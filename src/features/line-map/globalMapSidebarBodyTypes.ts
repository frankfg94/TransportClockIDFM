import type { GtfsLineFrequencyResponse } from "../../types/lineFrequency";
import type { TrafficDisruption } from "../traffic/types";
import type { LoadingClockDirection } from "../../components/LoadingClock.vue";
import type {
  AnnualRidershipLineResponse,
  AnnualRidershipRankingScope,
  AnnualRidershipStationResponse,
} from "../../types/ridership";
import type { RidershipRankingPresentation } from "../../services/ridershipRanking";
import type {
  GlobalMapEntrance,
  GlobalMapLine,
  GlobalMapPath,
  GlobalMapStation,
} from "../transport-map/contracts/manifest";
import type { LineMapDirectionOption } from "./types";
import type {
  PatternTrafficCalendarDay,
  PatternTrafficCalendarMonth,
} from "../service-pattern/trafficCalendar";

export interface GlobalMapSidebarTrafficCalendarState {
  open: boolean;
  expanded: boolean;
  calendar: PatternTrafficCalendarMonth;
  selectedDateKey: string;
  selectedDay?: PatternTrafficCalendarDay;
  selectedDisruptions: TrafficDisruption[];
  hasPrevious: boolean;
  hasNext: boolean;
  loadingDateKey?: string;
  loadingDirection: LoadingClockDirection;
}

export interface GlobalMapSidebarBodyProps {
  station?: GlobalMapStation;
  displayLine?: GlobalMapLine;
  lines: GlobalMapLine[];
  allLines: GlobalMapLine[];
  stations: GlobalMapStation[];
  cityPatternStations: GlobalMapStation[];
  paths: GlobalMapPath[];
  previewPaths: GlobalMapPath[];
  entrances: GlobalMapEntrance[];
  numberedEntrances: Array<{
    entrance: GlobalMapEntrance;
    displayCode: string;
  }>;
  focusedEntranceId?: string;
  hoveredLineId?: string;
  dashboardBusy: boolean;
  isLinePreview: boolean;
  trafficDisruption?: TrafficDisruption;
  frequencyProfile?: GtfsLineFrequencyResponse;
  frequencyLoading: boolean;
  frequencyUnavailable: boolean;
  ridershipLine?: AnnualRidershipLineResponse;
  ridershipLoading: boolean;
  ridershipUnavailable: boolean;
  ridershipLineRanking?: RidershipRankingPresentation;
  ridershipStation?: AnnualRidershipStationResponse;
  ridershipStationLoading: boolean;
  ridershipStationUnavailable: boolean;
  ridershipStationRanking?: RidershipRankingPresentation;
  ridershipStationScope: AnnualRidershipRankingScope;
  ridershipStationScopeOptions: Array<{
    value: AnnualRidershipRankingScope;
    label: string;
  }>;
  directionOptions: LineMapDirectionOption[];
  directionVariants: LineMapDirectionOption[];
  directionLoading: boolean;
  selectedDirectionId?: string;
  selectedMainDirectionId?: string;
  mergeDirections: boolean;
}

export interface GlobalMapSidebarBodyEmits {
  "select-line": [lineId: string];
  "change-line": [];
  "view-line-schema": [];
  "focus-entrance": [entrance: GlobalMapEntrance];
  "change-direction": [directionId: string];
  "change-direction-variant": [directionId: string];
  "toggle-merge-directions": [];
  "update:scope": [scope: AnnualRidershipRankingScope];
  "hover-line": [lineId: string | undefined];
  "add-active-station": [];
}
