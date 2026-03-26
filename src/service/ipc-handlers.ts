/**
 * IPC Handlers — 主注册层
 *
 * 架构说明：
 * - 本文件负责注册所有 IPC handler，不包含具体业务逻辑
 * - 具体 handler 实现按 domain 拆分到 handlers/ 目录下的独立文件
 * - broadcastToRenderers 抽取到 ipc-utils.ts 避免循环依赖
 *
 * Domain 拆分：
 * - ipc-task-handlers.ts: 任务管理
 * - ipc-account-handlers.ts: 账号管理
 * - ipc-rate-handlers.ts: 限流状态
 * - ipc-automation-handlers.ts: 自动化操作确认
 * - ipc-ai-handlers.ts: AI 生成、Provider 配置、每日简报
 * - (已移除) ipc-selector-handlers.ts: 选择器版本管理
 * - ipc-monitoring-handlers.ts: 健康检查、告警、指标
 * - ipc-config-handlers.ts: 运行时配置
 * - ipc-settings-handlers.ts: 用户设置
 * - ipc-export-handlers.ts: 数据导出/导入
 * - ipc-consent-handlers.ts: 用户同意管理
 * - ipc-system-handlers.ts: 系统状态
 * - ipc-fetch-handlers.ts: 热点话题获取
 * - ipc-pipeline-handlers.ts: Pipeline 任务管理
 * - group-handlers.ts: 账号分组
 */
import log from 'electron-log';
import { ipcMain } from 'electron';
import { broadcastToRenderers } from './ipc-utils.js';

// Re-export for backward compatibility (used by some internal modules)
export { broadcastToRenderers };

// Import all domain handlers
import {
  registerTaskHandlers,
  registerAccountHandlers,
  registerGroupHandlers,
  registerRateHandlers,
  registerAIHandlers,
  registerMonitoringHandlers,
  registerConfigHandlers,
  registerSettingsHandlers,
  registerExportHandlers,
  registerConsentHandlers,
  registerSystemHandlers,
  registerFetchHandlers,
  registerPipelineHandlers,
  registerCampaignHandlers,
} from './handlers/ipc-index.js';

/**
 * 注册所有 IPC 处理器
 */
export function registerIpcHandlers(): void {
  log.info('注册 IPC 处理器...');

  // 按依赖顺序注册各 domain handler
  registerTaskHandlers();
  registerAccountHandlers();
  registerGroupHandlers(ipcMain);
  registerRateHandlers();
  registerAIHandlers();
  registerMonitoringHandlers();
  registerConfigHandlers();
  registerSettingsHandlers();
  registerExportHandlers();
  registerConsentHandlers();
  registerSystemHandlers();
  registerFetchHandlers();
  registerPipelineHandlers();
  registerCampaignHandlers();

  log.info('IPC 处理器注册完成');
}
