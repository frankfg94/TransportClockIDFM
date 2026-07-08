import { describe, expect, it } from "vitest";
import {
  resolveLocale,
  translate,
  type TranslationKey,
} from "../src/i18n";

describe("i18n", () => {
  it("uses French automatically for the default French timezone", () => {
    expect(resolveLocale("auto", "Europe/Paris")).toBe("fr");
  });

  it("uses English automatically outside the French timezone", () => {
    expect(resolveLocale("auto", "America/New_York")).toBe("en");
  });

  it("honors explicit language choices", () => {
    expect(resolveLocale("fr", "America/New_York")).toBe("fr");
    expect(resolveLocale("en", "Europe/Paris")).toBe("en");
  });

  it("translates the same key in the selected locale", () => {
    const key: TranslationKey = "settings.language.label";

    expect(translate("fr", key)).toBe("Langue de l'application");
    expect(translate("en", key)).toBe("Application language");
  });

  it("interpolates translation parameters", () => {
    expect(translate("en", "traffic.groupLineOther", { count: 3 })).toBe(
      "3 lines",
    );
    expect(translate("fr", "traffic.groupLineOther", { count: 3 })).toBe(
      "3 lignes",
    );
  });
});
