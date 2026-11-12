/**
 * AI providers a user can connect with their own API key. Safe to import in the browser.
 * `model` is only the suggested default — providers rename models often, so the field stays editable.
 */

export const AI_PROVIDERS = {
  anthropic: { label: "Claude (Anthropic)", model: "claude-opus-5-5", keysUrl: "https://platform.claude.com/settings/keys" },
  openai: { label: "ChatGPT (OpenAI)", model: "gpt-5.6-terra", keysUrl: "https://platform.openai.com/api-keys" },
  deepseek: { label: "DeepSeek", model: "deepseek-v4-flash", keysUrl: "https://platform.deepseek.com/api_keys" },
  gemini: { label: "Gemini (Google)", model: "gemini-3.6-flash", keysUrl: "https://aistudio.google.com/apikey" },
} as const;

export type AiProvider = keyof typeof AI_PROVIDERS;
export const AI_PROVIDER_IDS = Object.keys(AI_PROVIDERS) as AiProvider[];

/** What the interface may know about the connection — never the key itself. */
export type AiState = { provider: AiProvider; model: string; hint: string; auto: boolean } | null;
export type AiNote = { content: string; model: string; createdAt: string };
export type AiResult<T> = ({ ok: true } & T) | { ok: false; error: string };
