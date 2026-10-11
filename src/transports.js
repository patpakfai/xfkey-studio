// Browser transports: WebHID for real pads, and in-memory pads for demo mode.

import { Ch57xCmd, slotIds } from './ch57x-protocol.js';
import { MAGIC, padReport, toHex } from './protocol.js';

const REQUEST_TIMEOUT_MS = 1500;
/** While collecting several replies, stop once the pad has been quiet this long. */
const QUIET_MS = 300;

export class TimeoutError extends Error {
  constructor() {
    super("The keyboard didn't answer.");
    this.name = 'TimeoutError';
  }
}

export const isWebHidAvailable = () => typeof navigator !== 'undefined' && 'hid' in navigator;

/** Shows Chrome's device picker. Resolves to the chosen device, or null if the user cancels. */
export async function requestDevice(filters) {
  const [device] = await navigator.hid.requestDevice({ filters });
  return device ?? null;
}

/** Devices this site may already use without asking. */
export const authorizedDevices = async () => (isWebHidAvailable() ? navigator.hid.getDevices() : []);

export class WebHidTransport {
  constructor(device, { reportId = 0 } = {}) {
    this.device = device;
    this.reportId = reportId;
    this.queue = Promise.resolve();
  }

  async open() {
    if (!this.device.opened) await this.device.open();
  }

  async close() {
    if (this.device.opened) await this.device.close();
  }

  /** Sends one request and resolves with the next input report. */
  request(bytes) {
    return this.enqueue(async () => {
      const [reply] = await this.exchange(bytes, 1);
      if (!reply) throw new TimeoutError();
      return reply;
    });
  }

  /** Sends one request and resolves with up to `count` replies (fewer if the pad goes quiet). */
  collect(bytes, count) {
    return this.enqueue(async () => {
      const replies = await this.exchange(bytes, count);
      if (!replies.length) throw new TimeoutError();
      return replies;
    });
  }

  /** Sends one report that gets no reply. */
  send(bytes) {
    return this.enqueue(() => this.device.sendReport(this.reportId, padReport(bytes)));
  }

  /** Requests run one at a time, so replies can't be mixed up. */
  enqueue(job) {
    const result = this.queue.then(job, job);
    this.queue = result.catch(() => {});
    return result;
  }

  /**
   * The listener is attached before sending (a fast reply can't be missed), and
   * every report is padded to 64 bytes like Windows does.
   */
  exchange(bytes, count) {
    return new Promise((resolve, reject) => {
      const replies = [];
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        this.device.removeEventListener('inputreport', onReport);
      };
      const finish = () => {
        cleanup();
        resolve(replies);
      };
      const onReport = (event) => {
        if (event.reportId !== this.reportId) return;
        const { buffer, byteOffset, byteLength } = event.data;
        replies.push(new Uint8Array(buffer.slice(byteOffset, byteOffset + byteLength)));
        clearTimeout(timer);
        if (replies.length >= count) finish();
        else timer = setTimeout(finish, QUIET_MS);
      };
      this.device.addEventListener('inputreport', onReport);
      timer = setTimeout(finish, REQUEST_TIMEOUT_MS);
      this.device.sendReport(this.reportId, padReport(bytes)).catch((err) => {
        cleanup();
        reject(err);
      });
    });
  }
}

const delay = () => new Promise((r) => setTimeout(r, 40));

/** Pretends to be an XFKEY pad. Logs what a real pad would receive. */
export class MockTransport {
  constructor({ keyCount = 2, variant = 17, chipId = [0xde, 0x40, 0x00, 0x00, 0x00, 0x01] } = {}) {
    this.info = [MAGIC, 0x01, keyCount, variant, ...chipId];
  }

  async open() {}
  async close() {}

  async request(bytes) {
    await delay();
    console.debug('[demo pad] <-', toHex(bytes, ' '));
    return padReport(bytes[1] === 0x01 ? this.info : [MAGIC, bytes[1]]);
  }
}

/** Pretends to be a CH57x pad: answers IDENTIFY and READ, and remembers writes. */
export class Ch57xMockTransport {
  constructor({ keys = 1, knobs = 0 } = {}) {
    this.layout = { keys, knobs };
    // Factory state of the real 1-key pad: Return on every layer (byte 4 = 1).
    this.records = new Map();
    for (let layer = 1; layer <= 3; layer++) {
      slotIds(keys, knobs).forEach((slot, i) => {
        const record = i < keys ? [1, 1, 1, 0, 0, 0x04 + i] : [1, 1, 1, 0, 0, 0];
        if (keys === 1 && i === 0) record[5] = 0x28;
        this.records.set(`${layer}:${slot}`, [Ch57xCmd.READ, slot, layer, ...record]);
      });
    }
  }

  async open() {}
  async close() {}

  async request(bytes) {
    const [reply] = await this.collect(bytes, 1);
    return reply;
  }

  async collect(bytes, count) {
    await delay();
    const { keys, knobs } = this.layout;
    if (bytes[0] === Ch57xCmd.IDENTIFY) return [padReport([Ch57xCmd.IDENTIFY, keys, knobs, 0x0b])];
    if (bytes[0] === Ch57xCmd.READ) {
      return slotIds(keys, knobs).slice(0, count).map((slot) => padReport(this.records.get(`${bytes[3]}:${slot}`)));
    }
    return [];
  }

  async send(bytes) {
    await delay();
    console.debug('[demo pad] <-', toHex(bytes, ' '));
    if (bytes[0] === Ch57xCmd.WRITE && bytes[1] !== 0xfe) this.records.set(`${bytes[2]}:${bytes[1]}`, [Ch57xCmd.READ, ...bytes.slice(1)]);
  }
}
