// Adapted from vendor/aijite/aijiteEsp32S3.original.cjs; see vendor/SOURCES.md.
export function aijiteDevice(Base: any) {
  return class AijiteEsp32S3 extends Base {
    get DEVICE_ID() { return 'aijiteESP32S3'; }
    isIO3Pin(item: any) { return item && (item.text === 'IO3' || String(item.value) === '3'); }
    get PINS_MENU() { return super.PINS_MENU.filter((item: any) => !this.isIO3Pin(item)); }
    get ANALOG_PINS_MENU() { return super.ANALOG_PINS_MENU.filter((item: any) => !this.isIO3Pin(item)); }
    get TOUCH_PINS_MENU() { return super.TOUCH_PINS_MENU.filter((item: any) => !this.isIO3Pin(item)); }
    getInfo() {
      return super.getInfo().map((category: any) => ({
        ...category,
        ...(category.menus && { menus: Object.fromEntries(Object.entries(category.menus).map(([key, menu]: [string, any]) => [
          key, Array.isArray(menu?.items) ? { ...menu, items: menu.items.filter((item: any) => !this.isIO3Pin(item)) } : menu,
        ])) }),
      }));
    }
  };
}

export function installDeviceMetadata(host: any) {
  const devices: any[] = host.CFZNDeviceMetadata;
  if (!devices) throw new Error('官方设备元数据不可用。请重新运行 prepare:openblock。');
  if (!devices.some(device => device.deviceId === 'aijiteESP32S3')) {
    const base = devices.find(device => device.deviceId === 'arduinoEsp32S3');
    devices.push({ ...base,
      deviceId: 'aijiteESP32S3', name: 'Aijite ESP32-S3', manufactor: 'Aijite',
      description: '基于 ESP32-S3，数字、模拟及触摸引脚菜单排除 IO3。',
      iconURL: '/cfzn-extensions/aijite/aijiteEsp32S3.png',
      programMode: ['upload'], defaultProgramMode: 'upload', deviceExtensionsCompatible: 'arduinoEsp32S3',
      defaultBaudRate: '115200', learnMore: '', helpLink: '',
    });
  }
  if (!devices.some(device => device.deviceId === 'firebeetleEsp32E')) {
    const base = devices.find(device => device.deviceId === 'arduinoEsp32');
    devices.push({ ...base, deviceId: 'firebeetleEsp32E', name: 'FireBeetle ESP32-E', manufactor: 'DFRobot',
      description: 'ESP32 上传兼容主控；D/A 标签映射至实际 GPIO，实时固件未验证。',
      programMode: ['upload'], defaultProgramMode: 'upload', deviceExtensionsCompatible: 'arduinoEsp32',
      defaultBaudRate: '115200', learnMore: '', helpLink: '',
    });
  }
  return devices;
}
