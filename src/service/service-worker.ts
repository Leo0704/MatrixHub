/**
 * 服务 Worker 入口
 * 独立进程运行，不依赖 Electron 主进程
 */
import * as path from 'path';
import * as os from 'os';

// 设置环境变量供 platform-launcher 使用
if (!process.env.MATRIX_USER_DATA) {
  process.env.MATRIX_USER_DATA = path.join(os.tmpdir(), 'matrixhub-user-data');
}

import { startServiceLoop, stopServiceLoop } from './service-process.js';
import log from 'electron-log';

console.log('[ServiceWorker] 启动服务进程...');
console.log(`[ServiceWorker] UserData: ${process.env.MATRIX_USER_DATA}`);
console.log(`[ServiceWorker] PID: ${process.pid}`);

// 配置日志输出到控制台
log.transports.console.level = 'debug';
log.transports.console.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';

process.on('message', (message: { type: string }) => {
  console.log('[ServiceWorker] 收到消息:', message);
  if (message.type === 'stop') {
    console.log('[ServiceWorker] 收到停止指令');
    stopServiceLoop();
    process.exit(0);
  }
});

process.on('uncaughtException', (error) => {
  console.error('[ServiceWorker] 未捕获异常:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[ServiceWorker] 未处理 rejection:', reason);
});

// 启动服务循环
startServiceLoop()
  .then(() => {
    console.log('[ServiceWorker] 服务循环已启动');
  })
  .catch((error) => {
    console.error('[ServiceWorker] 服务循环异常:', error);
    process.exit(1);
  });
