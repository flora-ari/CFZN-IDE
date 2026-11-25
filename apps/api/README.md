# CFZN-IDE 项目 API

独立本地硬件编译/上传服务见 [HARDWARE.md](HARDWARE.md)；使用 `npm run hardware` 启动 3002，不改变本页的 3001 项目 API。

NestJS + TypeScript。本地开发使用 Node.js 22.2 或更高版本，已在 Windows / Node.js 24 上验证。

在 `apps/api` 目录中执行：

```powershell
npm ci --cache ../../.runtime/npm-cache
npm run dev
```

`GET http://127.0.0.1:3001/api/v1/health` 返回 `{"status":"ok","storage":"local","auth":"none"}`。开发模式编译并监视 TypeScript，应用在编译结果变化后自动重启。也可用 `npm run build` 后执行 `npm start`；`npm run typecheck` 和 `npm test` 分别运行类型检查和 HTTP 集成测试。

服务固定绑定 `127.0.0.1`，Web 开发服务器通过同源 `/api` 代理。默认 `PORT=3001`，`PROJECT_DATA_DIR` 默认是仓库中的 `.runtime/project-data`。可在启动前设置 PowerShell 进程环境变量，例如：

```powershell
$env:PORT = '13001'
$env:PROJECT_DATA_DIR = 'F:/CFZN/CFZN-IDE/.runtime/api-check'
npm run dev
```

接口以 [统一契约](../../docs/api-contract.md) 为准。首次保存 POST multipart `name` + `file`，可导入兼容 `.ob` 或 `.sb3`。归档以 ZIP 内容验证，保存时保留上传的所有字节。再次保存 PUT 原始归档，允许 `application/octet-stream` 或 `application/x.openblock.ob`。读取内容返回 `.ob` 下载；读取元数据后可把其 ETag 作为 `If-Match` 传给下载请求。保存、重命名和删除都必须带当前带引号的 ETag，例如 `If-Match: "1"`。

每个项目在 `<PROJECT_DATA_DIR>/projects/<UUID>/` 下保存 `metadata.json` 和完整归档。归档通过校验后，先写新的文件，再原子替换元数据指针。每个项目的读写在同一把锁内执行，适用于一个 API 进程。`ProjectStore` 是未来替换本地存储的边界。

积木工厂通过 `GET /api/v1/arduino/libraries/search?q=Servo` 查找 Arduino Library Manager 库。结果展示库名、作者、描述、可选版本及各版本支持的架构。服务缓存官方索引 30 分钟。私有模块版本保存颜色、积木配置，以及用户选定的库名和确切版本；已保存的模块可离线读取。
