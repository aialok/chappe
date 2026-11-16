import type { Packet } from "../core/types.ts";
import type { TransferSource } from "../transport/transfer.ts";

export class PacketScheduler {
  private readonly source: TransferSource;
  private readonly manifestEvery: number;
  private seed = 0;
  private tick = 0;

  constructor(source: TransferSource, manifestEvery = 12) {
    this.source = source;
    this.manifestEvery = manifestEvery;
  }

  next(): Packet {
    const atManifest = this.tick % this.manifestEvery === 0;
    this.tick += 1;
    if (atManifest) return this.source.manifestPacket();
    const seed = this.seed;
    this.seed += 1;
    return this.source.blockPacket(seed);
  }
}
