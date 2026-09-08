import Fuse from "fuse.js";

const FUZZY_MATCH_MAX_SCORE = 0.42;

/**
 * One search primitive for local catalogues. Fuse is deliberately kept behind
 * this small adapter so every UI uses the same accent-insensitive, forgiving
 * matching rules instead of maintaining subtly different `includes` filters.
 */
export function normalizeFuzzySearchText(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

export function fuzzyMatches(
  query: string,
  values: readonly (string | undefined)[],
): boolean {
  const normalizedQuery = normalizeFuzzySearchText(query);
  if (!normalizedQuery) return true;

  const searchableValues = values
    .map((value) => normalizeFuzzySearchText(value))
    .filter(Boolean);
  if (!searchableValues.length) return false;

  const fuse = new Fuse([{ searchableValues }], {
    keys: ["searchableValues"],
    threshold: 0.42,
    ignoreLocation: true,
    minMatchCharLength: 1,
    includeScore: true,
  });
  return fuse.search(normalizedQuery).some(
    (result) => (result.score ?? 1) <= FUZZY_MATCH_MAX_SCORE,
  );
}

export function fuzzyFilter<T>(
  values: readonly T[],
  query: string,
  getSearchValues: (value: T) => readonly (string | undefined)[],
): T[] {
  const normalizedQuery = normalizeFuzzySearchText(query);
  if (!normalizedQuery) return [...values];

  const fuse = new Fuse(
    values.map((value, index) => ({
      value,
      index,
      searchableValues: getSearchValues(value)
        .map((candidate) => normalizeFuzzySearchText(candidate))
        .filter(Boolean),
    })),
    {
      keys: ["searchableValues"],
      threshold: 0.42,
      ignoreLocation: true,
      minMatchCharLength: 1,
      includeScore: true,
    },
  );

  return fuse
    .search(normalizedQuery)
    .filter((result) => (result.score ?? 1) <= FUZZY_MATCH_MAX_SCORE)
    .sort((left, right) =>
      (left.score ?? 1) - (right.score ?? 1) || left.item.index - right.item.index,
    )
    .map((result) => result.item.value);
}
