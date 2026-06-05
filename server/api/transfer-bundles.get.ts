import { defineEventHandler } from "h3";
import { listServerTransferBundles } from "./transfer-bundles.post";

export default defineEventHandler(() => ({
  bundles: listServerTransferBundles(),
}));
