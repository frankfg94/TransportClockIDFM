/** Collapse administrative qualifiers and labelled sub-sites of the same grounds. */
export function greenSpaceIdentity(name: string): string {
  return name.split(/\s[–—/-]\s|\s*\/\s*/u, 1)[0]!
    .normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ").trim()
    .replace(/^(?:(?:domaine|parc|boise|departemental|municipal|de|du|des|la|le|les|l|d)\s+)+/u, "")
    .trim();
}

export function legacyGreenSpaceId(fact: { id: string; family: string }): string | undefined {
  if (fact.id.startsWith("green-site-")) return fact.id.slice("green-site-".length);
  if (fact.id.startsWith("green-reference-")) return fact.id.slice("green-reference-".length);
  if (fact.id.startsWith("green-") && fact.family === "managed-green-space") return fact.id.slice("green-".length);
}
