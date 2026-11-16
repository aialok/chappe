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

const TILE_SPAN = 0.58;

function crop(image: RgbaImage, x: number, y: number, w: number, h: number): RgbaImage {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const start = ((y + row) * image.width + x) * 4;
    out.set(image.data.subarray(start, start + w * 4), row * w * 4);
  }
  return { data: out, width: w, height: h };
}

function readOne(image: RgbaImage): string | null {
  const code = jsQR(image.data, image.width, image.height, {
    inversionAttempts: "dontInvert",
  });
  return code ? code.data : null;
}

export function decodeAll(image: RgbaImage): string[] {
  const found = new Set<string>();
  const whole = readOne(image);
  if (whole) found.add(whole);

  const w = Math.floor(image.width * TILE_SPAN);
  const h = Math.floor(image.height * TILE_SPAN);
  const xs = [0, image.width - w];
  const ys = [0, image.height - h];
  for (const y of ys) {
    for (const x of xs) {
      const text = readOne(crop(image, x, y, w, h));
      if (text) found.add(text);
    }
  }
  return [...found];
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
      return decodeAll(ctx.getImageData(0, 0, width, height));
    },
  };
}
