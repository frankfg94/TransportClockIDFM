import { describe, expect, it } from "vitest";
import {
  getTrafficLineStatus,
  normalizeNavitiaLineReportPayload,
  normalizeTrafficLineRef,
} from "../src/features/traffic";
import { getPatternTrafficSummaryCopy } from "../src/features/service-pattern/trafficCalendarSummary";

describe("traffic normalization", () => {
  it("normalizes Navitia line_reports disruptions and impacted lines", () => {
    const disruptions = normalizeNavitiaLineReportPayload(
      {
        line_reports: [
          {
            disruptions: [
              {
                id: "work-1",
                messages: [{ text: "Travaux nocturnes" }],
                severity: { name: "Information" },
                application_periods: [
                  {
                    begin: "2026-05-26T22:00:00+02:00",
                    end: "2026-05-27T05:00:00+02:00",
                  },
                ],
                impacted_objects: [
                  {
                    pt_object: {
                      embedded_type: "line",
                      id: "line:IDFM:C01743",
                      name: "RER B",
                    },
                  },
                  {
                    pt_object: {
                      embedded_type: "stop_area",
                      name: "La Croix de Berny",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      "STIF:Line::C01743:",
    );

    expect(disruptions).toHaveLength(1);
    expect(disruptions[0].title).toBe("Travaux nocturnes");
    expect(disruptions[0].kind).toBe("works");
    expect(disruptions[0].impactedLineRefs).toContain("line:IDFM:C01743");
    expect(disruptions[0].impactedStopNames).toContain("La Croix de Berny");
    expect(getTrafficLineStatus(disruptions)).toBe("planned");
  });

  it("keeps both endpoints of a Navitia impacted_section", () => {
    const [disruption] = normalizeNavitiaLineReportPayload(
      {
        disruptions: [
          {
            id: "metro-13-south-works",
            status: "active",
            severity: { effect: "NO_SERVICE", name: "bloquante" },
            messages: [{ text: "Trafic interrompu" }],
            impacted_objects: [
              {
                pt_object: {
                  embedded_type: "line",
                  id: "line:IDFM:C01383",
                },
                impacted_section: {
                  from: {
                    name: "Malakoff - Rue Étienne Dolet (Malakoff)",
                    stop_area: { name: "Malakoff - Rue Étienne Dolet" },
                  },
                  to: {
                    name: "Châtillon - Montrouge (Bagneux)",
                    stop_area: { name: "Châtillon - Montrouge" },
                  },
                },
              },
            ],
          },
        ],
      },
      "line:IDFM:C01383",
    );

    expect(disruption.impactedStopNames).toEqual([
      "Malakoff - Rue Étienne Dolet (Malakoff)",
      "Châtillon - Montrouge (Bagneux)",
    ]);
  });

  it("keeps root disruptions when Navitia line_reports only link them", () => {
    const disruptions = normalizeNavitiaLineReportPayload(
      {
        disruptions: [
          {
            id: "t1-interruption",
            category: "Incidents",
            status: "active",
            severity: {
              name: "bloquante",
              effect: "NO_SERVICE",
            },
            messages: [
              { text: "Trafic interrompu" },
              {
                text: "Tramway T1 : Mesures de sécurité - Trafic interrompu",
              },
            ],
            impacted_objects: [
              {
                pt_object: {
                  embedded_type: "line",
                  id: "line:IDFM:C01389",
                  name: "T1",
                },
              },
            ],
          },
        ],
        line_reports: [
          {
            line: {
              id: "line:IDFM:C01389",
              links: [{ id: "t1-interruption", rel: "disruptions" }],
            },
          },
        ],
      },
      "line:IDFM:C01389",
    );

    expect(disruptions).toHaveLength(1);
    expect(disruptions[0].title).toBe("Trafic interrompu");
    expect(disruptions[0].kind).toBe("incident");
    expect(disruptions[0].severity).toBe("bloquante");
    expect(disruptions[0].impactedLineRefs).toContain("line:IDFM:C01389");
    expect(getTrafficLineStatus(disruptions)).toBe("disrupted");
  });

  it("ignores elevator outages so they do not mark traffic as disrupted", () => {
    const disruptions = normalizeNavitiaLineReportPayload(
      {
        disruptions: [
          {
            id: "elevator-1",
            category: "Incidents",
            status: "active",
            severity: { name: "bloquante", effect: "NO_SERVICE" },
            messages: [
              {
                text: "Denfert-Rochereau Panne de l'ascenseur situé Salle d'accès <> Quai 1, direction Sud",
              },
              { text: "Panne d'un ascenseur" },
            ],
            impacted_objects: [
              {
                pt_object: {
                  embedded_type: "line",
                  id: "line:IDFM:C01371",
                  name: "Métro 4",
                },
              },
            ],
          },
        ],
      },
      "line:IDFM:C01371",
    );

    expect(disruptions).toEqual([]);
    expect(getTrafficLineStatus(disruptions)).toBe("normal");
  });

  it("strips html formatting from traffic messages", () => {
    const disruptions = normalizeNavitiaLineReportPayload(
      {
        disruptions: [
          {
            id: "works-html",
            category: "Travaux",
            messages: [
              {
                text: "<p>Du 6 juillet au 24 juillet inclus, le trafic sera interrompu entre Montparnasse Bienvenue et Les Halles.</p>",
              },
              {
                text: "Métro 4 : Travaux - Trafic interrompu",
              },
            ],
          },
        ],
      },
      "line:IDFM:C01371",
    );

    expect(disruptions).toHaveLength(1);
    expect(disruptions[0].title).toBe(
      "Du 6 juillet au 24 juillet inclus, le trafic sera interrompu entre Montparnasse Bienvenue et Les Halles.",
    );
    expect(disruptions[0].title).not.toContain("<p>");
  });

  it("uses the overlapping RER B works campaign motif for the night interruption", () => {
    const disruptions = normalizeNavitiaLineReportPayload(
      {
        disruptions: [
          {
            id: "rer-b-night-interruption",
            category: "Incidents",
            cause: "travaux",
            messages: [
              {
                text: "RER B : La Croix de Berny/Robinson et Aéroport CDG/Mitry-Claye.",
                channel: { name: "titre", types: ["title"] },
              },
              {
                text: "<p>Période : de 22h45 à 02h.<br><br>Le trafic est interrompu entre La Croix de Berny et Aérop. C De Gaulle 2/Mitry - Claye et entre Robinson et Aérop. C De Gaulle 2/Mitry - Claye.<br><br>Un dispositif de bus de remplacement sera mis en place au départ de Gare du Nord.</p>",
                channel: { name: "moteur", types: ["web"] },
              },
            ],
            application_periods: [
              { begin: "20260724T224500", end: "20260725T020000" },
            ],
          },
          {
            id: "rer-b-summer-works",
            category: "Travaux",
            cause: "travaux",
            messages: [
              {
                text: "Grands Travaux d'été : du 25 juillet au 6 août",
                channel: { name: "titre", types: ["title"] },
              },
              {
                text: "<p>Période : toute la journée.<br><br>Motif : Travaux sur le réseau ferré (remplacement de 26 aiguillages dans le secteur de Gare du Nord)</p>",
                channel: { name: "moteur", types: ["web"] },
              },
            ],
            application_periods: [
              { begin: "20260725T000000", end: "20260725T235000" },
            ],
          },
        ],
      },
      "line:IDFM:C01743",
    );

    const interruption = disruptions.find(
      (disruption) => disruption.id === "rer-b-night-interruption",
    );

    expect(interruption?.motif).toBe(
      "Motif : Travaux sur le réseau ferré (remplacement de 26 aiguillages dans le secteur de Gare du Nord)",
    );
    expect(getPatternTrafficSummaryCopy(interruption!)).toEqual({
      title: "Travaux sur le réseau ferroviaire",
      description:
        "Remplacement de 26 aiguillages dans le secteur de Gare du Nord",
    });
  });
  it("converts STIF line references to Navitia line references", () => {
    expect(normalizeTrafficLineRef("STIF:Line::C02528:")).toBe(
      "line:IDFM:C02528",
    );
  });
});
