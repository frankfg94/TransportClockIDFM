import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  assertValidatedArtifact,
  getReleaseSource,
  isOversizeApproved,
  mobileReleaseManifestPath,
  mobileReleaseOutputDir,
  mobileReleaseProvenancePath,
  readManifest,
  requireEnv,
} from "./common";
import { MOBILE_RELEASES_PREFIX } from "./releaseMetadata";
import { join } from "node:path";
import { sha256, assertSnapshotStable } from "./sourceSnapshot";

const RETAINED_RELEASE_COUNT = 10;

async function main(): Promise<void> {
  const source = getReleaseSource();
  const manifest = await readManifest();
  const { sourceRevision } = source;
  const apkPath = join(mobileReleaseOutputDir, manifest.fileName);
  await assertValidatedArtifact({
    manifest,
    apkPath,
    expectedRevision: sourceRevision,
    approveOversize: isOversizeApproved(),
    expectedCertificateSha256: process.env.MOBILE_RELEASE_EXPECTED_CERTIFICATE_SHA256,
  });
  let provenance: string | undefined;
  if (source.snapshot) {
    provenance = await readFile(mobileReleaseProvenancePath, "utf8");
    const parsed = JSON.parse(provenance);
    assertSnapshotStable(parsed.snapshot, source.snapshot);
    if (parsed.manifestSha256 !== sha256(JSON.stringify(manifest)) ||
        JSON.stringify(parsed.artifact) !== JSON.stringify(manifest) ||
        manifest.sourceKind !== "worktree-snapshot" || manifest.baseCommit !== source.snapshot.baseCommit ||
        manifest.snapshotSha256 !== source.snapshot.snapshotSha256) throw new Error("APK provenance mismatch.");
  } else if (manifest.sourceKind) throw new Error("Snapshot publication requires --worktree-snapshot.");

  const bucket = requireEnv("MOBILE_RELEASE_R2_BUCKET");
  const client = new S3Client({
    region: "auto",
    endpoint: requireEnv("MOBILE_RELEASE_R2_ENDPOINT"),
    forcePathStyle: true,
    credentials: {
      accessKeyId: requireEnv("MOBILE_RELEASE_R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("MOBILE_RELEASE_R2_SECRET_ACCESS_KEY"),
    },
  });

  const getOptional = async (key: string): Promise<string | undefined> => {
    try { return await (await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))).Body?.transformToString(); }
    catch (error: unknown) { if ((error as { name?: string }).name === "NoSuchKey") return undefined; throw error; }
  };
  const previous = await getOptional(`${MOBILE_RELEASES_PREFIX}/latest.json`);
  if (previous && manifest.versionCode <= JSON.parse(previous).versionCode) throw new Error("Release versionCode must increase beyond current latest.");
  const existing = await getOptional(`${MOBILE_RELEASES_PREFIX}/${sourceRevision}/manifest.json`);
  if (existing && JSON.parse(existing).sha256 !== manifest.sha256) throw new Error("Refusing to overwrite a release identity with a different APK.");
  getReleaseSource(); // Last source/configuration stability check before any upload.

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: manifest.objectKey,
    Body: createReadStream(apkPath),
    ContentType: "application/vnd.android.package-archive",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  if (provenance) await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: `${MOBILE_RELEASES_PREFIX}/${sourceRevision}/provenance.json`,
    Body: provenance,
    ContentType: "application/json; charset=utf-8",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  getReleaseSource(); // Do not activate latest after source drift during upload.
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: `${MOBILE_RELEASES_PREFIX}/${manifest.sourceRevision}/manifest.json`,
    Body: JSON.stringify(manifest, null, 2),
    ContentType: "application/json; charset=utf-8",
    CacheControl: "no-store",
  }));
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: `${MOBILE_RELEASES_PREFIX}/latest.json`,
    Body: JSON.stringify(manifest, null, 2),
    ContentType: "application/json; charset=utf-8",
    CacheControl: "no-store",
  }));

  await pruneOldReleases(client, bucket);
  console.log(`APK publiée dans R2 : ${manifest.objectKey}`);
}

async function pruneOldReleases(client: S3Client, bucket: string): Promise<void> {
  const groups = new Map<string, { key: string; updatedAt: number }[]>();
  let continuationToken: string | undefined;

  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `${MOBILE_RELEASES_PREFIX}/`,
      ContinuationToken: continuationToken,
    }));
    continuationToken = page.NextContinuationToken;
    for (const object of page.Contents ?? []) {
      if (!object.Key) continue;
      const match = object.Key.match(/^mobile-releases\/android\/([a-f0-9]{40})\//iu);
      if (!match) continue;
      const release = groups.get(match[1]) ?? [];
      release.push({ key: object.Key, updatedAt: object.LastModified?.getTime() ?? 0 });
      groups.set(match[1], release);
    }
  } while (continuationToken);

  const stale = [...groups.values()]
    .sort((left, right) => Math.max(...right.map((entry) => entry.updatedAt)) - Math.max(...left.map((entry) => entry.updatedAt)))
    .slice(RETAINED_RELEASE_COUNT)
    .flatMap((entries) => entries.map(({ key }) => ({ Key: key })));

  if (stale.length) {
    await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: stale, Quiet: true },
    }));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
