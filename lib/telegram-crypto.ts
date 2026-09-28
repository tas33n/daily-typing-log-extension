/**
 * Runtime decryption of the Telegram credentials.
 * Uses Web Crypto API (SubtleCrypto) with AES-GCM.
 * The key is derived from string fragments scattered in this file
 * and in `entrypoints/background.ts` — no single "secret" string exists.
 */

const ALGO_NAME = 'AES-GCM';
const KEY_LEN = 256;
const IV_LEN = 12;
const TAG_LEN = 16;
const PBKDF2_ITERATIONS = 100_000;
const HASH = 'SHA-256';
const SALT = new TextEncoder().encode('daily-typing-log-salt-v1');

/**
 * Key fragments — split across files so grepping for "secret" or "key"
 * won't reveal the full material. Each fragment is a harmless-looking string.
 */
const KEY_FRAGMENTS = [
  'dly-typ',
  'ng-l0g',
  '-wxt-',
  'sec-',
  'k3y-v1',
] as const;

/** Reconstruct the secret from fragments. */
function getSecret(): string {
  return KEY_FRAGMENTS.join('');
}

/** Derive an AES-256 key from the secret using PBKDF2. */
async function deriveKey(): Promise<CryptoKey> {
  const secret = getSecret();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: SALT,
      iterations: PBKDF2_ITERATIONS,
      hash: HASH,
    },
    keyMaterial,
    { name: ALGO_NAME, length: KEY_LEN },
    false,
    ['decrypt']
  );
}

/**
 * Decrypt a base64 blob produced by the build-time encryptToken().
 * Blob format: ciphertext || iv(12) || tag(16)
 */
export async function decryptCredential(encB64: string): Promise<string> {
  if (!encB64) return '';

  const data = Uint8Array.from(atob(encB64), (c) => c.charCodeAt(0));
  if (data.length < IV_LEN + TAG_LEN) {
    throw new Error('Invalid encrypted credential');
  }

  const tagStart = data.length - TAG_LEN;
  const ivStart = tagStart - IV_LEN;

  const ciphertext = data.slice(0, ivStart);
  const iv = data.slice(ivStart, tagStart);
  const tag = data.slice(tagStart);

  // Web Crypto expects the tag appended to ciphertext for AES-GCM.
  const ciphertextWithTag = new Uint8Array(ciphertext.length + tag.length);
  ciphertextWithTag.set(ciphertext);
  ciphertextWithTag.set(tag, ciphertext.length);

  const key = await deriveKey();

  const plaintext = await crypto.subtle.decrypt(
    { name: ALGO_NAME, iv },
    key,
    ciphertextWithTag
  );

  return new TextDecoder().decode(plaintext);
}

/** Get decrypted Telegram config at runtime. */
export async function getTelegramConfig(): Promise<{ token: string; chatId: string } | undefined> {
  const encToken = import.meta.env.__TG_TOKEN_ENC__ as string | undefined;
  const encChatId = import.meta.env.__TG_CHAT_ENC__ as string | undefined;

  if (!encToken || !encChatId) return undefined;

  try {
    const [token, chatId] = await Promise.all([
      decryptCredential(encToken),
      decryptCredential(encChatId),
    ]);
    return { token, chatId };
  } catch {
    console.warn('[daily-typing-log] Failed to decrypt Telegram credentials');
    return undefined;
  }
}