import { randomUUID } from 'node:crypto';
import { ApiError } from '../common/api-error';
import { portKey } from './ownership';
import type { SerialDeviceInfo } from './serial-driver';

export interface SerialDevice extends SerialDeviceInfo { deviceRef: string }
export class SerialDirectory {
  private devices = new Map<string, SerialDevice>();
  private queue: Promise<unknown> = Promise.resolve();
  onRemoved: (deviceRef: string) => void = () => {};
  constructor(private readonly provider: () => Promise<SerialDeviceInfo[]>) {}

  refresh(): Promise<SerialDevice[]> {
    const operation = this.queue.then(async () => {
      let ports: SerialDeviceInfo[];
      try { ports = await this.provider(); }
      catch (cause) {
        if (cause instanceof ApiError) throw cause;
        throw new ApiError(503, 'SERIAL_IO_ERROR', `Local OS enumeration failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
      const next = new Map<string, SerialDevice>();
      for (const port of ports) {
        const key = portKey(port.portId);
        if (next.has(key)) throw new ApiError(503, 'SERIAL_IO_ERROR', 'OS enumeration returned duplicate port paths.');
        const old = this.devices.get(key);
        const same = old && JSON.stringify([old.identity, old.usbVendorId, old.usbProductId]) ===
          JSON.stringify([port.identity, port.usbVendorId, port.usbProductId]);
        next.set(key, { ...port, deviceRef: same ? old.deviceRef : randomUUID() });
      }
      const removed = [...this.devices.values()].filter(old => next.get(portKey(old.portId))?.deviceRef !== old.deviceRef);
      this.devices = next;
      for (const old of removed) this.onRemoved(old.deviceRef);
      return [...next.values()];
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  find(ref: string): SerialDevice {
    const device = [...this.devices.values()].find(device => device.deviceRef === ref);
    if (!device) throw new ApiError(409, 'PORT_STALE', 'The device reference expired. Refresh the local device list.');
    return device;
  }
  invalidate(ref: string): void {
    for (const [key, device] of this.devices) {
      if (device.deviceRef === ref) this.devices.delete(key);
    }
  }
}
