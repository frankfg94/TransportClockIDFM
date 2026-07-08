import { en } from "./en";
import { fr } from "./fr";
import type { AppLocale } from "../types";
import type { Messages } from "./schema";

export const messages = {
  en,
  fr,
} as const satisfies Record<AppLocale, Messages>;

export type { Messages } from "./schema";
