/** Start only the first bounded connection batch while pedestrian access is
 * loading. The remaining stream keeps its original order and backpressure. */
export function prefetchGtfsConnectionBatch<T>(source: AsyncGenerator<T>): AsyncIterableIterator<T> {
  let first: Promise<IteratorResult<T>> | undefined = source.next();
  // The consumer still observes the error; walking can finish after the read.
  void first.catch(() => {});
  return {
    [Symbol.asyncIterator]() { return this; },
    next() {
      if (!first) return source.next();
      const next = first;
      first = undefined;
      return next;
    },
    return() { first = undefined; return source.return(undefined); },
  };
}
