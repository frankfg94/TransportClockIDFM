import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../src/features/mobile-release/client");
});

describe("MobileReleaseCard", () => {
  it("enables the APK download and displays validated metadata", async () => {
    vi.doMock("../src/features/mobile-release/client", () => ({
      getAppSourceRevision: () => "a".repeat(40),
      getAndroidRelease: async () => ({
        available: true,
        sourceRevision: "a".repeat(40),
        versionName: "0.1.0+42",
        versionCode: 42,
        builtAt: "2026-06-21T09:00:00.000Z",
        sizeBytes: 1_572_864,
        sha256: "b".repeat(64),
        minSdk: 24,
        selection: "matching-source",
        downloadUrl: "https://example.test/api/mobile/android/release/download",
      }),
    }));
    const { default: MobileReleaseCard } = await import(
      "../src/features/mobile-release/MobileReleaseCard.vue"
    );
    const wrapper = mount(MobileReleaseCard);
    await flushPromises();

    expect(wrapper.text()).toContain("Application Android");
    expect(wrapper.text()).toContain("Disponible");
    expect(wrapper.text()).toContain("0.1.0+42 (42)");
    expect(wrapper.text()).toContain("Android 7+");
    expect(wrapper.text()).toContain("APK Android publiée");
    expect(wrapper.text()).toContain("Correspondance avec la page (optionnel)");
    expect(wrapper.find("a").attributes("href")).toContain("example.test");
  });

  it("keeps the control disabled while no APK exists for this commit", async () => {
    vi.doMock("../src/features/mobile-release/client", () => ({
      getAppSourceRevision: () => "a".repeat(40),
      getAndroidRelease: async () => ({ available: false, reason: "not-found" }),
    }));
    const { default: MobileReleaseCard } = await import(
      "../src/features/mobile-release/MobileReleaseCard.vue"
    );
    const wrapper = mount(MobileReleaseCard);
    await flushPromises();

    expect(wrapper.text()).toContain("Aucune APK Android valide n’a été détectée");
    expect(wrapper.text()).toContain("Aucune release Android valide n’a été trouvée");
    expect(wrapper.find("button").attributes("disabled")).toBeDefined();
  });
});
