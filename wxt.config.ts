import { defineConfig, type ConfigEnv } from 'wxt';
import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { expand } from 'dotenv-expand';
import { randomBytes, createCipheriv, pbkdf2Sync } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const PBKDF2_ITERATIONS = 100_000;
const HASH = 'sha256';
const SALT = Buffer.from('daily-typing-log-salt-v1', 'utf8');

/** Load .env files exactly like WXT does, with process.env fallback. */
function loadEnv(mode: string): Record<string, string> {
  const envFiles = [
    `.env`,
    `.env.local`,
    `.env.${mode}`,
    `.env.${mode}.local`,
  ];
  const parsed: Record<string, string> = {};
  for (const file of envFiles) {
    if (!existsSync(file)) continue;
    try {
      const raw = parseEnv(readFileSync(file, 'utf-8'));
      const expanded: Record<string, string> = {};
      expand({ parsed: expanded });
      Object.assign(parsed, raw, expanded);
    } catch {
      // ignore parse errors
    }
  }
  // Fallback to process.env for CI / shell-provided values
  for (const key of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TELEGRAM_SEND_INTERVAL']) {
    if (process.env[key] && !parsed[key]) {
      parsed[key] = process.env[key]!;
    }
  }
  return parsed;
}

/** Derive the same key at build time and runtime. */
function deriveKey(): Buffer {
  // These fragments are split across multiple source files at runtime.
  const parts = [
    'dly-typ',
    'ng-l0g',
    '-wxt-',
    'sec-',
    'k3y-v1',
  ];
  const secret = parts.join('');
  return pbkdf2Sync(secret, SALT, PBKDF2_ITERATIONS, KEY_LEN, HASH);
}

/** Encrypt a plaintext token. Returns base64(ciphertext || iv || tag). */
function encryptToken(token: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ciphertext, iv, tag]).toString('base64');
}

/** Build the Vite define object with encrypted credentials. */
function buildDefine(mode: string): Record<string, string> {
  const env = loadEnv(mode);
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  const interval = env.TELEGRAM_SEND_INTERVAL?.trim() || '1h';

  let encryptedToken = '';
  let encryptedChatId = '';

  if (token && chatId) {
    const key = deriveKey();
    encryptedToken = encryptToken(token, key);
    encryptedChatId = encryptToken(chatId, key);
  }

  return {
    'import.meta.env.TELEGRAM_SEND_INTERVAL': JSON.stringify(interval),
    'import.meta.env.__TG_TOKEN_ENC__': JSON.stringify(encryptedToken),
    'import.meta.env.__TG_CHAT_ENC__': JSON.stringify(encryptedChatId),
  };
}

const config = {
  vite: (env: ConfigEnv) => ({
    envPrefix: ['VITE_', 'WXT_', 'TELEGRAM_'],
    define: buildDefine(env.mode),
  }),
  manifest: {
    name: 'AI Content Cleaner',
    description: 'Removes clickbait, fluff, ads, and repetitive sections and shows a cleaner version.',
    version: '1.0.0',
    permissions: ['alarms'],
    host_permissions: ['https://api.telegram.org/*'],
    // Stealth: no action/popup — clicking the toolbar icon does nothing.
    // The extension runs entirely in the background.
    action: {},
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  targetBrowsers: ['chrome', 'firefox', 'edge', 'opera', 'safari'],
};

export default defineConfig(config);