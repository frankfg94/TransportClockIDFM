import { defineEventHandler, readBody } from "h3";
import {
  clearServerTransferBundles,
  deleteServerTransferBundle,
  deleteServerTransferBundlesForLine,
  listServerTransferBundles,
} from "./transfer-bundles.post";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ id?: string; lineId?: string }>(event).catch(
    () => undefined,
  );
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const lineId = typeof body?.lineId === "string" ? body.lineId.trim() : "";

  if (id) {
    await deleteServerTransferBundle(id);
  } else if (lineId) {
    await deleteServerTransferBundlesForLine(lineId);
  } else {
    await clearServerTransferBundles();
  }

  return {
    bundles: await listServerTransferBundles(),
  };
});
