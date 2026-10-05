/** Private binding only; no credential or public forwarding endpoint. */
export class IdfmRateGate {
  constructor(state) { this.storage = state.storage; }
  async fetch(request) {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const body = await request.json();
    const scope = String(body.scope ?? "");
    if (!["navitia", "siri-unit", "siri-global", "siri-line", "siri-messages", "marketplace-other"].includes(scope)) {
      return new Response("Invalid scope", { status: 400 });
    }
    const action = new URL(request.url).pathname;
    if (!["/reserve", "/check", "/cooldown"].includes(action)) return new Response("Not found", { status: 404 });
    const result = await this.storage.transaction(async (storage) => {
      const now = Date.now();
      const cooldownKey = `cooldown:${scope}`;
      const cooldownUntil = (await storage.get(cooldownKey)) ?? 0;
      if (action === "/cooldown") {
        const duration = Math.max(1, Math.min(86_400_000, Number(body.durationMs) || 30_000));
        await storage.put(cooldownKey, Math.max(cooldownUntil, now + duration));
        return {};
      }
      if (cooldownUntil > now) return { retryAfterMs: cooldownUntil - now };
      if (action === "/check") return {};
      const startsAt = Math.max(now, (await storage.get("nextRequestAt")) ?? 0);
      await storage.put("nextRequestAt", startsAt + 260);
      return { startsAt };
    });
    return Response.json(result);
  }
}
export default { fetch: () => new Response("Private IDFM rate coordinator", { status: 404 }) };
