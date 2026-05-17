<script setup lang="ts">
import "@vue-flow/core/dist/style.css";
import "@vue-flow/controls/dist/style.css";
import dagre from "@dagrejs/dagre";
import { computed } from "vue";
import { Handle, PanelPosition, Position, VueFlow } from "@vue-flow/core";
import type { Edge, Node } from "@vue-flow/core";
import LineIconBadge from "../../components/LineIconBadge.vue";
import { Controls } from "@vue-flow/controls";
import type {
  Departure,
  DepartureCall,
  DepartureCallingPattern,
  DepartureServiceType,
  LineRouteSequence,
  LineRouteStop,
  TransferLineOption,
  TransitBoardConfig,
} from "../../types/transit";

type PatternFlowNode = Node<
  PatternStationNodeData,
  Record<string, never>,
  "station"
>;
type PatternFlowEdge = Edge<
  Record<string, never>,
  Record<string, never>,
  "straight"
>;

interface PatternStationNodeData {
  key: string;
  label: string;
  city?: string;
  time?: string;
  current: boolean;
  served: boolean;
  branchEnd: boolean;
  branchChip?: string;
  busTransfers: TransferLineOption[];
  nonBusTransfers: TransferLineOption[];
}

interface PatternGraphNode {
  id: string;
  label: string;
  city?: string;
  lon?: number;
  lat?: number;
  current: boolean;
  served: boolean;
  time?: string;
  transfers: TransferLineOption[];
  degree: number;
}

interface PatternGraphEdge {
  id: string;
  source: string;
  target: string;
  active: boolean;
  distanceKm?: number;
}

interface PatternFlowModel {
  nodes: PatternFlowNode[];
  edges: PatternFlowEdge[];
}

interface PatternTopologyLayout {
  degrees: Map<string, number>;
  positions: Map<string, { x: number; y: number }>;
  syntheticEdges: PatternGraphEdge[];
  visibleEdges: Set<string>;
}

const NODE_WIDTH = 156;
const NODE_HEIGHT = 82;
const STOP_GAP = 174;
const BRANCH_GAP = 122;
const RANK_SEPARATOR = 96;
const NODE_SEPARATOR = 54;

const props = defineProps<{
  open: boolean;
  board?: TransitBoardConfig;
  departure?: Departure;
  pattern?: DepartureCallingPattern;
  loading?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const serviceLabel = computed(() =>
  props.pattern ? formatServiceType(props.pattern.serviceType) : "Desserte",
);
const servedCalls = computed(
  () => props.pattern?.calls.filter((call) => call.served) ?? [],
);
const destinationLabel = computed(
  () =>
    props.departure?.destination ?? props.pattern?.destination ?? "Destination",
);
const departureClock = computed(() =>
  formatClock(departureTime(props.departure)),
);
const servedStopsLabel = computed(() => {
  const count = servedCalls.value.length;

  return count > 1 ? `${count} arrêts desservis` : `${count} arrêt desservi`;
});
const flowModel = computed(() =>
  createPatternFlow(
    props.pattern?.calls ?? [],
    props.pattern?.lineTopology ?? [],
    departureClock.value,
  ),
);
const initialViewport = computed(() => {
  const currentNode =
    flowModel.value.nodes.find((node) => node.data?.current) ??
    flowModel.value.nodes.find((node) => node.data?.served) ??
    flowModel.value.nodes[0];
  const nodeCount = flowModel.value.nodes.length;
  const zoom = nodeCount > 64 ? 0.42 : nodeCount > 42 ? 0.5 : 0.78;

  if (!currentNode) {
    return { x: 24, y: 160, zoom };
  }

  return {
    x: 280 - (currentNode.position.x + NODE_WIDTH / 2) * zoom,
    y: 230 - (currentNode.position.y + NODE_HEIGHT / 2) * zoom,
    zoom,
  };
});

function formatClock(value?: string): string {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}

function formatServiceType(type: DepartureServiceType): string {
  if (type === "semi-direct") {
    return "Semi-direct";
  }

  if (type === "direct") {
    return "Direct";
  }

  if (type === "omnibus") {
    return "Omnibus";
  }

  return "Desserte";
}

function departureTime(departure?: Departure): string | undefined {
  return (
    departure?.expectedDepartureTime ??
    departure?.expectedArrivalTime ??
    departure?.aimedDepartureTime
  );
}

function createPatternFlow(
  calls: DepartureCall[],
  lineTopology: LineRouteSequence[],
  departureTimeLabel: string,
): PatternFlowModel {
  const graph = buildPatternGraph(calls, lineTopology);
  const topology =
    createTopologyLayout(graph.nodes, graph.edges, calls) ??
    createFallbackTopologyLayout(graph);

  const activeTerminalIds = getActiveTerminalIds(graph);
  const drawableEdges = [...graph.edges, ...topology.syntheticEdges];
  const nodes = graph.nodes.map((node) => {
    const position = topology.positions.get(node.id) ?? { x: 0, y: 0 };
    const isBranchEnd = (topology.degrees.get(node.id) ?? 0) <= 1;

    return {
      id: node.id,
      type: "station",
      position: {
        x: position.x - NODE_WIDTH / 2,
        y: position.y - NODE_HEIGHT / 2,
      },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      draggable: false,
      selectable: false,
      connectable: false,
      class: node.current ? "pattern-flow-node--current" : undefined,
      zIndex: node.current ? 30 : undefined,
      data: {
        key: node.id,
        label: node.label,
        city: node.city,
        time: node.time,
        current: node.current,
        served: node.served,
        branchEnd: isBranchEnd,
        branchChip: getBranchChip(node, activeTerminalIds, departureTimeLabel),
        busTransfers: node.transfers.filter(isBusTransfer),
        nonBusTransfers: node.transfers.filter(
          (transfer) => !isBusTransfer(transfer),
        ),
      },
    } satisfies PatternFlowNode;
  });
  const visibleDrawableEdges = drawableEdges.filter((edge) =>
    topology.visibleEdges.has(createEdgeKey(edge.source, edge.target)),
  );
  const activeRouteEdgeOrder = createActiveRouteEdgeOrder(calls, lineTopology);
  const activeLightEdges = visibleDrawableEdges
    .filter((edge) => edge.active)
    .map((edge, fallbackOrder) => ({
      edge,
      order:
        activeRouteEdgeOrder.get(createEdgeKey(edge.source, edge.target)) ??
        fallbackOrder,
    }))
    .sort((left, right) => left.order - right.order);
  const edges = [
    ...visibleDrawableEdges.map((edge) =>
      createFlowEdge(edge, topology.positions),
    ),
    ...activeLightEdges.map(({ edge, order }) =>
      createFlowLightEdge(
        edge,
        topology.positions,
        order,
        activeLightEdges.length,
      ),
    ),
  ];

  return { nodes, edges };
}

function createFlowEdge(
  edge: PatternGraphEdge,
  positions: Map<string, { x: number; y: number }>,
): PatternFlowEdge {
  const sourcePosition = positions.get(edge.source);
  const targetPosition = positions.get(edge.target);
  const shouldReverse =
    sourcePosition &&
    targetPosition &&
    (sourcePosition.x > targetPosition.x ||
      (sourcePosition.x === targetPosition.x &&
        sourcePosition.y > targetPosition.y));
  const source = shouldReverse ? edge.target : edge.source;
  const target = shouldReverse ? edge.source : edge.target;

  return {
    id: `${edge.id}:${source}:${target}`,
    source,
    target,
    sourceHandle: "station-source",
    targetHandle: "station-target",
    type: "straight",
    selectable: false,
    focusable: false,
    class: edge.active
      ? "pattern-flow-edge--active"
      : "pattern-flow-edge--skipped",
    style: {
      stroke: edge.active ? "var(--line-color)" : "#cbd5e1",
      strokeWidth: edge.active ? 10 : 7,
    },
  };
}

function createFlowLightEdge(
  edge: PatternGraphEdge,
  positions: Map<string, { x: number; y: number }>,
  order: number,
  count: number,
): PatternFlowEdge {
  const flowEdge = createFlowEdge(edge, positions);
  const lightCycleSeconds = Math.max(8.5, count * 0.72);
  const lightDelay = (order * lightCycleSeconds) / Math.max(count, 1);

  return {
    ...flowEdge,
    id: `${flowEdge.id}:light`,
    class: "pattern-flow-edge--light",
    style: {
      stroke: "color-mix(in srgb, var(--line-color), white 58%)",
      strokeOpacity: 0.42,
      strokeWidth: 14,
      "--flow-light-cycle": `${lightCycleSeconds.toFixed(2)}s`,
      "--flow-light-delay": `${lightDelay.toFixed(2)}s`,
    } as PatternFlowEdge["style"],
  };
}

function createTopologyLayout(
  nodes: PatternGraphNode[],
  edges: PatternGraphEdge[],
  calls: DepartureCall[],
): PatternTopologyLayout | null {
  if (nodes.length === 0 || edges.length === 0) {
    return null;
  }

  const adjacency = createAdjacency(edges);
  const activeKeys = new Set(
    calls.filter((call) => call.served).map(createStationKey),
  );
  const currentKey = calls.find((call) => call.current)
    ? createStationKey(calls.find((call) => call.current)!)
    : undefined;
  const destinationKey = getServedDestinationKey(calls);
  const mainPath = chooseMainPath(
    nodes,
    adjacency,
    activeKeys,
    currentKey,
    destinationKey,
  );

  if (mainPath.length < 2) {
    return null;
  }

  orientPathTowardDeparture(mainPath, calls);

  const positions = new Map<string, { x: number; y: number }>();
  const visibleEdges = new Set<string>();
  const syntheticEdges: PatternGraphEdge[] = [];
  const placed = new Set<string>();

  mainPath.forEach((key, index) => {
    positions.set(key, { x: index * STOP_GAP, y: 0 });
    placed.add(key);
  });
  addPathEdges(mainPath, visibleEdges);

  const laneSteps = createLaneSteps();
  let guard = 0;

  while (placed.size < nodes.length && guard < nodes.length * 2) {
    guard += 1;

    const branchPath = findBestBranchPath(nodes, adjacency, placed);

    if (!branchPath) {
      break;
    }

    placeBranchPath(
      branchPath,
      positions,
      placed,
      visibleEdges,
      laneSteps,
      destinationKey,
    );
  }

  placeRemainingComponents(
    nodes,
    adjacency,
    positions,
    placed,
    visibleEdges,
    laneSteps,
    destinationKey,
  );

  return {
    positions,
    syntheticEdges,
    visibleEdges,
    degrees: createDegreesFromEdgeKeys(visibleEdges),
  };
}

function createFallbackTopologyLayout(graph: {
  nodes: PatternGraphNode[];
  edges: PatternGraphEdge[];
}): PatternTopologyLayout {
  const visibleEdges = new Set(
    graph.edges.map((edge) => createEdgeKey(edge.source, edge.target)),
  );

  return {
    positions: createDagreLayout(graph),
    syntheticEdges: [],
    visibleEdges,
    degrees: createDegreesFromEdgeKeys(visibleEdges),
  };
}

function createAdjacency(edges: PatternGraphEdge[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  edges.forEach((edge) => {
    addNeighbor(adjacency, edge.source, edge.target);
    addNeighbor(adjacency, edge.target, edge.source);
  });

  return adjacency;
}

function addNeighbor(
  adjacency: Map<string, Set<string>>,
  source: string,
  target: string,
): void {
  if (!adjacency.has(source)) {
    adjacency.set(source, new Set<string>());
  }

  adjacency.get(source)!.add(target);
}

function chooseMainPath(
  nodes: PatternGraphNode[],
  adjacency: Map<string, Set<string>>,
  activeKeys: Set<string>,
  currentKey?: string,
  destinationKey?: string,
): string[] {
  const terminals = nodes
    .filter((node) => (adjacency.get(node.id)?.size ?? 0) <= 1)
    .map((node) => node.id);
  const candidates =
    terminals.length >= 2 ? terminals : nodes.map((node) => node.id);
  let bestPath: string[] = [];
  let bestScore = Number.NEGATIVE_INFINITY;

  candidates.forEach((source, sourceIndex) => {
    candidates.slice(sourceIndex + 1).forEach((target) => {
      const path = findShortestPath(source, (key) => key === target, adjacency);

      if (!path) {
        return;
      }

      const score = scoreMainPath(path, activeKeys, currentKey, destinationKey);

      if (score > bestScore) {
        bestScore = score;
        bestPath = path;
      }
    });
  });

  return bestPath;
}

function scoreMainPath(
  path: string[],
  activeKeys: Set<string>,
  currentKey?: string,
  destinationKey?: string,
): number {
  const activeCount = path.filter((key) => activeKeys.has(key)).length;
  const currentBonus = currentKey && path.includes(currentKey) ? 400 : 0;
  const destinationIndex = destinationKey ? path.indexOf(destinationKey) : -1;
  const destinationTerminalBonus =
    destinationIndex === 0 || destinationIndex === path.length - 1 ? 1200 : 0;
  const destinationPresenceBonus = destinationIndex >= 0 ? 500 : 0;

  return (
    path.length * 8 +
    activeCount * 120 +
    currentBonus +
    destinationPresenceBonus +
    destinationTerminalBonus
  );
}

function orientPathTowardDeparture(
  path: string[],
  calls: DepartureCall[],
): void {
  const servedCalls = calls.filter((call) => call.served);
  const firstServed = servedCalls[0]
    ? createStationKey(servedCalls[0])
    : undefined;
  const lastServedCall = servedCalls[servedCalls.length - 1];
  const lastServed = lastServedCall
    ? createStationKey(lastServedCall)
    : undefined;

  if (!firstServed || !lastServed) {
    return;
  }

  const firstIndex = path.indexOf(firstServed);
  const lastIndex = path.indexOf(lastServed);

  if (firstIndex >= 0 && lastIndex >= 0 && lastIndex < firstIndex) {
    path.reverse();
  }
}

function findBestBranchPath(
  nodes: PatternGraphNode[],
  adjacency: Map<string, Set<string>>,
  placed: Set<string>,
): string[] | null {
  const unplacedTerminals = nodes
    .filter((node) => !placed.has(node.id))
    .filter((node) => (adjacency.get(node.id)?.size ?? 0) <= 1)
    .map((node) => node.id);
  const starts =
    unplacedTerminals.length > 0
      ? unplacedTerminals
      : nodes.filter((node) => !placed.has(node.id)).map((node) => node.id);
  let bestPath: string[] | null = null;

  starts.forEach((start) => {
    const path = findShortestPath(start, (key) => placed.has(key), adjacency);

    if (!path || path.length < 2) {
      return;
    }

    if (!bestPath || path.length > bestPath.length) {
      bestPath = path;
    }
  });

  return bestPath ? [...bestPath].reverse() : null;
}

function findNearestDisconnectedBranchPath(
  nodes: PatternGraphNode[],
  adjacency: Map<string, Set<string>>,
  placed: Set<string>,
  syntheticEdges: PatternGraphEdge[],
): string[] | null {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const placedNodes = nodes.filter((node) => placed.has(node.id));
  const unplacedNodes = nodes.filter((node) => !placed.has(node.id));
  let best:
    | {
        distanceKm: number;
        placedNode: PatternGraphNode;
        unplacedNode: PatternGraphNode;
      }
    | undefined;

  placedNodes.forEach((placedNode) => {
    unplacedNodes.forEach((unplacedNode) => {
      const distanceKm = getNodeDistanceKm(placedNode, unplacedNode);

      if (distanceKm === undefined || distanceKm > 7) {
        return;
      }

      if (!best || distanceKm < best.distanceKm) {
        best = { distanceKm, placedNode, unplacedNode };
      }
    });
  });

  if (!best) {
    return null;
  }

  const component = collectUnplacedComponent(
    best.unplacedNode.id,
    adjacency,
    placed,
  );
  const componentPath = findLongestComponentPathFrom(
    best.unplacedNode.id,
    component,
    adjacency,
  );
  const connectorKey = createEdgeKey(best.placedNode.id, best.unplacedNode.id);

  if (!syntheticEdges.some((edge) => edge.id === connectorKey)) {
    syntheticEdges.push({
      id: connectorKey,
      source: best.placedNode.id,
      target: best.unplacedNode.id,
      active: false,
      distanceKm: best.distanceKm,
    });
  }

  componentPath.forEach((key) => {
    const node = nodeMap.get(key);

    if (node) {
      node.degree = Math.max(node.degree, adjacency.get(key)?.size ?? 0);
    }
  });

  return [best.placedNode.id, ...componentPath];
}

function collectUnplacedComponent(
  start: string,
  adjacency: Map<string, Set<string>>,
  placed: Set<string>,
): Set<string> {
  const component = new Set<string>();
  const queue = [start];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (component.has(current) || placed.has(current)) {
      continue;
    }

    component.add(current);
    Array.from(adjacency.get(current) ?? []).forEach((neighbor) => {
      if (!component.has(neighbor) && !placed.has(neighbor)) {
        queue.push(neighbor);
      }
    });
  }

  return component;
}

function findLongestComponentPathFrom(
  start: string,
  component: Set<string>,
  adjacency: Map<string, Set<string>>,
): string[] {
  const terminals = Array.from(component).filter(
    (key) =>
      Array.from(adjacency.get(key) ?? []).filter((neighbor) =>
        component.has(neighbor),
      ).length <= 1,
  );
  let bestPath = [start];

  terminals.forEach((terminal) => {
    const path = findShortestPathRestricted(
      start,
      (key) => key === terminal,
      adjacency,
      component,
    );

    if (path && path.length > bestPath.length) {
      bestPath = path;
    }
  });

  return bestPath;
}

function findShortestPathRestricted(
  start: string,
  isTarget: (key: string) => boolean,
  adjacency: Map<string, Set<string>>,
  allowed: Set<string>,
): string[] | null {
  const queue: string[][] = [[start]];
  const visited = new Set<string>([start]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];

    if (isTarget(current)) {
      return path;
    }

    Array.from(adjacency.get(current) ?? [])
      .filter((neighbor) => allowed.has(neighbor) && !visited.has(neighbor))
      .forEach((neighbor) => {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      });
  }

  return null;
}

function findShortestPath(
  start: string,
  isTarget: (key: string) => boolean,
  adjacency: Map<string, Set<string>>,
): string[] | null {
  const queue: string[][] = [[start]];
  const visited = new Set<string>([start]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];

    if (path.length > 1 && isTarget(current)) {
      return path;
    }

    Array.from(adjacency.get(current) ?? [])
      .filter((neighbor) => !visited.has(neighbor))
      .forEach((neighbor) => {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      });
  }

  return null;
}

function placeBranchPath(
  path: string[],
  positions: Map<string, { x: number; y: number }>,
  placed: Set<string>,
  visibleEdges: Set<string>,
  laneSteps: Generator<number, never, unknown>,
  destinationKey?: string,
): void {
  const anchor = path[0];
  const anchorPosition = positions.get(anchor);

  if (!anchorPosition) {
    return;
  }

  const lane = laneSteps.next().value;
  const y = lane * BRANCH_GAP;
  const destinationPosition = destinationKey
    ? positions.get(destinationKey)
    : undefined;
  const branchDirection =
    destinationPosition && anchor !== destinationKey
      ? anchorPosition.x < destinationPosition.x
        ? -1
        : 1
      : 1;

  path.slice(1).forEach((key, index) => {
    if (!positions.has(key)) {
      positions.set(key, {
        x: anchorPosition.x + branchDirection * (index + 1) * STOP_GAP,
        y,
      });
    }

    placed.add(key);
  });
  addPathEdges(path, visibleEdges);
}

function placeRemainingComponents(
  nodes: PatternGraphNode[],
  adjacency: Map<string, Set<string>>,
  positions: Map<string, { x: number; y: number }>,
  placed: Set<string>,
  visibleEdges: Set<string>,
  laneSteps: Generator<number, never, unknown>,
  destinationKey?: string,
): void {
  const nodeIds = nodes.map((node) => node.id);
  const keepAfterDestinationClear =
    destinationKey !== undefined && positions.has(destinationKey);
  let nextBaseX = keepAfterDestinationClear
    ? getMinPositionX(positions) - STOP_GAP
    : getMaxPositionX(positions) + STOP_GAP;

  while (true) {
    const start = nodeIds.find((id) => !placed.has(id));

    if (!start) {
      break;
    }

    const component = collectUnplacedComponentIds(start, adjacency, placed);
    const mainPath = findLongestPathInComponent(component, adjacency);
    const orderedIds = mainPath.length > 0 ? mainPath : Array.from(component);
    const lane = laneSteps.next().value;
    const y = lane * BRANCH_GAP;

    orderedIds.forEach((id, index) => {
      positions.set(id, {
        x: keepAfterDestinationClear
          ? nextBaseX - index * STOP_GAP
          : nextBaseX + index * STOP_GAP,
        y,
      });
      placed.add(id);
    });

    placeComponentSideNodes({
      component,
      orderedIds,
      adjacency,
      positions,
      placed,
      baseY: y,
    });

    addComponentEdges(component, adjacency, visibleEdges);

    nextBaseX +=
      (keepAfterDestinationClear ? -1 : 1) *
      (Math.max(orderedIds.length, 1) * STOP_GAP + STOP_GAP);
  }
}

function collectUnplacedComponentIds(
  start: string,
  adjacency: Map<string, Set<string>>,
  placed: Set<string>,
): Set<string> {
  const component = new Set<string>();
  const queue = [start];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (component.has(current) || placed.has(current)) {
      continue;
    }

    component.add(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      if (!component.has(neighbor) && !placed.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  return component;
}

function findLongestPathInComponent(
  component: Set<string>,
  adjacency: Map<string, Set<string>>,
): string[] {
  const ids = Array.from(component);

  if (ids.length <= 1) {
    return ids;
  }

  const terminals = ids.filter((id) => {
    const componentDegree = Array.from(adjacency.get(id) ?? []).filter(
      (neighbor) => component.has(neighbor),
    ).length;

    return componentDegree <= 1;
  });
  const candidates = terminals.length >= 2 ? terminals : ids;
  let bestPath: string[] = [];

  candidates.forEach((source, sourceIndex) => {
    candidates.slice(sourceIndex + 1).forEach((target) => {
      const path = findShortestPathRestricted(
        source,
        (key) => key === target,
        adjacency,
        component,
      );

      if (path && path.length > bestPath.length) {
        bestPath = path;
      }
    });
  });

  return bestPath.length > 0 ? bestPath : ids;
}

function placeComponentSideNodes(params: {
  component: Set<string>;
  orderedIds: string[];
  adjacency: Map<string, Set<string>>;
  positions: Map<string, { x: number; y: number }>;
  placed: Set<string>;
  baseY: number;
}): void {
  const { component, orderedIds, adjacency, positions, placed, baseY } = params;
  const orderedSet = new Set(orderedIds);

  Array.from(component).forEach((id) => {
    if (placed.has(id)) {
      return;
    }

    const anchorId = Array.from(adjacency.get(id) ?? []).find((neighbor) =>
      orderedSet.has(neighbor),
    );
    const anchorPosition = anchorId ? positions.get(anchorId) : undefined;

    positions.set(id, {
      x: anchorPosition?.x ?? getMaxPositionX(positions) + STOP_GAP,
      y: baseY + BRANCH_GAP,
    });
    placed.add(id);
  });
}

function addComponentEdges(
  component: Set<string>,
  adjacency: Map<string, Set<string>>,
  visibleEdges: Set<string>,
): void {
  component.forEach((source) => {
    for (const target of adjacency.get(source) ?? []) {
      if (component.has(target) && source !== target) {
        visibleEdges.add(createEdgeKey(source, target));
      }
    }
  });
}

function addPathEdges(path: string[], visibleEdges: Set<string>): void {
  path.slice(0, -1).forEach((source, index) => {
    const target = path[index + 1];

    if (source !== target) {
      visibleEdges.add(createEdgeKey(source, target));
    }
  });
}

function createDegreesFromEdgeKeys(edgeKeys: Set<string>): Map<string, number> {
  const degrees = new Map<string, number>();

  edgeKeys.forEach((edgeKey) => {
    const [source, target] = edgeKey.split("--");

    degrees.set(source, (degrees.get(source) ?? 0) + 1);
    degrees.set(target, (degrees.get(target) ?? 0) + 1);
  });

  return degrees;
}

function scoreSequence(
  sequence: string[],
  servedKeys: Set<string>,
  currentKey?: string,
): number {
  const overlap = sequence.filter((key) => servedKeys.has(key)).length;
  const currentBonus = currentKey && sequence.includes(currentKey) ? 1000 : 0;

  return overlap * 120 + currentBonus + sequence.length;
}

function getMaxPositionX(
  positions: Map<string, { x: number; y: number }>,
): number {
  return Math.max(
    0,
    ...Array.from(positions.values()).map((position) => position.x),
  );
}

function getMinPositionX(
  positions: Map<string, { x: number; y: number }>,
): number {
  return Math.min(
    0,
    ...Array.from(positions.values()).map((position) => position.x),
  );
}

function* createLaneSteps(): Generator<number, never, unknown> {
  let magnitude = 1;

  while (true) {
    yield magnitude;
    yield -magnitude;
    magnitude += 1;
  }
}

function createDagreLayout(graph: {
  nodes: PatternGraphNode[];
  edges: PatternGraphEdge[];
}): Map<string, { x: number; y: number }> {
  const layoutGraph = new dagre.graphlib.Graph();

  layoutGraph.setDefaultEdgeLabel(() => ({}));
  layoutGraph.setGraph({
    rankdir: "LR",
    align: "UL",
    ranksep: RANK_SEPARATOR,
    nodesep: NODE_SEPARATOR,
    edgesep: 24,
    marginx: 34,
    marginy: 28,
  });

  graph.nodes.forEach((node) => {
    layoutGraph.setNode(node.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  });
  graph.edges.forEach((edge) => {
    layoutGraph.setEdge(edge.source, edge.target, {
      weight: edge.active ? 3 : 1,
      minlen: 1,
    });
  });

  dagre.layout(layoutGraph);

  return new Map(
    graph.nodes.map((node) => {
      const layoutNode = layoutGraph.node(node.id);

      return [
        node.id,
        {
          x: layoutNode?.x ?? 0,
          y: layoutNode?.y ?? 0,
        },
      ];
    }),
  );
}

function buildPatternGraph(
  calls: DepartureCall[],
  lineTopology: LineRouteSequence[],
): {
  nodes: PatternGraphNode[];
  edges: PatternGraphEdge[];
} {
  const callMap = new Map<string, DepartureCall>();

  calls.forEach((call) => {
    callMap.set(createStationKey(call), call);
  });

  const nodeMap = new Map<string, PatternGraphNode>();
  const edgeMap = new Map<string, PatternGraphEdge>();

  lineTopology.forEach((sequence) => {
    const stops = dedupeRouteStops(sequence.stops);

    stops.forEach((stop) => {
      const call = findCallForStop(callMap, stop);
      const key = createStationKey(stop);
      const existing = nodeMap.get(key);

      nodeMap.set(key, {
        id: key,
        label: existing?.label ?? call?.label ?? stop.label,
        city: existing?.city ?? call?.city ?? stop.city,
        lon: existing?.lon ?? stop.lon,
        lat: existing?.lat ?? stop.lat,
        current: Boolean(existing?.current || call?.current),
        served: Boolean(existing?.served || call?.served),
        time: existing?.time ?? call?.time,
        transfers: mergeTransfers(
          existing?.transfers,
          stop.transferLines,
          call?.transferLines,
        ),
        degree: existing?.degree ?? 0,
      });
    });

    stops.slice(0, -1).forEach((sourceStop, index) => {
      const targetStop = stops[index + 1];
      const source = createStationKey(sourceStop);
      const target = createStationKey(targetStop);
      const edgeKey = createEdgeKey(source, target);

      if (source === target || edgeMap.has(edgeKey)) {
        return;
      }

      edgeMap.set(edgeKey, {
        id: edgeKey,
        source,
        target,
        active: false,
        distanceKm: getStopDistanceKm(sourceStop, targetStop),
      });
    });
  });

  if (nodeMap.size === 0) {
    calls.forEach((call) => {
      const key = createStationKey(call);

      nodeMap.set(key, {
        id: key,
        label: call.label,
        city: call.city,
        current: call.current,
        served: call.served,
        time: call.time,
        transfers: call.transferLines ?? [],
        degree: 0,
      });
    });
    calls.slice(0, -1).forEach((call, index) => {
      const source = createStationKey(call);
      const target = createStationKey(calls[index + 1]);

      if (source !== target) {
        edgeMap.set(createEdgeKey(source, target), {
          id: createEdgeKey(source, target),
          source,
          target,
          active: false,
        });
      }
    });
  }

  const servedEdges = createServedEdgeKeys(calls);
  const corridorEdges = createActiveCorridorEdgeKeys(calls, lineTopology);
  pruneImplausibleEdges(edgeMap, servedEdges, corridorEdges);

  edgeMap.forEach((edge) => {
    const edgeKey = createEdgeKey(edge.source, edge.target);

    edge.active = servedEdges.has(edgeKey) || corridorEdges.has(edgeKey);
    nodeMap.get(edge.source)!.degree += 1;
    nodeMap.get(edge.target)!.degree += 1;
  });

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
  };
}

function pruneImplausibleEdges(
  edgeMap: Map<string, PatternGraphEdge>,
  protectedEdges: Set<string>,
  activeCorridorEdges: Set<string>,
): void {
  const distances = Array.from(edgeMap.values())
    .map((edge) => edge.distanceKm)
    .filter(
      (distance): distance is number =>
        typeof distance === "number" &&
        Number.isFinite(distance) &&
        distance > 0,
    )
    .sort((left, right) => left - right);

  if (distances.length < 8) {
    return;
  }

  const medianDistance = distances[Math.floor(distances.length / 2)];
  const threshold = Math.min(8, Math.max(3.2, medianDistance * 3.2));

  edgeMap.forEach((edge, edgeKey) => {
    if (
      protectedEdges.has(edgeKey) ||
      activeCorridorEdges.has(edgeKey) ||
      edge.distanceKm === undefined
    ) {
      return;
    }

    if (edge.distanceKm > threshold) {
      edgeMap.delete(edgeKey);
    }
  });
}

function createServedEdgeKeys(calls: DepartureCall[]): Set<string> {
  return new Set(createServedEdgeKeyList(calls));
}

function createServedEdgeKeyList(calls: DepartureCall[]): string[] {
  const servedCalls = calls.filter((call) => call.served);
  const edgeKeys: string[] = [];

  servedCalls.slice(0, -1).forEach((call, index) => {
    const source = createStationKey(call);
    const target = createStationKey(servedCalls[index + 1]);

    if (source !== target) {
      edgeKeys.push(createEdgeKey(source, target));
    }
  });

  return edgeKeys;
}

function getServedDestinationKey(calls: DepartureCall[]): string | undefined {
  const servedCalls = calls.filter((call) => call.served);
  const destinationCall = servedCalls[servedCalls.length - 1];

  return destinationCall ? createStationKey(destinationCall) : undefined;
}

function createActiveCorridorEdgeKeys(
  calls: DepartureCall[],
  lineTopology: LineRouteSequence[],
): Set<string> {
  return new Set(createActiveRouteEdgeKeyList(calls, lineTopology));
}

function createActiveRouteEdgeOrder(
  calls: DepartureCall[],
  lineTopology: LineRouteSequence[],
): Map<string, number> {
  return new Map(
    createActiveRouteEdgeKeyList(calls, lineTopology).map((key, index) => [
      key,
      index,
    ]),
  );
}

function createActiveRouteEdgeKeyList(
  calls: DepartureCall[],
  lineTopology: LineRouteSequence[],
): string[] {
  const servedCallKeys = calls
    .filter((call) => call.served)
    .map(createStationKey);
  const servedKeys = new Set(servedCallKeys);
  const currentKey = calls.find((call) => call.current)
    ? createStationKey(calls.find((call) => call.current)!)
    : undefined;
  const sequences = lineTopology
    .map((sequence) => dedupeRouteStops(sequence.stops).map(createStationKey))
    .filter((sequence) => sequence.length > 1);
  const sequence = [...sequences].sort(
    (left, right) =>
      scoreSequence(right, servedKeys, currentKey) -
      scoreSequence(left, servedKeys, currentKey),
  )[0];

  if (!sequence) {
    return createServedEdgeKeyList(calls);
  }

  const orientedSequence = orientSequenceTowardCalls(sequence, servedCallKeys);
  const firstServedKey = servedCallKeys.find((key) =>
    orientedSequence.includes(key),
  );
  const lastServedKey = [...servedCallKeys]
    .reverse()
    .find((key) => orientedSequence.includes(key));
  const servedIndexes = orientedSequence
    .map((key, index) => (servedKeys.has(key) ? index : -1))
    .filter((index) => index >= 0);

  if (servedIndexes.length < 2) {
    return createServedEdgeKeyList(calls);
  }

  const firstIndex =
    firstServedKey !== undefined
      ? orientedSequence.indexOf(firstServedKey)
      : -1;
  const lastIndex =
    lastServedKey !== undefined ? orientedSequence.indexOf(lastServedKey) : -1;
  const startIndex =
    firstIndex >= 0 && lastIndex >= 0
      ? Math.min(firstIndex, lastIndex)
      : Math.min(...servedIndexes);
  const endIndex =
    firstIndex >= 0 && lastIndex >= 0
      ? Math.max(firstIndex, lastIndex)
      : Math.max(...servedIndexes);
  const edgeKeys: string[] = [];

  orientedSequence.slice(startIndex, endIndex).forEach((source, index) => {
    const target = orientedSequence[startIndex + index + 1];

    if (source !== target) {
      edgeKeys.push(createEdgeKey(source, target));
    }
  });

  return edgeKeys;
}

function orientSequenceTowardCalls(
  sequence: string[],
  servedCallKeys: string[],
): string[] {
  const firstServedKey = servedCallKeys.find((key) => sequence.includes(key));
  const lastServedKey = [...servedCallKeys]
    .reverse()
    .find((key) => sequence.includes(key));

  if (!firstServedKey || !lastServedKey) {
    return sequence;
  }

  const firstIndex = sequence.indexOf(firstServedKey);
  const lastIndex = sequence.indexOf(lastServedKey);

  return lastIndex < firstIndex ? [...sequence].reverse() : sequence;
}

function getActiveTerminalIds(graph: {
  nodes: PatternGraphNode[];
  edges: PatternGraphEdge[];
}): Set<string> {
  const activeDegree = new Map<string, number>();

  graph.edges
    .filter((edge) => edge.active)
    .forEach((edge) => {
      activeDegree.set(edge.source, (activeDegree.get(edge.source) ?? 0) + 1);
      activeDegree.set(edge.target, (activeDegree.get(edge.target) ?? 0) + 1);
    });

  return new Set(
    graph.nodes
      .filter((node) => node.served && (activeDegree.get(node.id) ?? 0) <= 1)
      .map((node) => node.id),
  );
}

function getBranchChip(
  node: PatternGraphNode,
  activeTerminalIds: Set<string>,
  departureTimeLabel: string,
): string | undefined {
  if (activeTerminalIds.has(node.id) && departureTimeLabel) {
    return node.current ? "Départ" : departureTimeLabel;
  }

  if (!node.served && node.degree <= 1) {
    return "Non desservi";
  }

  return undefined;
}

function dedupeRouteStops(stops: LineRouteStop[]): LineRouteStop[] {
  const seen = new Set<string>();

  return stops.filter((stop) => {
    const key = createStationKey(stop);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function findCallForStop(
  callMap: Map<string, DepartureCall>,
  stop: LineRouteStop,
): DepartureCall | undefined {
  const stopKey = createStationKey(stop);
  const exactMatch = callMap.get(stopKey);

  if (exactMatch) {
    return exactMatch;
  }

  return Array.from(callMap.values()).find((call) =>
    stationKeysAreCompatible(stopKey, createStationKey(call)),
  );
}

function mergeTransfers(
  ...transferGroups: Array<TransferLineOption[] | undefined>
): TransferLineOption[] {
  const transfers = new Map<string, TransferLineOption>();

  transferGroups
    .flatMap((group) => group ?? [])
    .forEach((transfer) => {
      const key = `${transfer.family ?? ""}:${transfer.id}:${transfer.label}`;

      if (!transfers.has(key)) {
        transfers.set(key, transfer);
      }
    });

  return Array.from(transfers.values()).slice(0, 40);
}

function isBusTransfer(transfer: TransferLineOption): boolean {
  return (
    transfer.family === "BUS" ||
    normalizeStationName(transfer.mode ?? "").includes("bus")
  );
}

function stationKeysAreCompatible(left: string, right: string): boolean {
  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  const shortestLength = Math.min(left.length, right.length);

  return shortestLength >= 6 && (left.includes(right) || right.includes(left));
}

function getNodeDistanceKm(
  sourceNode: PatternGraphNode,
  targetNode: PatternGraphNode,
): number | undefined {
  if (
    sourceNode.lat === undefined ||
    sourceNode.lon === undefined ||
    targetNode.lat === undefined ||
    targetNode.lon === undefined
  ) {
    return undefined;
  }

  return getCoordinatesDistanceKm(
    sourceNode.lat,
    sourceNode.lon,
    targetNode.lat,
    targetNode.lon,
  );
}

function getStopDistanceKm(
  sourceStop: LineRouteStop,
  targetStop: LineRouteStop,
): number | undefined {
  if (
    sourceStop.lat === undefined ||
    sourceStop.lon === undefined ||
    targetStop.lat === undefined ||
    targetStop.lon === undefined
  ) {
    return undefined;
  }

  return getCoordinatesDistanceKm(
    sourceStop.lat,
    sourceStop.lon,
    targetStop.lat,
    targetStop.lon,
  );
}

function getCoordinatesDistanceKm(
  sourceLatValue: number,
  sourceLonValue: number,
  targetLatValue: number,
  targetLonValue: number,
): number {
  const earthRadiusKm = 6371;
  const sourceLat = toRadians(sourceLatValue);
  const targetLat = toRadians(targetLatValue);
  const deltaLat = toRadians(targetLatValue - sourceLatValue);
  const deltaLon = toRadians(targetLonValue - sourceLonValue);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(sourceLat) * Math.cos(targetLat) * Math.sin(deltaLon / 2) ** 2;

  return (
    2 *
    earthRadiusKm *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function createStationKey(stop: {
  id?: string;
  label: string;
  station?: { scheduleStopAreaRef?: string };
  stopAreaRef?: string;
}): string {
  return normalizeStationName(
    stop.station?.scheduleStopAreaRef ??
      stop.stopAreaRef ??
      getStableTopologyStopId(stop.id) ??
      stop.label,
  );
}

function getStableTopologyStopId(id?: string): string | undefined {
  if (!id || id.startsWith("call:")) {
    return undefined;
  }

  return id;
}

function createEdgeKey(source: string, target: string): string {
  return [source, target].sort().join("--");
}

function normalizeStationName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "");
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-scale">
      <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
        <section
          class="modal-panel modal-panel--wide pattern-modal"
          aria-modal="true"
          role="dialog"
        >
          <header class="modal-panel__header">
            <div class="pattern-modal__title">
              <LineIconBadge
                v-if="board"
                class="pattern-modal__line"
                :line="board.line"
              />
              <div>
                <p class="eyebrow">{{ serviceLabel }}</p>
                <h2>{{ departure?.destination ?? "Desserte du passage" }}</h2>
                <span v-if="board">
                  {{ board.title }}
                  <template v-if="departure?.platform">
                    · Quai {{ departure.platform }}</template
                  >
                </span>
              </div>
            </div>
            <button
              class="icon-button"
              type="button"
              aria-label="Fermer"
              @click="emit('close')"
            >
              ×
            </button>
          </header>

          <div class="pattern-modal__body">
            <div v-if="loading" class="pattern-modal__state">
              <span aria-hidden="true" class="loader-dot"></span>
              Chargement de la desserte
            </div>

            <div
              v-else-if="error || pattern?.error"
              class="pattern-modal__state pattern-modal__state--error"
            >
              {{
                error || pattern?.error || "Impossible de charger la desserte."
              }}
            </div>

            <div
              v-else-if="pattern && pattern.calls.length > 0"
              class="pattern-board"
              :style="{ '--line-color': board?.line.color ?? '#0064ff' }"
            >
              <aside class="pattern-board__summary">
                <div class="pattern-board__line">
                  <LineIconBadge v-if="board" :line="board.line" />
                  <span v-else>{{ departure?.lineRef ?? "" }}</span>
                </div>
                <p>{{ serviceLabel }}</p>
                <strong>{{ destinationLabel }}</strong>
                <small v-if="board">
                  {{ board.title }}
                  <template v-if="departure?.platform">
                    · Quai {{ departure.platform }}</template
                  >
                </small>
              </aside>

              <div class="pattern-board__display">
                <div class="pattern-board__top-strip">
                  <div>
                    <span>Direction</span>
                    <strong>{{ destinationLabel }}</strong>
                  </div>
                  <div class="pattern-board__meta">
                    <span>{{ servedStopsLabel }}</span>
                    <strong>{{ departureClock || "--:--" }}</strong>
                  </div>
                </div>

                <div class="pattern-flow-shell">
                  <VueFlow
                    pan-on-drag
                    :key="pattern.departureId"
                    class="pattern-flow"
                    :nodes="flowModel.nodes"
                    :edges="flowModel.edges"
                    :default-viewport="initialViewport"
                    :fit-view-on-init="false"
                    :min-zoom="0.34"
                    :max-zoom="1.7"
                    :nodes-draggable="false"
                    :nodes-connectable="false"
                    :elements-selectable="false"
                    :pan-on-drag="true"
                    :zoom-on-scroll="true"
                    :zoom-on-pinch="true"
                    :prevent-scrolling="false"
                  >
                    <Controls :show-interactive="false" :position="PanelPosition.BottomRight" />
                    <template #node-station="{ data }">
                      <div
                        class="pattern-flow-station"
                        :data-station-key="data.key"
                        :data-station-label="data.label"
                        :data-served="data.served ? 'true' : 'false'"
                        :data-current="data.current ? 'true' : 'false'"
                        :class="{
                          'pattern-flow-station--current': data.current,
                          'pattern-flow-station--skipped': !data.served,
                          'pattern-flow-station--terminal': data.branchEnd,
                        }"
                        :title="
                          data.served
                            ? undefined
                            : 'Non desservi pour ce trajet'
                        "
                      >
                        <Handle
                          id="station-target"
                          class="pattern-flow-station__handle pattern-flow-station__handle--target"
                          type="target"
                          :position="Position.Left"
                        />
                        <Handle
                          id="station-source"
                          class="pattern-flow-station__handle pattern-flow-station__handle--source"
                          type="source"
                          :position="Position.Right"
                        />
                        <span
                          class="pattern-flow-station__dot"
                          aria-hidden="true"
                        ></span>
                        <strong>{{ data.label }}</strong>
                        <span
                          v-if="data.nonBusTransfers.length > 0"
                          class="pattern-flow-station__transfers pattern-flow-station__transfers--inline"
                          aria-label="Correspondances hors bus"
                        >
                          <LineIconBadge
                            v-for="transfer in data.nonBusTransfers"
                            :key="`${data.key}-non-bus-${transfer.id}-${transfer.label}`"
                            class="pattern-flow-station__transfer"
                            :line="transfer"
                            compact
                          />
                        </span>
                        <small v-if="data.time">{{
                          formatClock(data.time)
                        }}</small>
                        <small v-else-if="!data.served">Non desservi</small>
                        <em v-if="data.branchChip">{{ data.branchChip }}</em>
                        <span
                          v-if="data.busTransfers.length > 0"
                          class="pattern-flow-station__transfer-tooltip"
                          role="tooltip"
                        >
                          <span class="pattern-flow-station__transfer-title">
                            Bus
                          </span>
                          <span class="pattern-flow-station__transfers">
                            <LineIconBadge
                              v-for="transfer in data.busTransfers"
                              :key="`${data.key}-bus-${transfer.id}-${transfer.label}`"
                              class="pattern-flow-station__transfer"
                              :line="transfer"
                              compact
                            />
                          </span>
                        </span>
                      </div>
                    </template>
                  </VueFlow>
                </div>
              </div>
            </div>

            <div v-else class="pattern-modal__state">
              Desserte indisponible pour ce passage.
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
