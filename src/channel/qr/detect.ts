import jsQR from "jsqr";

export interface RgbaImage {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface FrameDetector {
  readonly preferredMaxDim: number;
  detect(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Promise<string[]>;
}

export function decodeFrame(image: RgbaImage): string[] {
  const code = jsQR(image.data, image.width, image.height, {
    inversionAttempts: "dontInvert",
  });
  return code ? [code.data] : [];
}

export async function createDetector(): Promise<FrameDetector> {
  if (typeof BarcodeDetector !== "undefined") {
    try {
      const formats = await BarcodeDetector.getSupportedFormats();
      if (formats.includes("qr_code")) {
        const detector = new BarcodeDetector({ formats: ["qr_code"] });
        return {
          preferredMaxDim: 1280,
          async detect(canvas) {
            const codes = await detector.detect(canvas);
            return codes.map((code) => code.rawValue);
          },
        };
      }
    } catch {}
  }
  return {
    preferredMaxDim: 720,
    async detect(_canvas, ctx) {
      const { width, height } = ctx.canvas;
      return decodeFrame(ctx.getImageData(0, 0, width, height));
    },
  };
}
