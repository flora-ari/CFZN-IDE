import type { EventEmitter } from 'node:events';
import type { HardwarePort } from './types';

export interface SerialOptions {
  baudRate: number; dataBits: 7 | 8; stopBits: 1 | 2;
  parity: 'none' | 'even' | 'odd'; flowControl: 'none' | 'hardware';
}
export interface SerialDeviceInfo extends HardwarePort { identity?: string }
export interface SerialHandle extends EventEmitter {
  readonly isOpen: boolean;
  open(callback: (error?: Error | null) => void): void;
  close(callback: (error?: Error | null) => void): void;
  write(bytes: Buffer, callback: (error?: Error | null) => void): boolean;
  drain(callback: (error?: Error | null) => void): void;
}
export interface SerialDriver {
  list(): Promise<SerialDeviceInfo[]>;
  create(path: string, options: SerialOptions): SerialHandle;
}
export async function loadSerialDriver(): Promise<{ driver?: SerialDriver; reason?: string }> {
  try {
    const { SerialPort } = await import('serialport');
    return { driver: {
      list: async () => (await SerialPort.list()).map((port) => ({
        portId: port.path,
        displayName: (port as typeof port & { friendlyName?: string }).friendlyName || port.manufacturer || port.path,
        ...(port.vendorId ? { usbVendorId: port.vendorId } : {}),
        ...(port.productId ? { usbProductId: port.productId } : {}),
        identity: JSON.stringify([port.serialNumber, port.pnpId, port.locationId, port.vendorId, port.productId]),
      })),
      create: (path, options) => new SerialPort({
        path, baudRate: options.baudRate, dataBits: options.dataBits, stopBits: options.stopBits,
        parity: options.parity, rtscts: options.flowControl === 'hardware', autoOpen: false,
      }),
    } };
  } catch (error) {
    return { reason: `Native serial binding is unavailable: ${error instanceof Error ? error.message : String(error)}` };
  }
}
