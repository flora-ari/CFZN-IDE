import { invalid, tooLarge } from '../common/api-error';
import type { SerialOptions } from './serial-driver';

export function serialObject(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) {
    throw invalid(`Provide only supported serial fields (${fields.join(', ')}).`);
  }
  return value as Record<string, unknown>;
}
export function serialUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw invalid('Provide a UUID.', field);
  }
  return value.toLowerCase();
}
export function serialOptions(value: unknown): SerialOptions {
  const input = serialObject(value, ['baudRate', 'dataBits', 'stopBits', 'parity', 'flowControl']);
  const { baudRate, dataBits, stopBits, parity, flowControl } = input;
  if (typeof baudRate !== 'number' || !Number.isInteger(baudRate) || baudRate < 1 || baudRate > 4294967295 ||
      (dataBits !== 7 && dataBits !== 8) || (stopBits !== 1 && stopBits !== 2) ||
      (parity !== 'none' && parity !== 'even' && parity !== 'odd') || (flowControl !== 'none' && flowControl !== 'hardware')) {
    throw invalid('Provide valid baudRate, dataBits, stopBits, parity and flowControl.', 'options');
  }
  return { baudRate, dataBits, stopBits, parity, flowControl };
}
export function serialInteger(value: unknown, field: string, max: number, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw invalid('Provide an integer in the supported range.', field);
  return value;
}
export function serialQueryInteger(value: unknown, field: string, max: number, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw invalid('Provide a nonnegative integer.', field);
  return serialInteger(Number(value), field, max);
}
export function serialBytes(value: unknown): Buffer {
  if (typeof value !== 'string') throw invalid('Provide Base64 bytes.', 'dataBase64');
  if (value.length > 4 * Math.ceil(65536 / 3)) throw tooLarge('Serial writes are limited to 64 KiB.');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw invalid('Provide canonical Base64 bytes.', 'dataBase64');
  if (bytes.length > 65536) throw tooLarge('Serial writes are limited to 64 KiB.');
  return bytes;
}
