export interface DegreeDistribution {
  readonly symbolCount: number;
  degreeFor(u: number): number;
}

export function robustSoliton(
  symbolCount: number,
  c = 0.03,
  delta = 0.05,
): DegreeDistribution {
  const k = symbolCount;
  if (k <= 1) {
    return { symbolCount: k, degreeFor: () => 1 };
  }

  const rho = new Float64Array(k + 1);
  rho[1] = 1 / k;
  for (let i = 2; i <= k; i++) rho[i] = 1 / (i * (i - 1));

  const r = c * Math.log(k / delta) * Math.sqrt(k);
  const spike = Math.max(1, Math.round(k / r));
  const tau = new Float64Array(k + 1);
  for (let i = 1; i < spike; i++) tau[i] = r / (i * k);
  if (spike <= k) tau[spike] = (r * Math.log(r / delta)) / k;

  let beta = 0;
  for (let i = 1; i <= k; i++) beta += rho[i] + tau[i];

  const cdf = new Float64Array(k + 1);
  let acc = 0;
  for (let i = 1; i <= k; i++) {
    acc += (rho[i] + tau[i]) / beta;
    cdf[i] = acc;
  }
  cdf[k] = 1;

  return {
    symbolCount: k,
    degreeFor(u: number): number {
      let lo = 1;
      let hi = k;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid] < u) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    },
  };
}
