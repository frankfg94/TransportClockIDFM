import { describe, expect, it } from "vitest";
import { createDashboardTrafficBranchFilter } from "../src/features/traffic/dashboardTrafficBranches";
import { getBoardTrafficAlertForReport, type BoardTrafficAlertMessages } from "../src/features/traffic/boardTrafficAlert";
import type { TrafficDisruption, TrafficLineReport } from "../src/features/traffic/types";
import { rerABoard, rerABranchTopology, rerADisruption, rerALineRef } from "./fixtures/dashboardTrafficBranches";

const filter = createDashboardTrafficBranchFilter(rerABranchTopology);
const poissy = rerABoard("poissy");
const boissy = rerABoard("boissy");
const chatelet = rerABoard("chatelet");
const poissyInterruption = rerADisruption(
  "poissy-interruption",
  "Le trafic est interrompu entre Maisons-Laffitte et Poissy.",
  { impactedStopNames: ["Maisons-Laffitte", "Poissy"] },
);
const centralDisturbance = rerADisruption(
  "central-disturbance",
  "Le trafic est perturbé entre Nanterre–Préfecture et Vincennes.",
);
const branchStemInterruption = rerADisruption(
  "west-interruption",
  "Le trafic est interrompu entre Nanterre–Préfecture et Cergy le Haut / Poissy.",
);

function report(...disruptions: TrafficDisruption[]): TrafficLineReport {
  return { lineRef: rerALineRef, status: "disrupted", disruptions };
}

describe("dashboard traffic branch filter", () => {
  it("keeps the common trunk and takes the union of the visible station branches", () => {
    const raw = report(poissyInterruption, centralDisturbance, branchStemInterruption);
    expect(filter(raw, [boissy]).disruptions).toEqual([centralDisturbance]);
    expect(filter(raw, [poissy, boissy])).toBe(raw);
    expect(filter(raw, [chatelet])).toBe(raw);
    expect(filter(raw, [])).toBe(raw);
  });

  it("retains an interruption on a shared approach for its descendant branches", () => {
    const raw = report(poissyInterruption, branchStemInterruption);
    expect(filter(raw, [rerABoard("cergy")]).disruptions).toEqual([branchStemInterruption]);
    expect(filter(raw, [rerABoard("sartrouville")])).toBe(raw);
    expect(filter(raw, [boissy])).toMatchObject({ disruptions: [], status: "normal" });
  });

  it("keeps line-wide, mixed central and uncertain impacts and resolves exact stop references", () => {
    const uncertain = rerADisruption("partial", "Le trafic est interrompu entre Gares inconnues et Poissy.");
    const rest = { ...poissyInterruption, message: poissyInterruption.message + " Le reste de la ligne est perturbé." };
    const mixed = rerADisruption("mixed", "Le trafic est interrompu entre Maisons-Laffitte et Poissy. Le trafic est perturbé entre Nanterre–Préfecture et Vincennes.");
    const stopOnly = rerADisruption("stop", "", { impactedStopNames: ["Poissy"] });
    const raw = report(poissyInterruption, uncertain, rest, mixed, stopOnly);
    expect(filter(raw, [{
      ...boissy,
      title: "Nom personnalisé",
      schedule: { lineRef: rerALineRef, stopAreaRef: "stop_area:IDFM:test-boissy" },
    }]).disruptions).toEqual([uncertain, rest, mixed]);
  });

  it("filters the list before building multiple-interruption targets for a station", () => {
    const second = { ...poissyInterruption, id: "another-poissy-interruption" };
    const boissyInterruption = rerADisruption(
      "boissy-interruption", "Le trafic est interrompu entre Vincennes et Boissy-Saint-Léger.",
    );
    const messages: BoardTrafficAlertMessages = {
      disruption: "Perturbation",
      disruptionAndInterruptionAt: () => "",
      interruption: "Interruption",
      multipleInterruptions: "Interruption multiple",
      interruptionAt: () => "",
      interruptionInDay: () => "",
      interruptionInDays: () => "",
      interruptionToday: "",
    };
    const raw = report(poissyInterruption, boissyInterruption, second);
    const poissyAlert = getBoardTrafficAlertForReport(filter(raw, [poissy]), { lookaheadDays: 7, messages });
    expect(poissyAlert?.label).toBe("Interruption multiple");
    expect(poissyAlert?.targets?.map(({ alertId }) => alertId)).toEqual([poissyInterruption.id, second.id]);
    const boissyAlert = getBoardTrafficAlertForReport(filter(raw, [boissy]), { lookaheadDays: 7, messages });
    expect(boissyAlert?.target.alertId).toBe(boissyInterruption.id);
    expect(boissyAlert?.targets).toBeUndefined();
  });
});
