import { Window } from "happy-dom";
import { afterAll, describe, expect, it } from "vitest";
import { parseMunicipalMarketPage } from "../scripts/places/compile-municipal-markets";
import { foodMarketCandidates, scoreFoodMarkets } from "../src/features/nearby-stations/neighborhood/criteria/foodMarkets";

const window = new Window();
afterAll(() => window.close());

const page = {
  id: 42,
  link: "https://ville.example/economie/marche-des-halles",
  title: { rendered: "Le marché des Halles" },
  content: { rendered: `<h2>Marché des Halles</h2>
    <p>5 rue de la République<br />Les vendredis et dimanches matin, de 8h à 13h (de novembre à mars)
    et de 8h à 14h (d&rsquo;avril à octobre).<br />Ouverture exceptionnellement le jeudi.</p>
    <p>Primeurs, traiteurs et poissonniers.</p>` },
};

describe("municipal market import", () => {
  it("extracts the official address, two recurring days and both published seasonal ranges", () => {
    expect(parseMunicipalMarketPage(page, window.document)).toEqual({
      name: "Marché des Halles", address: "5 rue de la République", sessionsPerWeek: 2,
      openingHours: "Nov-Mar Fr,Su 08:00-13:00; Apr-Oct Fr,Su 08:00-14:00",
    });
  });

  it("rejects a public tender or a monthly market", () => {
    expect(parseMunicipalMarketPage({ ...page, title: { rendered: "Marché public alimentaire" } }, window.document)).toBeUndefined();
    const monthly = { ...page, content: { rendered: page.content.rendered.replace("Les vendredis et dimanches matin", "Les dimanches du mois") } };
    expect(parseMunicipalMarketPage(monthly, window.document)).toBeUndefined();
  });

  it("counts the published vendor list without treating unrelated parking space as market area", () => {
    const published = { ...page, content: { rendered: page.content.rendered +
      "<p>Parking à proximité de 900 m².</p><h3>Les commerçants du marché</h3><p>• Primeur<br>• Poissonnier</p>" } };
    expect(parseMunicipalMarketPage(published, window.document)).toMatchObject({ listedTraders: 2 });
    expect(parseMunicipalMarketPage(published, window.document)?.areaM2).toBeUndefined();
    published.content.rendered += "<p>La superficie du marché est de 1 250 m².</p>";
    expect(parseMunicipalMarketPage(published, window.document)?.areaM2).toBe(1250);
  });

  it("qualifies a generated municipal market without a matching OSM element", () => {
    const [market] = foodMarketCandidates([], [{ distanceMeters: 100, place: {
      id: "municipal-market:00000:42", name: "Marché des Halles", address: "5 rue de la République",
      city: "Ville exemple", cityCode: "00000", lon: 2, lat: 48, sessionsPerWeek: 2, sourceUrl: page.link,
    } }]);
    expect(scoreFoodMarkets([{ ...market!, walkSeconds: 180 }])).toMatchObject({
      points: 0.5, facts: [{ evidence: { sourceUrl: page.link }, labelValues: { name: "Marché des Halles", sessions: 2 } }],
    });
  });
});
