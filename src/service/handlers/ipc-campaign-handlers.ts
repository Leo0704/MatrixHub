import { ipcMain } from 'electron';
import { IpcChannel } from '../../shared/ipc-channels.js';
import { launchCampaign, handleFeedback, getCampaignProgress } from '../campaign-manager.js';
import { listCampaigns, getCampaign } from '../campaign-store.js';
import { scrapeProductInfo } from '../scraper/product-scraper.js';
import type { CampaignStatus } from '../../shared/types.js';
import log from 'electron-log';

export function registerCampaignHandlers(): void {
  // 启动推广活动
  ipcMain.handle(IpcChannel.CAMPAIGN_LAUNCH, async (_event, params) => {
    try {
      log.info('[IPC] campaign:launch', params);
      const campaign = await launchCampaign(params);
      return { success: true, campaign };
    } catch (error) {
      log.error('[IPC] campaign:launch error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取单个推广活动
  ipcMain.handle(IpcChannel.CAMPAIGN_GET, async (_event, campaignId: string) => {
    try {
      const campaign = getCampaign(campaignId);
      return { success: true, campaign };
    } catch (error) {
      log.error('[IPC] campaign:get error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取推广活动列表
  ipcMain.handle(IpcChannel.CAMPAIGN_LIST, async (_event, status?: CampaignStatus) => {
    try {
      const campaigns = listCampaigns(status);
      return { success: true, campaigns };
    } catch (error) {
      log.error('[IPC] campaign:list error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 用户反馈
  ipcMain.handle(IpcChannel.CAMPAIGN_FEEDBACK, async (_event, campaignId: string, feedback: 'good' | 'bad') => {
    try {
      log.info('[IPC] campaign:feedback', campaignId, feedback);
      await handleFeedback(campaignId, feedback);
      return { success: true };
    } catch (error) {
      log.error('[IPC] campaign:feedback error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 取消推广活动
  ipcMain.handle(IpcChannel.CAMPAIGN_CANCEL, async (_event, campaignId: string) => {
    try {
      const { updateCampaignStatus } = await import('../campaign-store.js');
      updateCampaignStatus(campaignId, 'failed');
      return { success: true };
    } catch (error) {
      log.error('[IPC] campaign:cancel error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 产品信息抓取
  ipcMain.handle(IpcChannel.CAMPAIGN_SCRAPE, async (_event, url: string) => {
    try {
      log.info('[IPC] campaign:scrape', url);
      const result = await scrapeProductInfo(url);
      return result;
    } catch (error) {
      log.error('[IPC] campaign:scrape error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  log.info('[IPC] Campaign handlers registered');
}