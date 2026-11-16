import { expect, test } from "bun:test";
import { bytesEqual } from "../core/bytes.ts";
import { FountainDecoder, FountainEncoder } from "./fountain.ts";

function randomCargo(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

function roundTrip(cargoBytes: number, symbolSize: number, dropRate: number) {
  const cargo = randomCargo(cargoBytes);
  const encoder = new FountainEncoder(cargo, symbolSize);
  const decoder = new FountainDecoder(encoder.symbolCount, symbolSize);

  let sent = 0;
  for (let seed = 0; !decoder.isComplete() && seed < 100_000; seed++) {
    if (Math.random() < dropRate) continue;
    const block = encoder.blockAt(seed);
    decoder.push(block.seed, block.data);
    sent += 1;
  }

  expect(decoder.isComplete()).toBe(true);
  const assembled = decoder.assemble(cargoBytes);
  expect(bytesEqual(assembled, cargo)).toBe(true);
  return { sent, symbolCount: encoder.symbolCount };
}

test("clean channel decodes from systematic prefix", () => {
  const { sent, symbolCount } = roundTrip(50_000, 1200, 0);
  expect(sent).toBeGreaterThanOrEqual(symbolCount);
});

test("recovers with 30% loss", () => {
  roundTrip(200_000, 1200, 0.3);
});

test("recovers with 50% loss", () => {
  roundTrip(120_000, 1000, 0.5);
});

test("single symbol payload", () => {
  roundTrip(400, 1200, 0.2);
});

test("duplicate seeds are ignored", () => {
  const cargo = randomCargo(10_000);
  const encoder = new FountainEncoder(cargo, 1000);
  const decoder = new FountainDecoder(encoder.symbolCount, 1000);
  const block = encoder.blockAt(500);
  decoder.push(block.seed, block.data);
  decoder.push(block.seed, block.data);
  expect(decoder.recovered).toBeLessThanOrEqual(encoder.symbolCount);
});
