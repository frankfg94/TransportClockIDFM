import { onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";

const STALE_MS = 5000;
const MAX_ACCURACY = 45;
type CompassEvent = DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number };
type OrientationConstructor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };
export function normalizeHeading(value: number): number { return (value % 360 + 360) % 360; }
export function smoothHeading(previous: number, next: number): number {
  const delta = normalizeHeading(next - previous + 180) - 180;
  return previous + (Math.abs(delta) < 2 ? 0 : delta * 0.25);
}
export function compassHeading(event: CompassEvent, screenAngle: number): number | undefined {
  if (typeof event.webkitCompassHeading === "number") {
    if (!Number.isFinite(event.webkitCompassHeading) || typeof event.webkitCompassAccuracy !== "number" || event.webkitCompassAccuracy < 0 || event.webkitCompassAccuracy > MAX_ACCURACY) return undefined;
    return normalizeHeading(event.webkitCompassHeading + screenAngle);
  }
  if (!event.absolute || typeof event.alpha !== "number" || !Number.isFinite(event.alpha)) return undefined;
  return normalizeHeading(360 - event.alpha + screenAngle);
}
export function useMapHeading(enabled: Readonly<Ref<boolean>>) {
  const heading = ref<number>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let listening = false;
  let permissionPending = false;
  let permissionGranted = false;
  let mounted = false;
  function clear() { heading.value = undefined; clearTimeout(timer); }
  function onOrientation(event: Event) {
    const angle = window.screen.orientation?.angle ?? (typeof window.orientation === "number" ? window.orientation : 0);
    const value = compassHeading(event as CompassEvent, angle);
    if (value === undefined) return;
    heading.value = heading.value === undefined ? value : smoothHeading(heading.value, value);
    clearTimeout(timer);
    timer = setTimeout(clear, STALE_MS);
  }
  function stop() {
    window.removeEventListener("deviceorientationabsolute", onOrientation);
    window.removeEventListener("deviceorientation", onOrientation);
    listening = false; clear();
  }
  function start() {
    if (!mounted || !enabled.value || listening || typeof DeviceOrientationEvent === "undefined") return;
    const ctor = DeviceOrientationEvent as OrientationConstructor;
    if (ctor.requestPermission && !permissionGranted) return;
    listening = true;
    window.addEventListener("deviceorientationabsolute", onOrientation);
    window.addEventListener("deviceorientation", onOrientation);
  }
  async function requestPermission() {
    if (!enabled.value || permissionPending || typeof DeviceOrientationEvent === "undefined") return;
    const ctor = DeviceOrientationEvent as OrientationConstructor;
    if (!ctor.requestPermission) { start(); return; }
    permissionPending = true;
    try { permissionGranted = await ctor.requestPermission() === "granted"; if (permissionGranted) start(); }
    catch { clear(); } finally { permissionPending = false; }
  }
  function onVisibility() { if (document.hidden) stop(); else start(); }
  onMounted(() => { mounted = true; start(); document.addEventListener("visibilitychange", onVisibility); });
  watch(enabled, (active) => { if (active) start(); else stop(); });
  onBeforeUnmount(() => { mounted = false; stop(); document.removeEventListener("visibilitychange", onVisibility); });
  return { heading, requestPermission };
}
