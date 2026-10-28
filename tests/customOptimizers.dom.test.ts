import { afterEach, describe, expect, it } from "vitest";
import { createCustomOptimizer, deleteCustomOptimizer, readCustomOptimizers } from "../src/features/line-optimizer/customOptimizers";
afterEach(() => localStorage.clear());
describe("custom optimizers", () => {
  it("saves distinct journeys and deletes only the selected one", () => {
    const first = createCustomOptimizer(" Travail ", " Départ ", " Arrivée ");
    const second = createCustomOptimizer("Autre", "A", "B");
    expect(readCustomOptimizers()).toEqual([{ ...first, name: "Travail", origin: "Départ", destination: "Arrivée" }, second]);
    deleteCustomOptimizer(first.id);
    expect(readCustomOptimizers()).toEqual([second]);
  });
});
