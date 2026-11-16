export type Brand<T, B extends string> = T & { readonly __brand: B };

export type TransferId = Brand<number, "TransferId">;
export type Seed = Brand<number, "Seed">;

export type Payload =
  | { kind: "text"; text: string }
  | { kind: "file"; name: string; mime: string; bytes: Uint8Array };

export interface CargoFlags {
  readonly gzip: boolean;
  readonly encrypted: boolean;
}

export interface Manifest {
  readonly transferId: TransferId;
  readonly kind: Payload["kind"];
  readonly name: string;
  readonly mime: string;
  readonly cargoBytes: number;
  readonly symbolSize: number;
  readonly symbolCount: number;
  readonly flags: CargoFlags;
  readonly sha256: Uint8Array;
  readonly salt: Uint8Array;
  readonly iv: Uint8Array;
}

export type Packet =
  | { kind: "manifest"; manifest: Manifest }
  | { kind: "block"; transferId: TransferId; seed: Seed; data: Uint8Array };

export type DecodeState =
  | { kind: "idle" }
  | { kind: "awaiting-manifest"; blocksBuffered: number }
  | {
      kind: "collecting";
      received: number;
      recovered: number;
      needed: number;
      ratio: number;
    }
  | { kind: "assembling" }
  | { kind: "done"; payload: Payload }
  | { kind: "error"; reason: DecodeError };

export type DecodeError =
  | "integrity-mismatch"
  | "decrypt-failed"
  | "passphrase-required"
  | "decompress-failed"
  | "malformed-cargo";
