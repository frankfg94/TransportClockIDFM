export interface RawLineFixture {
  line: {
    id: string;
    aliases: string[];
    name: string;
    shortName: string;
    mode: string;
  };
  stations: RawStation[];
  patterns: RawPattern[];
}

export interface RawStation {
  id: string;
  name: string;
  lat?: number;
  lon?: number;
  aliases?: string[];
}

export interface RawPattern {
  id: string;
  terminalFrom: string;
  terminalTo: string;
  stops: string[];
  tripCount: number;
}

export interface LineTopology {
  line: RawLineFixture["line"];
  stations: TopologyStation[];
  segments: TopologySegment[];
  patterns: TopologyPattern[];
  branches: TopologyBranch[];
  branchPoints: string[];
  terminals: string[];
}

export interface TopologyStation extends RawStation {
  degree: number;
}

export interface TopologySegment {
  id: string;
  from: string;
  to: string;
  patterns: string[];
}

export interface TopologyPattern extends RawPattern {
  stops: string[];
}

export interface TopologyBranch {
  id: string;
  from: string;
  to: string;
  stops: string[];
}

export interface ExpectedTopologyFixture {
  lineId: string;
  requiredStations: string[];
  expectedTerminals: string[];
  expectedTerminalDegrees?: Record<string, number>;
  expectedBranchPoints: string[];
  expectedNeighbors: Record<string, string[]>;
}
