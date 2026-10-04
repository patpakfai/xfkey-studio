// Browser transports: WebHID for real pads, and an in-memory mock for demo mode.

import { CONFIG_USAGE_PAGE, MAGIC, padReport, PRODUCT_ID, toHex, VENDOR_ID } from './protocol.js';

const REQUEST_TIMEOUT_MS = 1500;
const PAD_FILTER = { vendorId: VENDOR_ID, productId: PRODUCT_ID, usagePage: CONFIG_USAGE_PAGE };

export class TimeoutError extends Error {
  constructor() {
    super("The keyboard didn't answer.");
    this.name = 'TimeoutError';
  }
}

export const isWebHidAvailable = () => typeof navigator !== 'undefined' && 'hid' in navigator;

/** The config interface of a pad: the HID collection on usage page 0xFF00. */
export const isPadDevice = (device) =>
  device.vendorId === VENDOR_ID &&
  device.productId === PRODUCT_ID &&
  device.collections.some((c) => c.usagePage === CONFIG_USAGE_PAGE);

/** Shows Chrome's device picker. Resolves to null if the user cancels. */
export async function requestPad() {
  const devices = await navigator.hid.requestDevice({ filters: [PAD_FILTER] });
  return devices.find(isPadDevice) ?? null;
}

/** A pad this site was already allowed to use, so we can reconnect without asking. */
export async function findAuthorizedPad() {
  if (!isWebHidAvailable()) return null;
  return (await navigator.hid.getDevices()).find(isPadDevice) ?? null;
}

export class WebHidTransport {
  constructor(device) {
    this.device = device;
    this.queue = Promise.resolve();
  }

  async open() {
    if (!this.device.opened) await this.device.open();
  }

  async close() {
    if (this.device.opened) await this.device.close();
  }

  /**
   * Sends one request and resolves with the next input report. Requests are
   * serialized, the listener is attached before sending (a fast reply can't be
   * missed), and every report is padded to 64 bytes like Windows does.
   */
  request(bytes) {
    const run = () => new Promise((resolve, reject) => {
      const onReport = (event) => {
        if (event.reportId !== 0) return;
        cleanup();
        const { buffer, byteOffset, byteLength } = event.data;
        resolve(new Uint8Array(buffer.slice(byteOffset, byteOffset + byteLength)));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new TimeoutError());
      }, REQUEST_TIMEOUT_MS);
      const cleanup = () => {
        clearTimeout(timer);
        this.device.removeEventListener('inputreport', onReport);
      };
      this.device.addEventListener('inputreport', onReport);
      this.device.sendReport(0, padReport(bytes)).catch((err) => {
        cleanup();
        reject(err);
      });
    });
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }
}

/** Pretends to be a pad. Logs what a real pad would receive. */
export class MockTransport {
  constructor({ keyCount = 2, variant = 17, chipId = [0xde, 0x40, 0x00, 0x00, 0x00, 0x01] } = {}) {
    this.info = [MAGIC, 0x01, keyCount, variant, ...chipId];
    this.device = { productName: 'Demo pad' };
  }

  async open() {}
  async close() {}

  async request(bytes) {
    await new Promise((r) => setTimeout(r, 60));
    console.debug('[demo pad] <-', toHex(bytes, ' '));
    return padReport(bytes[1] === 0x01 ? this.info : [MAGIC, bytes[1]]);
  }
}
