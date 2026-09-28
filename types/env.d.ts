/**
 * Extra environment variables loaded from `.env` files.
 *
 * The `TELEGRAM_` prefix is registered in `wxt.config.ts` (`vite.envPrefix`),
 * so these values are inlined into the bundle at build/dev time.
 */
interface ImportMetaEnv {
  /** Bot token from @BotFather, e.g. `123456789:AA...` */
  readonly TELEGRAM_BOT_TOKEN?: string;
  /** Chat/group/channel id the log files are posted to, e.g. `-1001234567890` */
  readonly TELEGRAM_CHAT_ID?: string;
  /** Upload interval: `30m`, `1h`, `1d` or plain minutes. Default: `1h`. */
  readonly TELEGRAM_SEND_INTERVAL?: string;
}
