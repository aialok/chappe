import { expect, test } from "bun:test";
import QRCode from "qrcode";
import { bytesEqual } from "../../core/bytes.ts";
import { TransferSink, TransferSource } from "../../transport/transfer.ts";
import { PacketScheduler } from "../scheduler.ts";
import { packetToText, textToPacket } from "./codec.ts";
import { decodeAll, type RgbaImage } from "./detect.ts";

function blank(width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  return { data, width, height };
}

function paint(
  target: RgbaImage,
  text: string,
  originX: number,
  originY: number,
  scale: number,
): void {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const quiet = 4;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!qr.modules.data[row * size + col]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = originX + (col + quiet) * scale + dx;
          const y = originY + (row + quiet) * scale + dy;
          const i = (y * target.width + x) * 4;
          target.data[i] = 0;
          target.data[i + 1] = 0;
          target.data[i + 2] = 0;
        }
      }
    }
  }
}

function codeSpan(text: string, scale: number): number {
  return (QRCode.create(text, { errorCorrectionLevel: "M" }).modules.size + 8) * scale;
}

function frameOf(texts: string[], scale: number): RgbaImage {
  const cols = Math.round(Math.sqrt(texts.length));
  const span = Math.max(...texts.map((t) => codeSpan(t, scale)));
  const gap = Math.round(span * 0.14);
  const side = cols * span + (cols - 1) * gap;
  const image = blank(side + 40, side + 40);
  texts.forEach((text, i) => {
    const x = 20 + (i % cols) * (span + gap);
    const y = 20 + Math.floor(i / cols) * (span + gap);
    paint(image, text, x, y, scale);
  });
  return image;
}

async function beam(slots: number) {
  const bytes = new Uint8Array(12_000);
  crypto.getRandomValues(bytes);
  const source = await TransferSource.create(
    { kind: "file", name: "notes.bin", mime: "application/octet-stream", bytes },
    { symbolSize: 400, passphrase: "hunter2" },
  );
  const sink = new TransferSink("hunter2");
  const scheduler = new PacketScheduler(source);

  let frames = 0;
  while (!sink.ready && frames < 200) {
    const texts = Array.from({ length: slots }, () => packetToText(scheduler.next()));
    for (const text of decodeAll(frameOf(texts, 3))) {
      const packet = textToPacket(text);
      if (packet) sink.offer(packet);
    }
    frames += 1;
  }

  expect(sink.ready).toBe(true);
  const result = await sink.assemble();
  expect(result.ok).toBe(true);
  if (result.ok && result.payload.kind === "file") {
    expect(bytesEqual(result.payload.bytes, bytes)).toBe(true);
  }
  return frames;
}

test("single code per frame rebuilds an encrypted file", async () => {
  await beam(1);
});

test("2x2 grid decodes several codes per frame", async () => {
  const single = await beam(1);
  const grid = await beam(4);
  expect(grid).toBeLessThan(single / 2);
});

test("decodeAll finds every code in a 2x2 frame", () => {
  const texts = ["alpha-0001", "bravo-0002", "charlie-0003", "delta-0004"].map((s) =>
    s.repeat(20),
  );
  const found = decodeAll(frameOf(texts, 3));
  expect(found.sort()).toEqual([...texts].sort());
});
