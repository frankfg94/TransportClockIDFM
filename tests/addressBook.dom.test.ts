import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import AdressBook from "../src/features/address-book/AdressBook.vue";
import {
  ADDRESS_BOOK_STORAGE_KEY,
  ADDRESS_BOOK_STORAGE_VERSION,
  resetAddressBookState,
} from "../src/features/address-book/addressBook";

describe("AdressBook", () => {
  let wrapper: VueWrapper | undefined;

  beforeEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    document.body.innerHTML = "";
    window.localStorage.clear();
    resetAddressBookState();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    document.body.innerHTML = "";
    window.localStorage.clear();
    resetAddressBookState();
  });

  it("shows the hidden chip and persists the visibility switch", async () => {
    window.localStorage.setItem(ADDRESS_BOOK_STORAGE_KEY, JSON.stringify({
      version: ADDRESS_BOOK_STORAGE_VERSION,
      entries: [{
        id: "home",
        kind: "address",
        name: "Mon appart",
        address: "9 Rue Chateaubriand",
        lon: 2.27,
        lat: 48.766,
        icon: "home",
        isHidden: true,
      }],
    }));

    wrapper = mount(AdressBook, { props: { open: true }, attachTo: document.body });
    await flushPromises();

    const hiddenChip = document.body.querySelector(".address-book-entry__hidden");
    expect(hiddenChip?.textContent).toContain("Masqué");
    const editButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>(
      ".address-book-entry__actions button",
    )).find((button) => button.getAttribute("aria-label") === "Modifier Mon appart");
    expect(editButton).toBeDefined();

    editButton?.click();
    await nextTick();
    const visibilitySwitch = document.body.querySelector<HTMLButtonElement>(
      ".address-book-form__visibility",
    );
    expect(visibilitySwitch?.getAttribute("role")).toBe("switch");
    expect(visibilitySwitch?.getAttribute("aria-checked")).toBe("true");

    visibilitySwitch?.click();
    await nextTick();
    expect(visibilitySwitch?.getAttribute("aria-checked")).toBe("false");

    document.body.querySelector<HTMLButtonElement>(
      'button[type="submit"][form="address-book-form"]',
    )?.click();
    await flushPromises();

    const saved = JSON.parse(window.localStorage.getItem(ADDRESS_BOOK_STORAGE_KEY) ?? "{}") as {
      entries?: Array<{ isHidden?: boolean }>;
    };
    expect(saved.entries?.[0]?.isHidden).toBeUndefined();
  });

  it("opens the dynamic icon selector, searches Lucide names and keeps the selection", async () => {
    wrapper = mount(AdressBook, { props: { open: true }, attachTo: document.body });
    await flushPromises();

    const addButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("Ajouter une entrée"));
    expect(addButton).toBeDefined();
    addButton?.click();
    await nextTick();

    const showMoreButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("Afficher plus"));
    expect(showMoreButton).toBeDefined();
    showMoreButton?.click();
    await flushPromises();

    const selector = document.body.querySelector(".address-book-icon-selector-modal");
    expect(selector).not.toBeNull();
    const search = selector?.querySelector<HTMLInputElement>('input[type="search"]');
    expect(search).not.toBeNull();
    if (!search) throw new Error("Icon search input is missing");
    search.value = "map pin";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();

    const mapPinOption = Array.from(document.body.querySelectorAll<HTMLButtonElement>(
      ".address-book-icon-selector__option",
    )).find((button) => button.textContent?.trim() === "Map Pin");
    expect(mapPinOption).toBeDefined();
    mapPinOption?.click();
    await flushPromises();
    await nextTick();

    expect(document.body.querySelector(".address-book-icon-selector-modal")).toBeNull();
    const selectedExtendedIcon = document.body.querySelector(
      ".address-book-form__icon-option--extended",
    );
    expect(selectedExtendedIcon?.textContent).toContain("Map Pin");
    expect(selectedExtendedIcon?.querySelector<HTMLInputElement>("input")?.value).toBe("MapPin");
  });

  it("offers saved addresses as selectable origins", async () => {
    window.localStorage.setItem(ADDRESS_BOOK_STORAGE_KEY, JSON.stringify({
      version: ADDRESS_BOOK_STORAGE_VERSION,
      entries: [{
        id: "home",
        kind: "address",
        name: "Mon appart",
        address: "277 avenue de la division Leclerc",
        city: "Châtenay-Malabry",
        lon: 2.26821,
        lat: 48.76591,
        icon: "home",
      }],
    }));

    wrapper = mount(AdressBook, {
      props: { open: true, selectionMode: true },
      attachTo: document.body,
    });
    await flushPromises();

    const selectButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>(
      ".address-book-entry__select",
    )).find((button) => button.textContent?.includes("Utiliser cette adresse"));
    expect(selectButton).toBeDefined();
    selectButton?.click();
    await nextTick();

    expect(wrapper.emitted("select")?.[0]?.[0]).toMatchObject({
      id: "home",
      name: "Mon appart",
      lat: 48.76591,
      lon: 2.26821,
    });
  });
});
