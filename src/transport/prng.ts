export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickDistinct(
  rng: () => number,
  count: number,
  range: number,
): number[] {
  if (count >= range) {
    return Array.from({ length: range }, (_, i) => i);
  }
  const chosen = new Set<number>();
  for (let i = range - count; i < range; i++) {
    const j = Math.floor(rng() * (i + 1));
    chosen.add(chosen.has(j) ? i : j);
  }
  return [...chosen];
}
