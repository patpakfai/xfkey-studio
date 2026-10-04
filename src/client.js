// Transport-agnostic pad client. A transport only needs
//   request(bytes: number[]) -> Promise<Uint8Array>   (one reply per request)
// so the same code drives WebHID in the browser and node-hid in tools/.

import { infoRequest, isAck, parseInfo, ProtocolError, savePackets, toHex } from './protocol.js';

export class PadClient {
  constructor(transport) {
    this.transport = transport;
  }

  async info() {
    return parseInfo(await this.transport.request(infoRequest()));
  }

  /** Sends packets in order, stopping at the first one the pad rejects. */
  async sendPackets(packets, onProgress) {
    for (const [i, packet] of packets.entries()) {
      const reply = await this.transport.request(packet);
      if (!isAck(reply)) {
        throw new ProtocolError(
          `The keyboard rejected step ${i + 1} of ${packets.length} (reply ${toHex(reply.slice(0, 8), ' ')}).`,
          reply,
        );
      }
      onProgress?.(i + 1, packets.length);
    }
  }

  save(model, actions, lighting, onProgress) {
    return this.sendPackets(savePackets(model, actions, lighting), onProgress);
  }
}
