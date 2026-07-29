import { describe, expect, it, vi } from "vitest";
import {
  clearServerTransferBundles,
  createTransferBundleResponse,
  enrichTransferLineOptionsWithNavitia,
  fetchOfficialConnectionStopNames,
  findMatchingLineStation,
  isSupportedTransferTargetRef,
  listServerTransferBundles,
  resolveOfficialConnectionStopNames,
} from "../server/api/transfer-bundles.post";

describe("transfer bundle endpoint", () => {
  it("caches generated bundles on the Nuxt backend until the backend cache is cleared", async () => {
    await clearServerTransferBundles();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(input.toString());

      if (url.includes("/lines/line:IDFM:C01742/stop_areas?")) {
        return jsonResponse({
          stop_areas: [
            {
              id: "stop_area:IDFM:A",
              label: "Station A",
              name: "Station A",
            },
          ],
        });
      }

      if (url.includes("/places_nearby?")) {
        return jsonResponse({
          places_nearby: [
            {
              embedded_type: "stop_area",
              distance: 120,
              stop_area: {
                id: "stop_area:IDFM:B",
                label: "Station B",
                name: "Station B",
              },
            },
          ],
        });
      }

      if (url.includes("/stop_areas/stop_area:IDFM:B/lines?")) {
        return jsonResponse({
          lines: [
            {
              id: "line:IDFM:C01371",
              code: "1",
              commercial_mode: { id: "commercial_mode:Metro", name: "Metro" },
              name: "Metro 1",
              physical_modes: [{ id: "physical_mode:Metro", name: "Metro" }],
            },
          ],
        });
      }

      return jsonResponse({ lines: [] });
    });

    await createTransferBundleResponse(
      {
        lineId: "line:IDFM:C01742",
        lineLabel: "RER A",
        targets: [{ stopAreaRef: "stop_area:IDFM:A", label: "Station A" }],
        transferResolverMode: "nearby",
      },
      { fetcher: fetcher as unknown as typeof fetch },
    );

    expect(await listServerTransferBundles()).toMatchObject([
      {
        lineId: "line:IDFM:C01742",
        lineLabel: "RER A",
        stopAreaCount: 1,
        transferCount: 1,
        transferResolverMode: "nearby",
      },
    ]);

    await createTransferBundleResponse(
      {
        lineId: "line:IDFM:C01742",
        lineLabel: "RER A",
        targets: [{ stopAreaRef: "stop_area:IDFM:A", label: "Station A" }],
        transferResolverMode: "nearby",
      },
      { fetcher: fetcher as unknown as typeof fetch },
    );

    expect(
      fetcher.mock.calls.filter((call) =>
        decodeURIComponent(String(call[0])).includes(
          "/stop_areas/stop_area:IDFM:B/lines?",
        ),
      ),
    ).toHaveLength(1);

    await clearServerTransferBundles();
    expect(await listServerTransferBundles()).toEqual([]);
  });

  it("reuses a backend bundle for a fresh browser without creating a separate cache", async () => {
    await clearServerTransferBundles();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(input.toString());

      if (url.includes("/lines/line:IDFM:C01742/stop_areas?")) {
        return jsonResponse({
          stop_areas: [
            {
              id: "stop_area:IDFM:A",
              label: "Station A",
              name: "Station A",
            },
          ],
        });
      }

      if (url.includes("/places_nearby?")) {
        return jsonResponse({
          places_nearby: [
            {
              embedded_type: "stop_area",
              distance: 120,
              stop_area: {
                id: "stop_area:IDFM:B",
                label: "Station B",
                name: "Station B",
              },
            },
          ],
        });
      }

      if (url.includes("/stop_areas/stop_area:IDFM:B/lines?")) {
        return jsonResponse({
          lines: [
            {
              id: "line:IDFM:C01371",
              code: "1",
              commercial_mode: { id: "commercial_mode:Metro", name: "Metro" },
              name: "Metro 1",
              physical_modes: [{ id: "physical_mode:Metro", name: "Metro" }],
            },
          ],
        });
      }

      return jsonResponse({ lines: [] });
    });
    const request = {
      lineId: "line:IDFM:C01742",
      lineLabel: "RER A",
      targets: [{ stopAreaRef: "stop_area:IDFM:A", label: "Station A" }],
      transferResolverMode: "nearby" as const,
    };

    const first = await createTransferBundleResponse(
      {
        ...request,
        cacheBust: "browser-a",
      },
      { fetcher: fetcher as unknown as typeof fetch },
    );

    fetcher.mockClear();

    const second = await createTransferBundleResponse(
      {
        ...request,
        cacheBust: "browser-b",
      },
      { fetcher: fetcher as unknown as typeof fetch },
    );

    expect(second.generatedAt).toBe(first.generatedAt);
    expect(second.transfersByStopAreaRef).toEqual(first.transfersByStopAreaRef);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await listServerTransferBundles()).toMatchObject([
      {
        lineId: "line:IDFM:C01742",
        stopAreaCount: 1,
      },
    ]);
  });

  it("progressively completes a backend bundle across bounded invocations", async () => {
    await clearServerTransferBundles();
    const targets = Array.from({ length: 9 }, (_, index) => ({
      label: `Station ${index}`,
      stopAreaRef: `stop_area:IDFM:S${index}`,
    }));
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(input.toString());

      if (url.includes("/lines/line:IDFM:C01384/stop_areas?")) {
        return jsonResponse({
          stop_areas: targets.map((target) => ({
            id: target.stopAreaRef,
            label: target.label,
            name: target.label,
          })),
        });
      }

      if (url.includes("/places_nearby?")) {
        return jsonResponse({ places_nearby: [] });
      }

      return jsonResponse({ lines: [] });
    });
    const request = {
      lineId: "line:IDFM:C01384",
      lineLabel: "Métro 14",
      nearbyDistanceMeters: 450,
      targets,
      transferResolverMode: "nearby" as const,
    };

    const first = await createTransferBundleResponse(request, {
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(Object.keys(first.transfersByStopAreaRef)).toHaveLength(4);
    expect((await listServerTransferBundles())[0]?.stopAreaCount).toBe(4);

    const second = await createTransferBundleResponse(request, {
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(Object.keys(second.transfersByStopAreaRef)).toHaveLength(8);
    expect((await listServerTransferBundles())[0]?.stopAreaCount).toBe(8);

    const third = await createTransferBundleResponse(request, {
      fetcher: fetcher as unknown as typeof fetch,
    });
    const fetchCountAfterCompletion = fetcher.mock.calls.length;

    expect(Object.keys(third.transfersByStopAreaRef)).toHaveLength(9);
    expect((await listServerTransferBundles())[0]?.stopAreaCount).toBe(9);

    const cached = await createTransferBundleResponse(request, {
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(Object.keys(cached.transfersByStopAreaRef)).toHaveLength(9);
    expect(fetcher).toHaveBeenCalledTimes(fetchCountAfterCompletion);
  });

  it("bypasses backend bundle and runtime caches when disabled", async () => {
    await clearServerTransferBundles();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(input.toString());

      if (url.includes("/lines/line:IDFM:C01384/stop_areas?")) {
        return jsonResponse({
          stop_areas: [
            {
              id: "stop_area:IDFM:A",
              label: "Station A",
              name: "Station A",
            },
          ],
        });
      }

      if (url.includes("/places_nearby?")) {
        return jsonResponse({ places_nearby: [] });
      }

      return jsonResponse({ lines: [] });
    });
    const request = {
      backendCacheEnabled: false,
      lineId: "line:IDFM:C01384",
      lineLabel: "Métro 14",
      nearbyDistanceMeters: 450,
      targets: [{ label: "Station A", stopAreaRef: "stop_area:IDFM:A" }],
      transferResolverMode: "nearby" as const,
    };

    const first = await createTransferBundleResponse(request, {
      fetcher: fetcher as unknown as typeof fetch,
    });
    const second = await createTransferBundleResponse(request, {
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(Object.keys(first.transfersByStopAreaRef)).toEqual([
      "stop_area:IDFM:A",
    ]);
    expect(Object.keys(second.transfersByStopAreaRef)).toEqual([
      "stop_area:IDFM:A",
    ]);
    expect(
      fetcher.mock.calls.filter((call) =>
        decodeURIComponent(String(call[0])).includes(
          "/lines/line:IDFM:C01384/stop_areas?",
        ),
      ),
    ).toHaveLength(2);
    expect(await listServerTransferBundles()).toEqual([]);
  });

  it("merges concurrent backend progress without losing resolved stations", async () => {
    await clearServerTransferBundles();
    const targets = [
      { label: "Station A", stopAreaRef: "stop_area:IDFM:A" },
      { label: "Station B", stopAreaRef: "stop_area:IDFM:B" },
    ];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(input.toString());

      if (url.includes("/lines/line:IDFM:C01727/stop_areas?")) {
        return jsonResponse({
          stop_areas: targets.map((target) => ({
            id: target.stopAreaRef,
            label: target.label,
            name: target.label,
          })),
        });
      }

      if (url.includes("/places_nearby?")) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return jsonResponse({ places_nearby: [] });
      }

      return jsonResponse({ lines: [] });
    });
    const requestBase = {
      lineId: "line:IDFM:C01727",
      lineLabel: "RER B",
      nearbyDistanceMeters: 600,
      transferResolverMode: "nearby" as const,
    };

    await Promise.all(
      targets.map((target) =>
        createTransferBundleResponse(
          {
            ...requestBase,
            targets: [target],
          },
          { fetcher: fetcher as unknown as typeof fetch },
        ),
      ),
    );

    expect(await listServerTransferBundles()).toMatchObject([
      {
        lineId: "line:IDFM:C01727",
        stopAreaCount: 2,
      },
    ]);
  });

  it("uses the requested nearby radius in Navitia places_nearby calls", async () => {
    await clearServerTransferBundles();
    const requestedUrls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(input.toString());

      requestedUrls.push(url);

      if (url.includes("/lines/line:IDFM:C01742/stop_areas?")) {
        return jsonResponse({
          stop_areas: [
            {
              id: "stop_area:IDFM:A",
              label: "Station A",
              name: "Station A",
            },
          ],
        });
      }

      if (url.includes("/places_nearby?")) {
        return jsonResponse({ places_nearby: [] });
      }

      return jsonResponse({ lines: [] });
    });

    await createTransferBundleResponse(
      {
        lineId: "line:IDFM:C01742",
        lineLabel: "RER A",
        nearbyDistanceMeters: 600,
        targets: [{ stopAreaRef: "stop_area:IDFM:A", label: "Station A" }],
      },
      { fetcher: fetcher as unknown as typeof fetch },
    );

    expect(
      requestedUrls.some((url) =>
        url.includes("/places_nearby?") && url.includes("distance=600"),
      ),
    ).toBe(true);
    expect((await listServerTransferBundles())[0]?.id).toContain("::d600");
  });

  it("accepts stop-area and NeTEx stop-place refs produced by the cache", () => {
    expect(isSupportedTransferTargetRef("stop_area:IDFM:46007")).toBe(true);
    expect(isSupportedTransferTargetRef("FR::Quay:50149051:FR1")).toBe(true);
    expect(isSupportedTransferTargetRef("FR::monomodalStopPlace:46007:FR1")).toBe(
      true,
    );
    expect(isSupportedTransferTargetRef("FR::multimodalStopPlace:58774:FR1")).toBe(
      true,
    );
  });

  it("rejects unsupported refs instead of sending malformed Navitia requests", () => {
    expect(isSupportedTransferTargetRef("FR::ScheduledStopPoint:46007:FR1")).toBe(
      false,
    );
    expect(isSupportedTransferTargetRef("")).toBe(false);
  });

  it("resolves NeTEx StopPlace refs directly to Navitia stop-area refs", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) =>
      jsonResponse({
        connections: [],
        places_nearby: [],
      }),
    );

    await resolveOfficialConnectionStopNames(
      {
        stopAreaRef: "FR::monomodalStopPlace:45873:FR1",
        label: "Auber",
      },
      {
        currentLineId: "line:IDFM:C01742",
        currentLineLabel: "RER A",
        fetcher: fetcher as unknown as typeof fetch,
        requestSpacingMs: 0,
        retentionDays: 15,
      },
    );

    expect(decodeURIComponent(String(fetcher.mock.calls[0]?.[0]))).toContain(
      "/stop_areas/stop_area:IDFM:45873/connections",
    );
  });

  it("falls back to a Navitia station search when a direct NeTEx StopPlace id is not a Navitia stop area", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(input.toString());

      if (url.includes("/stop_areas/stop_area:IDFM:45873/connections")) {
        return jsonResponse({}, 404);
      }

      if (url.includes("/pt_objects?")) {
        return jsonResponse({
          pt_objects: [
            {
              embedded_type: "stop_area",
              stop_area: {
                id: "stop_area:IDFM:478926",
                label: "Auber (Paris)",
                name: "Auber",
              },
            },
          ],
        });
      }

      if (url.includes("/stop_areas/stop_area:IDFM:478926/connections")) {
        return jsonResponse({
          connections: [
            {
              origin: { id: "stop_point:IDFM:auber", name: "Auber" },
              destination: { id: "stop_point:IDFM:opera", name: "Opera" },
            },
          ],
        });
      }

      if (url.includes("/places_nearby?")) {
        return jsonResponse({ places_nearby: [] });
      }

      if (url.includes("stop_point:IDFM:opera")) {
        return jsonResponse({
          lines: [
            {
              id: "line:IDFM:C01373",
              physical_modes: [{ id: "physical_mode:Metro", name: "Metro" }],
            },
          ],
        });
      }

      return jsonResponse({ lines: [] });
    });

    await expect(
      resolveOfficialConnectionStopNames(
        {
          stopAreaRef: "FR::monomodalStopPlace:45873:FR1",
          label: "Auber",
        },
        {
          currentLineId: "line:IDFM:C01742",
          currentLineLabel: "RER A",
          fetcher: fetcher as unknown as typeof fetch,
          requestSpacingMs: 0,
          retentionDays: 15,
        },
      ),
    ).resolves.toEqual(["Opera"]);

    const urls = fetcher.mock.calls.map((call) =>
      decodeURIComponent(String(call[0])),
    );

    expect(urls.some((url) => url.includes("/pt_objects?"))).toBe(true);
    expect(
      urls.some((url) =>
        url.includes("/stop_areas/stop_area:IDFM:478926/connections"),
      ),
    ).toBe(true);
  });

  it("matches NeTEx station labels to Navitia stop areas despite punctuation variants", () => {
    expect(
      findMatchingLineStation(
        {
          stopAreaRef: "FR::Quay:50026077:FR1",
          label: "Champs-Elysées-Clémenceau",
          city: "Paris",
        },
        [
          {
            id: "stop_area:IDFM:71305",
            label: "Champs-Élysées - Clemenceau",
            city: "Paris",
            monitoringRef: "",
            scheduleStopAreaRef: "stop_area:IDFM:71305",
          },
        ],
      )?.scheduleStopAreaRef,
    ).toBe("stop_area:IDFM:71305");
  });

  it.each([
    [
      "FR::Quay:50121960:FR1",
      "Gare de Lyon - Diderot",
      "Paris 12e",
      "stop_area:IDFM:73626",
      "Gare de Lyon",
    ],
    [
      "FR::Quay:50114394:FR1",
      "Montparnasse - Rue du Départ",
      "Paris 15e",
      "stop_area:IDFM:71139",
      "Gare Montparnasse",
    ],
    [
      "FR::Quay:50115010:FR1",
      "Montparnasse - Cinémas",
      "Paris 6e",
      "stop_area:IDFM:71139",
      "Gare Montparnasse",
    ],
  ])(
    "matches bus 91 quay %s to its official interchange stop area",
    (stopAreaRef, label, city, expectedStopAreaRef, officialLabel) => {
      expect(
        findMatchingLineStation(
          { stopAreaRef, label, city },
          [
            {
              id: expectedStopAreaRef,
              label: officialLabel,
              city: "Paris",
              monitoringRef: "",
              scheduleStopAreaRef: expectedStopAreaRef,
            },
          ],
        )?.scheduleStopAreaRef,
      ).toBe(expectedStopAreaRef);
    },
  );

  it("loads official interchange lines for the three bus 91 quays", async () => {
    await clearServerTransferBundles();
    const targets = [
      {
        stopAreaRef: "FR::Quay:50121960:FR1",
        label: "Gare de Lyon - Diderot",
        city: "Paris 12e",
      },
      {
        stopAreaRef: "FR::Quay:50114394:FR1",
        label: "Montparnasse - Rue du Départ",
        city: "Paris 15e",
      },
      {
        stopAreaRef: "FR::Quay:50115010:FR1",
        label: "Montparnasse - Cinémas",
        city: "Paris 6e",
      },
    ];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(input.toString());

      if (url.includes("/lines/line:IDFM:C01122/stop_areas?")) {
        return jsonResponse({
          stop_areas: [
            {
              id: "stop_area:IDFM:73626",
              name: "Gare de Lyon",
              administrative_regions: [{ name: "Paris" }],
            },
            {
              id: "stop_area:IDFM:71139",
              name: "Gare Montparnasse",
              administrative_regions: [{ name: "Paris" }],
            },
          ],
        });
      }

      if (url.includes("/places_nearby?")) {
        return jsonResponse({ places_nearby: [] });
      }

      if (url.includes("/stop_areas/stop_area:IDFM:73626/lines?")) {
        return jsonResponse({
          lines: [
            {
              id: "line:IDFM:C01122",
              code: "91",
              commercial_mode: { name: "Bus" },
              physical_modes: [{ name: "Bus" }],
            },
            {
              id: "line:IDFM:C01384",
              code: "14",
              commercial_mode: { name: "Métro" },
              physical_modes: [{ name: "Métro" }],
            },
          ],
        });
      }

      if (url.includes("/stop_areas/stop_area:IDFM:71139/lines?")) {
        return jsonResponse({
          lines: [
            {
              id: "line:IDFM:C01122",
              code: "91",
              commercial_mode: { name: "Bus" },
              physical_modes: [{ name: "Bus" }],
            },
            {
              id: "line:IDFM:C01374",
              code: "4",
              commercial_mode: { name: "Métro" },
              physical_modes: [{ name: "Métro" }],
            },
          ],
        });
      }

      return jsonResponse({ lines: [] });
    });
    const response = await createTransferBundleResponse(
      {
        backendCacheEnabled: false,
        lineId: "line:IDFM:C01122",
        lineLabel: "91",
        nearbyDistanceMeters: 200,
        targets,
        transferResolverMode: "nearby",
      },
      { fetcher: fetcher as unknown as typeof fetch },
    );

    expect(response.transfersByStopAreaRef[targets[0]!.stopAreaRef]).toMatchObject([
      { id: "line:IDFM:C01384", label: "14", family: "METRO" },
    ]);
    expect(response.transfersByStopAreaRef[targets[1]!.stopAreaRef]).toMatchObject([
      { id: "line:IDFM:C01374", label: "4", family: "METRO" },
    ]);
    expect(response.transfersByStopAreaRef[targets[2]!.stopAreaRef]).toMatchObject([
      { id: "line:IDFM:C01374", label: "4", family: "METRO" },
    ]);
    expect(
      fetcher.mock.calls.some((call) =>
        decodeURIComponent(String(call[0])).includes("/pt_objects?"),
      ),
    ).toBe(false);
  });

  it("rejects the Bobigny homonym when resolving Hôtel de Ville de La Courneuve", () => {
    expect(
      findMatchingLineStation(
        {
          stopAreaRef: "FR::Quay:50143533:FR1",
          label: "Hôtel de Ville de La Courneuve",
          city: "La Courneuve",
        },
        [
          {
            id: "stop_area:IDFM:72477",
            label: "Hôtel de Ville de Bobigny",
            city: "Bobigny",
            monitoringRef: "",
            scheduleStopAreaRef: "stop_area:IDFM:72477",
          },
          {
            id: "stop_area:IDFM:73696",
            label: "La Courneuve - 8 Mai 1945",
            city: "La Courneuve",
            monitoringRef: "",
            scheduleStopAreaRef: "stop_area:IDFM:73696",
          },
        ],
      ),
    ).toBeUndefined();
  });

  it("falls back to the global stop-area search for Hôtel de Ville de La Courneuve", async () => {
    await clearServerTransferBundles();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(input.toString());

      if (url.includes("/lines/line:IDFM:C01389/stop_areas?")) {
        return jsonResponse({
          stop_areas: [
            {
              id: "stop_area:IDFM:72477",
              name: "Hôtel de Ville de Bobigny",
              administrative_regions: [{ name: "Bobigny" }],
            },
            {
              id: "stop_area:IDFM:73696",
              name: "La Courneuve - 8 Mai 1945",
              administrative_regions: [{ name: "La Courneuve" }],
            },
          ],
        });
      }

      if (url.includes("/pt_objects?")) {
        return jsonResponse({
          pt_objects: [
            {
              embedded_type: "stop_area",
              stop_area: {
                id: "stop_area:IDFM:72622",
                name: "Hôtel de Ville de la Courneuve",
                administrative_regions: [{ name: "La Courneuve" }],
              },
            },
          ],
        });
      }

      if (url.includes("/places_nearby?")) {
        return jsonResponse({ places_nearby: [] });
      }

      if (url.includes("/stop_areas/stop_area:IDFM:72622/lines?")) {
        return jsonResponse({
          lines: [
            {
              id: "line:IDFM:C01389",
              code: "T1",
              commercial_mode: { id: "commercial_mode:Tramway", name: "Tramway" },
              physical_modes: [{ id: "physical_mode:Tramway", name: "Tramway" }],
            },
            {
              id: "line:IDFM:C01241",
              code: "249",
              commercial_mode: { id: "commercial_mode:Bus", name: "Bus" },
              physical_modes: [{ id: "physical_mode:Bus", name: "Bus" }],
            },
          ],
        });
      }

      return jsonResponse({ lines: [] });
    });
    const target = {
      stopAreaRef: "FR::Quay:50143533:FR1",
      label: "Hôtel de Ville de La Courneuve",
    };
    const response = await createTransferBundleResponse(
      {
        backendCacheEnabled: false,
        lineId: "line:IDFM:C01389",
        lineLabel: "T1",
        nearbyDistanceMeters: 650,
        targets: [target],
        transferResolverMode: "nearby",
      },
      { fetcher: fetcher as unknown as typeof fetch },
    );

    expect(response.transfersByStopAreaRef[target.stopAreaRef]).toMatchObject([
      { id: "line:IDFM:C01241", label: "249", family: "BUS" },
    ]);
    expect(
      fetcher.mock.calls.some((call) =>
        decodeURIComponent(String(call[0])).includes("/pt_objects?"),
      ),
    ).toBe(true);
  });

  it("resolves Danton in La Courneuve instead of homonymous bus stops", async () => {
    await clearServerTransferBundles();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(input.toString());

      if (url.includes("/lines/line:IDFM:C01389/stop_areas?")) {
        return jsonResponse({
          stop_areas: [
            {
              id: "stop_area:IDFM:72477",
              name: "Hôtel de Ville de Bobigny",
              administrative_regions: [{ name: "Bobigny" }],
            },
          ],
        });
      }

      if (url.includes("/pt_objects?")) {
        return jsonResponse({
          pt_objects: [
            {
              embedded_type: "stop_area",
              stop_area: {
                id: "stop_area:IDFM:71796",
                name: "Danton",
                administrative_regions: [{ name: "Montreuil" }],
              },
            },
            {
              embedded_type: "stop_area",
              stop_area: {
                id: "stop_area:IDFM:73693",
                name: "Danton",
                administrative_regions: [{ name: "La Courneuve" }],
              },
            },
          ],
        });
      }

      if (url.includes("/places_nearby?")) {
        return jsonResponse({ places_nearby: [] });
      }

      if (url.includes("/stop_areas/stop_area:IDFM:73693/lines?")) {
        return jsonResponse({
          lines: [
            {
              id: "line:IDFM:C02404",
              code: "T1",
              commercial_mode: { id: "commercial_mode:Bus", name: "Bus" },
              physical_modes: [{ id: "physical_mode:Bus", name: "Bus" }],
            },
          ],
        });
      }

      if (url.includes("/stop_areas/stop_area:IDFM:71796/lines?")) {
        return jsonResponse({
          lines: ["102", "116", "121", "202", "N34"].map((code) => ({
            id: `line:wrong:${code}`,
            code,
            commercial_mode: { id: "commercial_mode:Bus", name: "Bus" },
            physical_modes: [{ id: "physical_mode:Bus", name: "Bus" }],
          })),
        });
      }

      return jsonResponse({ lines: [] });
    });
    const target = {
      stopAreaRef: "FR::Quay:50143535:FR1",
      label: "Danton",
      city: "La Courneuve",
    };
    const response = await createTransferBundleResponse(
      {
        backendCacheEnabled: false,
        lineId: "line:IDFM:C01389",
        lineLabel: "T1",
        nearbyDistanceMeters: 350,
        targets: [target],
        transferResolverMode: "nearby",
      },
      { fetcher: fetcher as unknown as typeof fetch },
    );

    expect(response.transfersByStopAreaRef[target.stopAreaRef]).toMatchObject([
      { id: "line:IDFM:C02404", label: "T1" },
    ]);
    expect(
      response.transfersByStopAreaRef[target.stopAreaRef].map(({ label }) => label),
    ).not.toEqual(expect.arrayContaining(["102", "116", "121", "202", "N34"]));
  });

  it("keeps only structural official connections before they become compatible Open Data names", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(input.toString());

      if (url.includes("/connections?")) {
        return jsonResponse({
          connections: [
            {
              origin: { id: "stop_point:IDFM:rer", name: "Fontenay-aux-Roses" },
              destination: { id: "stop_point:IDFM:gambetta", name: "Gambetta" },
            },
            {
              origin: { id: "stop_point:IDFM:rer", name: "Fontenay-aux-Roses" },
              destination: { id: "stop_point:IDFM:opera-bus", name: "Opéra" },
            },
            {
              origin: { id: "stop_point:IDFM:rer", name: "Fontenay-aux-Roses" },
              destination: { id: "stop_point:IDFM:opera-metro", name: "Opéra" },
            },
          ],
        });
      }

      if (url.includes("stop_point:IDFM:gambetta")) {
        return jsonResponse({
          lines: [
            {
              id: "line:IDFM:C01319",
              physical_modes: [{ id: "physical_mode:Bus", name: "Bus" }],
            },
          ],
        });
      }

      if (url.includes("stop_point:IDFM:opera-bus")) {
        return jsonResponse({
          lines: [
            {
              id: "line:IDFM:C01102",
              physical_modes: [{ id: "physical_mode:Bus", name: "Bus" }],
            },
          ],
        });
      }

      if (url.includes("stop_point:IDFM:opera-metro")) {
        return jsonResponse({
          lines: [
            {
              id: "line:IDFM:C01373",
              physical_modes: [{ id: "physical_mode:Metro", name: "Métro" }],
            },
          ],
        });
      }

      if (url.includes("stop_point:IDFM:rer")) {
        return jsonResponse({
          lines: [
            {
              id: "line:IDFM:C01743",
              physical_modes: [
                { id: "physical_mode:RapidTransit", name: "RER" },
              ],
            },
          ],
        });
      }

      return jsonResponse({ lines: [] });
    });

    await expect(
      fetchOfficialConnectionStopNames(
        "stop_area:IDFM:fontenay",
        "line:IDFM:C01743",
        fetcher as unknown as typeof fetch,
      ),
    ).resolves.toEqual(["Opéra"]);
  });
  it("uses nearby structural stop areas when Navitia connections miss a large interchange", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(input.toString());

      if (url.includes("/connections?")) {
        return jsonResponse({ connections: [] });
      }

      if (url.includes("/places_nearby?")) {
        return jsonResponse({
          places_nearby: [
            {
              embedded_type: "stop_area",
              distance: 120,
              stop_area: { id: "stop_area:IDFM:opera", name: "OpÃ©ra" },
            },
            {
              embedded_type: "stop_area",
              distance: 160,
              stop_area: { id: "stop_area:IDFM:auber-bus", name: "Auber" },
            },
            {
              embedded_type: "stop_area",
              distance: 430,
              stop_area: {
                id: "stop_area:IDFM:saint-lazare",
                name: "Saint-Lazare",
              },
            },
          ],
        });
      }

      if (url.includes("stop_area:IDFM:opera")) {
        return jsonResponse({
          lines: [
            {
              id: "line:IDFM:C01373",
              physical_modes: [{ id: "physical_mode:Metro", name: "MÃ©tro" }],
            },
          ],
        });
      }

      if (url.includes("stop_area:IDFM:saint-lazare")) {
        return jsonResponse({
          lines: [
            {
              id: "line:IDFM:C01740",
              physical_modes: [{ id: "physical_mode:LocalTrain", name: "Train" }],
            },
          ],
        });
      }

      return jsonResponse({
        lines: [
          {
            id: "line:IDFM:C01102",
            physical_modes: [{ id: "physical_mode:Bus", name: "Bus" }],
          },
        ],
      });
    });

    await expect(
      fetchOfficialConnectionStopNames(
        "stop_area:IDFM:auber",
        "line:IDFM:C01742",
        fetcher as unknown as typeof fetch,
      ),
    ).resolves.toEqual(["OpÃ©ra", "Saint-Lazare"]);
  });

  it("paginates official connections for large interchanges before resolving compatible names", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(input.toString());

      if (url.includes("/connections?") && url.includes("start_page=0")) {
        return jsonResponse({
          pagination: {
            total_result: 2,
            start_page: 0,
            items_per_page: 1,
            items_on_page: 1,
          },
          connections: [
            {
              origin: { id: "stop_point:IDFM:auber", name: "Auber" },
              destination: { id: "stop_point:IDFM:opera", name: "Opera" },
            },
          ],
        });
      }

      if (url.includes("/connections?") && url.includes("start_page=1")) {
        return jsonResponse({
          pagination: {
            total_result: 2,
            start_page: 1,
            items_per_page: 1,
            items_on_page: 1,
          },
          connections: [
            {
              origin: { id: "stop_point:IDFM:auber", name: "Auber" },
              destination: {
                id: "stop_point:IDFM:saint-lazare",
                name: "Saint-Lazare",
              },
            },
          ],
        });
      }

      if (url.includes("/places_nearby?")) {
        return jsonResponse({ places_nearby: [] });
      }

      if (url.includes("stop_point:IDFM:opera")) {
        return jsonResponse({
          lines: [
            {
              id: "line:IDFM:C01373",
              physical_modes: [{ id: "physical_mode:Metro", name: "Metro" }],
            },
          ],
        });
      }

      if (url.includes("stop_point:IDFM:saint-lazare")) {
        return jsonResponse({
          lines: [
            {
              id: "line:IDFM:C01384",
              physical_modes: [{ id: "physical_mode:Metro", name: "Metro" }],
            },
          ],
        });
      }

      return jsonResponse({ lines: [] });
    });

    await expect(
      fetchOfficialConnectionStopNames(
        "stop_area:IDFM:auber",
        "line:IDFM:C01742",
        fetcher as unknown as typeof fetch,
      ),
    ).resolves.toEqual(["Opera", "Saint-Lazare"]);
  });

  it("keeps meaningful connection parentheses like Grande Arche", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(input.toString());

      if (url.includes("/connections?")) {
        return jsonResponse({
          connections: [
            {
              origin: { id: "stop_point:IDFM:defense-a", name: "La Défense" },
              destination: {
                id: "stop_point:IDFM:grande-arche-metro",
                name: "La Défense (Grande Arche)",
              },
            },
          ],
        });
      }

      if (url.includes("/places_nearby?")) {
        return jsonResponse({ places_nearby: [] });
      }

      if (url.includes("stop_point:IDFM:grande-arche-metro")) {
        return jsonResponse({
          lines: [
            {
              id: "line:IDFM:C01371",
              physical_modes: [{ id: "physical_mode:Metro", name: "Metro" }],
            },
          ],
        });
      }

      return jsonResponse({ lines: [] });
    });

    await expect(
      fetchOfficialConnectionStopNames(
        "stop_area:IDFM:defense",
        "line:IDFM:C01742",
        fetcher as unknown as typeof fetch,
      ),
    ).resolves.toEqual(["La Défense (Grande Arche)"]);
  });

  it("keeps nearby structural stop areas only when they match official connection names", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(input.toString());

      if (url.includes("/connections?")) {
        return jsonResponse({
          connections: [
            {
              origin: { id: "stop_point:IDFM:auber", name: "Auber" },
              destination: {
                id: "stop_point:IDFM:gare-saint-lazare",
                name: "Haussmann Saint-Lazare",
              },
            },
          ],
        });
      }

      if (url.includes("/places_nearby?")) {
        return jsonResponse({
          places_nearby: [
            {
              embedded_type: "stop_area",
              distance: 180,
              stop_area: {
                id: "stop_area:IDFM:gare-saint-lazare",
                name: "Saint-Lazare",
              },
            },
            {
              embedded_type: "stop_area",
              distance: 260,
              stop_area: {
                id: "stop_area:IDFM:madeleine",
                name: "Madeleine",
              },
            },
          ],
        });
      }

      if (url.includes("stop_area:IDFM:gare-saint-lazare")) {
        return jsonResponse({
          lines: [
            {
              id: "line:IDFM:C01384",
              physical_modes: [{ id: "physical_mode:Metro", name: "Metro" }],
            },
          ],
        });
      }

      if (url.includes("stop_area:IDFM:madeleine")) {
        return jsonResponse({
          lines: [
            {
              id: "line:IDFM:C01382",
              physical_modes: [{ id: "physical_mode:Metro", name: "Metro" }],
            },
          ],
        });
      }

      return jsonResponse({ lines: [] });
    });

    await expect(
      fetchOfficialConnectionStopNames(
        "stop_area:IDFM:auber",
        "line:IDFM:C01742",
        fetcher as unknown as typeof fetch,
      ),
    ).resolves.toEqual(["Saint-Lazare"]);
  });

  it("enriches nearby Open Data badges with Navitia colors and codes", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(input.toString());

      if (url.includes("/lines/line:IDFM:C01740?")) {
        return jsonResponse({
          lines: [
            {
              id: "line:IDFM:C01740",
              code: "L",
              color: "a65a95",
              text_color: "ffffff",
              commercial_mode: { id: "commercial_mode:LocalTrain", name: "Train" },
              physical_modes: [{ id: "physical_mode:LocalTrain", name: "Train" }],
            },
          ],
        });
      }

      if (url.includes("/lines/line:IDFM:C01120?")) {
        return jsonResponse({
          lines: [
            {
              id: "line:IDFM:C01120",
              code: "20",
              color: "f6a800",
              text_color: "111827",
              commercial_mode: { id: "commercial_mode:Bus", name: "Bus" },
              physical_modes: [{ id: "physical_mode:Bus", name: "Bus" }],
            },
          ],
        });
      }

      return jsonResponse({ lines: [] });
    });

    const transfers = await enrichTransferLineOptionsWithNavitia(
      [
        {
          id: "line:IDFM:C01740",
          label: "TER",
          family: "TRANSILIEN",
          mode: "Train",
          color: "#0064ff",
          textColor: "#ffffff",
        },
        {
          id: "line:IDFM:C01120",
          label: "20",
          family: "BUS",
          mode: "Bus",
          color: "#0064ff",
          textColor: "#ffffff",
        },
      ],
      fetcher as unknown as typeof fetch,
    );

    expect(transfers).toEqual([
      expect.objectContaining({
        id: "line:IDFM:C01740",
        label: "L",
        family: "TRANSILIEN",
        color: "#a65a95",
        textColor: "#ffffff",
      }),
      expect.objectContaining({
        id: "line:IDFM:C01120",
        label: "20",
        family: "BUS",
        color: "#f6a800",
        textColor: "#111827",
      }),
    ]);
  });

  it("falls back to Open Data badges and removes duplicate unresolved TER labels", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ lines: [] }));

    const transfers = await enrichTransferLineOptionsWithNavitia(
      [
        {
          id: "line:IDFM:C09999",
          label: "TER",
          family: "TRANSILIEN",
          mode: "Train",
          color: "#0064ff",
          textColor: "#ffffff",
        },
        {
          id: "line:IDFM:C09998",
          label: "TER",
          family: "TRANSILIEN",
          mode: "Train",
          color: "#0064ff",
          textColor: "#ffffff",
        },
      ],
      fetcher as unknown as typeof fetch,
    );

    expect(transfers.map((transfer) => transfer.label)).toEqual(["TER"]);
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

