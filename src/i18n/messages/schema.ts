import type { fr } from "./fr";

export type StringLeaves<T> = {
  readonly [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends Record<string, unknown>
      ? StringLeaves<T[K]>
      : T[K];
};

export type Messages = StringLeaves<typeof fr>;
