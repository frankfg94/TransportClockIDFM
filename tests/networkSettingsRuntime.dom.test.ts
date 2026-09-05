import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { expect, it, vi } from "vitest";

vi.mock("../src/services/networkScheduler", () => ({ setNetworkConcurrencyMode: vi.fn() }));
vi.mock("../src/features/app-settings/appSettings", () => ({ useAppSettings: vi.fn() }));

import { useAppSettings } from "../src/features/app-settings/appSettings";
import { setNetworkConcurrencyMode } from "../src/services/networkScheduler";
import AppSettingsRuntime from "../src/features/app-settings/AppSettingsRuntime.vue";

it("applies the saved network choice immediately and follows updates and reset", () => {
  const settings = ref({ networkConcurrencyMode: "limited", wakeLockDuration: "none" });
  vi.mocked(useAppSettings).mockReturnValue({ settings } as unknown as ReturnType<typeof useAppSettings>);
  const wrapper = mount(AppSettingsRuntime);
  expect(vi.mocked(setNetworkConcurrencyMode).mock.calls.at(-1)?.[0]).toBe("limited");
  settings.value.networkConcurrencyMode = "unlimited";
  expect(vi.mocked(setNetworkConcurrencyMode).mock.calls.at(-1)?.[0]).toBe("unlimited");
  settings.value.networkConcurrencyMode = "auto";
  expect(vi.mocked(setNetworkConcurrencyMode).mock.calls.at(-1)?.[0]).toBe("auto");
  wrapper.unmount();
});
