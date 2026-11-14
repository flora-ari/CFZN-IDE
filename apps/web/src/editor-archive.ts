import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export interface EditorMetadata { version: 1; codeMode: 'generated' | 'manual'; manualSource?: string }
export const defaultEditorMetadata = (): EditorMetadata => ({ version: 1, codeMode: 'generated' });
const entry = 'cfzn/editor.json';
export function validateEditorMetadata(value: unknown): EditorMetadata {
  const v = value as EditorMetadata | null;
  if (!v || v.version !== 1 || !['generated', 'manual'].includes(v.codeMode) ||
    (v.manualSource !== undefined && (typeof v.manualSource !== 'string' || strToU8(v.manualSource).length > 1024 * 1024)) ||
    (v.codeMode === 'manual' && typeof v.manualSource !== 'string')) throw new Error('cfzn/editor.json 无效或版本不受支持，当前项目保持不变。');
  return { version: 1, codeMode: v.codeMode, ...(v.manualSource === undefined ? {} : { manualSource: v.manualSource }) };
}
export function readEditorMetadata(bytes: ArrayBuffer): EditorMetadata {
  const files = unzipSync(new Uint8Array(bytes), { filter: file => {
    if (file.name !== entry) return false;
    // JSON escapes can expand one source byte to six bytes (for example NUL -> \u0000).
    if (file.originalSize > 6 * 1024 * 1024 + 4096) throw new Error('代码草稿元数据超过限制。');
    return true;
  } });
  if (!files[entry]) return defaultEditorMetadata();
  try { return validateEditorMetadata(JSON.parse(strFromU8(files[entry]))); }
  catch (e) { throw new Error(`无法读取代码草稿：${e instanceof Error ? e.message : String(e)}`); }
}
export async function addEditorMetadata(archive: Promise<Blob>, metadata: EditorMetadata): Promise<Blob> {
  const captured = validateEditorMetadata(metadata);
  const files = unzipSync(new Uint8Array(await (await archive).arrayBuffer()));
  files[entry] = strToU8(JSON.stringify(captured));
  const result = zipSync(files, { level: 6 });
  return new Blob([result as Uint8Array<ArrayBuffer>], { type: 'application/x.openblock.ob' });
}

export function archiveWithoutController(bytes: ArrayBuffer): ArrayBuffer {
  const files = unzipSync(new Uint8Array(bytes));
  const project = JSON.parse(strFromU8(files['project.json']!));
  if (project.deviceExtensions?.length) throw new Error('请先移除已加载模块。');
  project.device = { deviceId: null, type: null, pnpIdList: [] };
  files['project.json'] = strToU8(JSON.stringify(project));
  return zipSync(files, { level: 6 }).buffer as ArrayBuffer;
}
