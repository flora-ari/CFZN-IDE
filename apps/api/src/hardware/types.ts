export type DeviceId = 'arduinoUno' | 'arduinoEsp32S3' | 'aijiteESP32S3' | 'arduinoEsp32' | 'firebeetleEsp32E';
export interface HardwareProfile {
  id: string; deviceId: DeviceId; label: string; chip: 'avr' | 'esp32' | 'esp32s3';
  fqbn: string; compileAvailable: boolean; uploadAvailable: boolean;
  realtimeAvailable: boolean; reason?: string;
}
export interface HardwarePort {
  portId: string; displayName: string; usbVendorId?: string; usbProductId?: string;
}
export interface HardwareJob {
  id: string; kind: 'build' | 'upload';
  state: 'running' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled';
  stage: 'compiling' | 'uploading' | 'complete';
  deviceId: DeviceId; profileId: string; sourceHash: string;
  createdAt: string; finishedAt?: string; buildId?: string; portId?: string;
  error?: { code: string; message: string };
}
export interface HardwareLog { index: number; stream: 'stdout' | 'stderr' | 'system'; text: string }
export const SOURCE_LIMIT = 1024 ** 2;
export const LOG_LIMIT = 1024 ** 2;
export const MODULE_IDS = ['activateBuzzer', 'atomizer', 'pirSensor', 'flameSensor', 'raindropSensor', 'moreComments'];
