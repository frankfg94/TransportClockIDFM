<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { HealthCheck, HealthResponse, HealthStatus } from "./types";

const checks = ref<HealthCheck[]>([]);
const generatedAt = ref("");
const loading = ref(true);
const errorMessage = ref("");

const overallStatus = computed<HealthStatus>(() => {
  if (checks.value.some((check) => check.status === "error" && check.required)) {
    return "error";
  }

  if (
    checks.value.some(
      (check) => check.status === "warning" || check.status === "error",
    )
  ) {
    return "warning";
  }

  return "ok";
});

onMounted(() => {
  void loadHealth();
});

async function loadHealth(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";

  try {
    const response = await fetch("/api/health");

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as HealthResponse;
    checks.value = payload.checks;
    generatedAt.value = payload.generatedAt;
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : "Impossible de charger le health check.";
  } finally {
    loading.value = false;
  }
}

function formatLatency(check: HealthCheck): string {
  return typeof check.latencyMs === "number" ? `${check.latencyMs} ms` : "--";
}

function formatQuota(check: HealthCheck): string {
  if (!check.quota?.exposed) {
    return "Non exposé";
  }

  return [
    check.quota.remaining ? `Restant ${check.quota.remaining}` : "",
    check.quota.limit ? `Limite ${check.quota.limit}` : "",
    check.quota.reset ? `Reset ${check.quota.reset}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function statusLabel(status: HealthStatus): string {
  return {
    ok: "OK",
    warning: "Avertissement",
    error: "Erreur",
    not_configured: "Non configuré",
  }[status];
}
</script>

<template>
  <main class="health-page">
    <header class="health-page__hero">
      <p class="eyebrow">Health</p>
      <h1>État des services</h1>
      <p>
        Vérification courte des dépendances principales. Les secrets et URLs
        sensibles ne sont jamais affichés.
      </p>
    </header>

    <section
      class="health-summary"
      :class="`health-summary--${overallStatus}`"
      aria-live="polite"
    >
      <div>
        <strong>{{ statusLabel(overallStatus) }}</strong>
        <span v-if="generatedAt">Dernière vérification {{ generatedAt }}</span>
        <span v-else>Vérification en attente</span>
      </div>
      <button class="button-secondary" type="button" @click="loadHealth">
        Rafraîchir
      </button>
    </section>

    <section v-if="loading" class="health-state" role="status">
      Vérification des services...
    </section>

    <section v-else-if="errorMessage" class="health-state health-state--error">
      {{ errorMessage }}
    </section>

    <section v-else class="health-grid" aria-label="Services vérifiés">
      <article
        v-for="check in checks"
        :key="check.id"
        class="health-card"
        :class="`health-card--${check.status}`"
      >
        <header>
          <div>
            <span>{{ check.category }}</span>
            <h2>{{ check.label }}</h2>
          </div>
          <strong>{{ statusLabel(check.status) }}</strong>
        </header>
        <p>{{ check.message }}</p>
        <dl>
          <div>
            <dt>Latence</dt>
            <dd>{{ formatLatency(check) }}</dd>
          </div>
          <div>
            <dt>Quota</dt>
            <dd>{{ formatQuota(check) }}</dd>
          </div>
          <div>
            <dt>Critique</dt>
            <dd>{{ check.required ? "Oui" : "Optionnel" }}</dd>
          </div>
        </dl>
        <small v-if="check.detail">{{ check.detail }}</small>
      </article>
    </section>
  </main>
</template>

<style scoped>
.health-page {
  color: var(--ink);
  margin: 0 auto;
  max-width: 1120px;
  min-height: 100vh;
  padding: 42px 22px 110px;
}

.health-page__hero {
  margin-bottom: 24px;
}

.health-page__hero h1 {
  font-size: clamp(2rem, 4vw, 3.8rem);
  letter-spacing: 0;
  line-height: 0.98;
  margin: 0;
}

.health-page__hero p:last-child {
  color: var(--muted);
  font-size: 1.05rem;
  font-weight: 720;
  line-height: 1.5;
  max-width: 760px;
}

.health-summary {
  align-items: center;
  background: #ffffff;
  border: 1px solid rgba(16, 35, 63, 0.1);
  border-left: 7px solid #64748b;
  border-radius: 8px;
  box-shadow: 0 16px 40px rgba(16, 35, 63, 0.08);
  display: flex;
  justify-content: space-between;
  margin-bottom: 18px;
  padding: 18px;
}

.health-summary strong {
  display: block;
  font-size: 1.4rem;
  font-weight: 950;
}

.health-summary span {
  color: var(--muted);
  font-weight: 740;
}

.health-summary--ok {
  border-left-color: #14b87a;
}

.health-summary--warning {
  border-left-color: #f59e0b;
}

.health-summary--error {
  border-left-color: #ef4444;
}

.health-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
}

.health-card {
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(16, 35, 63, 0.1);
  border-radius: 8px;
  box-shadow: 0 14px 34px rgba(16, 35, 63, 0.07);
  display: grid;
  gap: 14px;
  padding: 18px;
}

.health-card header {
  align-items: start;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.health-card header span,
.eyebrow {
  color: #5136ff;
  font-size: 0.78rem;
  font-weight: 950;
  letter-spacing: 0.04em;
  margin: 0 0 6px;
  text-transform: uppercase;
}

.health-card h2 {
  font-size: 1.35rem;
  line-height: 1.1;
  margin: 0;
}

.health-card header > strong {
  background: #eef3fb;
  border-radius: 999px;
  color: var(--muted);
  font-size: 0.8rem;
  padding: 7px 10px;
  white-space: nowrap;
}

.health-card--ok header > strong {
  background: #dffbea;
  color: #087a50;
}

.health-card--warning header > strong,
.health-card--not_configured header > strong {
  background: #fff7d6;
  color: #9a5b00;
}

.health-card--error header > strong {
  background: #ffe3e3;
  color: #bd1f32;
}

.health-card p {
  color: var(--ink);
  font-size: 1rem;
  font-weight: 820;
  margin: 0;
}

.health-card dl {
  display: grid;
  gap: 8px;
  margin: 0;
}

.health-card dl div {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.health-card dt {
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 900;
  text-transform: uppercase;
}

.health-card dd {
  color: var(--ink);
  font-weight: 870;
  margin: 0;
  text-align: right;
}

.health-card small {
  border-top: 1px solid rgba(16, 35, 63, 0.08);
  color: var(--muted);
  font-weight: 720;
  line-height: 1.45;
  padding-top: 12px;
}

.health-state {
  background: #ffffff;
  border: 1px solid rgba(16, 35, 63, 0.1);
  border-radius: 8px;
  color: var(--muted);
  font-weight: 850;
  padding: 22px;
}

.health-state--error {
  color: #bd1f32;
}

@media (max-width: 680px) {
  .health-summary {
    align-items: stretch;
    flex-direction: column;
    gap: 14px;
  }
}
</style>
