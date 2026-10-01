<script setup lang="ts">
import AppModal from "../../components/AppModal.vue";
import type { DvfPurchaseSaleDetails, DvfPurchasePropertyDetails } from "../../services/real-estate/compiledRealEstate";
import { useI18n } from "../../i18n";

const props = defineProps<{
  open: boolean;
  loading: boolean;
  error: boolean;
  cityName: string;
  referencePeriod: string;
  sales: readonly DvfPurchaseSaleDetails[];
}>();

const emit = defineEmits<{
  close: [];
  retry: [];
}>();

const { locale, t } = useI18n();

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(formatLocale(), { dateStyle: "long", timeZone: "UTC" }).format(date);
}

function formatCurrency(value: number | undefined): string {
  if (value === undefined) return t("globalMap.realEstate.salePriceUnavailable");
  return new Intl.NumberFormat(formatLocale(), {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(formatLocale(), { maximumFractionDigits: 1 }).format(value);
}

function formatLocale(): string {
  return locale.value.startsWith("fr") ? "fr-FR" : "en-GB";
}

function propertyType(property: DvfPurchasePropertyDetails): string {
  return property.type || t("globalMap.realEstate.salePropertyUnspecified");
}
</script>

<template>
  <AppModal
    :open="open"
    :eyebrow="t('globalMap.realEstate.saleDetailsEyebrow')"
    :title="t('globalMap.realEstate.saleDetailsTitle')"
    panel-class="global-map-real-estate-sales-modal"
    @close="emit('close')"
  >
    <div class="global-map-real-estate-sales-modal__content" data-global-map-real-estate-sales-modal>
      <p class="global-map-real-estate-sales-modal__context">
        {{ t("globalMap.realEstate.saleDetailsContext", { city: cityName, period: referencePeriod }) }}
      </p>

      <p v-if="loading" class="global-map-real-estate-sales-modal__status" role="status" aria-live="polite">
        {{ t("globalMap.realEstate.saleDetailsLoading") }}
      </p>

      <div v-else-if="error" class="global-map-real-estate-sales-modal__status" role="alert">
        <p>{{ t("globalMap.realEstate.saleDetailsError") }}</p>
        <button type="button" @click="emit('retry')">{{ t("globalMap.realEstate.saleDetailsRetry") }}</button>
      </div>

      <p v-else-if="sales.length === 0" class="global-map-real-estate-sales-modal__status" role="status">
        {{ t("globalMap.realEstate.saleDetailsEmpty") }}
      </p>

      <template v-else>
        <p class="global-map-real-estate-sales-modal__count">
          {{ t("globalMap.realEstate.saleDetailsCount", { count: sales.length }) }}
        </p>
        <ol class="global-map-real-estate-sales-modal__list">
          <li v-for="(sale, saleIndex) in sales" :key="`${sale.date}:${saleIndex}`">
            <article class="global-map-real-estate-sales-modal__sale">
              <header class="global-map-real-estate-sales-modal__sale-header">
                <div>
                  <time :datetime="sale.date">{{ formatDate(sale.date) }}</time>
                  <p>{{ sale.nature || t("globalMap.realEstate.saleLabel", { number: saleIndex + 1 }) }}</p>
                </div>
                <strong>{{ formatCurrency(sale.price) }}</strong>
              </header>

              <p v-if="sale.lotCount" class="global-map-real-estate-sales-modal__lots">
                {{ t("globalMap.realEstate.saleLotCount", { count: sale.lotCount }) }}
              </p>

              <ul v-if="sale.properties.length" class="global-map-real-estate-sales-modal__properties">
                <li v-for="(property, propertyIndex) in sale.properties" :key="`${property.type}:${propertyIndex}`">
                  <strong>
                    {{ property.count > 1 ? t("globalMap.realEstate.salePropertyCount", { count: property.count, type: propertyType(property) }) : propertyType(property) }}
                  </strong>
                  <span v-if="property.builtSurfaceM2 !== undefined">
                    {{ t("globalMap.realEstate.saleBuiltSurface", { area: formatNumber(property.builtSurfaceM2) }) }}
                  </span>
                  <span v-if="property.rooms !== undefined">
                    {{ t("globalMap.realEstate.saleRoomCount", { count: property.rooms }) }}
                  </span>
                  <span v-if="property.carrezSurfaceM2 !== undefined">
                    {{ t("globalMap.realEstate.saleCarrezSurface", { area: formatNumber(property.carrezSurfaceM2) }) }}
                  </span>
                  <span v-if="property.landSurfaceM2 !== undefined">
                    {{ t("globalMap.realEstate.saleLandSurface", { area: formatNumber(property.landSurfaceM2) }) }}
                  </span>
                </li>
              </ul>
            </article>
          </li>
        </ol>
      </template>

      <p class="global-map-real-estate-sales-modal__source">
        {{ t("globalMap.realEstate.saleDetailsSource") }}
      </p>
    </div>
  </AppModal>
</template>

<style scoped>
:deep(.global-map-real-estate-sales-modal) {
  width: min(48rem, calc(100vw - 2rem));
  max-height: min(86vh, 56rem);
}

.global-map-real-estate-sales-modal__content {
  display: grid;
  gap: 1rem;
  max-height: min(68vh, 44rem);
  overflow-y: auto;
  padding: 0.1rem 0.15rem 0.5rem;
}

.global-map-real-estate-sales-modal__context,
.global-map-real-estate-sales-modal__count,
.global-map-real-estate-sales-modal__source,
.global-map-real-estate-sales-modal__lots {
  margin: 0;
  color: var(--text-secondary, #64748b);
  font-size: 0.9rem;
}

.global-map-real-estate-sales-modal__count {
  color: var(--text-primary, #0f172a);
  font-weight: 700;
}

.global-map-real-estate-sales-modal__status {
  display: grid;
  justify-items: start;
  gap: 0.75rem;
  margin: 0;
  padding: 1.1rem;
  border: 1px solid var(--border-color, #cbd5e1);
  border-radius: 0.8rem;
  background: var(--surface-secondary, #f8fafc);
}

.global-map-real-estate-sales-modal__status button {
  border: 0;
  border-radius: 0.55rem;
  padding: 0.55rem 0.85rem;
  color: #fff;
  background: var(--primary-color, #2563eb);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}

.global-map-real-estate-sales-modal__list {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.global-map-real-estate-sales-modal__sale {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--border-color, #cbd5e1);
  border-radius: 0.85rem;
  background: var(--surface-primary, #fff);
}

.global-map-real-estate-sales-modal__sale-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.global-map-real-estate-sales-modal__sale-header time {
  color: var(--text-primary, #0f172a);
  font-weight: 700;
}

.global-map-real-estate-sales-modal__sale-header p {
  margin: 0.2rem 0 0;
  color: var(--text-secondary, #64748b);
  font-size: 0.88rem;
}

.global-map-real-estate-sales-modal__sale-header > strong {
  color: var(--text-primary, #0f172a);
  text-align: right;
  white-space: nowrap;
}

.global-map-real-estate-sales-modal__properties {
  display: grid;
  gap: 0.45rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.global-map-real-estate-sales-modal__properties li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.8rem;
  color: var(--text-secondary, #64748b);
  font-size: 0.86rem;
}

.global-map-real-estate-sales-modal__properties strong {
  color: var(--text-primary, #0f172a);
}

.global-map-real-estate-sales-modal__source {
  border-top: 1px solid var(--border-color, #cbd5e1);
  padding-top: 0.75rem;
}

@media (max-width: 520px) {
  .global-map-real-estate-sales-modal__sale-header {
    display: grid;
  }

  .global-map-real-estate-sales-modal__sale-header > strong {
    text-align: left;
  }
}
</style>
