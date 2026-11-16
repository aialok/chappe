import { gunzip, gzip, shouldCompress } from "../core/compress.ts";
import { ByteReader, ByteWriter, bytesEqual, utf8Decode, utf8Encode } from "../core/bytes.ts";
import type {
  DecodeError,
  DecodeState,
  Manifest,
  Packet,
  Payload,
  Seed,
  TransferId,
} from "../core/types.ts";
import {
  decrypt,
  deriveKey,
  encrypt,
  IV_BYTES,
  randomBytes,
  SALT_BYTES,
  sha256,
} from "../crypto/crypto.ts";
import { FountainDecoder, FountainEncoder } from "./fountain.ts";

export type AssembleResult =
  | { ok: true; payload: Payload }
  | { ok: false; reason: DecodeError };

export interface TransferOptions {
  readonly passphrase?: string;
  readonly symbolSize: number;
}

function payloadBytes(payload: Payload): Uint8Array {
  return payload.kind === "text" ? utf8Encode(payload.text) : payload.bytes;
}

const SEALED_VERSION = 1;
const SEALED_MIME = "application/octet-stream";

interface Sealed {
  readonly kind: Payload["kind"];
  readonly name: string;
  readonly mime: string;
  readonly raw: Uint8Array;
}

function envelope(sealed: Sealed): Uint8Array {
  return new ByteWriter()
    .u8(sealed.kind === "text" ? 0 : 1)
    .lenPrefixed(utf8Encode(sealed.name))
    .lenPrefixed(utf8Encode(sealed.mime))
    .bytes(sealed.raw)
    .finish();
}

function openEnvelope(bytes: Uint8Array): Sealed {
  const reader = new ByteReader(bytes);
  const kind = reader.u8() === 0 ? "text" : "file";
  const name = utf8Decode(reader.lenPrefixed());
  const mime = utf8Decode(reader.lenPrefixed());
  return { kind, name, mime, raw: reader.rest().slice() };
}

function toPayload(sealed: Sealed): Payload {
  return sealed.kind === "text"
    ? { kind: "text", text: utf8Decode(sealed.raw) }
    : { kind: "file", name: sealed.name, mime: sealed.mime, bytes: sealed.raw };
}

function randomTransferId(): TransferId {
  return (randomBytes(4).reduce((acc, b) => (acc << 8) | b, 0) >>> 0) as TransferId;
}

export class TransferSource {
  readonly manifest: Manifest;
  private readonly encoder: FountainEncoder;

  private constructor(manifest: Manifest, encoder: FountainEncoder) {
    this.manifest = manifest;
    this.encoder = encoder;
  }

  static async create(
    payload: Payload,
    options: TransferOptions,
  ): Promise<TransferSource> {
    const raw = payloadBytes(payload);
    const name = payload.kind === "file" ? payload.name : "";
    const mime =
      payload.kind === "file" ? payload.mime || "application/octet-stream" : "text/plain";
    const gzipWanted = await shouldCompress(raw, mime);

    if (options.passphrase) {
      const body = envelope({ kind: payload.kind, name, mime, raw });
      const plain = new ByteWriter()
        .u8(SEALED_VERSION)
        .u8(gzipWanted ? 1 : 0)
        .bytes(gzipWanted ? await gzip(body) : body)
        .finish();
      const salt = randomBytes(SALT_BYTES);
      const iv = randomBytes(IV_BYTES);
      const key = await deriveKey(options.passphrase, salt);
      const cargo = await encrypt(key, iv, plain);
      return TransferSource.from(cargo, options.symbolSize, {
        kind: "file",
        name: "",
        mime: SEALED_MIME,
        flags: { gzip: false, encrypted: true },
        sha256: await sha256(cargo),
        salt,
        iv,
      });
    }

    const cargo = gzipWanted ? await gzip(raw) : raw;
    return TransferSource.from(cargo, options.symbolSize, {
      kind: payload.kind,
      name,
      mime,
      flags: { gzip: gzipWanted, encrypted: false },
      sha256: await sha256(raw),
      salt: new Uint8Array(0),
      iv: new Uint8Array(0),
    });
  }

  private static from(
    cargo: Uint8Array,
    symbolSize: number,
    fields: Pick<Manifest, "kind" | "name" | "mime" | "flags" | "sha256" | "salt" | "iv">,
  ): TransferSource {
    const encoder = new FountainEncoder(cargo, symbolSize);
    const manifest: Manifest = {
      ...fields,
      transferId: randomTransferId(),
      cargoBytes: cargo.length,
      symbolSize,
      symbolCount: encoder.symbolCount,
    };
    return new TransferSource(manifest, encoder);
  }

  get symbolCount(): number {
    return this.encoder.symbolCount;
  }

  manifestPacket(): Packet {
    return { kind: "manifest", manifest: this.manifest };
  }

  blockPacket(seed: number): Packet {
    const block = this.encoder.blockAt(seed);
    return {
      kind: "block",
      transferId: this.manifest.transferId,
      seed: block.seed as Seed,
      data: block.data,
    };
  }
}

export class TransferSink {
  private manifest: Manifest | null = null;
  private decoder: FountainDecoder | null = null;
  private passphrase: string | undefined;

  constructor(passphrase?: string) {
    this.passphrase = passphrase;
  }

  setPassphrase(passphrase: string): void {
    this.passphrase = passphrase;
  }

  offer(packet: Packet): void {
    if (packet.kind === "manifest") {
      this.ingestManifest(packet.manifest);
      return;
    }
    if (!this.manifest || !this.decoder) return;
    if (packet.transferId !== this.manifest.transferId) return;
    this.decoder.push(packet.seed, packet.data);
  }

  private ingestManifest(manifest: Manifest): void {
    if (this.manifest?.transferId === manifest.transferId) return;
    this.manifest = manifest;
    this.decoder = new FountainDecoder(manifest.symbolCount, manifest.symbolSize);
  }

  get ready(): boolean {
    return this.decoder?.isComplete() ?? false;
  }

  get currentManifest(): Manifest | null {
    return this.manifest;
  }

  get state(): DecodeState {
    if (!this.manifest || !this.decoder) {
      return { kind: "idle" };
    }
    if (this.decoder.isComplete()) {
      return { kind: "assembling" };
    }
    const needed = this.manifest.symbolCount;
    const received = this.decoder.received;
    const recovered = this.decoder.recovered;
    const ratio = Math.min(
      0.99,
      Math.max(recovered / needed, received / (needed * 1.1)),
    );
    return { kind: "collecting", received, recovered, needed, ratio };
  }

  async assemble(): Promise<AssembleResult> {
    if (!this.manifest || !this.decoder || !this.decoder.isComplete()) {
      return { ok: false, reason: "malformed-cargo" };
    }
    const m = this.manifest;
    const cargo = this.decoder.assemble(m.cargoBytes);
    return m.flags.encrypted ? this.openSealed(m, cargo) : this.openPlain(m, cargo);
  }

  private async openSealed(m: Manifest, cargo: Uint8Array): Promise<AssembleResult> {
    if (!bytesEqual(await sha256(cargo), m.sha256)) {
      return { ok: false, reason: "integrity-mismatch" };
    }
    if (!this.passphrase) return { ok: false, reason: "passphrase-required" };

    let plain: Uint8Array;
    try {
      const key = await deriveKey(this.passphrase, m.salt);
      plain = await decrypt(key, m.iv, cargo);
    } catch {
      return { ok: false, reason: "decrypt-failed" };
    }

    try {
      const reader = new ByteReader(plain);
      if (reader.u8() !== SEALED_VERSION) return { ok: false, reason: "malformed-cargo" };
      const gzipped = reader.u8() === 1;
      const rest = reader.rest();
      const body = gzipped ? await gunzip(rest) : rest;
      return { ok: true, payload: toPayload(openEnvelope(body)) };
    } catch {
      return { ok: false, reason: "decompress-failed" };
    }
  }

  private async openPlain(m: Manifest, cargo: Uint8Array): Promise<AssembleResult> {
    let raw = cargo;
    if (m.flags.gzip) {
      try {
        raw = await gunzip(cargo);
      } catch {
        return { ok: false, reason: "decompress-failed" };
      }
    }
    if (!bytesEqual(await sha256(raw), m.sha256)) {
      return { ok: false, reason: "integrity-mismatch" };
    }
    return { ok: true, payload: toPayload({ kind: m.kind, name: m.name, mime: m.mime, raw }) };
  }
}
