import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import log from 'electron-log';
import { app } from 'electron';

export class ServiceManager {
  private worker: ChildProcess | null = null;
  private isShuttingDown = false;
  private restartAttempts = 0;
  private readonly MAX_RESTART_ATTEMPTS = 3;
  private readonly RESTART_DELAY = 5000;

  /**
   * 获取或创建 userData 路径供 Worker 使用
   */
  private getUserDataPath(): string {
    try {
      return app.getPath('userData');
    } catch {
      // 开发模式或 Electron 不可用时使用备用路径
      return path.join(os.tmpdir(), 'matrixhub-user-data');
    }
  }

  /**
   * 启动服务进程
   */
  start(): boolean {
    if (this.worker) {
      log.warn('[ServiceManager] 服务已在运行');
      return false;
    }

    // 获取编译后的 service-worker.js 路径
    const serviceWorkerPath = path.join(
      app.isPackaged
        ? path.dirname(app.getPath('exe'))
        : path.join(__dirname, '..', '..'),
      'dist',
      'service',
      'service-worker.js'
    );

    log.info('[ServiceManager] 启动服务进程...');
    log.info(`[ServiceManager] Worker 路径: ${serviceWorkerPath}`);
    log.info(`[ServiceManager] UserData: ${this.getUserDataPath()}`);

    try {
      this.worker = spawn('node', [serviceWorkerPath], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        env: {
          ...process.env,
          MATRIX_USER_DATA: this.getUserDataPath(),
          NODE_ENV: app.isPackaged ? 'production' : 'development',
        },
        detached: false,
      });

      this.worker.on('message', (message) => {
        log.info('[ServiceManager] 收到服务消息:', message);
      });

      this.worker.on('stdout', (data) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) {
          if (line) console.log(`[Service] ${line}`);
        }
      });

      this.worker.on('stderr', (data) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) {
          if (line) console.error(`[Service] ${line}`);
        }
      });

      this.worker.on('exit', (code, signal) => {
        log.info(`[ServiceManager] 服务进程退出，代码: ${code}, 信号: ${signal}`);
        this.worker = null;

        if (!this.isShuttingDown) {
          this.restartAttempts++;
          if (this.restartAttempts <= this.MAX_RESTART_ATTEMPTS) {
            log.warn(`[ServiceManager] 服务意外退出，${this.RESTART_DELAY / 1000}秒后尝试重启 (${this.restartAttempts}/${this.MAX_RESTART_ATTEMPTS})...`);
            setTimeout(() => this.start(), this.RESTART_DELAY);
          } else {
            log.error('[ServiceManager] 服务重启次数过多，停止自动重启');
          }
        }
      });

      this.worker.on('error', (error) => {
        log.error('[ServiceManager] 服务进程错误:', error);
      });

      this.restartAttempts = 0;
      log.info('[ServiceManager] 服务进程已启动');
      return true;

    } catch (error) {
      log.error('[ServiceManager] 启动服务进程失败:', error);
      return false;
    }
  }

  /**
   * 停止服务进程
   */
  stop(): void {
    this.isShuttingDown = true;
    if (this.worker) {
      log.info('[ServiceManager] 停止服务进程...');
      // 发送停止指令而不是 kill，让服务优雅退出
      this.worker.send({ type: 'stop' });
      setTimeout(() => {
        if (this.worker && !this.worker.killed) {
          this.worker.kill('SIGTERM');
        }
        this.worker = null;
      }, 3000);
    }
  }

  /**
   * 发送消息到服务进程
   */
  send(message: object): void {
    if (this.worker && this.worker.connected) {
      this.worker.send(message);
    } else {
      log.warn('[ServiceManager] 服务进程未连接，无法发送消息');
    }
  }

  /**
   * 检查服务是否在运行
   */
  isRunning(): boolean {
    return this.worker !== null && this.worker.connected;
  }
}
