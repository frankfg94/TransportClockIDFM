import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { h, nextTick } from "vue";
import DepartureAlarmModal from "../src/components/DepartureAlarmModal.vue";
import type { Departure, DepartureAlarm } from "../src/types/transit";

const activeAlarm: DepartureAlarm = {
  id: "alarm-1",
  nativeNotificationId: 481_516,
  boardId: "board-1",
  boardTitle: "Denfert-Rochereau",
  lineLabel: "B",
  lineColor: "#4b92db",
  destination: "Aeroport CDG 2",
  monitoringLabel: "Voie 2",
  platform: "2",
  departureId: "departure-1",
  scheduledDepartureTime: "2026-07-18T12:20:00.000Z",
  alarmTime: "2026-07-18T12:15:00.000Z",
  minutesBefore: 5,
  soundEnabled: true,
  notified: false,
  createdAt: "2026-07-18T12:00:00.000Z",
};

const alarmDeparture: Departure = {
  id: "departure-1",
  lineRef: "line:noctilien:N66",
  monitoringRef: "stop:1",
  stopName: "Arrêt de départ",
  destination: "Destination",
  monitoringLabel: "Départ du trajet",
  expectedDepartureTime: "2026-08-22T01:43:00",
  aimedDepartureTime: "2026-08-22T01:43:00",
  vehicleAtStop: false,
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DepartureAlarmModal", () => {
  it("uses activeAlarm as the single switch for cancellation mode", async () => {
    const wrapper = mount(DepartureAlarmModal, {
      attachTo: document.body,
      props: {
        open: true,
        activeAlarm,
        nativeSoundRequired: true,
        nativePermissionState: "required",
      },
    });

    expect(document.body.textContent).toContain("Annuler l'alarme");
    expect(document.body.textContent).toContain("5 min avant");
    expect(document.body.querySelector('input[type="text"]')).toBeNull();

    const removeButton = document.body.querySelector(
      ".alarm-modal__danger",
    ) as HTMLButtonElement;
    removeButton.click();
    expect(wrapper.emitted("remove")).toHaveLength(1);

    const keepButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Conserver l'alarme"),
    ) as HTMLButtonElement;
    keepButton.click();
    expect(wrapper.emitted("cancel")).toHaveLength(1);

    wrapper.unmount();
  });

  it("hides the web sound checkbox and exposes Android permission recovery", async () => {
    const wrapper = mount(DepartureAlarmModal, {
      attachTo: document.body,
      props: {
        open: true,
        nativeSoundRequired: true,
        nativePermissionState: "required",
      },
    });

    expect(document.body.querySelector('input[type="checkbox"]')).toBeNull();
    expect(document.body.textContent).toContain(
      "arr\u00eat automatique apr\u00e8s 1 minute",
    );

    const authorizeButton = Array.from(
      document.body.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Autoriser"));
    (authorizeButton as HTMLButtonElement).click();

    expect(wrapper.emitted("request-native-permissions")).toHaveLength(1);
    wrapper.unmount();
  });

  it("keeps the web sound option outside Android", () => {
    const wrapper = mount(DepartureAlarmModal, {
      attachTo: document.body,
      props: {
        open: true,
        nativeSoundRequired: false,
        nativePermissionState: "ready",
      },
    });

    expect(document.body.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Activer le son");

    wrapper.unmount();
  });

  it("prefills a route walking duration and exposes the live hint slot", async () => {
    const wrapper = mount(DepartureAlarmModal, {
      attachTo: document.body,
      props: {
        open: true,
        initialMinutesBefore: 9,
        transportTypeLabel: "Noctilien",
        departure: alarmDeparture,
        nativeSoundRequired: false,
        nativePermissionState: "ready",
      },
      slots: {
        "before-departure-hint": ({ minutesBefore, remainingMinutes, transportTypeLabel }) => h(
          "p",
          { class: "test-alarm-hint" },
          `${remainingMinutes} min dans (${minutesBefore} min avant le ${transportTypeLabel})`,
        ),
      },
    });

    const input = document.body.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.value).toBe("9");
    expect(document.body.querySelector(".test-alarm-hint")?.textContent).toMatch(
      /\d+ min dans \(9 min avant le Noctilien\)/,
    );
    expect(document.body.querySelector(".alarm-modal__scheduled-time")).toBeNull();

    input.value = "10";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    expect(document.body.querySelector(".test-alarm-hint")?.textContent).toMatch(
      /\d+ min dans \(10 min avant le Noctilien\)/,
    );

    wrapper.unmount();
  });

  it("can teleport into the fullscreen map target", async () => {
    const target = document.createElement("div");
    target.className = "fullscreen-target";
    document.body.appendChild(target);

    const wrapper = mount(DepartureAlarmModal, {
      attachTo: document.body,
      props: {
        open: true,
        aboveFullscreen: true,
        teleportTarget: ".fullscreen-target",
      },
    });

    await nextTick();
    expect(target.querySelector(".modal-backdrop")).not.toBeNull();
    expect(target.querySelector(".alarm-modal-backdrop--above-fullscreen")).not.toBeNull();
    wrapper.unmount();
  });
});
