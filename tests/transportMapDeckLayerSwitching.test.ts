import { AttributeManager } from "@deck.gl/core";
import { PathLayer } from "@deck.gl/layers";
import { describe, expect, it, vi } from "vitest";
import type { TransportMapRenderFrame } from "../src/features/transport-map/contracts/renderer";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { createDeckTransportLayers } from "../src/features/transport-map/next/deckMapLayers";
import { createDeckPathBinaryPacket } from "../src/features/transport-map/render/deckgl/deckPathPacket";
import type { TransportMapPathRenderRecord } from "../src/features/transport-map/render/transportMapRenderModel";

type PathRole = "base" | "traffic" | "highlight";

function createFrame(role: PathRole, line: "B" | "C", binary: boolean): TransportMapRenderFrame {
  // C's larger buffer must be reusable for B's provisional geometry. That is
  // when Deck can upload XYZ vertices without resetting its previous XY stride.
  const positions = new Float64Array((line === "C" ? 2_000 : 20) * 2);
  for (let index = 0; index < positions.length; index += 2) {
    positions[index] = 2.3 + index * 0.00001;
    positions[index + 1] = 48.8 + index * 0.00001;
  }
  const record: TransportMapPathRenderRecord = {
    id: `path:${line}`,
    pathId: `path:${line}`,
    lineId: `line:${line}`,
    subpathIndex: 0,
    positions,
    color: [108, 136, 209, 255],
    widthCssPx: 3,
    alpha: 1,
    order: 0,
    dash: role === "traffic" ? "traffic-interruption" : "solid",
  };
  return {
    camera: createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 10 }),
    scene: {
      interactionActive: !binary,
      allowGeometrySwapDuringInteraction: !binary,
    } as TransportMapRenderFrame["scene"],
    model: {
      sceneVersion: 1,
      pathCount: 1,
      vertexCount: positions.length / 2,
      basePaths: role === "base" ? [record] : [],
      trafficPaths: role === "traffic" ? [record] : [],
      highlightPaths: role === "highlight" ? [record] : [],
      stations: [],
      quays: [],
      entrances: [],
      labels: [],
    } as TransportMapRenderFrame["model"],
    binaryPackets: binary
      ? { [role]: createDeckPathBinaryPacket([record], `${role}:${line}`) }
      : undefined,
  };
}

/** Exercise Deck's real tessellator and attributes, replacing only GPU storage. */
function createPathLayerHarness() {
  const device = {
    type: "webgl",
    createBuffer: (props: { byteLength: number }) => ({
      props,
      byteLength: props.byteLength,
      write: vi.fn(),
      destroy: vi.fn(),
      delete: vi.fn(),
    }),
  };
  const managers = new Set<AttributeManager>();
  let previous: PathLayer | undefined;

  return {
    present(frame: TransportMapRenderFrame) {
      const layer = createDeckTransportLayers(frame, undefined)[0] as PathLayer;
      expect(layer).toBeInstanceOf(PathLayer);

      // Deck matches successive layers by id and transfers their entire state.
      const matched = previous?.id === layer.id ? previous : undefined;
      const attributes = matched?.getAttributeManager() ?? new AttributeManager(device as never);
      managers.add(attributes);
      layer.state = matched?.state ?? ({} as PathLayer["state"]);
      layer.internalState = { attributeManager: attributes, hasPickingBuffer: false } as never;
      layer.context = { viewport: {} } as never;
      vi.spyOn(layer, "setState").mockImplementation((partial) => {
        Object.assign(layer.state, partial);
      });
      if (!matched) {
        layer.initializeState();
        // Only position and segment attributes are needed to check geometry.
        attributes.remove(["instanceColors", "instanceStrokeWidths", "instancePickingColors"]);
      }
      const dataChanged = !matched || layer.props.data !== matched.props.data;
      layer.updateState({
        props: layer.props,
        oldProps: previous?.props ?? layer.props,
        context: layer.context,
        changeFlags: {
          dataChanged: dataChanged ? "Line geometry changed" : false,
          propsChanged: false,
          updateTriggersChanged: false,
          extensionsChanged: false,
          viewportChanged: true,
          stateChanged: false,
          propsOrDataChanged: dataChanged,
          somethingChanged: true,
        },
      });
      attributes.update({
        data: layer.props.data,
        numInstances: layer.state.pathTesselator.instanceCount,
        startIndices: layer.state.pathTesselator.vertexStarts,
        props: layer.props,
        buffers: (layer.props.data as { attributes?: object }).attributes ?? {},
        context: layer,
        transitions: {},
      });
      previous = layer;
      return attributes.getAttributes().vertexPositions!;
    },
    dispose() {
      for (const manager of managers) manager.finalize();
    },
  };
}

describe("Deck geometry during animated line switching", () => {
  it.each<PathRole>(["base", "traffic", "highlight"])(
    "keeps %s vertex coordinates aligned across binary and provisional frames",
    (role) => {
      const harness = createPathLayerHarness();
      try {
        for (const [line, binary] of [
          ["C", false],
          ["C", true],
          ["B", false],
          ["B", true],
          ["C", false],
          ["C", true],
          ["B", false],
        ] as const) {
          const frame = createFrame(role, line, binary);
          const positions = harness.present(frame);
          const expectedSize = binary ? 2 : 3;
          expect(positions.getAccessor().size, `${line}, binary=${binary}`).toBe(expectedSize);
          expect(positions.getBufferLayout().byteStride).toBe(
            expectedSize * Float64Array.BYTES_PER_ELEMENT,
          );

          // A camera-only frame must keep reusing the same valid attributes.
          expect(
            harness.present({
              ...frame,
              camera: { ...frame.camera, centerWorldY: frame.camera.centerWorldY + 0.0001 },
            }),
          ).toBe(positions);
        }
      } finally {
        harness.dispose();
      }
    },
  );
});
