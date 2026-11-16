import { expect, test } from "bun:test";
import { bytesEqual } from "../core/bytes.ts";
import type { Payload } from "../core/types.ts";
import { encodePacket, tryDecodePacket } from "./packet.ts";
import { TransferSink, TransferSource } from "./transfer.ts";

interface SimOptions {
  passphrase?: string;
  receiverPassphrase?: string;
  dropRate?: number;
  symbolSize?: number;
}

async function simulate(payload: Payload, opts: SimOptions = {}) {
  const symbolSize = opts.symbolSize ?? 800;
  const source = await TransferSource.create(payload, {
    symbolSize,
    ...(opts.passphrase ? { passphrase: opts.passphrase } : {}),
  });
  const sink = new TransferSink(opts.receiverPassphrase ?? opts.passphrase);

  const deliver = (bytes: Uint8Array) => {
    const packet = tryDecodePacket(bytes);
    expect(packet).not.toBeNull();
    if (packet) sink.offer(packet);
  };

  deliver(encodePacket(source.manifestPacket()));

  const drop = opts.dropRate ?? 0;
  for (let seed = 0; !sink.ready && seed < 200_000; seed++) {
    if (seed % 24 === 0) deliver(encodePacket(source.manifestPacket()));
    if (Math.random() < drop) continue;
    deliver(encodePacket(source.blockPacket(seed)));
  }

  expect(sink.ready).toBe(true);
  return { result: await sink.assemble(), manifest: source.manifest };
}

test("text round trip", async () => {
  const { result } = await simulate({ kind: "text", text: "hello soliton" });
  expect(result.ok).toBe(true);
  if (result.ok && result.payload.kind === "text") {
    expect(result.payload.text).toBe("hello soliton");
  }
});

test("compressible text sets gzip flag and restores", async () => {
  const text = "repeat ".repeat(4000);
  const { result, manifest } = await simulate({ kind: "text", text });
  expect(manifest.flags.gzip).toBe(true);
  expect(result.ok && result.payload.kind === "text" && result.payload.text).toBe(
    text,
  );
});

test("encrypted file with 30% loss round trips", async () => {
  const bytes = new Uint8Array(60_000);
  crypto.getRandomValues(bytes);
  const payload: Payload = {
    kind: "file",
    name: "payroll.pdf",
    mime: "application/pdf",
    bytes,
  };
  const { result, manifest } = await simulate(payload, {
    passphrase: "correct horse battery staple",
    dropRate: 0.3,
  });
  expect(manifest.flags.encrypted).toBe(true);
  expect(result.ok).toBe(true);
  if (result.ok && result.payload.kind === "file") {
    expect(result.payload.name).toBe("payroll.pdf");
    expect(bytesEqual(result.payload.bytes, bytes)).toBe(true);
  }
});

test("wrong passphrase fails cleanly", async () => {
  const { result } = await simulate(
    { kind: "text", text: "secret" },
    { passphrase: "right", receiverPassphrase: "wrong" },
  );
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.reason).toBe("decrypt-failed");
});

test("missing passphrase reports requirement", async () => {
  const { result } = await simulate(
    { kind: "text", text: "secret" },
    { passphrase: "right", receiverPassphrase: "" },
  );
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.reason).toBe("passphrase-required");
});
