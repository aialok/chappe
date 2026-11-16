import QRCode from "qrcode";
import type { ChannelSender, SenderStats } from "../index.ts";
import type { PacketScheduler } from "../scheduler.ts";
import { packetToText } from "./codec.ts";

export interface QrSenderOptions {
  readonly codeRate: number;
  readonly errorCorrectionLevel: "L" | "M" | "Q";
}

const QUIET_MODULES = 4;

export class QrSender implements ChannelSender {
  private readonly container: HTMLElement;
  private readonly scheduler: PacketScheduler;
  private readonly options: QrSenderOptions;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private timer: number | null = null;
  private packetsShown = 0;
  private startedAt = 0;

  constructor(container: HTMLElement, scheduler: PacketScheduler, options: QrSenderOptions) {
    this.container = container;
    this.scheduler = scheduler;
    this.options = options;
    this.canvas = document.createElement("canvas");
    this.canvas.style.width = "100%";
    this.canvas.style.display = "block";
    this.canvas.style.imageRendering = "pixelated";
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas context unavailable");
    this.ctx = ctx;
    container.replaceChildren(this.canvas);
  }

  start(): void {
    if (this.timer !== null) return;
    this.startedAt = performance.now();
    this.timer = window.setInterval(() => this.tick(), 1000 / this.options.codeRate);
    this.tick();
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  destroy(): void {
    this.stop();
    this.container.replaceChildren();
  }

  get stats(): SenderStats {
    return {
      packetsShown: this.packetsShown,
      elapsedMs: this.startedAt ? performance.now() - this.startedAt : 0,
    };
  }

  private tick(): void {
    this.render(packetToText(this.scheduler.next()));
    this.packetsShown += 1;
  }

  private render(text: string): void {
    const qr = QRCode.create(text, { errorCorrectionLevel: this.options.errorCorrectionLevel });
    const size = qr.modules.size;
    const dim = size + QUIET_MODULES * 2;
    const cssWidth = this.canvas.clientWidth || 320;
    const scale = Math.max(2, Math.floor((cssWidth * devicePixelRatio) / dim));
    const pixels = dim * scale;

    if (this.canvas.width !== pixels) {
      this.canvas.width = pixels;
      this.canvas.height = pixels;
    }

    const ctx = this.ctx;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pixels, pixels);
    ctx.fillStyle = "#000000";
    const data = qr.modules.data;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (data[row * size + col]) {
          ctx.fillRect((col + QUIET_MODULES) * scale, (row + QUIET_MODULES) * scale, scale, scale);
        }
      }
    }
  }
}
