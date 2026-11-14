# 模块卡片提示对齐：后端边界确认

2026-11-12，后端接口设计只读核对：`apps/web/src/extensions/library.ts` 的模块卡片提示由现有 `adapter.currentDevice()` 与 `supportsModule()` 在前端生成，并通过 `cfzn-card-compatibility` 展示；本轮将“未选择主控板”等兼容提示统一靠卡片右上边框，仅涉及卡片内定位样式。无需新增或修改 HTTP 接口、请求/响应 schema、后端业务、归档字段、项目存储、依赖或硬件协议；`docs/api-contract.md` 的既有语义继续有效。开发保留现有提示文字、兼容判断、选中/移除及筛选行为，不触及 openblock-vm/Blockly。本核对只交付本文，未修改产品、启停服务或操作 COM3；后续视觉验收由主控统一安排。
