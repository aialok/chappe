import { ByteReader, ByteWriter, utf8Decode, utf8Encode } from "../core/bytes.ts";
import {
  MAX_CARGO_BYTES,
  MAX_SYMBOL_SIZE,
  MAX_TEXT_FIELD_BYTES,
  MIN_SYMBOL_SIZE,
} from "../core/limits.ts";
import type { Manifest, Packet, Seed, TransferId } from "../core/types.ts";
import { IV_BYTES, SALT_BYTES } from "../crypto/crypto.ts";

const TAG_MANIFEST = 0x01;
const TAG_BLOCK = 0x02;
const SHA256_BYTES = 32;

const FLAG_GZIP = 0x01;
const FLAG_ENCRYPTED = 0x02;

function kindToByte(kind: Manifest["kind"]): number {
  return kind === "text" ? 0 : 1;
}

function byteToKind(value: number): Manifest["kind"] {
  return value === 0 ? "text" : "file";
}

export function encodePacket(packet: Packet): Uint8Array {
  if (packet.kind === "manifest") {
    const m = packet.manifest;
    const flags =
      (m.flags.gzip ? FLAG_GZIP : 0) | (m.flags.encrypted ? FLAG_ENCRYPTED : 0);
    return new ByteWriter()
      .u8(TAG_MANIFEST)
      .u32(m.transferId)
      .u8(kindToByte(m.kind))
      .u32(m.cargoBytes)
      .u32(m.symbolSize)
      .u32(m.symbolCount)
      .u8(flags)
      .bytes(m.sha256)
      .lenPrefixed(m.salt)
      .lenPrefixed(m.iv)
      .lenPrefixed(utf8Encode(m.name))
      .lenPrefixed(utf8Encode(m.mime))
      .finish();
  }
  return new ByteWriter()
    .u8(TAG_BLOCK)
    .u32(packet.transferId)
    .u32(packet.seed)
    .bytes(packet.data)
    .finish();
}

export function tryDecodePacket(bytes: Uint8Array): Packet | null {
  if (bytes.length < 1) return null;
  try {
    const reader = new ByteReader(bytes);
    const tag = reader.u8();
    if (tag === TAG_MANIFEST) return decodeManifest(reader);
    if (tag === TAG_BLOCK) return decodeBlock(reader);
    return null;
  } catch {
    return null;
  }
}

function decodeManifest(reader: ByteReader): Packet | null {
  const transferId = reader.u32() as TransferId;
  const kind = byteToKind(reader.u8());
  const cargoBytes = reader.u32();
  const symbolSize = reader.u32();
  const symbolCount = reader.u32();
  const flags = reader.u8();
  const sha256 = reader.bytes(SHA256_BYTES).slice();
  const salt = reader.lenPrefixed().slice();
  const iv = reader.lenPrefixed().slice();
  const name = utf8Decode(reader.lenPrefixed());
  const mime = utf8Decode(reader.lenPrefixed());
  const manifest: Manifest = {
    transferId,
    kind,
    name,
    mime,
    cargoBytes,
    symbolSize,
    symbolCount,
    flags: {
      gzip: (flags & FLAG_GZIP) !== 0,
      encrypted: (flags & FLAG_ENCRYPTED) !== 0,
    },
    sha256,
    salt,
    iv,
  };
  return isPlausibleManifest(manifest) ? { kind: "manifest", manifest } : null;
}

function isPlausibleManifest(m: Manifest): boolean {
  if (m.symbolSize < MIN_SYMBOL_SIZE || m.symbolSize > MAX_SYMBOL_SIZE) return false;
  if (m.cargoBytes < 1 || m.cargoBytes > MAX_CARGO_BYTES) return false;
  if (m.symbolCount !== Math.ceil(m.cargoBytes / m.symbolSize)) return false;
  if (m.sha256.length !== SHA256_BYTES) return false;
  if (m.name.length > MAX_TEXT_FIELD_BYTES || m.mime.length > MAX_TEXT_FIELD_BYTES) {
    return false;
  }
  if (m.flags.encrypted) return m.salt.length === SALT_BYTES && m.iv.length === IV_BYTES;
  return m.salt.length === 0 && m.iv.length === 0;
}

function decodeBlock(reader: ByteReader): Packet {
  const transferId = reader.u32() as TransferId;
  const seed = reader.u32() as Seed;
  const data = reader.rest().slice();
  return { kind: "block", transferId, seed, data };
}
