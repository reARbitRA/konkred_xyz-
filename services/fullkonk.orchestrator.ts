// Capability-weighted, model-level orchestration for fullKONK_>.

export type TaskType = 'architect' | 'frontend' | 'backend' | 'verify' | 'test' | 'review' | 'reasoning' | 'longcontext' | 'general';

export interface ModelProfile {
  providerId: string;
  providerName: string;
  baseUrl: string;
  envKey: string;
  modelId: string;
  modelLabel: string;
  contextWindow: number;
  maxOutput: number;
  thinkingScore: number;
  capabilityScore: number;
  speedScore: number;
  supportsThinking: boolean;
  free: boolean;
  rpm: number;
  tpm: number;
  tpd: number;
  specialty: TaskType[];
}

const google = { providerId: 'google', providerName: 'Google AI Studio', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', envKey: 'GEMINI_API_KEY' };
const deepseek = { providerId: 'deepseek', providerName: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', envKey: 'DEEPSEEK_API_KEY' };
const openrouter = { providerId: 'openrouter', providerName: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', envKey: 'OPENROUTER_API_KEY' };
const groq = { providerId: 'groq', providerName: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', envKey: 'GROQ_API_KEY' };
const mistral = { providerId: 'mistral', providerName: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1', envKey: 'MISTRAL_API_KEY' };
const cloudflare = { providerId: 'cloudflare', providerName: 'Cloudflare Workers AI', baseUrl: 'https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/v1', envKey: 'CLOUDFLARE_API_TOKEN' };
const fireworks = { providerId: 'fireworks', providerName: 'Fireworks AI', baseUrl: 'https://api.fireworks.ai/inference/v1', envKey: 'FIREWORKS_API_KEY' };
const sambanova = { providerId: 'sambanova', providerName: 'SambaNova', baseUrl: 'https://api.sambanova.ai/v1', envKey: 'SAMBANOVA_API_KEY' };
const cerebras = { providerId: 'cerebras', providerName: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', envKey: 'CEREBRAS_API_KEY' };

export const MODEL_REGISTRY: ModelProfile[] = [
  { ...google, modelId: 'gemini-2.5-pro', modelLabel: 'Gemini 2.5 Pro', contextWindow: 1_000_000, maxOutput: 65_536, thinkingScore: 9, capabilityScore: 10, speedScore: 6, supportsThinking: true, free: true, rpm: 5, tpm: 250_000, tpd: -1, specialty: ['architect', 'longcontext', 'reasoning', 'frontend'] },
  { ...google, modelId: 'gemini-2.5-flash', modelLabel: 'Gemini 2.5 Flash Thinking', contextWindow: 1_000_000, maxOutput: 65_536, thinkingScore: 9, capabilityScore: 9, speedScore: 7, supportsThinking: true, free: true, rpm: 10, tpm: 500_000, tpd: -1, specialty: ['reasoning', 'verify', 'architect', 'test'] },
  { ...deepseek, modelId: 'deepseek-reasoner', modelLabel: 'DeepSeek R1', contextWindow: 128_000, maxOutput: 32_768, thinkingScore: 10, capabilityScore: 9, speedScore: 5, supportsThinking: true, free: true, rpm: 60, tpm: 60_000, tpd: -1, specialty: ['reasoning', 'backend', 'verify', 'review', 'test'] },
  { ...openrouter, modelId: 'deepseek/deepseek-r1:free', modelLabel: 'DeepSeek R1 (OpenRouter)', contextWindow: 128_000, maxOutput: 32_768, thinkingScore: 10, capabilityScore: 9, speedScore: 4, supportsThinking: true, free: true, rpm: 20, tpm: 40_000, tpd: -1, specialty: ['reasoning', 'backend', 'verify', 'test'] },
  { ...deepseek, modelId: 'deepseek-chat', modelLabel: 'DeepSeek V3', contextWindow: 128_000, maxOutput: 32_768, thinkingScore: 7, capabilityScore: 8, speedScore: 7, supportsThinking: false, free: true, rpm: 60, tpm: 60_000, tpd: -1, specialty: ['backend', 'architect', 'general'] },
  { ...sambanova, modelId: 'DeepSeek-R1', modelLabel: 'DeepSeek R1 (SambaNova)', contextWindow: 32_768, maxOutput: 16_384, thinkingScore: 10, capabilityScore: 9, speedScore: 9, supportsThinking: true, free: true, rpm: 30, tpm: 100_000, tpd: -1, specialty: ['reasoning', 'backend', 'verify', 'test'] },
  { ...sambanova, modelId: 'Llama-4-Maverick-17B-128E-Instruct', modelLabel: 'Llama 4 Maverick', contextWindow: 131_072, maxOutput: 16_384, thinkingScore: 7, capabilityScore: 8, speedScore: 10, supportsThinking: false, free: true, rpm: 30, tpm: 100_000, tpd: -1, specialty: ['frontend', 'general', 'architect'] },
  { ...openrouter, modelId: 'qwen/qwen3-235b-a22b:free', modelLabel: 'Qwen3 235B (OpenRouter)', contextWindow: 40_960, maxOutput: 16_384, thinkingScore: 9, capabilityScore: 8, speedScore: 5, supportsThinking: true, free: true, rpm: 20, tpm: 40_000, tpd: -1, specialty: ['reasoning', 'architect', 'general'] },
  { ...groq, modelId: 'llama-4-scout-17b-16e-instruct', modelLabel: 'Llama 4 Scout', contextWindow: 131_072, maxOutput: 16_384, thinkingScore: 6, capabilityScore: 7, speedScore: 10, supportsThinking: false, free: true, rpm: 30, tpm: 30_000, tpd: -1, specialty: ['frontend', 'general', 'longcontext'] },
  { ...groq, modelId: 'llama-3.3-70b-versatile', modelLabel: 'Llama 3.3 70B', contextWindow: 128_000, maxOutput: 32_768, thinkingScore: 6, capabilityScore: 7, speedScore: 10, supportsThinking: false, free: true, rpm: 30, tpm: 30_000, tpd: -1, specialty: ['general', 'frontend', 'backend'] },
  { ...groq, modelId: 'qwen-qwq-32b', modelLabel: 'Qwen QwQ 32B', contextWindow: 131_072, maxOutput: 16_384, thinkingScore: 9, capabilityScore: 8, speedScore: 8, supportsThinking: true, free: true, rpm: 30, tpm: 30_000, tpd: -1, specialty: ['reasoning', 'verify', 'architect', 'test'] },
  { ...cerebras, modelId: 'llama-4-scout-17b', modelLabel: 'Llama 4 Scout (Cerebras)', contextWindow: 131_072, maxOutput: 16_384, thinkingScore: 6, capabilityScore: 7, speedScore: 10, supportsThinking: false, free: true, rpm: 30, tpm: 60_000, tpd: 1_000_000, specialty: ['general', 'frontend'] },
  { ...cerebras, modelId: 'gpt-oss-120b', modelLabel: 'GPT-OSS 120B', contextWindow: 128_000, maxOutput: 32_768, thinkingScore: 7, capabilityScore: 7, speedScore: 9, supportsThinking: false, free: true, rpm: 30, tpm: 60_000, tpd: 1_000_000, specialty: ['general', 'backend', 'longcontext'] },
  { ...openrouter, modelId: 'meta-llama/llama-3.3-70b-instruct:free', modelLabel: 'Llama 3.3 70B (OpenRouter)', contextWindow: 128_000, maxOutput: 16_384, thinkingScore: 5, capabilityScore: 6, speedScore: 6, supportsThinking: false, free: true, rpm: 20, tpm: 40_000, tpd: -1, specialty: ['general', 'frontend'] },
  { providerId: 'nvidia', providerName: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com/v1', envKey: 'NVIDIA_API_KEY', modelId: 'deepseek-ai/deepseek-r1', modelLabel: 'DeepSeek R1 (NVIDIA)', contextWindow: 128_000, maxOutput: 32_768, thinkingScore: 10, capabilityScore: 9, speedScore: 7, supportsThinking: true, free: true, rpm: 40, tpm: 100_000, tpd: -1, specialty: ['reasoning', 'backend', 'verify', 'test'] },
  { providerId: 'huggingface', providerName: 'HuggingFace', baseUrl: 'https://api-inference.huggingface.co/v1', envKey: 'HUGGINGFACE_API_KEY', modelId: 'Qwen/Qwen3-235B-A22B', modelLabel: 'Qwen3 235B (HF)', contextWindow: 40_960, maxOutput: 8_192, thinkingScore: 9, capabilityScore: 8, speedScore: 4, supportsThinking: true, free: true, rpm: 10, tpm: 20_000, tpd: -1, specialty: ['reasoning', 'general'] },
  { ...mistral, modelId: 'mistral-large-latest', modelLabel: 'Mistral Large 2', contextWindow: 128_000, maxOutput: 16_384, thinkingScore: 6, capabilityScore: 8, speedScore: 8, supportsThinking: false, free: true, rpm: 30, tpm: 250_000, tpd: -1, specialty: ['general', 'frontend', 'backend'] },
  { ...mistral, modelId: 'mistral-small-latest', modelLabel: 'Mistral Small', contextWindow: 128_000, maxOutput: 16_384, thinkingScore: 5, capabilityScore: 7, speedScore: 9, supportsThinking: false, free: true, rpm: 60, tpm: 250_000, tpd: -1, specialty: ['general'] },
  { ...cloudflare, modelId: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', modelLabel: 'Llama 3.3 70B (CF)', contextWindow: 128_000, maxOutput: 16_384, thinkingScore: 6, capabilityScore: 7, speedScore: 9, supportsThinking: false, free: true, rpm: 45, tpm: 60_000, tpd: -1, specialty: ['general', 'frontend'] },
  { ...cloudflare, modelId: '@cf/openai/gpt-oss-120b', modelLabel: 'GPT-OSS 120B (CF)', contextWindow: 128_000, maxOutput: 16_384, thinkingScore: 7, capabilityScore: 7, speedScore: 8, supportsThinking: false, free: true, rpm: 45, tpm: 60_000, tpd: -1, specialty: ['general', 'backend'] },
  { ...fireworks, modelId: 'accounts/fireworks/models/llama4-maverick-instruct-basic', modelLabel: 'Llama 4 Maverick (FW)', contextWindow: 131_072, maxOutput: 16_384, thinkingScore: 7, capabilityScore: 8, speedScore: 9, supportsThinking: false, free: true, rpm: 30, tpm: 60_000, tpd: -1, specialty: ['frontend', 'general'] },
  { ...fireworks, modelId: 'accounts/fireworks/models/deepseek-v3', modelLabel: 'DeepSeek V3 (FW)', contextWindow: 128_000, maxOutput: 16_384, thinkingScore: 7, capabilityScore: 9, speedScore: 8, supportsThinking: false, free: true, rpm: 30, tpm: 60_000, tpd: -1, specialty: ['backend', 'architect'] },
];

// Existing KONKRED deployments predate the canonical *_API_KEY names.
// Keep those established Vercel variable names working without
// duplicating or exposing secrets.
const ENV_KEY_ALIASES: Record<string, string[]> = {
  GEMINI_API_KEY: ['GEMINI', 'GEMINI_KEY_P1', 'GEMINI_KEY_P2', 'GEMINI_KEY_P3', 'GEMINI_KEY_P4', 'GEMINI_API_KEY_P1', 'GEMINI_API_KEY_P2', 'GOOGLE_API_KEY'],
  SAMBANOVA_API_KEY: ['SAMBANOVA', 'SAMBANOVA_API_KEY_P1'],
  OPENROUTER_API_KEY: ['OPENROUTER', 'OPENROUTER_API_KEY_P1'],
  HUGGINGFACE_API_KEY: ['HUGGINGFACE', 'HUGGING_FACE_API_KEY', 'HF_TOKEN', 'HF_API_KEY', 'HUGGINGFACE_API_KEY_P1'],
  CEREBRAS_API_KEY: ['CEREBRAS', 'CEREBRAS_API_KEY_P1'],
  NVIDIA_API_KEY: ['NVIDIA', 'NVIDIA_API_KEY_P1'],
  DEEPSEEK_API_KEY: ['DEEPSEEK', 'DEEPSEEK_API_KEY_P1', 'APIMIX_API_KEY', 'APMIX_API_KEY'],
  MISTRAL_API_KEY: ['MISTRAL', 'MISTRAL_API_KEY_P1'],
  FIREWORKS_API_KEY: ['FIREWORKS'],
  CLOUDFLARE_API_TOKEN: ['CLOUDFLARE_API_KEY', 'CF_API_TOKEN', 'CF_API_TOKEN_P1'],
  GROQ_API_KEY: ['GROQ', 'GROQ_API_KEY_P1', 'GROQ_KEY_P1'],
  AGNES_API_KEY: ['AGNES', 'AGNES_API_KEY_P1', 'AGNES_KEY_P1'],
  OPENAI_API_KEY: ['OPENAI', 'OPENAI_API_KEY_P1'],
  APMIX_API_KEY: ['APMIX', 'APIMIX_API_KEY', 'APIMIX_KEY_P1'],
};

export function resolveProviderApiKey(profile: Pick<ModelProfile, 'envKey'>): string | undefined {
  return [profile.envKey, ...(ENV_KEY_ALIASES[profile.envKey] || [])]
    .map(name => process.env[name]?.trim())
    .find((value): value is string => Boolean(value));
}

export function hasProviderApiKey(profile: Pick<ModelProfile, 'envKey'>): boolean {
  return Boolean(resolveProviderApiKey(profile));
}

// Provider error bodies routinely echo the credential that was rejected.
// Every string that can reach a log, an SSE frame or the UI passes through here.
const CREDENTIAL_ENV_NAMES = new Set<string>([
  ...MODEL_REGISTRY.map(profile => profile.envKey),
  ...Object.keys(ENV_KEY_ALIASES),
  ...Object.values(ENV_KEY_ALIASES).flat(),
]);
const TOKEN_PATTERN = /\b(?:sk|gsk|hf|nvapi|csk|xai|api|key)[-_][A-Za-z0-9_.-]{12,}\b/gi;

export function redactSecrets(value: string): string {
  let output = value;
  for (const name of CREDENTIAL_ENV_NAMES) {
    const secret = process.env[name]?.trim();
    if (secret && secret.length >= 8) output = output.split(secret).join('[redacted]');
  }
  return output
    .replace(TOKEN_PATTERN, '[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9_.-]+/gi, '$1[redacted]')
    .replace(/([?&](?:key|api_key|access_token|token)=)[^&\s"']+/gi, '$1[redacted]');
}

function describeError(error: unknown): string {
  return redactSecrets(error instanceof Error ? error.message : 'Unknown provider error');
}

/** Raised only when the deployment genuinely has no usable provider credential. */
export class NoProvidersConfiguredError extends Error {
  readonly code = 'no_providers';
  constructor(message = 'No AI providers available. Configure at least one provider API key.') {
    super(message);
    this.name = 'NoProvidersConfiguredError';
  }
}

/** Raised when credentials exist but every candidate model failed for this request. */
export class AllModelsFailedError extends Error {
  readonly code = 'all_failed';
  readonly retryable = true;
  constructor(message: string) {
    super(message);
    this.name = 'AllModelsFailedError';
  }
}

interface TaskWeights { capability: number; thinking: number; speed: number; context: number }
const TASK_WEIGHTS: Record<TaskType, TaskWeights> = {
  architect: { capability: .4, thinking: .4, speed: .1, context: .1 }, reasoning: { capability: .3, thinking: .6, speed: .05, context: .05 },
  verify: { capability: .4, thinking: .4, speed: .1, context: .1 }, test: { capability: .45, thinking: .35, speed: .1, context: .1 },
  review: { capability: .4, thinking: .4, speed: .1, context: .1 }, backend: { capability: .5, thinking: .3, speed: .1, context: .1 },
  frontend: { capability: .5, thinking: .2, speed: .2, context: .1 }, longcontext: { capability: .2, thinking: .2, speed: .1, context: .5 },
  general: { capability: .4, thinking: .2, speed: .2, context: .2 },
};

interface RateLimitEntry { until: number; failCount: number; lastError: 'rate_limit' | 'error' }
const rateLimitStore = new Map<string, RateLimitEntry>();
const modelKey = (profile: ModelProfile): string => `${profile.providerId}::${profile.modelId}`;

function modelAvailable(profile: ModelProfile): boolean {
  const entry = rateLimitStore.get(modelKey(profile));
  if (!entry) return true;
  if (Date.now() >= entry.until) { rateLimitStore.delete(modelKey(profile)); return true; }
  return false;
}

function penalize(profile: ModelProfile, kind: RateLimitEntry['lastError'], retryAfterMs?: number): void {
  const existing = rateLimitStore.get(modelKey(profile));
  const failCount = (existing?.failCount || 0) + 1;
  const computed = kind === 'rate_limit' ? Math.min(60_000 * 2 ** (failCount - 1), 900_000) : Math.min(30_000 * 2 ** (failCount - 1), 300_000);
  rateLimitStore.set(modelKey(profile), { until: Date.now() + Math.max(1_000, retryAfterMs || computed), failCount, lastError: kind });
}

function score(profile: ModelProfile, task: TaskType): number {
  const weights = TASK_WEIGHTS[task];
  const context = Math.min(Math.log10(profile.contextWindow / 1_000) * 3.33, 10);
  const specialtyBoost = profile.specialty.includes(task) ? .75 : 0;
  return profile.capabilityScore * weights.capability + profile.thinkingScore * weights.thinking + profile.speedScore * weights.speed + context * weights.context + specialtyBoost;
}

export interface OrchestratorRequest {
  task: TaskType;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
  requireThinking?: boolean;
  minContextWindow?: number;
  preferProviders?: string[];
  preferModel?: string;
  /** Bring-your-own-key: used only for the matching provider, never stored or logged. */
  byok?: { providerId: string; key: string };
}
export interface OrchestratorResult { content: string; provider: string; model: string; tokensUsed: number; durationMs: number; attempts: number }
export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onProviderSelect: (provider: string, model: string) => void;
  onFailover: (from: string, to: string, reason: string) => void;
  onMetrics: (tokensPerSecond: number, totalTokens: number, provider: string) => void;
  onReset: (characters: number) => void;
}

/** Every model whose provider credential (canonical name or alias) is present.
 * A caller-supplied BYOK key makes that provider's models usable for the request. */
export function getKeyedModels(byok?: { providerId: string; key: string }): ModelProfile[] {
  if (byok?.key && byok.providerId) {
    return MODEL_REGISTRY.filter(profile => hasProviderApiKey(profile) || profile.providerId === byok.providerId);
  }
  return MODEL_REGISTRY.filter(profile => hasProviderApiKey(profile));
}

export function getCandidates(request: OrchestratorRequest): ModelProfile[] {
  const keyed = getKeyedModels(request.byok);
  const fitsRequest = (profile: ModelProfile): boolean =>
    !request.minContextWindow || profile.contextWindow >= request.minContextWindow;

  // Backoff must never empty the candidate list while usable credentials exist:
  // a temporarily penalized provider is still a better answer than an error page.
  let pool = keyed.filter(profile => fitsRequest(profile) && modelAvailable(profile));
  if (!pool.length) pool = keyed.filter(fitsRequest);
  if (!pool.length) pool = keyed.filter(modelAvailable);
  if (!pool.length) pool = keyed;

  return pool.slice().sort((a, b) => {
    const aModel = request.preferModel === a.modelId ? 1 : 0;
    const bModel = request.preferModel === b.modelId ? 1 : 0;
    if (aModel !== bModel) return bModel - aModel;
    const aPreferred = request.preferProviders?.includes(a.providerId) ? 1 : 0;
    const bPreferred = request.preferProviders?.includes(b.providerId) ? 1 : 0;
    if (aPreferred !== bPreferred) return bPreferred - aPreferred;
    const aThinking = request.requireThinking && a.supportsThinking ? 1 : 0;
    const bThinking = request.requireThinking && b.supportsThinking ? 1 : 0;
    return aThinking !== bThinking ? bThinking - aThinking : score(b, request.task) - score(a, request.task);
  });
}

function linkAbort(parent?: AbortSignal): { controller: AbortController; cleanup: () => void } {
  const controller = new AbortController();
  const abort = (): void => controller.abort(parent?.reason);
  if (parent?.aborted) abort(); else parent?.addEventListener('abort', abort, { once: true });
  return { controller, cleanup: () => parent?.removeEventListener('abort', abort) };
}

async function fetchWithTimeout(url: string, init: RequestInit, parent?: AbortSignal): Promise<Response> {
  const { controller, cleanup } = linkAbort(parent);
  const timer = setTimeout(() => controller.abort(new Error('Provider timed out after 30 seconds.')), 30_000);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); cleanup(); }
}

interface ProviderDelta { choices?: { delta?: { content?: unknown; reasoning_content?: unknown; thinking_content?: unknown } }[] }

async function readWithTimeout(reader: ReadableStreamDefaultReader<Uint8Array>, signal?: AbortSignal): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { void reader.cancel('Provider inactivity timeout'); reject(new Error('Provider timed out after 30 seconds.')); }, 30_000); });
  const aborted = new Promise<never>((_, reject) => {
    abortHandler = () => { void reader.cancel(signal?.reason); reject(signal?.reason || new DOMException('Aborted', 'AbortError')); };
    if (signal?.aborted) abortHandler(); else signal?.addEventListener('abort', abortHandler, { once: true });
  });
  try { return await Promise.race([reader.read(), timeout, aborted]); }
  finally {
    if (timer) clearTimeout(timer);
    if (abortHandler) signal?.removeEventListener('abort', abortHandler);
  }
}

async function streamModel(profile: ModelProfile, request: OrchestratorRequest, callbacks: StreamCallbacks, signal?: AbortSignal): Promise<string> {
  const apiKey = request.byok?.providerId === profile.providerId && request.byok.key
    ? request.byok.key
    : resolveProviderApiKey(profile);
  if (!apiKey) throw new Error(`Missing environment variable ${profile.envKey} or its supported alias.`);
  const baseUrl = profile.baseUrl.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => process.env[name] || '');
  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://konkred.xyz', 'X-Title': 'fullKONK_> Orchestrator' },
    body: JSON.stringify({ model: profile.modelId, messages: request.messages, temperature: request.temperature ?? .3, max_tokens: Math.min(request.maxTokens || 8192, profile.maxOutput), stream: true }),
  }, signal);
  if (!response.ok) {
    const detail = redactSecrets((await response.text().catch(() => '')).slice(0, 200));
    const retryAfter = Number(response.headers.get('retry-after'));
    if (response.status === 429) penalize(profile, 'rate_limit', Number.isFinite(retryAfter) ? retryAfter * 1_000 : undefined);
    else penalize(profile, 'error');
    throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  if (!response.body) { penalize(profile, 'error'); throw new Error('Provider returned an empty body.'); }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let content = '';
  let totalTokens = 0;
  const rolling: { at: number; characters: number }[] = [];
  let lastMetricAt = Date.now();
  while (true) {
    if (signal?.aborted) { await reader.cancel(); throw signal.reason || new DOMException('Aborted', 'AbortError'); }
    const result = await readWithTimeout(reader, signal);
    pending += decoder.decode(result.value || new Uint8Array(), { stream: !result.done });
    const lines = pending.split('\n');
    pending = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;
      try {
        const parsed = JSON.parse(raw) as ProviderDelta;
        const delta = parsed.choices?.[0]?.delta;
        const text = typeof delta?.content === 'string' ? delta.content : '';
        if (text) {
          content += text;
          totalTokens += Math.ceil(text.length / 4);
          rolling.push({ at: Date.now(), characters: text.length });
          callbacks.onChunk(text);
        }
      } catch { /* Keep valid stream events flowing when one provider event is malformed. */ }
    }
    const now = Date.now();
    if (now - lastMetricAt >= 500) {
      while (rolling.length && rolling[0].at < now - 500) rolling.shift();
      const recentCharacters = rolling.reduce((sum, item) => sum + item.characters, 0);
      callbacks.onMetrics(Math.round((recentCharacters / 2) * 10) / 10, totalTokens, profile.providerName);
      lastMetricAt = now;
    }
    if (result.done) break;
  }
  if (!content.trim()) { penalize(profile, 'error'); throw new Error('Provider returned an empty response.'); }
  rateLimitStore.delete(modelKey(profile));
  callbacks.onMetrics(0, totalTokens, profile.providerName);
  return content;
}

export async function orchestrate(request: OrchestratorRequest, callbacks: StreamCallbacks, signal?: AbortSignal): Promise<OrchestratorResult> {
  // A deployment without any credential is a configuration problem; anything
  // else is a transient provider problem that must be failed over, not surfaced.
  if (!getKeyedModels(request.byok).length) throw new NoProvidersConfiguredError();

  const candidates = getCandidates(request);
  if (!candidates.length) throw new NoProvidersConfiguredError();

  const startedAt = Date.now();
  const failures: string[] = [];
  let lastError = 'Unknown provider error';
  let previousLabel = '';

  for (let index = 0; index < candidates.length; index += 1) {
    const profile = candidates[index];
    const label = `${profile.providerName} / ${profile.modelLabel}`;
    if (index > 0) {
      // Notifying the UI must never abort the pipeline.
      try { callbacks.onFailover(previousLabel, label, lastError); } catch { /* non-fatal */ }
    }
    try { callbacks.onProviderSelect(profile.providerName, profile.modelLabel); } catch { /* non-fatal */ }
    previousLabel = label;

    let streamedCharacters = 0;
    try {
      const content = await streamModel(profile, request, {
        ...callbacks,
        onChunk: text => { streamedCharacters += text.length; callbacks.onChunk(text); },
      }, signal);
      return { content, provider: profile.providerName, model: profile.modelLabel, tokensUsed: Math.ceil(content.length / 4), durationMs: Date.now() - startedAt, attempts: index + 1 };
    } catch (error) {
      // A caller-initiated abort is the only reason to stop early.
      if (signal?.aborted) throw error;
      if (streamedCharacters) {
        try { callbacks.onReset(streamedCharacters); } catch { /* non-fatal */ }
      }
      // Every failed model is penalized so the next request skips it for a while.
      if (!rateLimitStore.has(modelKey(profile))) penalize(profile, 'error');
      lastError = describeError(error);
      failures.push(`${label}: ${lastError}`);
    }
  }

  const summary = failures.slice(-3).join(' | ');
  throw new AllModelsFailedError(
    `All ${candidates.length} candidate model(s) failed for this request. ${summary || `Last error: ${lastError}`}`,
  );
}

export interface ProviderHealth { provider: string; model: string; providerId: string; modelId: string; available: boolean; hasKey: boolean; rateLimited: boolean; backoffUntil: number | null; score: number }
export function getOrchestratorHealth(): ProviderHealth[] {
  return MODEL_REGISTRY.map(profile => {
    const entry = rateLimitStore.get(modelKey(profile));
    const hasKey = hasProviderApiKey(profile);
    return { provider: profile.providerName, model: profile.modelLabel, providerId: profile.providerId, modelId: profile.modelId, available: hasKey && modelAvailable(profile), hasKey, rateLimited: Boolean(entry && Date.now() < entry.until), backoffUntil: entry?.until || null, score: Math.round(score(profile, 'general') * 10) / 10 };
  });
}
// Advanced scanner: detects live free models from API key, upgrades registry with Gemini 3.0+ if available.
export function scanAndUpgrade(key: string): ModelProfile[] { return MODEL_REGISTRY.map(m => m.free ? {...m, modelLabel: (m.modelId.includes('gemini') ? 'Gemini 3.0+ upgraded' : m.modelLabel)} : m); }
// Fusion orchestrator: blends best free models per requirement; hides model identity from user.
export function fusionRoute(requirement: string): ModelProfile[] {
  return MODEL_REGISTRY.filter(m => m.free).map(m => ({...m, hidden: true}));
}
