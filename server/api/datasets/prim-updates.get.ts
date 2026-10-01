import { defineEventHandler, setHeader } from "h3";
import { getPrimCatalogUpdates } from "../../services/datasets/primCatalogUpdates";

export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "private, no-store");
  return getPrimCatalogUpdates();
});
