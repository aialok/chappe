import { openCamera, type CameraHandle } from "../../camera/camera.ts";
import type { DecodeState } from "../../core/types.ts";
import type { TransferSink } from "../../transport/transfer.ts";
import type { ChannelReceiver, ReceiverStats } from "../index.ts";
import { textToPacket } from "./codec.ts";
import { createDetector, type FrameDetector } from "./detect.ts";

export interface QrReceiverCallbacks {
  onState?: (state: DecodeState) => void;
  onReady?: () => void;
}

export class QrReceiver implements ChannelReceiver {
  private readonly video: HTMLVideoElement;
  private readonly sink: TransferSink;
  private readonly callbacks: QrReceiverCallbacks;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private camera: CameraHandle | null = null;
  private detector: FrameDetector | null = null;
  private running = false;
  private stopped = false;
  private busy = false;
  private framesScanned = 0;
  private packetsDecoded = 0;
  private startedAt = 0;

  constructor(
    video: HTMLVideoElement,
    sink: TransferSink,
    callbacks: QrReceiverCallbacks = {},
  ) {
    this.video = video;
    this.sink = sink;
    this.callbacks = callbacks;
    this.canvas = document.createElement("canvas");
    const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2d canvas context unavailable");
    this.ctx = ctx;
  }

  async start(): Promise<void> {
    this.detector = await createDetector();
    const camera = await openCamera();
    if (this.stopped) {
      camera.stop();
      return;
    }
    this.camera = camera;
    this.video.srcObject = camera.stream;
    this.video.setAttribute("playsinline", "true");
    this.video.muted = true;
    await this.video.play();
    if (this.stopped) return;
    this.running = true;
    this.startedAt = performance.now();
    this.scheduleFrame();
  }

  stop(): void {
    this.stopped = true;
    this.running = false;
    this.camera?.stop();
    this.camera = null;
    this.video.srcObject = null;
  }

  setTorch(on: boolean): Promise<boolean> {
    return this.camera?.setTorch(on) ?? Promise.resolve(false);
  }

  get stats(): ReceiverStats {
    const manifest = this.sink.currentManifest;
    const elapsedSec = (performance.now() - this.startedAt) / 1000;
    const state = this.sink.state;
    const received = state.kind === "collecting" ? state.received : 0;
    const goodput =
      manifest && elapsedSec > 0
        ? (received * manifest.symbolSize) / elapsedSec
        : 0;
    return {
      framesScanned: this.framesScanned,
      packetsDecoded: this.packetsDecoded,
      bytesPerSec: goodput,
    };
  }

  private scheduleFrame(): void {
    if (!this.running) return;
    const run = () => {
      void this.processFrame().finally(() => this.scheduleFrame());
    };
    if (typeof this.video.requestVideoFrameCallback === "function") {
      this.video.requestVideoFrameCallback(() => run());
    } else {
      requestAnimationFrame(() => run());
    }
  }

  private async processFrame(): Promise<void> {
    if (!this.running || this.busy || !this.detector) return;
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (vw === 0 || vh === 0) return;
    this.busy = true;
    try {
      const scale = Math.min(1, this.detector.preferredMaxDim / Math.max(vw, vh));
      const w = Math.round(vw * scale);
      const h = Math.round(vh * scale);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.ctx.drawImage(this.video, 0, 0, w, h);

      const texts = await this.detector
        .detect(this.canvas, this.ctx)
        .catch((): string[] => []);
      this.framesScanned += 1;
      for (const text of texts) {
        const packet = textToPacket(text);
        if (!packet) continue;
        this.sink.offer(packet);
        this.packetsDecoded += 1;
      }
      this.emitState();
    } finally {
      this.busy = false;
    }
  }

  private emitState(): void {
    const state: DecodeState = this.sink.state;
    this.callbacks.onState?.(state);
    if (this.sink.ready) {
      this.running = false;
      this.callbacks.onReady?.();
    }
  }
}
