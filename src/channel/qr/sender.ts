import QRCode from "qrcode";
import type { ChannelSender, SenderStats } from "../index.ts";
import type { PacketScheduler } from "../scheduler.ts";
import { packetToText } from "./codec.ts";

export interface QrSenderOptions {
  readonly slots: number;
  readonly codeRate: number;
  readonly errorCorrectionLevel: "L" | "M" | "Q";
}

interface Slot {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
}

export class QrSender implements ChannelSender {
  private readonly scheduler: PacketScheduler;
  private readonly options: QrSenderOptions;
  private readonly slots: Slot[] = [];
  private timer: number | null = null;
  private cursor = 0;
  private packetsShown = 0;
  private startedAt = 0;

  constructor(
    container: HTMLElement,
    scheduler: PacketScheduler,
    options: QrSenderOptions,
  ) {
    this.scheduler = scheduler;
    this.options = options;
    this.buildGrid(container);
  }

  private buildGrid(container: HTMLElement): void {
    container.replaceChildren();
    const cols = Math.round(Math.sqrt(this.options.slots));
    container.style.display = "grid";
    container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    container.style.gap = cols > 1 ? `${14 / cols}%` : "0";
    for (let i = 0; i < this.options.slots; i++) {
      const canvas = document.createElement("canvas");
      canvas.style.width = "100%";
      canvas.style.imageRendering = "pixelated";
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2d canvas context unavailable");
      container.append(canvas);
      this.slots.push({ canvas, ctx });
    }
  }

  start(): void {
    if (this.timer !== null) return;
    this.startedAt = performance.now();
    const interval = Math.max(1000 / 60, 1000 / (this.options.codeRate * this.slots.length));
    this.timer = window.setInterval(() => this.tick(), interval);
    this.tick();
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  get stats(): SenderStats {
    return {
      packetsShown: this.packetsShown,
      elapsedMs: this.startedAt ? performance.now() - this.startedAt : 0,
    };
  }

  private tick(): void {
    const slot = this.slots[this.cursor];
    this.cursor = (this.cursor + 1) % this.slots.length;
    const text = packetToText(this.scheduler.next());
    this.render(slot, text);
    this.packetsShown += 1;
  }

  private render(slot: Slot, text: string): void {
    const qr = QRCode.create(text, {
      errorCorrectionLevel: this.options.errorCorrectionLevel,
    });
    const size = qr.modules.size;
    const quiet = 4;
    const dim = size + quiet * 2;
    const cssWidth = slot.canvas.clientWidth || 320;
    const scale = Math.max(2, Math.floor((cssWidth * devicePixelRatio) / dim));
    const pixels = dim * scale;

    if (slot.canvas.width !== pixels) {
      slot.canvas.width = pixels;
      slot.canvas.height = pixels;
    }

    const ctx = slot.ctx;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pixels, pixels);
    ctx.fillStyle = "#000000";
    const data = qr.modules.data;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (data[row * size + col]) {
          ctx.fillRect(
            (col + quiet) * scale,
            (row + quiet) * scale,
            scale,
            scale,
          );
        }
      }
    }
  }
}
