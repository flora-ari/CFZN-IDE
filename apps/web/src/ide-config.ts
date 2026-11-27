/// <reference types="vite/client" />

export const ideAuthEnabled = import.meta.env?.VITE_IDE_AUTH === 'true';
export const guestEditorUrl = '/?mode=guest';
export const guestEditor = ideAuthEnabled && typeof window !== 'undefined' && window.top === window &&
  new URLSearchParams(window.location.search).get('mode') === 'guest';
export const guestProjectHint = '登录创客账号后可查看和保存账号项目。当前作品可导出到本机。';
export const projectMaxMiB = ideAuthEnabled ? 64 : 20;
export const projectMaxBytes = projectMaxMiB * 1024 * 1024;
export const projectTooLarge = `项目文件超过 ${projectMaxMiB} MiB。`;
export const makerPortal = 'https://maker.xiaodaiyang.top/';
