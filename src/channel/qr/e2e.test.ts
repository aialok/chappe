import { expect, test } from "bun:test";
import QRCode from "qrcode";
import { bytesEqual } from "../../core/bytes.ts";
import { TransferSink, TransferSource } from "../../transport/transfer.ts";
import { PacketScheduler } from "../scheduler.ts";
import { packetToText, textToPacket } from "./codec.ts";
import { decodeFrame, type RgbaImage } from "./detect.ts";

const MARGIN = 20;

function frameOf(text: string, scale: number): RgbaImage {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const side = (size + 8) * scale + MARGIN * 2;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!qr.modules.data[row * size + col]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = MARGIN + (col + 4) * scale + dx;
          const y = MARGIN + (row + 4) * scale + dy;
          const i = (y * side + x) * 4;
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
        }
      }
    }
  }
  return { data, width: side, height: side };
}

test("rendered codes rebuild an encrypted file through the camera decoder", async () => {
  const bytes = new Uint8Array(12_000);
  crypto.getRandomValues(bytes);
  const source = await TransferSource.create(
    { kind: "file", name: "notes.bin", mime: "application/octet-stream", bytes },
    { symbolSize: 650, passphrase: "hunter2" },
  );
  const sink = new TransferSink("hunter2");
  const scheduler = new PacketScheduler(source);

  for (let frame = 0; frame < 200 && !sink.ready; frame++) {
    const shown = packetToText(scheduler.next());
    if (frame % 5 === 3) continue;
    for (const text of decodeFrame(frameOf(shown, 3))) {
      const packet = textToPacket(text);
      if (packet) sink.offer(packet);
    }
  }

  expect(sink.ready).toBe(true);
  const result = await sink.assemble();
  expect(result.ok).toBe(true);
  if (result.ok && result.payload.kind === "file") {
    expect(bytesEqual(result.payload.bytes, bytes)).toBe(true);
  }
});

test("decodeFrame returns nothing for a blank frame", () => {
  const blank = { data: new Uint8ClampedArray(200 * 200 * 4).fill(255), width: 200, height: 200 };
  expect(decodeFrame(blank)).toEqual([]);
});
