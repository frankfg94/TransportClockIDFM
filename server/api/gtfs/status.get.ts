import { defineEventHandler, getQuery } from "h3";
import { getGtfsPublicStatus } from "../../services/gtfs/runtime";

export default defineEventHandler((event) => {
  const query = getQuery(event);
  return getGtfsPublicStatus(event, { fresh: query.fresh === "1", calendar: query.calendar === "1" });
});
