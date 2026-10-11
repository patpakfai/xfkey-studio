// Transport-agnostic pad clients. A transport provides
//   request(bytes) -> Promise<Uint8Array>             one reply per request
//   send(bytes) -> Promise                            no reply expected (CH57x writes)
//   collect(bytes, count) -> Promise<Uint8Array[]>    up to `count` replies
// so the same code drives WebHID in the browser and node-hid in tools/.

import {
  expectedRecord, identifyRequest, isCommit, LAYERS, parseIdentify, parseLayer, readRequest, sameRecord,
} from './ch57x-protocol.js';
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** CH57x pads (514C:8850). Writes are unacknowledged, so every save is checked by reading back. */
export class Ch57xClient {
  /** `pauses` give the pad time to store a record; it commits each binding to flash. */
  constructor(transport, { recordPauseMs = 10, commitPauseMs = 60 } = {}) {
    this.transport = transport;
    this.pauses = { record: recordPauseMs, commit: commitPauseMs };
  }

  async identify() {
    return parseIdentify(await this.transport.request(identifyRequest()));
  }

  /** The raw records of one layer (1-based), in `ids` order. */
  async readLayer(keys, knobs, ids, layer) {
    const replies = await this.transport.collect(readRequest(keys, knobs, layer), ids.length);
    return parseLayer(replies, ids, layer);
  }

  async sendPackets(packets, onProgress) {
    for (const [i, packet] of packets.entries()) {
      await this.transport.send(packet);
      await sleep(isCommit(packet) ? this.pauses.commit : this.pauses.record);
      onProgress?.(i + 1, packets.length);
    }
  }

  /**
   * Reads every layer back and lists the slots that don't hold what `packets`
   * wrote, as { layer, index } with `index` into `ids`.
   */
  async verify(keys, knobs, ids, packets) {
    const written = packets.filter((p) => !isCommit(p));
    const mismatches = [];
    for (let layer = 1; layer <= LAYERS; layer++) {
      const records = await this.readLayer(keys, knobs, ids, layer);
      ids.forEach((slot, index) => {
        const packet = written.find((p) => p[1] === slot && p[2] === layer);
        if (packet && !sameRecord(records[index], expectedRecord(packet))) mismatches.push({ layer, index });
      });
    }
    return mismatches;
  }
}
