export interface SenderStats {
  readonly packetsShown: number;
  readonly elapsedMs: number;
}

export interface ReceiverStats {
  readonly framesScanned: number;
  readonly packetsDecoded: number;
  readonly bytesPerSec: number;
}

export interface ChannelSender {
  start(): void;
  stop(): void;
  readonly stats: SenderStats;
}

export interface ChannelReceiver {
  start(): Promise<void>;
  stop(): void;
  readonly stats: ReceiverStats;
}
