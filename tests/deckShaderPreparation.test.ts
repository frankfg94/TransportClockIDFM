import { afterEach, describe, expect, it, vi } from "vitest";
import { linkDeckProgram } from "../src/features/transport-map/next/deckShaderPreparation";

function gpu() {
  let completed = false;
  const program = {} as WebGLProgram;
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, LINK_STATUS: 3,
    createProgram: vi.fn(() => program), createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(), compileShader: vi.fn(), attachShader: vi.fn(), linkProgram: vi.fn(),
    getProgramParameter: vi.fn((_program, parameter) => parameter === 37297 ? completed : true),
    isContextLost: vi.fn(() => false), getProgramInfoLog: vi.fn(() => "link error"),
    deleteShader: vi.fn(), deleteProgram: vi.fn(),
  };
  return { gl: gl as unknown as WebGL2RenderingContext, calls: gl, program, complete: () => { completed = true; } };
}
const extension: KHR_parallel_shader_compile = { COMPLETION_STATUS_KHR: 37297 };
afterEach(() => vi.useRealTimers());

describe("nonblocking Deck shader preparation", () => {
  it("keeps LINK_STATUS off the main thread until the driver reports completion", async () => {
    vi.useFakeTimers();
    const device = gpu();
    const pending = linkDeckProgram(device.gl, extension, "vertex", "fragment", () => false);
    await vi.advanceTimersByTimeAsync(24);
    expect(device.calls.getProgramParameter.mock.calls.every((call) => call[1] === 37297)).toBe(true);
    expect(device.calls.deleteProgram).not.toHaveBeenCalled();
    device.complete();
    await vi.advanceTimersByTimeAsync(8);
    expect(await pending).toBe(device.program);
    expect(device.calls.getProgramParameter.mock.calls.at(-1)?.[1]).toBe(3);
    expect(device.calls.deleteShader).toHaveBeenCalledTimes(2);
    expect(device.calls.deleteProgram).not.toHaveBeenCalled();
  });

  it("releases an unfinished program on navigation without querying its link status", async () => {
    vi.useFakeTimers();
    const device = gpu();
    let cancelled = false;
    const pending = linkDeckProgram(device.gl, extension, "vertex", "fragment", () => cancelled);
    cancelled = true;
    await vi.advanceTimersByTimeAsync(8);
    expect(await pending).toBeUndefined();
    expect(device.calls.deleteProgram).toHaveBeenCalledWith(device.program);
    expect(device.calls.getProgramParameter.mock.calls.every((call) => call[1] === 37297)).toBe(true);
  });

  it("reports failed links and frees the native resources", async () => {
    const device = gpu();
    device.complete();
    device.calls.getProgramParameter.mockImplementation((_program, parameter) => parameter === 37297);
    await expect(linkDeckProgram(device.gl, extension, "vertex", "fragment", () => false)).rejects.toThrow("link error");
    expect(device.calls.deleteShader).toHaveBeenCalledTimes(2);
    expect(device.calls.deleteProgram).toHaveBeenCalledWith(device.program);
  });
});
