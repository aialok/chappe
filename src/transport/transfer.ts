import { gunzip, gzip, shouldCompress } from "../core/compress.ts";
import { bytesEqual, utf8Decode, utf8Encode } from "../core/bytes.ts";
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
    const hash = await sha256(raw);

    const name = payload.kind === "file" ? payload.name : "";
    const mime =
      payload.kind === "file" ? payload.mime || "application/octet-stream" : "text/plain";

    const gzipWanted = await shouldCompress(raw, mime);
    const compressed = gzipWanted ? await gzip(raw) : raw;

    const encryptWanted = Boolean(options.passphrase);
    let cargo: Uint8Array = compressed;
    let salt: Uint8Array = new Uint8Array(0);
    let iv: Uint8Array = new Uint8Array(0);
    if (options.passphrase) {
      salt = randomBytes(SALT_BYTES);
      iv = randomBytes(IV_BYTES);
      const key = await deriveKey(options.passphrase, salt);
      cargo = await encrypt(key, iv, compressed);
    }

    const encoder = new FountainEncoder(cargo, options.symbolSize);
    const manifest: Manifest = {
      transferId: randomTransferId(),
      kind: payload.kind,
      name,
      mime,
      cargoBytes: cargo.length,
      symbolSize: options.symbolSize,
      symbolCount: encoder.symbolCount,
      flags: { gzip: gzipWanted, encrypted: encryptWanted },
      sha256: hash,
      salt,
      iv,
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
    let cargo = this.decoder.assemble(m.cargoBytes);

    if (m.flags.encrypted) {
      if (!this.passphrase) return { ok: false, reason: "passphrase-required" };
      try {
        const key = await deriveKey(this.passphrase, m.salt);
        cargo = await decrypt(key, m.iv, cargo);
      } catch {
        return { ok: false, reason: "decrypt-failed" };
      }
    }

    if (m.flags.gzip) {
      try {
        cargo = await gunzip(cargo);
      } catch {
        return { ok: false, reason: "decompress-failed" };
      }
    }

    const hash = await sha256(cargo);
    if (!bytesEqual(hash, m.sha256)) {
      return { ok: false, reason: "integrity-mismatch" };
    }

    if (m.kind === "text") {
      return { ok: true, payload: { kind: "text", text: utf8Decode(cargo) } };
    }
    return {
      ok: true,
      payload: { kind: "file", name: m.name, mime: m.mime, bytes: cargo },
    };
  }
}
