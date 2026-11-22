import { defineEventHandler } from "h3";
import { getNatureDatasetInfo } from "../../services/datasets/natureInCity";
import { getNetexRuntimeEnv } from "../../services/topology/netexCache";

export default defineEventHandler(event => getNatureDatasetInfo(getNetexRuntimeEnv(event)));
