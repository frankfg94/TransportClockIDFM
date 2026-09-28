<script setup lang="ts">
import { Building2, Route, Shuffle, Train } from "lucide-vue-next";

defineProps<{
  sectionAriaLabel: string;
  lengthLabel: string;
  lengthCaption: string;
  lineCount: number;
  lineStatsCountLabel: string;
  cityCount: number;
  cityCountCaption: string;
  connectionCount: number;
  connectionCountCaption: string;
}>();
</script>

<template>
  <section class="global-map-picker-sidebar__line-stats" :aria-label="sectionAriaLabel">
    <article class="global-map-picker-sidebar__line-stat">
      <Route :size="17" aria-hidden="true" />
      <div>
        <strong>{{ lengthLabel }}</strong>
        <span>{{ lengthCaption }}</span>
      </div>
    </article>
    <article class="global-map-picker-sidebar__line-stat">
      <Train :size="17" aria-hidden="true" />
      <div>
        <strong>{{ lineCount }}</strong>
        <span>{{ lineStatsCountLabel }}</span>
      </div>
    </article>
    <article class="global-map-picker-sidebar__line-stat">
      <Building2 :size="17" aria-hidden="true" />
      <div>
        <strong>{{ cityCount }}</strong>
        <span>{{ cityCountCaption }}</span>
      </div>
    </article>
    <article class="global-map-picker-sidebar__line-stat">
      <Shuffle :size="17" aria-hidden="true" />
      <div>
        <strong>{{ connectionCount }}</strong>
        <span>{{ connectionCountCaption }}</span>
      </div>
    </article>
  </section>
</template>

<style scoped>
.global-map-picker-sidebar__line-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.global-map-picker-sidebar__line-stat {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 12px 10px;
  border: 1px solid var(--sidebar-border);
  border-radius: 14px;
  background: #fff;
}

.global-map-picker-sidebar__line-stat > svg {
  flex: 0 0 auto;
  color: var(--line-color);
}

.global-map-picker-sidebar__line-stat strong,
.global-map-picker-sidebar__line-stat span {
  display: block;
}

.global-map-picker-sidebar__line-stat strong {
  overflow: hidden;
  color: #18233f;
  font-size: .92rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.global-map-picker-sidebar__line-stat span {
  margin-top: 3px;
  color: #71809d;
  font-size: .65rem;
  font-weight: 800;
}
</style>
