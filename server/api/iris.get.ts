import { createError, defineEventHandler } from "h3";
import { getCompiledNeighborhoodVerdictData } from "../services/neighborhoodVerdict/dataStore";
import {
  AIR_NOISE_STATISTICS_SOURCE_ID,
  IRIS_SOURCE_ID,
} from "../services/neighborhoodVerdict/contracts";
import { resolveDepartmentNames } from "../services/neighborhoodVerdict/geoApi";

/**
 * Publish only the IRIS slice of the compiled verdict artifact. The geometry
 * remains backed by the same server-side source/checksum used by check:data;
 * the frontend never reads a raw file from disk or R2.
 */
export default defineEventHandler(async (event) => {
  try {
    const data = await getCompiledNeighborhoodVerdictData(event);
    const source = data.sources.find((candidate) => candidate.id === IRIS_SOURCE_ID);
    const airNoiseSource = data.sources.find((candidate) => candidate.id === AIR_NOISE_STATISTICS_SOURCE_ID);
    if (!source || !airNoiseSource || data.iris.sourceId !== IRIS_SOURCE_ID) {
      throw new Error("IRIS source is absent from the compiled artifact.");
    }
    let departmentNames: Readonly<Record<string, string>> = {};
    try {
      departmentNames = await resolveDepartmentNames(
        data.iris.neighborhoods.map((neighborhood) => neighborhood.departmentCode),
      );
    } catch {
      // Keep the geometry usable when the optional official name lookup is
      // unavailable. The client will retain the department code as a label.
    }
    return {
      schemaVersion: data.schemaVersion,
      generatedAt: data.generatedAt,
      source,
      airNoiseSource,
      airNoiseCommunes: Object.fromEntries(Object.entries(data.airNoiseCommunes).map(([code, commune]) => [code, {
        inseeCode: commune.inseeCode,
        name: commune.name,
        departmentCode: commune.departmentCode,
        population: commune.population,
        score: commune.score,
        airScore: commune.airScore,
        noiseScore: commune.noiseScore,
        dominantClass: commune.dominantClass,
      }])),
      ...data.iris,
      departmentNames,
    };
  } catch (cause) {
    throw createError({ statusCode: 503, statusMessage: "IRIS data unavailable", cause });
  }
});
