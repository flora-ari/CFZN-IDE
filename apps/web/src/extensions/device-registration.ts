import { aijiteDevice } from './aijite';
import { derivedInfo, firebeetleDevice } from './board-info';

// Compatibility boundary for this exact pinned VM. Its original modules remain byte-identical.
// Only this external adapter temporarily wraps the existing instance registration entry point.
export function deviceRegistration(vm: any, originalLoad: (device: any) => Promise<void>) {
  const manager = vm.extensionManager;
  const runtime = vm.runtime;
  let loading = false;
  return async (device: any) => {
    const id = device.deviceId;
    const baseId = id === 'aijiteESP32S3' ? 'arduinoEsp32S3' : id === 'firebeetleEsp32E' ? 'arduinoEsp32' : null;
    if (!baseId) return originalLoad(device);
    if (loading) throw new Error('主控注册正在进行。');
    loading = true;
    const register = manager._registerInternalExtension;
    let captured = false;
    try {
      // The native loader performs its normal disconnect, monitor and extension cleanup.
      // Remove only a stale loader key; actual project replacement already has a rollback archive.
      manager._loadedDevice.delete(baseId);
      manager._registerInternalExtension = function (instance: any) {
        if (instance.DEVICE_ID !== baseId) return register.call(this, instance);
        captured = true;
        runtime.setDevice({ deviceId: id, type: device.type, pnpIdList: device.pnpidList });
        const Derived: any = id === 'aijiteESP32S3' ? aijiteDevice(instance.constructor) : firebeetleDevice(instance.constructor);
        return register.call(this, new Derived(runtime, id));
      };
      await originalLoad({ ...device, deviceId: baseId });
      if (!captured) throw new Error(`原生设备 ${baseId} 未经过固定版本注册入口。`);
      const service = manager._loadedDevice.get(baseId);
      manager._loadedDevice.delete(baseId); manager._loadedDevice.set(id, service);
    } finally { manager._registerInternalExtension = register; loading = false; }
  };
}

export async function deviceDescriptions() {
  const response = await fetch('/openblock-vendor/device-descriptions.json');
  if (!response.ok) throw new Error('固定版本主控描述缓存不可用。');
  const { descriptions } = await response.json();
  descriptions.aijiteESP32S3 = derivedInfo(descriptions.arduinoEsp32S3, 'aijiteESP32S3');
  descriptions.firebeetleEsp32E = derivedInfo(descriptions.arduinoEsp32, 'firebeetleEsp32E');
  return descriptions as Record<string, any[]>;
}
