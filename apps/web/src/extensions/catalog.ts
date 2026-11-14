export const controllerIds = ['arduinoUno', 'arduinoEsp32S3', 'aijiteESP32S3', 'arduinoEsp32', 'firebeetleEsp32E'] as const;
export const normalizeDeviceId = (id: string) => id === 'aijiteEsp32S3' ? 'aijiteESP32S3' : id;

export interface ModuleEntry {
  extensionId: string;
  name: string;
  description: string;
  opcodes: string[];
  tags: string[];
  version: string;
  iconURL: string;
  supportDevice: readonly string[];
  categoryId: string;
  type: 'sensor' | 'actuator' | 'function';
  menuOpcodes?: string[];
  dependencies?: string[];
}

const entries = [
  ['activateBuzzer', '有源蜂鸣器', '初始化引脚，打开或关闭有源蜂鸣器。', ['activeBuzzer_init', 'activeBuzzer_on', 'activeBuzzer_off'], 'actuator', 'ACTIVATEBUZZER_CATEGORY'],
  ['atomizer', '雾化模块', '初始化雾化模块，设置或切换输出状态。', ['atomizer_init', 'atomizer_setState', 'atomizer_toggle'], 'actuator', 'ATOMIZER_CATEGORY'],
  ['pirSensor', '人体红外', '初始化数字输入，读取人体红外检测状态。', ['pirSensor_init', 'pirSensor_detected'], 'sensor', 'PIRSENSOR_CATEGORY'],
  ['flameSensor', '火焰传感器', '读取火焰传感器的数字和模拟信号。', ['flameSensor_readDigital', 'flameSensor_readAnalog'], 'sensor', 'FLAMESENSOR_CATEGORY'],
  ['raindropSensor', '水滴传感器', '读取水滴传感器的数字和模拟信号。', ['raindropSensor_readDigital', 'raindropSensor_readAnalog'], 'sensor', 'RAINDROPSENSOR_CATEGORY'],
  ['moreComments', '积木注释', '添加语句注释或保留内部代码的分支注释。', ['moreComments_commandBlock', 'moreComments_branchBlock'], 'other', 'MORECOMMENTS_CATEGORY'],
] as const;

export const modules: ModuleEntry[] = entries.map(([extensionId, name, description, opcodes, tag, categoryId]) => ({
  extensionId, name, description, opcodes: [...opcodes], tags: [tag, extensionId], categoryId,
  version: '1.0.0', supportDevice: controllerIds,
  type: tag === 'other' ? 'function' : tag,
  iconURL: `/cfzn-extensions/extensions/${extensionId}/assets/${extensionId}.png`,
}));

export const controllerTypes = Object.fromEntries(controllerIds.map(id => [id, 'board'])) as Record<string, 'board'>;
export const typeNames: Record<string, string> = { all: '全部', board: '主控板', sensor: '传感器', actuator: '执行器', function: '功能模块' };

export function supportsModule(entry: ModuleEntry, deviceId: string | null | undefined) {
  return !!deviceId && entry.supportDevice.includes(normalizeDeviceId(deviceId));
}

export function validateProjectExtensions(project: Record<string, any>, availableDevices: readonly string[], allowProgrammingModules = false) {
  const original = typeof project.device === 'string' ? project.device : project.device?.deviceId;
  const deviceId = original && original !== 'null' ? normalizeDeviceId(original) : undefined;
  if (deviceId && !availableDevices.includes(deviceId)) throw new Error(`此网站没有主控实现：${deviceId}。当前项目未替换。`);
  const ids = project.deviceExtensions ?? [];
  if (!Array.isArray(ids)) throw new Error('deviceExtensions 必须是模块 ID 数组。');
  for (const id of ids) {
    const entry = modules.find(item => item.extensionId === id);
    if (!entry) throw new Error(`此网站没有模块实现：${String(id)}。当前项目未替换。`);
    if (!supportsModule(entry, deviceId)) throw new Error(`${entry.name}（${id}）不支持主控 ${deviceId || '未选择'}。`);
    if (project.programMode !== 'upload' && !(allowProgrammingModules && project.programMode === 'realtime')) throw new Error(`${entry.name}（${id}）需要 Arduino 上传模式。`);
  }
  // Normalize only the documented legacy spelling. Generic ESP32-S3 stays generic.
  if (deviceId && original !== deviceId) {
    return { ...project, device: typeof project.device === 'string' ? deviceId : { ...project.device, deviceId } };
  }
  return project;
}
