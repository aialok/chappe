interface DetectedBarcode {
  readonly rawValue: string;
}

interface BarcodeDetectorOptions {
  formats: string[];
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  static getSupportedFormats(): Promise<string[]>;
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
