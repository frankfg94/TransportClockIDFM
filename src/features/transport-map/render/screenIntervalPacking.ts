/** Closest ordered centers whose intervals remain separated by the given gap. */
export function packScreenIntervals(centers: readonly number[], sizes: readonly number[], gap: number): number[] {
  const offsets = [0];
  for (let index = 1; index < centers.length; index += 1) {
    offsets[index] = offsets[index - 1]! + (sizes[index - 1]! + sizes[index]!) / 2 + gap;
  }
  const pools: Array<{ start: number; end: number; sum: number; count: number }> = [];
  centers.forEach((center, index) => {
    pools.push({ start: index, end: index + 1, sum: center - offsets[index]!, count: 1 });
    while (pools.length > 1) {
      const right = pools[pools.length - 1]!;
      const left = pools[pools.length - 2]!;
      if (left.sum / left.count <= right.sum / right.count) break;
      left.end = right.end;
      left.sum += right.sum;
      left.count += right.count;
      pools.pop();
    }
  });
  const result = new Array<number>(centers.length);
  for (const pool of pools) {
    for (let index = pool.start; index < pool.end; index += 1) {
      result[index] = pool.sum / pool.count + offsets[index]!;
    }
  }
  return result;
}
