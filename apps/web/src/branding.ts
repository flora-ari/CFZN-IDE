export const DEFAULT_PROJECT_TITLE = 'gui.gui.defaultProjectTitle';
const english = {
  'gui.menuBar.wiki': 'Website',
  'gui.alerts.lostPeripheralConnection': 'CCraft lost connection to {extensionName}.',
  'gui.unsupportedBrowser.notRecommended': 'CCraft does not support this browser version. Please update to a supported version of Chrome, Firefox, Edge, or Safari.',
  'gui.unsupportedBrowser.description': 'CCraft does not support this browser. Please use a supported version of Chrome, Firefox, Edge, or Safari.',
  'gui.connection.unavailable.installscratchlink': 'Make sure a local connection service compatible with your device is installed and running.',
  'gui.crashMessage.description': 'The CCraft editor encountered a problem. Please refresh the page and try again.',
  'gui.webglModal.description': 'Your browser or computer {webGlLink}. This technology is needed for CCraft to run.',
  [DEFAULT_PROJECT_TITLE]: 'CCraft Project',
  'gui.telemetryOptIn.label': 'CCraft usage statistics',
  'gui.telemetryOptIn.body1': 'Usage reporting is not enabled in this version of CCraft.',
  'gui.telemetryOptIn.optInText': 'Usage reporting is unavailable in CCraft',
  'gui.telemetryOptIn.optOutText': 'Do not share CCraft usage data',
};
type BrandId = keyof typeof english;
const safetyIds: BrandId[] = ['gui.menuBar.wiki', 'gui.connection.unavailable.installscratchlink', 'gui.crashMessage.description',
  'gui.telemetryOptIn.label', 'gui.telemetryOptIn.body1', 'gui.telemetryOptIn.optInText', 'gui.telemetryOptIn.optOutText'];
const localized: Record<string, Partial<Record<BrandId, string>>> = {
  'zh-cn': {
    'gui.menuBar.wiki': '官网',
    'gui.alerts.lostPeripheralConnection': 'CCraft与{extensionName}的连接已断开。',
    'gui.unsupportedBrowser.notRecommended': 'CCraft不支持当前浏览器版本，请升级到受支持的 Chrome、Firefox、Edge 或 Safari。',
    'gui.unsupportedBrowser.description': 'CCraft不支持当前浏览器，请使用受支持的 Chrome、Firefox、Edge 或 Safari。',
    'gui.connection.unavailable.installscratchlink': '请确认与当前设备兼容的本机连接服务已安装并运行。',
    'gui.crashMessage.description': 'CCraft 编辑器遇到问题，请刷新页面后重试。',
    'gui.webglModal.description': '你的电脑或浏览器{webGlLink}。CCraft需要该技术才能运行。',
    [DEFAULT_PROJECT_TITLE]: 'CCraft作品',
    'gui.telemetryOptIn.label': 'CCraft使用情况统计',
    'gui.telemetryOptIn.body1': '此版本CCraft未启用使用情况上报。',
    'gui.telemetryOptIn.optInText': '此版本CCraft暂不支持使用情况上报',
    'gui.telemetryOptIn.optOutText': '不分享CCraft使用情况数据',
  },
  'zh-tw': {
    'gui.menuBar.wiki': '官網',
    'gui.alerts.lostPeripheralConnection': 'CCraft 與 {extensionName} 的連線中斷。',
    'gui.unsupportedBrowser.notRecommended': 'CCraft不支援目前的瀏覽器版本，請升級至支援的 Chrome、Firefox、Edge 或 Safari。',
    'gui.unsupportedBrowser.description': 'CCraft不支援目前的瀏覽器，請使用支援的 Chrome、Firefox、Edge 或 Safari。',
    'gui.connection.unavailable.installscratchlink': '請確認與目前裝置相容的本機連線服務已安裝並執行。',
    'gui.crashMessage.description': 'CCraft 編輯器遇到問題，請重新整理頁面後再試一次。',
    'gui.webglModal.description': '你的瀏覽器或裝置{webGlLink}，這是讓CCraft運作的必要技術。',
    [DEFAULT_PROJECT_TITLE]: 'CCraft作品',
    'gui.telemetryOptIn.label': 'CCraft使用情況統計',
    'gui.telemetryOptIn.body1': '此版本CCraft未啟用使用情況回報。',
    'gui.telemetryOptIn.optInText': '此版本CCraft暫不支援使用情況回報',
    'gui.telemetryOptIn.optOutText': '不分享CCraft使用情況資料',
  },
  ru: {
    'gui.menuBar.wiki': 'Сайт',
    'gui.connection.unavailable.installscratchlink': 'Убедитесь, что совместимая с устройством локальная служба подключения установлена и запущена.',
    'gui.crashMessage.description': 'В редакторе CCraft возникла ошибка. Обновите страницу и попробуйте снова.',
    'gui.telemetryOptIn.label': 'Статистика использования CCraft',
    'gui.telemetryOptIn.body1': 'В этой версии CCraft отправка статистики использования отключена.',
    'gui.telemetryOptIn.optInText': 'Отправка статистики CCraft недоступна',
    'gui.telemetryOptIn.optOutText': 'Не отправлять статистику CCraft',
  },
};
const emptyMessages = Object.freeze({});
const cache = new WeakMap<object, Map<string, Readonly<Record<string, string>>>>();
export function brandMessages(messages: Readonly<Record<string, string>> = emptyMessages, locale = 'en'): Readonly<Record<string, string>> {
  const normalized = locale.toLowerCase().replaceAll('_', '-');
  const language = /^zh-(tw|hk|mo|hant)/.test(normalized) ? 'zh-tw' : normalized === 'zh' || normalized.startsWith('zh-') ? 'zh-cn' : normalized.split('-')[0];
  let locales = cache.get(messages);
  if (!locales) { locales = new Map(); cache.set(messages, locales); }
  const cached = locales.get(normalized); if (cached) return cached;
  const result: Record<string, string> = { ...messages };
  for (const id of Object.keys(english) as BrandId[]) {
    const existing = messages[id];
    result[id] = (typeof existing === 'string' && existing.trim() ? existing : localized[language]?.[id] ?? english[id]).replace(/OpenBlock/gi, 'CCraft');
  }
  // These promises change with the host's actual capabilities, rather than by renaming a service/team.
  for (const id of safetyIds) result[id] = localized[language]?.[id] ?? english[id];
  if (language === 'zh-cn' || language === 'zh-tw' || language === 'en') result[DEFAULT_PROJECT_TITLE] = localized[language]?.[DEFAULT_PROJECT_TITLE] ?? english[DEFAULT_PROJECT_TITLE];
  const derived = Object.freeze(result); locales.set(normalized, derived); return derived;
}

// Only the fixed generator-owned first line is branded. Program data and manual drafts are never scanned.
export function brandGeneratedSource(code: string) {
  return code.replace(/^\/\/ generated by OpenBlock(\r\n|\n|\r|$)/, '// generated by CCraft$1');
}
