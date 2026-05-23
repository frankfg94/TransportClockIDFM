import { defineEventHandler } from "h3";
import { getNetexCacheStatus } from "../../services/topology/netexCache";

export default defineEventHandler(async () => getNetexCacheStatus());
