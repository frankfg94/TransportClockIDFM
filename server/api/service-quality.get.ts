import { defineEventHandler, createError } from "h3";
import {
  SERVICE_QUALITY_SOURCE_ID,
  type CompiledServiceQualityData,
} from "../services/neighborhoodVerdict/contracts";
import { getCompiledNeighborhoodVerdictData } from "../services/neighborhoodVerdict/dataStore";

const SERVICE_QUALITY_SCHEMA_VERSION = "1.2" as const;

export default defineEventHandler(async (event) => {
  try {
    const data = await getCompiledNeighborhoodVerdictData(event);
    const serviceQuality: CompiledServiceQualityData = data.serviceQuality;
    const source = data.sources.find((candidate) => candidate.id === SERVICE_QUALITY_SOURCE_ID);
    if (!source) throw new Error(`Missing source metadata ${SERVICE_QUALITY_SOURCE_ID}`);
    return {
      schemaVersion: SERVICE_QUALITY_SCHEMA_VERSION,
      generatedAt: serviceQuality.generatedAt,
      availableYears: serviceQuality.availableYears,
      lines: serviceQuality.lines,
      sources: [source],
      warnings: data.warnings,
    };
  } catch (cause) {
    throw createError({ statusCode: 503, statusMessage: "Service quality data unavailable", cause });
  }
});
