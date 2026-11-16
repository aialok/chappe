import { expect, test } from "bun:test";
import { bytesEqual } from "../../core/bytes.ts";
import type { Seed, TransferId } from "../../core/types.ts";
import { packetToText, textToPacket } from "./codec.ts";

test("block packet survives base64url round trip", () => {
  const data = new Uint8Array(600);
  crypto.getRandomValues(data);
  const text = packetToText({
    kind: "block",
    transferId: 123456 as TransferId,
    seed: 42 as Seed,
    data,
  });
  const packet = textToPacket(text);
  expect(packet?.kind).toBe("block");
  if (packet?.kind === "block") {
    expect(packet.transferId).toBe(123456 as TransferId);
    expect(packet.seed).toBe(42 as Seed);
    expect(bytesEqual(packet.data, data)).toBe(true);
  }
});

test("manifest with inconsistent sizes is rejected", () => {
  const text = packetToText({
    kind: "manifest",
    manifest: {
      transferId: 1 as TransferId,
      kind: "file",
      name: "x",
      mime: "application/octet-stream",
      cargoBytes: 1000,
      symbolSize: 100,
      symbolCount: 4_000_000_000,
      flags: { gzip: false, encrypted: false },
      sha256: new Uint8Array(32),
      salt: new Uint8Array(0),
      iv: new Uint8Array(0),
    },
  });
  expect(textToPacket(text)).toBeNull();
});

test("garbage text decodes to null, not a throw", () => {
  expect(textToPacket("not a packet!!!")).toBeNull();
});
