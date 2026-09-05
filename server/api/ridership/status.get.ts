import { defineEventHandler, setHeader } from "h3";
import {
  getRidershipStatus,
} from "../../services/ridership/ridershipCache";
import { getNetexRuntimeEnv } from "../../services/topology/netexCache";

export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
  return getRidershipStatus(getNetexRuntimeEnv(event));
});
