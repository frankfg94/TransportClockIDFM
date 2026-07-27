import { defineEventHandler } from "h3";
import { getGtfsPublicStatus } from "../../services/gtfs/runtime";

export default defineEventHandler((event) => getGtfsPublicStatus(event));
