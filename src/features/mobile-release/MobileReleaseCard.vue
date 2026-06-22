<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { getAndroidRelease, getAppSourceRevision } from "./client";
import type { AndroidReleaseStatus } from "./types";

const release = ref<AndroidReleaseStatus | null>(null);
const loading = ref(true);
const pageRevision = getAppSourceRevision();
const hasPageRevision = /^[a-f0-9]{40}$/iu.test(pageRevision);

type ChecklistState = "ready" | "waiting" | "blocked";

interface ChecklistItem {
  detail: string;
  label: string;
  state: ChecklistState;
}

const statusCopy = computed(() => {
  if (loading.value) return "Vérification de l’APK disponible…";
  if (release.value?.available) {
    return release.value.selection === "matching-source"
      ? "APK signée correspondant à cette version de la page."
      : "Dernière APK signée disponible au téléchargement.";
  }

  switch (release.value?.reason) {
    case "source-revision-mismatch":
      return "L’APK correspondante est encore en cours de génération.";
    case "invalid-release":
      return "Une APK existe, mais sa vérification a échoué.";
    case "not-configured":
      return "La distribution Android n’est pas encore configurée.";
    case "request-failed":
      return "Le serveur de distribution Android est actuellement injoignable.";
    default:
      return "Aucune APK Android valide n’a été détectée pour le moment.";
  }
});

const checklist = computed<ChecklistItem[]>(() => {
  const releaseState = release.value;
  const waiting = loading.value;
  const apkState: ChecklistState = waiting ? "waiting" : releaseState?.available ? "ready" : "blocked";

  return [
    {
      label: "APK Android publiée",
      detail: waiting
        ? "Recherche de la dernière release valide…"
        : releaseState?.available
          ? `Version ${releaseState.versionName} (${releaseState.versionCode}) détectée.`
          : releaseState?.reason === "not-configured"
            ? "Le stockage de releases n’est pas encore accessible depuis le serveur."
            : releaseState?.reason === "request-failed"
              ? "Le service de distribution ne répond pas."
              : "Aucune release Android valide n’a été trouvée.",
      state: apkState,
    },
    {
      label: "Manifest et intégrité vérifiés",
      detail: waiting
        ? "Validation du manifest en cours…"
        : releaseState?.available
          ? "Taille, SHA-256 et signature ont été validés avant publication."
          : "Cette vérification sera effectuée dès qu’une release sera détectée.",
      state: apkState,
    },
    {
      label: "Correspondance avec la page (optionnel)",
      detail: !hasPageRevision
        ? "Non activée : la dernière APK valide reste téléchargeable."
        : releaseState?.available && releaseState.selection === "matching-source"
          ? `Le commit ${pageRevision.slice(0, 12)} correspond également à l’APK.`
          : "La dernière APK valide est proposée sans bloquer sur le commit de la page.",
      state: releaseState?.available && releaseState.selection === "matching-source" ? "ready" : "waiting",
    },
  ];
});

const formattedDate = computed(() => {
  if (!release.value?.available) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(release.value.builtAt));
});

const formattedSize = computed(() => {
  if (!release.value?.available) return "—";
  return `${(release.value.sizeBytes / 1024 / 1024).toFixed(1)} Mo`;
});

onMounted(async () => {
  release.value = await getAndroidRelease();
  loading.value = false;
});
</script>

<template>
  <section class="settings-panel mobile-release-card" aria-labelledby="settings-android-title">
    <div class="settings-panel__heading">
      <div>
        <p class="settings-panel__eyebrow">Application mobile</p>
        <h2 id="settings-android-title">Application Android</h2>
        <p>Téléchargez l’APK signée correspondant exactement à cette version.</p>
      </div>
      <span
        class="mobile-release-card__status"
        :class="{ 'mobile-release-card__status--ready': release?.available }"
      >
        {{ release?.available ? "Disponible" : "En attente" }}
      </span>
    </div>

    <div class="mobile-release-card__details" :aria-busy="loading">
      <p class="mobile-release-card__message">{{ statusCopy }}</p>
      <ul class="mobile-release-card__checklist" aria-label="Conditions de disponibilité de l’APK">
        <li
          v-for="item in checklist"
          :key="item.label"
          :class="`mobile-release-card__checklist-item--${item.state}`"
        >
          <span class="mobile-release-card__checklist-icon" aria-hidden="true">
            {{ item.state === "ready" ? "✓" : item.state === "waiting" ? "…" : "!" }}
          </span>
          <span>
            <strong>{{ item.label }}</strong>
            <small>{{ item.detail }}</small>
          </span>
        </li>
      </ul>
      <dl v-if="release?.available" class="mobile-release-card__metadata">
        <div><dt>Version</dt><dd>{{ release.versionName }} ({{ release.versionCode }})</dd></div>
        <div><dt>Générée le</dt><dd>{{ formattedDate }}</dd></div>
        <div><dt>Taille</dt><dd>{{ formattedSize }}</dd></div>
        <div><dt>Compatibilité</dt><dd>Android {{ release.minSdk === 24 ? "7+" : `${release.minSdk}+` }}</dd></div>
        <div class="mobile-release-card__fingerprint"><dt>SHA-256</dt><dd>{{ release.sha256 }}</dd></div>
      </dl>
    </div>

    <a
      v-if="release?.available"
      class="button-primary mobile-release-card__download"
      :href="release.downloadUrl"
      download
    >
      Télécharger l’APK
    </a>
    <button v-else class="button-primary mobile-release-card__download" type="button" disabled>
      APK indisponible
    </button>
  </section>
</template>

<style scoped>
.mobile-release-card__status {
  align-self: flex-start;
  border-radius: 999px;
  background: var(--surface-muted, #eef2f8);
  color: var(--text-muted, #64748b);
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.38rem 0.64rem;
}

.mobile-release-card__status--ready {
  background: #dcfce7;
  color: #166534;
}

.mobile-release-card__details {
  margin: 1.1rem 0;
  border-radius: 0.85rem;
  background: var(--surface-muted, #f5f7fb);
  padding: 1rem;
}

.mobile-release-card__message { margin: 0; font-weight: 600; }
.mobile-release-card__checklist { display: grid; gap: 0.65rem; list-style: none; margin: 1rem 0 0; padding: 0; }
.mobile-release-card__checklist li { align-items: flex-start; display: grid; gap: 0.6rem; grid-template-columns: 1.3rem minmax(0, 1fr); }
.mobile-release-card__checklist strong { display: block; color: var(--text-primary, #14213d); font-size: 0.84rem; }
.mobile-release-card__checklist small { color: var(--text-muted, #64748b); display: block; font-size: 0.76rem; line-height: 1.35; margin-top: 0.08rem; overflow-wrap: anywhere; }
.mobile-release-card__checklist-icon { align-items: center; background: #fef3c7; border-radius: 50%; color: #92400e; display: inline-flex; font-size: 0.76rem; font-weight: 800; height: 1.3rem; justify-content: center; line-height: 1; width: 1.3rem; }
.mobile-release-card__checklist-item--ready .mobile-release-card__checklist-icon { background: #dcfce7; color: #166534; }
.mobile-release-card__checklist-item--waiting .mobile-release-card__checklist-icon { background: #dbeafe; color: #1d4ed8; }
.mobile-release-card__metadata { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.9rem; margin: 1rem 0 0; }
.mobile-release-card__metadata div { min-width: 0; }
.mobile-release-card__metadata dt { color: var(--text-muted, #64748b); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
.mobile-release-card__metadata dd { margin: 0.2rem 0 0; font-weight: 600; }
.mobile-release-card__fingerprint { grid-column: 1 / -1; }
.mobile-release-card__fingerprint dd { overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.77rem; }
.mobile-release-card__download { display: inline-flex; text-decoration: none; }

@media (max-width: 520px) {
  .mobile-release-card__metadata { grid-template-columns: 1fr; }
}
</style>
