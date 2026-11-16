import { fromBase64Url, toBase64Url } from "../../core/bytes.ts";
import type { Packet } from "../../core/types.ts";
import { encodePacket, tryDecodePacket } from "../../transport/packet.ts";

export function packetToText(packet: Packet): string {
  return toBase64Url(encodePacket(packet));
}

export function textToPacket(text: string): Packet | null {
  try {
    return tryDecodePacket(fromBase64Url(text));
  } catch {
    return null;
  }
}
