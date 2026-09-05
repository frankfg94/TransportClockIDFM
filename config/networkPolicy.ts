/** Explicit overrides win; only the development server is unlimited by default. */
export function resolveUnlimitedNetwork(value: string | undefined, development: boolean): boolean {
  if (value === undefined || value.trim() === "") return development;
  return value.trim().toLowerCase() === "true";
}
