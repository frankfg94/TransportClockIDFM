export type TransitMode = "tram" | "rer" | "metro" | "bus" | "train";
export type TransitFamily =
  | "METRO"
  | "RER"
  | "BUS"
  | "TRAM"
  | "NOCTILIEN"
  | "TRANSILIEN"
  | "CABLE";

export interface LineConfig {
  ref: string;
  shortName: string;
  longName: string;
  mode: TransitMode;
  color: string;
  textColor: string;
  iconUrl?: string;
  iconUrls?: string[];
}

export interface MonitoringPointConfig {
  ref: string;
  label: string;
}

export interface DirectionGroupMatchConfig {
  monitoringRefs?: string[];
  monitoringLabels?: string[];
  platforms?: string[];
  destinationIncludes?: string[];
  navitiaStopPointRefs?: string[];
}

export interface DirectionGroupConfig {
  id: string;
  label: string;
  subtitle?: string;
  match: DirectionGroupMatchConfig;
}

export interface TheoreticalScheduleConfig {
  lineRef: string;
  stopAreaRef: string;
}

export interface TransitBoardConfig {
  id: string;
  title: string;
  city: string;
  line: LineConfig;
  monitoringPoints: MonitoringPointConfig[];
  directionGroups: DirectionGroupConfig[];
  schedule?: TheoreticalScheduleConfig;
  maxDepartures: number;
  maxDeparturesPerDirection?: number;
}

export interface Departure {
  id: string;
  lineRef: string;
  monitoringRef: string;
  stopName: string;
  destination: string;
  direction?: string;
  platform?: string;
  monitoringLabel: string;
  expectedDepartureTime?: string;
  expectedArrivalTime?: string;
  aimedDepartureTime?: string;
  status?: string;
  vehicleAtStop: boolean;
  journeyName?: string;
  journeyRef?: string;
  callOrder?: number;
  remainingStopCount?: number;
  navitiaStopPointRef?: string;
}

export type DepartureServiceType =
  | "omnibus"
  | "semi-direct"
  | "direct"
  | "inconnu";

export interface DepartureCall {
  id: string;
  label: string;
  city?: string;
  time?: string;
  current: boolean;
  served: boolean;
  status?: DepartureCallStatus;
  stopAreaRef?: string;
  transferLines?: TransferLineOption[];
}

export type DepartureCallStatus =
  | "current"
  | "served"
  | "not_served"
  | "works"
  | "unknown";

export interface DepartureCallingPattern {
  departureId: string;
  destination: string;
  serviceType: DepartureServiceType;
  calls: DepartureCall[];
  lineTopology?: LineRouteSequence[];
  error?: string;
}

export interface LastDeparture {
  groupId: string;
  time: string;
  destination: string;
}

export interface DirectionDepartureGroup {
  id: string;
  label: string;
  subtitle?: string;
  departures: Departure[];
  lastDeparture?: LastDeparture;
  serviceEnded: boolean;
}

export interface BoardDeparturesResult {
  departures: Departure[];
  directionGroups: DirectionDepartureGroup[];
}

export interface TransitBoardPreferences {
  visibleBoardIds: string[];
  collapsedDirectionIds: string[];
  customBoards: TransitBoardConfig[];
}

export interface LineSearchOption {
  family: TransitFamily;
  id: string;
  label: string;
  ref: string;
  navitiaId: string;
  commercialModeId?: string;
  color?: string;
  textColor?: string;
  displayName?: string;
  iconUrl?: string;
  iconUrls?: string[];
}

export interface StationSearchOption {
  id: string;
  label: string;
  city?: string;
  lon?: number;
  lat?: number;
  monitoringRef: string;
  scheduleStopAreaRef?: string;
}

export interface TransitFamilyOption {
  id: string;
  label: string;
  family: TransitFamily;
}

export interface TransferLineOption {
  id: string;
  label: string;
  family?: TransitFamily;
  mode?: string;
  color?: string;
  textColor?: string;
  iconUrl?: string;
  iconUrls?: string[];
  ref?: string;
}

export interface LineRouteStop {
  id: string;
  label: string;
  city?: string;
  lon?: number;
  lat?: number;
  projectedX?: number;
  projectedY?: number;
  station: StationSearchOption;
  transferLines?: TransferLineOption[];
}

export interface LineRouteSequence {
  id: string;
  label: string;
  direction?: string;
  branchLayout?: LineRouteBranchLayout;
  topologySource?: "server" | "navitia" | "generated";
  stops: LineRouteStop[];
}

export interface LineRouteBranchLayout {
  kind: "same-direction-fork" | "split-fork";
  junctionStationId: string;
  terminalStationId: string;
  trunkStationId?: string;
  direction: "forward" | "reverse";
  side: "upper" | "lower" | "center";
  axisDegrees?: number;
  angleDegrees?: number;
}

export interface DepartureAlarm {
  id: string;
  boardId: string;
  boardTitle: string;
  lineLabel: string;
  lineColor: string;
  destination: string;
  monitoringLabel: string;
  platform?: string;
  departureId: string;
  journeyName?: string;
  scheduledDepartureTime: string;
  alarmTime: string;
  minutesBefore: number;
  soundEnabled: boolean;
  notified: boolean;
  createdAt: string;
}

export interface AlarmDraft {
  minutesBefore: number;
  soundEnabled: boolean;
}

export interface StationBoardDraft {
  family?: TransitFamily;
  line?: LineSearchOption;
  station?: StationSearchOption;
}

export interface LinePatternStationStatus {
  id: string;
  label: string;
  status: DepartureCallStatus;
  current: boolean;
  served: boolean;
  order?: number;
}

export interface LinePatternViewResponse {
  lineId: string;
  transportType: string;
  directionId: string;
  directionOptions?: LinePatternDirectionOption[];
  startStationId?: string;
  activeSegmentIds: string[];
  stationStatuses: LinePatternStationStatus[];
  board: TransitBoardConfig;
  departure: Departure;
  pattern: DepartureCallingPattern;
}

export interface LinePatternDirectionOption {
  id: string;
  label: string;
}

