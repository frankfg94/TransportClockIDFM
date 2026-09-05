import { createError, defineEventHandler, readBody } from "h3";
import { searchIgnAddress } from "../../services/geocoding/ign";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ query?: unknown }>(event);
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (query.length < 3 || query.length > 180) {
    throw createError({ statusCode: 400, statusMessage: "Address query must contain between 3 and 180 characters." });
  }
  return { provider: "ign-geoplateforme", results: await searchIgnAddress(query) };
});
