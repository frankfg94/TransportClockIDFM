import { createReadStream } from "node:fs";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  assertCleanGitWorktree,
  assertValidatedArtifact,
  getCurrentSourceRevision,
  isOversizeApproved,
  mobileReleaseManifestPath,
  mobileReleaseOutputDir,
  readManifest,
  requireEnv,
} from "./common";
import { MOBILE_RELEASES_PREFIX } from "./releaseMetadata";
import { join } from "node:path";

const RETAINED_RELEASE_COUNT = 10;

async function main(): Promise<void> {
  assertCleanGitWorktree();
  const manifest = await readManifest();
  const sourceRevision = getCurrentSourceRevision();
  const apkPath = join(mobileReleaseOutputDir, manifest.fileName);
  const certificateSha256 = requireEnv("ANDROID_SIGNING_CERT_SHA256");
  await assertValidatedArtifact({
    manifest,
    apkPath,
    expectedRevision: sourceRevision,
    expectedCertificateSha256: certificateSha256,
    approveOversize: isOversizeApproved(),
  });

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

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: manifest.objectKey,
    Body: createReadStream(apkPath),
    ContentType: "application/vnd.android.package-archive",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: `${MOBILE_RELEASES_PREFIX}/${manifest.sourceRevision}/manifest.json`,
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
