import { xorInto } from "../core/bytes.ts";
import { mulberry32, pickDistinct } from "./prng.ts";
import { robustSoliton, type DegreeDistribution } from "./soliton.ts";

export interface EncodedBlock {
  readonly seed: number;
  readonly data: Uint8Array;
}

function neighborsOf(
  seed: number,
  symbolCount: number,
  dist: DegreeDistribution,
): number[] {
  if (seed < symbolCount) return [seed];
  const rng = mulberry32(seed);
  const degree = dist.degreeFor(rng());
  return pickDistinct(rng, degree, symbolCount);
}

function splitIntoSymbols(cargo: Uint8Array, symbolSize: number): Uint8Array[] {
  const count = Math.max(1, Math.ceil(cargo.length / symbolSize));
  const symbols: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const symbol = new Uint8Array(symbolSize);
    symbol.set(cargo.subarray(i * symbolSize, (i + 1) * symbolSize));
    symbols.push(symbol);
  }
  return symbols;
}

export class FountainEncoder {
  readonly symbolCount: number;
  readonly symbolSize: number;
  private readonly symbols: Uint8Array[];
  private readonly dist: DegreeDistribution;

  constructor(cargo: Uint8Array, symbolSize: number) {
    this.symbolSize = symbolSize;
    this.symbols = splitIntoSymbols(cargo, symbolSize);
    this.symbolCount = this.symbols.length;
    this.dist = robustSoliton(this.symbolCount);
  }

  blockAt(seed: number): EncodedBlock {
    const data = new Uint8Array(this.symbolSize);
    for (const index of neighborsOf(seed, this.symbolCount, this.dist)) {
      xorInto(data, this.symbols[index]);
    }
    return { seed, data };
  }
}

interface PendingBlock {
  neighbors: Set<number>;
  data: Uint8Array;
}

export class FountainDecoder {
  readonly symbolCount: number;
  readonly symbolSize: number;
  private readonly dist: DegreeDistribution;
  private readonly solved: (Uint8Array | null)[];
  private readonly index: Set<PendingBlock>[];
  private readonly seenSeeds = new Set<number>();
  private solvedCount = 0;

  constructor(symbolCount: number, symbolSize: number) {
    this.symbolCount = symbolCount;
    this.symbolSize = symbolSize;
    this.dist = robustSoliton(symbolCount);
    this.solved = new Array(symbolCount).fill(null);
    this.index = Array.from({ length: symbolCount }, () => new Set());
  }

  get recovered(): number {
    return this.solvedCount;
  }

  get received(): number {
    return this.seenSeeds.size;
  }

  isComplete(): boolean {
    return this.solvedCount === this.symbolCount;
  }

  push(seed: number, data: Uint8Array): void {
    if (this.isComplete() || this.seenSeeds.has(seed)) return;
    this.seenSeeds.add(seed);

    const block: PendingBlock = {
      neighbors: new Set(neighborsOf(seed, this.symbolCount, this.dist)),
      data: data.slice(0, this.symbolSize),
    };
    for (const n of [...block.neighbors]) {
      const solved = this.solved[n];
      if (solved) {
        xorInto(block.data, solved);
        block.neighbors.delete(n);
      }
    }
    this.admit(block);
  }

  private admit(block: PendingBlock): void {
    if (block.neighbors.size === 0) return;
    if (block.neighbors.size > 1) {
      for (const n of block.neighbors) this.index[n].add(block);
      return;
    }
    this.propagate(block);
  }

  private propagate(start: PendingBlock): void {
    const queue: PendingBlock[] = [start];
    while (queue.length > 0) {
      const block = queue.pop() as PendingBlock;
      if (block.neighbors.size !== 1) continue;
      const sym = block.neighbors.values().next().value as number;
      if (this.solved[sym]) continue;

      this.solved[sym] = block.data;
      this.solvedCount += 1;

      const dependents = this.index[sym];
      dependents.delete(block);
      for (const dep of dependents) {
        xorInto(dep.data, block.data);
        dep.neighbors.delete(sym);
        if (dep.neighbors.size === 1) queue.push(dep);
      }
      dependents.clear();
    }
  }

  assemble(cargoBytes: number): Uint8Array {
    if (!this.isComplete()) {
      throw new Error("fountain decode incomplete");
    }
    const out = new Uint8Array(this.symbolCount * this.symbolSize);
    for (let i = 0; i < this.symbolCount; i++) {
      out.set(this.solved[i] as Uint8Array, i * this.symbolSize);
    }
    return out.subarray(0, cargoBytes);
  }
}
