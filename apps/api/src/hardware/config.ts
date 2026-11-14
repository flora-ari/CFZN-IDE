import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import type { DeviceId } from './types';

export interface ToolchainConfig {
  cliPath: string;
  /** Existing Arduino data root; packages are referenced read-only, indexes copied. */
  sourceDataDir: string;
  packages: string[];
  builtinToolsDir?: string;
}
export interface ProfileBinding { toolchain: string; coreVersion: string; fqbn?: string; libraries?: string[] }
export interface HardwareConfig {
  runtimeDir: string;
  toolchains: Record<string, ToolchainConfig>;
  profiles: Record<string, ProfileBinding>;
  allowedOrigins: string[];
}
export const PROFILES: { id: string; deviceId: DeviceId; label: string; chip: 'avr' | 'esp32' | 'esp32s3'; fqbn: string }[] = [
  { id: 'uno-avr', deviceId: 'arduinoUno', label: 'Arduino Uno', chip: 'avr', fqbn: 'arduino:avr:uno' },
  { id: 'esp32s3-default', deviceId: 'arduinoEsp32S3', label: 'ESP32-S3', chip: 'esp32s3', fqbn: 'esp32:esp32:esp32s3' },
  { id: 'aijite-esp32s3-default', deviceId: 'aijiteESP32S3', label: 'Aijite ESP32-S3', chip: 'esp32s3', fqbn: 'esp32:esp32:esp32s3' },
  { id: 'esp32-4mb-dio', deviceId: 'arduinoEsp32', label: 'ESP32 · 4 MB DIO', chip: 'esp32', fqbn: 'esp32:esp32:esp32:FlashMode=dio,FlashFreq=40,FlashSize=4M,PartitionScheme=default,UploadSpeed=115200' },
  { id: 'firebeetle-esp32e-4mb', deviceId: 'firebeetleEsp32E', label: 'FireBeetle ESP32-E · 4 MB', chip: 'esp32', fqbn: 'mindplus:esp32:fireBeetleEsp32E' },
];

export async function loadHardwareConfig(env = process.env): Promise<HardwareConfig> {
  const input = env.HARDWARE_CONFIG ? JSON.parse(await readFile(resolve(env.HARDWARE_CONFIG), 'utf8')) : {};
  const runtimeDir = resolve(env.HARDWARE_RUNTIME_DIR ?? input.runtimeDir ?? resolve(__dirname, '../../../../.runtime/hardware'));
  const toolchains: Record<string, ToolchainConfig> = input.toolchains ?? {};
  const profiles: Record<string, ProfileBinding> = input.profiles ?? {};
  const origins: string[] = env.HARDWARE_ALLOWED_ORIGINS?.split(',').map((value) => value.trim()).filter(Boolean)
    ?? input.allowedOrigins ?? [];
  for (const [id, toolchain] of Object.entries(toolchains)) {
    if (!/^[a-z0-9-]+$/i.test(id) || !toolchain || !isAbsolute(toolchain.cliPath) || !isAbsolute(toolchain.sourceDataDir) ||
        !Array.isArray(toolchain.packages) || !toolchain.packages.every((name) => /^[a-z0-9_-]+$/i.test(name)) ||
        toolchain.builtinToolsDir !== undefined && !isAbsolute(toolchain.builtinToolsDir)) {
      throw new Error(`Invalid hardware toolchain configuration: ${id}`);
    }
  }
  for (const [id, binding] of Object.entries(profiles)) {
    if (!PROFILES.some((profile) => profile.id === id) || !binding || !toolchains[binding.toolchain] ||
        typeof binding.coreVersion !== 'string' || !/^[\w.-]+$/.test(binding.coreVersion) ||
        binding.fqbn !== undefined && !/^[\w:.,=+-]+$/.test(binding.fqbn) ||
        binding.libraries !== undefined && (!Array.isArray(binding.libraries) || !binding.libraries.every(isAbsolute))) {
      throw new Error(`Invalid hardware profile configuration: ${id}`);
    }
  }
  for (const origin of origins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new Error(`Invalid product origin: ${origin}`);
  }
  return { runtimeDir, toolchains, profiles, allowedOrigins: origins };
}
