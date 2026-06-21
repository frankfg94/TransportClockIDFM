import { defineEventHandler, getQuery, setHeader } from "h3";
import { getAndroidReleaseStatus } from "../../../services/mobileRelease/androidRelease";

export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "no-store");
  const revision = String(getQuery(event).revision ?? "");
  return getAndroidReleaseStatus(event, revision);
});
