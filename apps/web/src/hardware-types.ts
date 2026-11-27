import type { SerialOptions, SerialStatus } from './serial.ts';

export type DeviceId = 'arduinoUno' | 'arduinoEsp32S3' | 'aijiteESP32S3' | 'arduinoEsp32' | 'firebeetleEsp32E';
export interface HardwareProfile {
  id: string; deviceId: DeviceId; label: string; chip: 'avr' | 'esp32' | 'esp32s3'; fqbn: string;
  compileAvailable: boolean; uploadAvailable: boolean; realtimeAvailable: boolean; reason?: string;
}
export interface HardwareCapabilities {
  protocolVersion: 1; executionHost: 'local'; profiles: HardwareProfile[];
  toolchain: { cliVersion: string | null; description: string };
}
export interface HardwarePort { portId: string; displayName: string; usbVendorId?: string; usbProductId?: string }
export interface HardwareJob {
  id: string; kind: 'build' | 'upload'; state: 'running' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled';
  stage: 'compiling' | 'uploading' | 'complete'; deviceId: DeviceId; profileId: string; sourceHash: string;
  createdAt: string; finishedAt?: string; buildId?: string; portId?: string; error?: { code: string; message: string };
}
export interface HardwareLog { index: number; stream: 'stdout' | 'stderr' | 'system'; text: string }
export interface ToolchainProfile {
  profileId: string; planId: string; state: 'missing' | 'preparing' | 'ready' | 'failed'; installable: boolean; reason?: string;
}
export interface ToolchainCatalog {
  supported: true; profiles: ToolchainProfile[]; activeJobId: string | null;
}
export interface ToolchainJob {
  id: string; profileId: string; planId: string;
  state: 'running' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled';
  phase: 'resolving' | 'downloading' | 'installing' | 'validating' | 'complete';
  createdAt: string; finishedAt?: string; error?: { code: string; message: string };
  progress?: { downloadedBytes: number; totalBytes?: number };
}
export interface ToolchainSnapshot {
  support: 'unknown' | 'available' | 'legacy'; profiles: ToolchainProfile[];
  busy: boolean; profileId: string | null; job: ToolchainJob | null; logs: HardwareLog[];
  cancelAvailable: boolean; message: string; error: string;
}
export interface BrowserPort { id: string; label: string; name: string; source?: 'local'; portId?: string; preferenceKey?: string; confirmed?: boolean; reason?: string; ownership?: string; transportError?: string }
export type SerialOperation = 'authorizing' | 'connecting' | 'switching' | 'closing' | 'restoring' | null;
// Editor-only diagnostics. This is not part of the hardware HTTP schema.
export interface LocalServiceState {
  status: 'unknown' | 'checking' | 'online' | 'offline' | 'incompatible';
  baseUrl: string; message: string;
}
export interface HardwareSnapshot {
  deviceId: string | null; sessionId: string | null; connection: SerialStatus;
  use: 'idle' | 'terminal' | 'protocol' | 'preparing' | 'build' | 'releasing' | 'upload' | 'restoring';
  options: SerialOptions; browserPorts: BrowserPort[]; browserPortId: string | null;
  profiles: HardwareProfile[]; ports: HardwarePort[]; profileId: string; portId: string;
  busy: boolean; job: HardwareJob | null; logs: HardwareLog[];
  message: string; error: string; restoreError: string;
  serialOperation: SerialOperation; pendingBrowserPortId: string | null;
  serialError: string; scanning: boolean; scanError: string;
  localService: LocalServiceState; portError: string;
  toolchain: ToolchainSnapshot;
  pendingAction?: 'compile' | 'upload' | null;
}
export function isSerialOptions(value: unknown): value is SerialOptions {
  const v = value as SerialOptions | null;
  return !!v && Number.isInteger(v.baudRate) && v.baudRate > 0 && v.baudRate <= 0xffffffff && [7, 8].includes(v.dataBits) &&
    [1, 2].includes(v.stopBits) && ['none', 'even', 'odd'].includes(v.parity) && ['none', 'hardware'].includes(v.flowControl);
}
