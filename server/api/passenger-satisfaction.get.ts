import { createError } from "h3";
import { parsePassengerSatisfactionExport, PASSENGER_SATISFACTION_EXPORT } from "../../shared/passengerSatisfaction";

export default defineCachedEventHandler(async () => {
  try {
    const response = await fetch(PASSENGER_SATISFACTION_EXPORT, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`IDFM perception export returned ${response.status}`);
    return parsePassengerSatisfactionExport(await response.json());
  } catch (cause) {
    throw createError({ statusCode: 502, statusMessage: "IDFM passenger satisfaction unavailable", cause });
  }
}, { maxAge: 3600, swr: false, name: "passenger-satisfaction" });
