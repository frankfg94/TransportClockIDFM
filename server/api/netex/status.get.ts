import { defineEventHandler } from "h3";
import {
  getNetexCacheStatus,
  getNetexRuntimeEnv,
} from "../../services/topology/netexCache";

export default defineEventHandler(async (event) =>
  getNetexCacheStatus(getNetexRuntimeEnv(event)),
);
