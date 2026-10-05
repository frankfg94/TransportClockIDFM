/** Same bounded default in development and production; explicit overrides win. */
export function resolveUnlimitedNetwork(value: string | undefined, _development: boolean): boolean {
  if (value === undefined || value.trim() === "") return false;
  return value.trim().toLowerCase() === "true";
}
