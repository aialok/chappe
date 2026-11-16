async function transform(
  data: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const source = new Blob([data as unknown as BlobPart]).stream();
  const buffer = await new Response(source.pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(buffer);
}

export function gzip(data: Uint8Array): Promise<Uint8Array> {
  return transform(data, new CompressionStream("gzip"));
}

export function gunzip(data: Uint8Array): Promise<Uint8Array> {
  return transform(data, new DecompressionStream("gzip"));
}

const INCOMPRESSIBLE = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "video/",
  "audio/",
  "application/zip",
  "application/gzip",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/pdf",
];

export async function shouldCompress(
  data: Uint8Array,
  mime: string,
): Promise<boolean> {
  if (data.length < 512) return false;
  if (INCOMPRESSIBLE.some((prefix) => mime.startsWith(prefix))) return false;
  const sample = data.subarray(0, Math.min(data.length, 16 * 1024));
  const compressed = await gzip(sample);
  return compressed.length < sample.length * 0.9;
}
