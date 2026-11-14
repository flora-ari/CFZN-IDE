(function () {
  'use strict';

  const moduleIds = new Set([
    'activateBuzzer', 'atomizer', 'pirSensor', 'flameSensor', 'raindropSensor', 'moreComments',
  ]);
  const moduleKinds = ['toolbox', 'translations', 'generator', 'blocks'];
  const modules = new Map();
  let pageVersion;

  function loadBuiltin(id, integrationSha256, attempt) {
    if (!moduleIds.has(id)) {
      return Promise.reject(new Error('无法加载扩展：模块不在内置目录中。'));
    }
    if (typeof integrationSha256 !== 'string' || integrationSha256.length !== 64
      || !/^[a-fA-F0-9]{64}$/.test(integrationSha256)) {
      return Promise.reject(new Error('无法加载扩展：资源版本无效，请刷新编辑器。'));
    }
    if (!Number.isSafeInteger(attempt) || attempt < 0) {
      return Promise.reject(new Error('无法加载扩展：重试次数必须是非负安全整数。'));
    }

    const version = integrationSha256.toLowerCase();
    if (pageVersion !== undefined && pageVersion !== version) {
      return Promise.reject(new Error('扩展资源版本已变化，请先保存当前项目并刷新编辑器。'));
    }
    pageVersion = version;

    const key = `${version}:${id}`;
    if (modules.has(key)) return modules.get(key);

    const query = `?v=${encodeURIComponent(version)}&retry=${encodeURIComponent(String(attempt))}`;
    const pending = Promise.all(moduleKinds.map(async (kind) => {
      // This classic public script stays outside Vite's source import transformation.
      const path = `/cfzn-extensions/extensions/${id}/${kind}.mjs${query}`;
      let loaded;
      try {
        loaded = await import(path);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`扩展「${id}」的 ${kind}.mjs 加载失败：${detail}`, { cause: error });
      }
      if (typeof loaded.default !== 'function') {
        throw new Error(`扩展「${id}」的 ${kind}.mjs 未提供有效的默认注册函数。`);
      }
      return [kind, loaded.default];
    })).then((entries) => Object.freeze(Object.fromEntries(entries))).catch((error) => {
      modules.delete(key);
      throw error;
    });

    // Cache code only; callers register these functions again for the current board.
    modules.set(key, pending);
    return pending;
  }

  Object.defineProperty(window, 'CFZNBuiltinModules', {
    value: Object.freeze({ loadBuiltin }),
  });
}());
