import { defineEventHandler } from "h3";
import { transportClockServerPlugins } from "#transport-clock/plugin-server-registry";

export default defineEventHandler(() => ({
  apiVersion: 1,
  plugins: transportClockServerPlugins,
}));
