export interface FlowPoint {
  x: number;
  y: number;
}

export interface DirectedFlowEdge {
  source: string;
  target: string;
}

export function getVisualFlowEdgeEndpoints(
  edge: DirectedFlowEdge,
  positions: Map<string, FlowPoint>,
): DirectedFlowEdge {
  const sourcePosition = positions.get(edge.source);
  const targetPosition = positions.get(edge.target);
  const shouldReverse =
    sourcePosition &&
    targetPosition &&
    (sourcePosition.x > targetPosition.x ||
      (sourcePosition.x === targetPosition.x &&
        sourcePosition.y > targetPosition.y));

  return shouldReverse
    ? { source: edge.target, target: edge.source }
    : { source: edge.source, target: edge.target };
}

export function getFlowLightEdgeClass(params: {
  direction?: DirectedFlowEdge;
  visualEdge: DirectedFlowEdge;
}): string {
  const isVisuallyReversed =
    Boolean(params.direction) &&
    params.visualEdge.source === params.direction?.target &&
    params.visualEdge.target === params.direction?.source;

  return isVisuallyReversed
    ? "pattern-flow-edge--light pattern-flow-edge--light-reverse"
    : "pattern-flow-edge--light";
}
