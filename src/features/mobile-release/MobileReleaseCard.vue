<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "../../i18n";
import { getAndroidRelease, getAppSourceRevision } from "./client";
import type { AndroidReleaseStatus } from "./types";

const release = ref<AndroidReleaseStatus | null>(null);
const loading = ref(true);
const pageRevision = getAppSourceRevision();
const hasPageRevision = /^[a-f0-9]{40}$/iu.test(pageRevision);
const { d, n, t } = useI18n();

type ChecklistState = "ready" | "waiting" | "blocked";

interface ChecklistItem {
  detail: string;
  label: string;
  state: ChecklistState;
}

const statusCopy = computed(() => {
  if (loading.value) return t("mobileRelease.status.checking");
  if (release.value?.available) {
    return release.value.selection === "matching-source"
      ? t("mobileRelease.status.matching")
      : t("mobileRelease.status.latest");
  }

  switch (release.value?.reason) {
    case "source-revision-mismatch":
      return t("mobileRelease.status.sourceMismatch");
    case "invalid-release":
      return t("mobileRelease.status.invalidRelease");
    case "not-configured":
      return t("mobileRelease.status.notConfigured");
    case "request-failed":
      return t("mobileRelease.status.requestFailed");
    default:
      return t("mobileRelease.status.none");
  }
});

const checklist = computed<ChecklistItem[]>(() => {
  const releaseState = release.value;
  const waiting = loading.value;
  const apkState: ChecklistState = waiting ? "waiting" : releaseState?.available ? "ready" : "blocked";

  return [
    {
      label: t("mobileRelease.checklist.apkPublished"),
      detail: waiting
        ? t("mobileRelease.checklist.searching")
        : releaseState?.available
          ? t("mobileRelease.checklist.versionDetected", {
              versionName: releaseState.versionName,
              versionCode: releaseState.versionCode,
            })
          : releaseState?.reason === "not-configured"
            ? t("mobileRelease.checklist.storageMissing")
            : releaseState?.reason === "request-failed"
              ? t("mobileRelease.checklist.serviceDown")
              : t("mobileRelease.checklist.noRelease"),
      state: apkState,
    },
    {
      label: t("mobileRelease.checklist.manifest"),
      detail: waiting
        ? t("mobileRelease.checklist.manifestChecking")
        : releaseState?.available
          ? t("mobileRelease.checklist.manifestReady")
          : t("mobileRelease.checklist.manifestWaiting"),
      state: apkState,
    },
    {
      label: t("mobileRelease.checklist.pageMatch"),
      detail: !hasPageRevision
        ? t("mobileRelease.checklist.pageMatchDisabled")
        : releaseState?.available && releaseState.selection === "matching-source"
          ? t("mobileRelease.checklist.pageMatchReady", {
              commit: pageRevision.slice(0, 12),
            })
          : t("mobileRelease.checklist.pageMatchWaiting"),
      state: releaseState?.available && releaseState.selection === "matching-source" ? "ready" : "waiting",
    },
  ];
});

const formattedDate = computed(() => {
  if (!release.value?.available) return "—";
  return d(new Date(release.value.builtAt), {
    dateStyle: "medium",
    timeStyle: "short",
  });
});

const formattedSize = computed(() => {
  if (!release.value?.available) return "—";
  return t("mobileRelease.sizeMegabytes", {
    size: n(release.value.sizeBytes / 1024 / 1024, {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    }),
  });
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
        <p class="settings-panel__eyebrow">{{ t("mobileRelease.eyebrow") }}</p>
        <h2 id="settings-android-title">{{ t("mobileRelease.title") }}</h2>
        <p>{{ t("mobileRelease.body") }}</p>
      </div>
      <span
        class="mobile-release-card__status"
        :class="{ 'mobile-release-card__status--ready': release?.available }"
      >
        {{
          release?.available
            ? t("mobileRelease.available")
            : t("mobileRelease.waiting")
        }}
      </span>
    </div>

    <div class="mobile-release-card__details" :aria-busy="loading">
      <p class="mobile-release-card__message">{{ statusCopy }}</p>
      <ul
        class="mobile-release-card__checklist"
        :aria-label="t('mobileRelease.checklist.aria')"
      >
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
        <div><dt>{{ t("mobileRelease.version") }}</dt><dd>{{ release.versionName }} ({{ release.versionCode }})</dd></div>
        <div><dt>{{ t("mobileRelease.builtAt") }}</dt><dd>{{ formattedDate }}</dd></div>
        <div><dt>{{ t("mobileRelease.size") }}</dt><dd>{{ formattedSize }}</dd></div>
        <div><dt>{{ t("mobileRelease.compatibility") }}</dt><dd>{{ t("mobileRelease.androidCompatibility", { version: release.minSdk === 24 ? "7+" : `${release.minSdk}+` }) }}</dd></div>
        <div class="mobile-release-card__fingerprint"><dt>SHA-256</dt><dd>{{ release.sha256 }}</dd></div>
      </dl>
    </div>

    <a
      v-if="release?.available"
      class="button-primary mobile-release-card__download"
      :href="release.downloadUrl"
      download
    >
      {{ t("mobileRelease.download") }}
    </a>
    <button v-else class="button-primary mobile-release-card__download" type="button" disabled>
      {{ t("mobileRelease.unavailable") }}
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
