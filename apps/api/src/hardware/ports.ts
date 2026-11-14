import { readdir } from 'node:fs/promises';
import { ApiError } from '../common/api-error';
import { runCommand } from './process';
import type { HardwarePort } from './types';

/** Enumeration only; does not create a serial connection or query board firmware. */
export async function listLocalPorts(): Promise<HardwarePort[]> {
  if (process.platform === 'win32') {
    const script = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Get-CimInstance Win32_SerialPort | Select-Object DeviceID,Name,PNPDeviceID | ConvertTo-Json -Compress';
    const result = await runCommand({ executable: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], timeoutMs: 15_000 });
    if (result.code !== 0 || result.timedOut) throw new ApiError(503, 'TOOLCHAIN_UNAVAILABLE', 'Local serial port enumeration failed.', result.stderr);
    const value = result.stdout.trim() ? JSON.parse(result.stdout) : [];
    return (Array.isArray(value) ? value : [value]).map((port): HardwarePort => {
      const ids = /VID_([\dA-F]{4}).*PID_([\dA-F]{4})/i.exec(port.PNPDeviceID ?? '');
      return { portId: port.DeviceID, displayName: port.Name ?? port.DeviceID,
        ...(ids ? { usbVendorId: ids[1], usbProductId: ids[2] } : {}) };
    }).sort((a, b) => a.portId.localeCompare(b.portId));
  }
  const names = await readdir('/dev');
  return names.filter((name) => /^(tty(USB|ACM)\d+|cu\..+)$/.test(name))
    .sort().map((name) => ({ portId: `/dev/${name}`, displayName: name }));
}
