export { default as TrafficPage } from "./TrafficPage.vue";
export { getActiveTrafficLines } from "./activeTrafficLines";
export {
  getTrafficLineStatus,
  normalizeNavitiaLineReportPayload,
  normalizeTrafficLineRef,
} from "./trafficNormalization";
export {
  getCurrentTrafficDisruptions,
  getTrafficDisruptionDisplayPeriod,
  getTrafficDisruptionTiming,
  getUpcomingTrafficDisruptions,
  parseTrafficDate,
  type TrafficTimingTab,
} from "./trafficTiming";
export {
  formatTrafficDate,
  formatTrafficDisruptionPeriod,
  getDisruptionIcon,
  getDisruptionTone,
  getTrafficAlertPresentation,
  getTrafficDisruptionsTone,
  normalizeTrafficText,
  type TrafficAlertPresentation,
  type TrafficAlertSymbol,
  type TrafficTone,
} from "./trafficPresentation";
export type {
  ActiveTrafficLine,
  TrafficDisruption,
  TrafficLineReport,
  TrafficLineStatus,
  TrafficResponse,
} from "./types";
