import type { PassengerSatisfactionObservation } from "../../../shared/passengerSatisfaction";
import { runNetworkTask } from "../../services/networkScheduler";
import { toServerApiUrl } from "../../services/serverApi";

export function fetchPassengerSatisfaction(signal: AbortSignal): Promise<PassengerSatisfactionObservation[]> {
  return runNetworkTask(async requestSignal => {
    const response = await fetch(toServerApiUrl("/api/passenger-satisfaction"), { signal: requestSignal });
    if (!response.ok) throw new Error(`IDFM passenger satisfaction (${response.status})`);
    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw new Error("Invalid passenger satisfaction response");
    return data as PassengerSatisfactionObservation[];
  }, signal, 12_000);
}
