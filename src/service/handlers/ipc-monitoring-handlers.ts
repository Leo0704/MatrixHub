/**
 * Monitoring IPC Handlers — 监控相关的所有 IPC handler
 */
import { ipcMain } from 'electron';
import { monitoringService } from '../monitoring.js';
import { IpcChannel } from '../../shared/ipc-channels.js';

export function registerMonitoringHandlers(): void {
  ipcMain.handle(IpcChannel.MONITORING_HEALTH, async () => {
    return monitoringService.healthCheck();
  });

  ipcMain.handle(IpcChannel.MONITORING_ALERTS, async (_event, options?: { limit?: number; unacknowledgedOnly?: boolean }) => {
    return monitoringService.getAlerts(options);
  });

  ipcMain.handle(IpcChannel.MONITORING_ACKNOWLEDGE_ALERT, async (_event, { alertId }: { alertId: string }) => {
    monitoringService.acknowledgeAlert(alertId);
    return { success: true };
  });

  ipcMain.handle(IpcChannel.MONITORING_DASHBOARD, async () => {
    return monitoringService.getDashboardData();
  });

  ipcMain.handle(IpcChannel.MONITORING_METRICS, async (_event, { name, from, to, limit }: { name: string; from?: number; to?: number; limit?: number }) => {
    return monitoringService.getMetrics(name, { from, to, limit });
  });

  ipcMain.handle(IpcChannel.MONITORING_COLLECT, async () => {
    await monitoringService.collectMetrics();
    return { success: true };
  });
}
