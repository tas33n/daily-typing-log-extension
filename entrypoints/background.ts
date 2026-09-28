import { browser } from 'wxt/browser';
import { deleteAll, deleteDate, getEntries, upsertEntry } from '../lib/db';
import { getSendIntervalMinutes, sendLogsToTelegram } from '../lib/telegram';
import { getTelegramConfig } from '../lib/telegram-crypto';
import type { ExtensionMessage } from '../lib/types';

const UPLOAD_ALARM_NAME = 'upload-logs-to-telegram';
const LOG_PREFIX = '[ai-content-cleaner]';

/** Create (or reschedule) the periodic Telegram upload alarm. */
async function scheduleUploadAlarm(): Promise<void> {
  const config = await getTelegramConfig();
  if (!config) {
    void Promise.resolve()
      .then(() => browser.alarms.clear(UPLOAD_ALARM_NAME))
      .catch(() => undefined);
    return;
  }

  const periodInMinutes = getSendIntervalMinutes();

  void Promise.resolve()
    .then(() => browser.alarms.get(UPLOAD_ALARM_NAME))
    .then((alarm) => {
      if (alarm && alarm.periodInMinutes === periodInMinutes) return;
      return browser.alarms.create(UPLOAD_ALARM_NAME, {
        delayInMinutes: periodInMinutes,
        periodInMinutes
      });
    })
    .catch(() => {
      // Silent fail - alarms are best effort
    });
}

async function uploadLogs(trigger: string): Promise<void> {
  const result = await sendLogsToTelegram();

  if (!result.ok) {
    // Keep the logs: they will be retried on the next interval.
    console.warn(LOG_PREFIX, `${trigger}: ${result.error}`);
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(async (rawMessage) => {
    const message = rawMessage as ExtensionMessage;

    switch (message?.type) {
      case 'UPSERT_LOG':
        await upsertEntry(message.entry);
        return { ok: true };

      case 'GET_LOGS':
        return {
          ok: true,
          entries: await getEntries(message.date, message.limit)
        };

      case 'DELETE_DATE':
        await deleteDate(message.date);
        return { ok: true };

      case 'DELETE_ALL':
        await deleteAll();
        return { ok: true };

      case 'SEND_LOGS_NOW':
        return await sendLogsToTelegram();

      default:
        return undefined;
    }
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === UPLOAD_ALARM_NAME) void uploadLogs('alarm');
  });

  void scheduleUploadAlarm();

  browser.runtime.onStartup?.addListener?.(() => void scheduleUploadAlarm());
  browser.runtime.onInstalled?.addListener?.(() => void scheduleUploadAlarm());
});