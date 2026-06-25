import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const patternBoardCss = readFileSync(
  new URL("../src/styles/07-pattern-board.css", import.meta.url),
  "utf8",
);

describe("pattern flow CSS regressions", () => {
  it("keeps station handles anchored to the visual station dot", () => {
    expect(patternBoardCss).toMatch(
      /\.pattern-flow\s+\.vue-flow__handle\.pattern-flow-station__handle\s*\{[^}]*top:\s*var\(--station-dot-center-y\)/su,
    );
    expect(patternBoardCss).toMatch(
      /\.vue-flow__handle-left\.pattern-flow-station__handle--target\s*\{[^}]*left:\s*calc\(50% - var\(--station-dot-size\) \/ 2\)/su,
    );
    expect(patternBoardCss).toMatch(
      /\.vue-flow__handle-right\.pattern-flow-station__handle--source\s*\{[^}]*right:\s*calc\(50% - var\(--station-dot-size\) \/ 2\)/su,
    );
  });

  it("draws active light edges as a continuous glow", () => {
    const lightEdgeBlock = patternBoardCss.match(
      /\.pattern-flow-edge--light \.vue-flow__edge-path\s*\{(?<block>[^}]*)\}/u,
    )?.groups?.block;

    expect(lightEdgeBlock).toContain("stroke-dasharray: none");
    expect(lightEdgeBlock).not.toMatch(/stroke-dasharray:\s*\d/u);
  });
});
