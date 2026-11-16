const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8Encode(text: string): Uint8Array {
  return encoder.encode(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function xorInto(target: Uint8Array, source: Uint8Array): void {
  const len = Math.min(target.length, source.length);
  for (let i = 0; i < len; i++) target[i] ^= source[i];
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export class ByteWriter {
  private chunks: Uint8Array[] = [];
  private length = 0;

  u8(value: number): this {
    this.chunks.push(Uint8Array.of(value & 0xff));
    this.length += 1;
    return this;
  }

  u32(value: number): this {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setUint32(0, value >>> 0, true);
    this.chunks.push(buf);
    this.length += 4;
    return this;
  }

  bytes(value: Uint8Array): this {
    this.chunks.push(value);
    this.length += value.length;
    return this;
  }

  lenPrefixed(value: Uint8Array): this {
    return this.u32(value.length).bytes(value);
  }

  finish(): Uint8Array {
    return concatBytes(this.chunks);
  }
}

export class ByteReader {
  private offset = 0;
  private readonly view: Uint8Array;

  constructor(view: Uint8Array) {
    this.view = view;
  }

  get remaining(): number {
    return this.view.length - this.offset;
  }

  u8(): number {
    const value = this.view[this.offset];
    this.offset += 1;
    return value;
  }

  u32(): number {
    const value = new DataView(
      this.view.buffer,
      this.view.byteOffset + this.offset,
      4,
    ).getUint32(0, true);
    this.offset += 4;
    return value;
  }

  bytes(length: number): Uint8Array {
    const slice = this.view.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  lenPrefixed(): Uint8Array {
    return this.bytes(this.u32());
  }

  rest(): Uint8Array {
    return this.bytes(this.remaining);
  }
}
