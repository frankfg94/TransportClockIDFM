import { createError, defineEventHandler, getQuery, setHeader } from "h3";
import {
  findAndroidRelease,
  getAndroidDownloadHeaders,
  getMobileReleasesBucket,
} from "../../../../services/mobileRelease/androidRelease";

export default defineEventHandler(async (event) => {
  const revision = String(getQuery(event).revision ?? "");
  const bucket = getMobileReleasesBucket(event);
  const release = await findAndroidRelease(bucket, revision);

  if (!release.available || !bucket) {
    throw createError({ statusCode: 404, statusMessage: "APK Android indisponible." });
  }

  const apk = await bucket.get(release.manifest.objectKey);
  if (!apk || apk.size !== release.manifest.sizeBytes) {
    throw createError({ statusCode: 404, statusMessage: "APK Android introuvable." });
  }

  for (const [name, value] of Object.entries(
    getAndroidDownloadHeaders(release.manifest, apk.size),
  )) {
    setHeader(event, name, value);
  }

  return apk.body;
});
