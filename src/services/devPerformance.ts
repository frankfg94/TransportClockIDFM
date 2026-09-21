let measureSequence = 0;

/**
 * Development-only Performance Timeline marks.
 *
 * This deliberately does not log: the browser Performance panel remains the
 * source of truth and production builds pay no mark/measure cost.
 */
export function beginDevPerformance(name: string): string | undefined {
  if (!import.meta.dev || typeof performance === "undefined" || typeof performance.mark !== "function") {
    return undefined;
  }
  const id = `${name}:${++measureSequence}`;
  performance.mark(`${id}:start`);
  return id;
}

export function endDevPerformance(id: string | undefined, name: string): void {
  if (!id || !import.meta.dev || typeof performance === "undefined" || typeof performance.measure !== "function") return;
  const start = `${id}:start`;
  const end = `${id}:end`;
  performance.mark(end);
  try {
    performance.measure(name, start, end);
  } finally {
    performance.clearMarks(start);
    performance.clearMarks(end);
  }
}

export function measureDevPerformance<T>(name: string, callback: () => T): T {
  const id = beginDevPerformance(name);
  try {
    return callback();
  } finally {
    endDevPerformance(id, name);
  }
}
