export const DENSITY = { small: 400, medium: 650, large: 1000 } as const;
export type Density = keyof typeof DENSITY;

export interface Prefs {
  readonly density: Density;
  readonly codeRate: number;
}

const KEY = "chappe:prefs";
const DEFAULTS: Prefs = { density: "medium", codeRate: 8 };

function isDensity(value: unknown): value is Density {
  return typeof value === "string" && value in DENSITY;
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULTS;
    const density = "density" in parsed && isDensity(parsed.density) ? parsed.density : DEFAULTS.density;
    const rate = "codeRate" in parsed ? Number(parsed.codeRate) : NaN;
    const codeRate = Number.isFinite(rate) && rate >= 3 && rate <= 15 ? rate : DEFAULTS.codeRate;
    return { density, codeRate };
  } catch {
    return DEFAULTS;
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {}
}
