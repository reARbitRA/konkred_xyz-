import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAuth } from 'firebase/auth';
import AnalyticsDashboard from '../components/fullkonk/AnalyticsDashboard';
import ChatPanel from '../components/fullkonk/ChatPanel';
import CodeOutput from '../components/fullkonk/CodeOutput';
import LiveEnvironment from '../components/fullkonk/LiveEnvironment';
import { getPlaybooks, composePlaybook } from '../services/fullkonk.prompts';
import GitHubExportModal from '../components/fullkonk/GitHubExportModal';
import PipelineStatus, { PipelineMetrics } from '../components/fullkonk/PipelineStatus';
import SessionSidebar from '../components/fullkonk/SessionSidebar';
import { createSession, FKSession, generateSessionTitle, updateSession } from '../services/fullkonk.sessions';
import { logUsage } from '../services/fullkonk.analytics';
import { saveProject } from '../services/fullkonk.projects';
import { SSEParser, parseStreamChunk } from '../lib/sse';
import { GatewayError, readGatewayError } from '../lib/gateway-client';
import { AttachedCodeFile, BuildMode, FKMessage, FKProject, GeneratedFile, PipelineStage, StreamChunk } from '../types';

const MODES: { id: BuildMode; label: string }[] = [
  { id: 'fullstack', label: 'FULL-STACK' }, { id: 'frontend', label: 'FRONTEND' }, { id: 'backend', label: 'BACKEND' }, { id: 'review', label: 'REVIEW' },
];
const PROVIDER_SIGNUP: Record<string, string> = {
  groq: 'https://console.groq.com/keys', cerebras: 'https://cloud.cerebras.ai/', google: 'https://aistudio.google.com/apikey',
  sambanova: 'https://cloud.sambanova.ai/apis', deepseek: 'https://platform.deepseek.com/api_keys', openrouter: 'https://openrouter.ai/settings/keys',
  huggingface: 'https://huggingface.co/settings/tokens', mistral: 'https://console.mistral.ai/api-keys/', nvidia: 'https://build.nvidia.com/',
  fireworks: 'https://fireworks.ai/account/api-keys', cloudflare: 'https://dash.cloudflare.com/',
};
const EXTENSIONS: Record<string, string> = { ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', html: 'html', css: 'css', json: 'json', prisma: 'prisma', sql: 'sql', yaml: 'yaml', yml: 'yaml', sh: 'bash', bash: 'bash' };
interface ProviderOption { id: string; name: string; hasKey: boolean; models: { id: string; label: string }[] }

/** A pipeline failure that the user may retry, as opposed to a real misconfiguration. */
class RetryablePipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryablePipelineError';
  }
}

function normalizeLanguage(value: string, path: string): string {
  const raw = value.toLowerCase().trim();
  if (raw && raw !== 'text' && raw !== 'plaintext') return EXTENSIONS[raw] || raw;
  const extension = path.split('.').pop()?.toLowerCase() || 'text';
  return EXTENSIONS[extension] || extension;
}

function cleanPath(value: string): string {
  return value.trim().replace(/^['"`]|['"`]$/g, '').replace(/^\.\//, '').replace(/\\/g, '/').replace(/^\/+/, '');
}

export function extractFiles(content: string): GeneratedFile[] {
  const lines = content.split(/\r?\n/);
  const files = new Map<string, GeneratedFile>();
  let inFence = false;
  let marker = '```';
  let language = '';
  let buffer: string[] = [];
  let precedingPath = '';
  let unnamed = 0;
  const pathPattern = /(?:file(?:name)?\s*:\s*|^#{1,6}\s*|^\/\/\s*|^<!--\s*)([\w@+.,()\[\] -]+\/[\w@+.,()\[\]/ -]+|[\w@+(),\[\] -]+\.(?:tsx?|jsx?|css|html?|json|prisma|sql|ya?ml|sh))(?:\s*-->)?\s*$/i;

  for (const line of lines) {
    if (!inFence) {
      const pathMatch = line.trim().match(pathPattern);
      if (pathMatch) precedingPath = cleanPath(pathMatch[1]);
      const opening = line.match(/^\s*(`{3,}|~{3,})([^\s`]*)\s*(.*)$/);
      if (!opening) continue;
      inFence = true;
      marker = opening[1];
      language = opening[2] || '';
      const inlinePath = opening[3].match(/^(?:\/\/\s*|file:\s*)?([^\s]+\.[\w]+)\s*$/i);
      if (inlinePath) precedingPath = cleanPath(inlinePath[1]);
      buffer = [];
      continue;
    }
    if (line.trim() === marker || new RegExp(`^${marker[0]}{${marker.length},}$`).test(line.trim())) {
      inFence = false;
      const firstLinePath = buffer[0]?.match(/^\s*(?:\/\/|#|<!--)\s*(?:file(?:name)?\s*:\s*)?([^\s].*?\.[a-z0-9]+)\s*(?:-->)?\s*$/i);
      let path = firstLinePath ? cleanPath(firstLinePath[1]) : precedingPath;
      if (firstLinePath) buffer.shift();
      const code = buffer.join('\n').trim();
      if (code) {
        if (!path) {
          unnamed += 1;
          const ext = language.toLowerCase() || 'txt';
          path = `generated/output-${unnamed}.${ext === 'typescript' ? 'ts' : ext === 'javascript' ? 'js' : ext}`;
        }
        const normalizedLanguage = normalizeLanguage(language, path);
        files.set(path, { path, content: code, language: normalizedLanguage, isTest: /(?:^|\/)(?:__tests__\/|.*\.(?:test|spec)\.[jt]sx?$)/i.test(path) });
      }
      precedingPath = '';
      buffer = [];
      continue;
    }
    buffer.push(line);
  }
  return [...files.values()];
}

function mergeFiles(base: GeneratedFile[], generated: GeneratedFile[]): GeneratedFile[] {
  const merged = new Map(base.map(file => [file.path, file]));
  generated.forEach(file => merged.set(file.path, file));
  return [...merged.values()];
}

function isStreamChunk(value: unknown): value is StreamChunk {
  if (!value || typeof value !== 'object') return false;
  return typeof (value as { type?: unknown }).type === 'string';
}

async function authHeaders(): Promise<Record<string, string>> {
  const user = getAuth().currentUser;
  const token = user ? await user.getIdToken() : '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function FullKonkPage() {
  const [mode, setMode] = useState<BuildMode>('fullstack');
  const [messages, setMessages] = useState<FKMessage[]>([]);
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [previousFiles, setPreviousFiles] = useState<GeneratedFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [stage, setStage] = useState<PipelineStage>('idle');
  const [stageText, setStageText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [provider, setProvider] = useState('google');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [allProviders, setAllProviders] = useState<ProviderOption[]>([]);
  const [byokKeys, setByokKeys] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('fk-byok') || '{}'); } catch { return {}; }
  });
  const [byokDraft, setByokDraft] = useState('');
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1100px)').matches);
  const [panel, setPanel] = useState<'chat' | 'code' | 'live'>('chat');
  const providerOptions = allProviders.filter(option => option.hasKey || Boolean(byokKeys[option.id]));
  const [temperature, setTemperature] = useState(0.4);
  const [maxTokens, setMaxTokens] = useState(8192);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [liveEnv, setLiveEnv] = useState(true);
  const [metrics, setMetrics] = useState<PipelineMetrics>({ tokensPerSecond: 0, totalTokens: 0, provider: '', elapsedMs: 0 });
  const [attachments, setAttachments] = useState<AttachedCodeFile[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<FKProject | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showGitHub, setShowGitHub] = useState(false);
  const [sidebarRefresh, setSidebarRefresh] = useState(0);
  const [saveState, setSaveState] = useState('SAVE AS PROJECT');
  const [providersLoaded, setProvidersLoaded] = useState(false);
  /** Persian, user-facing reason the provider list could not be loaded. */
  const [providersError, setProvidersError] = useState<string | null>(null);
  /** Set when the server answers 402: the user is out of quota. */
  const [paywalled, setPaywalled] = useState(false);
  const [quota, setQuota] = useState<{ totalRemaining: number; trialRemaining: number; paidRemaining: number } | null>(null);
  const [retryable, setRetryable] = useState(false);
  const providersAbortRef = useRef<AbortController | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const startTimeRef = useRef(0);
  const generationTextRef = useRef('');
  const baseFilesRef = useRef<GeneratedFile[]>([]);
  const latestPromptRef = useRef('');
  const idempotencyRef = useRef('');
  const metricsRef = useRef<PipelineMetrics>({ tokensPerSecond: 0, totalTokens: 0, provider: '', elapsedMs: 0 });

  useEffect(() => {
    const auth = getAuth();
    return auth.onAuthStateChanged(user => { setUserId(user?.uid || null); if (user) setShowSidebar(true); });
  }, []);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1100px)');
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const saveByok = (value: string) => {
    setByokDraft(value);
    const next = { ...byokKeys };
    if (value.trim()) next[provider] = value.trim(); else delete next[provider];
    setByokKeys(next);
    try { localStorage.setItem('fk-byok', JSON.stringify(next)); } catch { /* private mode */ }
  };

  /**
   * Provider discovery.
   *
   * Every outcome must be terminal: success, a controlled configuration error,
   * a network error, or a timeout. The selector previously stayed on "LOADING…"
   * forever whenever this request failed, which is one of the infinite spinners
   * the brief calls out. A 12s abort guarantees the UI always settles, and
   * `providersError` drives a visible Persian message plus a RETRY button.
   */
  const loadProviders = useCallback(() => {
    providersAbortRef.current?.abort();
    const controller = new AbortController();
    providersAbortRef.current = controller;
    // Guarantees the UI leaves the loading state even if the network stalls.
    const timeout = window.setTimeout(() => controller.abort(), 12_000);

    setProvidersError(null);
    setProvidersLoaded(false);

    fetch('/api/fullkonk/providers', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) {
          // Configuration/availability problem — never masquerade as "no providers".
          const detail = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
          // Branch on the HTTP status only. Server-side error *codes* are never
          // hard-coded in client JavaScript (see tests/client-bundle.test.ts):
          // 503 = the deployment is not configured, anything else = transient.
          const message = response.status === 503
            ? 'سرویس هوش مصنوعی هنوز پیکربندی نشده است. لطفاً با پشتیبانی تماس بگیرید.'
            : 'دریافت فهرست ارائه‌دهنده‌ها ممکن نشد. لطفاً دوباره تلاش کنید.';
          // Diagnostic code stays in the console only; users see plain Persian.
          console.warn('[fullkonk] providers failed', { status: response.status, code: detail.code });
          setProvidersError(message);
          setProvidersLoaded(true);
          return { providers: [] as ProviderOption[] };
        }
        return (await response.json().catch(() => ({}))) as { providers?: ProviderOption[] };
      })
      .then(data => {
        if (!mountedRef.current) return;
        setAllProviders(data.providers || []);
        setProvidersLoaded(true);
        const all = data.providers || [];
        const available = all.filter(option => option.hasKey || byokKeys[option.id]);
        if (available.length && !available.some(option => option.id === provider)) {
          setProvider(available[0].id);
          setModel(available[0].models[0]?.id || '');
        }
        // Nothing keyed anywhere? Preselect the fastest free signup so the
        // BYOK field in ⚙ SETTINGS targets a real provider immediately.
        if (!available.length && all.length && !byokKeys[provider]) {
          setProvider('groq');
          setModel(all.find(option => option.id === 'groq')?.models[0]?.id || '');
        }
      })
      // A failed probe says nothing about server configuration; never claim
      // "no providers" just because this request could not be completed.
      .catch((error: unknown) => {
        if (!mountedRef.current) return;
        const aborted = (error as Error)?.name === 'AbortError';
        console.warn('[fullkonk] providers unreachable', { reason: aborted ? 'timeout' : 'network' });
        setProvidersError(aborted
          ? 'زمان دریافت فهرست ارائه‌دهنده‌ها به پایان رسید. لطفاً دوباره تلاش کنید.'
          : 'ارتباط با سرور برقرار نشد. اتصال خود را بررسی و دوباره تلاش کنید.');
        // Terminal state: the spinner must never persist.
        setProvidersLoaded(true);
      })
      .finally(() => window.clearTimeout(timeout));
  }, []);

  useEffect(() => {
    loadProviders();
    return () => providersAbortRef.current?.abort();
  }, [loadProviders]);
  // Re-arm on mount: React StrictMode (and any remount) runs the cleanup once,
  // and a ref that is only ever set to false would permanently suppress every
  // subsequent setState — leaving the UI stuck in its loading state.
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; abortRef.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!streaming) return;
    const timer = window.setInterval(() => setMetrics(value => ({ ...value, elapsedMs: Date.now() - startTimeRef.current })), 100);
    return () => window.clearInterval(timer);
  }, [streaming]);

  const addMessage = useCallback((message: Omit<FKMessage, 'id' | 'timestamp'>) => {
    setMessages(previous => [...previous, { ...message, id: crypto.randomUUID(), timestamp: Date.now() }]);
  }, []);
  const appendToLast = useCallback((content: string, nextStage: PipelineStage) => {
    setMessages(previous => {
      const last = previous.at(-1);
      if (last?.role === 'assistant' && last.stage === nextStage) return [...previous.slice(0, -1), { ...last, content: last.content + content }];
      return [...previous, { id: crypto.randomUUID(), timestamp: Date.now(), role: 'assistant', stage: nextStage, content }];
    });
  }, []);

  /** Read the authoritative balance from the server (never computed client-side). */
  const refreshQuota = useCallback(async () => {
    try {
      const response = await fetch('/api/quota');
      if (!response.ok) return;              // quota display is best-effort
      const data = await response.json();
      if (mountedRef.current) setQuota(data);
    } catch {
      /* Non-fatal: the balance strip simply stays hidden. */
    }
  }, []);

  useEffect(() => { void refreshQuota(); }, [refreshQuota]);

  const handleSend = useCallback(async (rawPrompt: string, reuseIdempotencyKey = false) => {
    const prompt = rawPrompt.trim();
    if (!prompt || streaming) return;
    const controller = new AbortController();
    abortRef.current = controller;
    startTimeRef.current = Date.now();
    latestPromptRef.current = prompt;
    // One key per logical generation. A retry of the SAME generation reuses it
    // so a reconnect is never billed twice (server-side dedup lives in
    // server/metering.ts; the key is scoped under the server-derived identity).
    if (!reuseIdempotencyKey || !idempotencyRef.current) {
      idempotencyRef.current = crypto.randomUUID().replace(/-/g, '');
    }
    generationTextRef.current = '';
    baseFilesRef.current = activeProject?.files || files;
    setPreviousFiles(baseFilesRef.current);
    setStreaming(true);
    setRetryable(false);
    setPaywalled(false);
    setStage(mode === 'review' ? 'review' : 'architect');
    setStageText('INITIALIZING PIPELINE');
    metricsRef.current = { tokensPerSecond: 0, totalTokens: 0, provider: '', elapsedMs: 0 };
    setMetrics(metricsRef.current);
    setSaveState(activeProject ? 'UPDATE PROJECT' : 'SAVE AS PROJECT');
    addMessage({ role: 'user', content: prompt });

    let sessionId = activeSession;
    if (!sessionId && userId) {
      try {
        sessionId = await createSession({ userId, title: generateSessionTitle(prompt), mode, provider, model });
        setActiveSession(sessionId);
      } catch {
        setStageText('SESSION PERSISTENCE UNAVAILABLE');
      }
    }

    let completed = false;
    let activeStage: PipelineStage = mode === 'review' ? 'review' : 'architect';
    try {
      const headers = await authHeaders();
      const byok = byokKeys[provider] ? { 'x-provider-key': byokKeys[provider] } : {};
      const response = await fetch('/api/fullkonk/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idempotencyRef.current, ...byok, ...headers },
        body: JSON.stringify({ prompt, mode, provider, model, temperature, maxTokens, systemPrompt: systemPrompt || undefined, projectId: activeProject?.id, attachedFiles: attachments }),
        signal: controller.signal,
      });
      // Non-stream HTTP errors carry a normalized envelope from the proxy (400/401/403/413/429/5xx).
      if (!response.ok) throw await readGatewayError(response);
      if (!response.body) throw new RetryablePipelineError('Generation stream was empty.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = new SSEParser();
      let readerDone = false;
      while (!readerDone) {
        const result = await reader.read();
        const feed = parser.feed(decoder.decode(result.value || new Uint8Array(), { stream: !result.done }));
        if (result.done) feed.push(...parser.flush());
        for (const item of feed) {
          // Explicit SSE completion sentinel (some gateway builds emit it).
          if (item.kind === 'done') { completed = true; readerDone = true; break; }
          // Malformed/partial frames are skipped; they never crash the pipeline.
          if (item.kind === 'malformed') continue;
          const parsedResult = parseStreamChunk(item.message.data);
          if (!parsedResult.ok) continue;
          const parsed = parsedResult.value;
          if (!isStreamChunk(parsed)) continue;
          switch (parsed.type) {
            case 'stage': activeStage = parsed.stage; setStage(parsed.stage); setStageText(parsed.content || parsed.stage.toUpperCase()); break;
            case 'provider':
              metricsRef.current = { ...metricsRef.current, provider: parsed.provider };
              setMetrics(value => ({ ...value, provider: parsed.provider }));
              setStageText(`${parsed.provider} / ${parsed.model}`);
              break;
            case 'failover':
              metricsRef.current = { ...metricsRef.current, transition: `${parsed.from} → ${parsed.to || 'NEXT PROVIDER'}` };
              setMetrics(value => ({ ...value, transition: metricsRef.current.transition }));
              break;
            case 'metrics':
              metricsRef.current = { ...metricsRef.current, ...parsed.data };
              setMetrics(value => ({ ...value, ...parsed.data }));
              break;
            case 'reset':
              if (activeStage !== 'architect') {
                generationTextRef.current = generationTextRef.current.slice(0, Math.max(0, generationTextRef.current.length - parsed.characters));
              }
              setMessages(previous => {
                const last = previous.at(-1);
                if (!last || last.role !== 'assistant' || last.stage !== activeStage) return previous;
                const content = last.content.slice(0, Math.max(0, last.content.length - parsed.characters));
                return content ? [...previous.slice(0, -1), { ...last, content }] : previous.slice(0, -1);
              });
              setFiles(mergeFiles(baseFilesRef.current, extractFiles(generationTextRef.current)));
              break;
            case 'delta':
              if (activeStage !== 'architect') generationTextRef.current += parsed.content;
              appendToLast(parsed.content, activeStage);
              if (activeStage !== 'architect') setFiles(mergeFiles(baseFilesRef.current, extractFiles(generationTextRef.current)));
              break;
            case 'file': setFiles(current => mergeFiles(current, [{ ...parsed.file, language: parsed.file.language.toLowerCase() }])); break;
            case 'done': completed = true; setStage('done'); setStageText('BUILD COMPLETE'); break;
            // A provider-level failure means the orchestrator already exhausted
            // every candidate; surface it as retryable rather than terminal.
            case 'error': throw parsed.kind === 'configuration'
              ? new Error(parsed.error)
              : new RetryablePipelineError(parsed.error);
          }
        }
        if (result.done) readerDone = true;
      }
      if (!completed) throw new RetryablePipelineError('Generation stream closed before completion.');
      const finalFiles = mergeFiles(baseFilesRef.current, extractFiles(generationTextRef.current));
      setFiles(finalFiles);
      setActiveFile(current => current && finalFiles.some(file => file.path === current) ? current : finalFiles[0]?.path || null);
      if (userId) void logUsage({ userId, provider: metricsRef.current.provider || provider, model, mode, stage: 'done', tokens: metricsRef.current.totalTokens, durationMs: Date.now() - startTimeRef.current, success: true });
      setAttachments([]);
      setSidebarRefresh(value => value + 1);
      void refreshQuota();   // reflect the message just consumed
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // User STOP or unmount: leave no error banner behind.
        if (mountedRef.current) { setStage('idle'); setStageText(''); }
      } else if (mountedRef.current) {
        const message = error instanceof Error && error.message ? error.message : 'Unknown pipeline error';
        // 402 is a business state, not a fault: show the paywall instead of an
        // error the user cannot act on. Retrying would fail identically.
        if (error instanceof GatewayError && error.status === 402) {
          setPaywalled(true);
          setRetryable(false);
          setStage('idle');
          setStageText('');
          void refreshQuota();
          return;
        }
        // Exhausted failover, capacity (429/5xx) and network faults are
        // recoverable; validation/configuration faults are terminal.
        const retryable = error instanceof RetryablePipelineError
          || error instanceof TypeError
          || (error instanceof GatewayError && error.retryable);
        setRetryable(retryable);
        setStage('error'); setStageText(message); addMessage({ role: 'assistant', stage: 'error', content: `ERROR: ${message}` });
        if (userId) void logUsage({ userId, provider, model, mode, stage: 'error', tokens: metricsRef.current.totalTokens, durationMs: Date.now() - startTimeRef.current, success: false });
      }
    } finally {
      if (mountedRef.current) setStreaming(false);
      abortRef.current = null;
    }
  }, [activeProject, activeSession, addMessage, appendToLast, attachments, files, maxTokens, mode, model, provider, streaming, systemPrompt, temperature, userId]);

  /** Re-runs the last prompt after a recoverable failure. */
  const handleRetry = useCallback(() => {
    const prompt = latestPromptRef.current;
    if (!prompt || streaming) return;
    setRetryable(false);
    // Reuse the key: this is the same logical generation, retried.
    void handleSend(prompt, true);
  }, [handleSend, streaming]);

  useEffect(() => {
    if (stage !== 'done' || !activeSession || !userId) return;
    void updateSession(activeSession, { messages, files, stage: 'done', tokenCount: metrics.totalTokens })
      .catch(() => setStageText('BUILD COMPLETE · SESSION SAVE FAILED'));
  }, [activeSession, files, messages, metrics.totalTokens, stage, userId]);

  const clearWorkspace = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]); setFiles([]); setPreviousFiles([]); setActiveFile(null); setActiveSession(null); setActiveProject(null); setStage('idle'); setStageText(''); setAttachments([]);
  }, []);
  const selectSession = useCallback((session: FKSession) => {
    setActiveSession(session.id); setActiveProject(null); setMessages(session.messages); setFiles(session.files); setPreviousFiles([]); setMode(session.mode); setProvider(session.provider); setModel(session.model); setStage('done'); setActiveFile(session.files[0]?.path || null);
  }, []);
  const selectProject = useCallback((project: FKProject) => {
    setActiveProject(project); setActiveSession(null); setMessages([]); setFiles(project.files); setPreviousFiles(project.files); setStage('done'); setStageText(`PROJECT: ${project.name}`); setActiveFile(project.files[0]?.path || null); setSaveState('UPDATE PROJECT');
  }, []);
  const handleSaveProject = useCallback(async () => {
    if (!userId || files.length === 0) return;
    const estimatedSize = new Blob([JSON.stringify(files)]).size;
    if (estimatedSize > 900_000) { setSaveState('PROJECT EXCEEDS 900KB'); return; }
    setSaveState('SAVING...');
    try {
      const name = activeProject?.name || generateSessionTitle(latestPromptRef.current || 'fullKONK project');
      const projectId = await saveProject({ userId, name, description: latestPromptRef.current, stack: [...new Set(files.map(file => file.language))], files, sessions: [...new Set([...(activeProject?.sessions || []), ...(activeSession ? [activeSession] : [])])] }, activeProject?.id);
      setActiveProject({ id: projectId, userId, name, description: latestPromptRef.current, stack: [...new Set(files.map(file => file.language))], files, sessions: [...new Set([...(activeProject?.sessions || []), ...(activeSession ? [activeSession] : [])])], createdAt: activeProject?.createdAt || Date.now(), updatedAt: Date.now() });
      setSaveState('✓ PROJECT SAVED'); setSidebarRefresh(value => value + 1);
    } catch (error) { setSaveState(error instanceof Error ? error.message.toUpperCase() : 'SAVE FAILED'); }
  }, [activeProject, activeSession, files, userId]);

  return <div className="fk-root" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <div aria-hidden="true" className="fk-scan" style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }} />
    <header className="fk-head" style={{ height: 54, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', overflowX: 'auto' }}>
      <motion.span animate={{ opacity: [1, .35, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} className="fk-led" />
      <strong className="fk-brand">fullKONK_&gt;</strong>
      <div style={{ flex: 1 }} />
      {userId && <button onClick={() => setShowSidebar(value => !value)} className="fk-btn">≡ WORKSPACE</button>}
      {userId && files.length > 0 && <button onClick={() => { void handleSaveProject(); }} className="fk-btn" style={{ borderColor: '#ffb400', color: '#ffb400' }}>{saveState}</button>}
      {userId && <button onClick={() => setShowAnalytics(true)} className="fk-btn">◎ ANALYTICS</button>}
      {files.length > 0 && <button onClick={() => setShowGitHub(true)} className="fk-btn" style={{ background: '#19d3c5', borderColor: '#000', color: '#0b0d10' }}>↑ GITHUB</button>}
      <div style={{ display: 'flex', gap: 4 }}>{MODES.map(item => <button key={item.id} disabled={streaming} onClick={() => setMode(item.id)} className={`fk-btn${mode === item.id ? ' fk-btn-acc' : ''}`}>{item.label}</button>)}</div>
      <button onClick={() => setShowSettings(value => !value)} className="fk-btn">⚙ SETTINGS</button>
      <button onClick={() => setLiveEnv(value => !value)} className={`fk-btn${liveEnv ? ' fk-btn-acc' : ''}`}>▶ LIVE ENV</button>
      <select className="fk-select" value={provider} disabled={streaming} onChange={event => { const next = providerOptions.find(option => option.id === event.target.value); setProvider(event.target.value); if (next?.models[0]) setModel(next.models[0].id); }}>{providerOptions.length ? providerOptions.map(option => <option key={option.id} value={option.id}>{option.name.toUpperCase()}</option>) : <option value={provider}>{!providersLoaded ? 'LOADING…' : providersError ? 'UNAVAILABLE — RETRY' : 'NO KEY — PICK ONE, ADD KEY IN ⚙'}</option>}</select>
      <select value={model} disabled={streaming} onChange={event => setModel(event.target.value)} className="fk-select">{(providerOptions.find(option => option.id === provider)?.models || [{ id: model, label: model }]).map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
    </header>
    {/* Terminal error state for provider discovery: Persian message + retry. */}
    {providersError && <div
      role="alert"
      dir="rtl"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '8px 16px', background: '#2a1416', borderBottom: '2px solid #ff4d4f', color: '#ffd7d8', fontSize: 12 }}
    >
      <span>{providersError}</span>
      <button type="button" onClick={loadProviders} className="fk-btn" style={{ background: '#ff4d4f', borderColor: '#000', color: '#fff' }}>
        تلاش دوباره
      </button>
    </div>}
    {paywalled && <div
      role="alert"
      dir="rtl"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '10px 16px', background: '#2a2413', borderBottom: '2px solid #ffb020', color: '#ffe0a3', fontSize: 12 }}
    >
      <span>
        سهمیهٔ رایگان شما به پایان رسیده است. برای ادامه یکی از بسته‌ها را تهیه کنید.
        {quota ? ` (باقی‌مانده: ${quota.totalRemaining})` : ''}
      </span>
      <a href="/checkout" className="fk-btn" style={{ background: '#ffb020', borderColor: '#000', color: '#0b0d10', textDecoration: 'none' }}>
        ارتقای حساب
      </a>
    </div>}
    {showSettings && <div className="fk-settings" style={{ display: 'grid', gridTemplateColumns: '120px 160px 170px minmax(240px, 1fr)', gap: 10, alignItems: 'center', padding: '8px 16px' }}>
      <label>TEMPERATURE <input type="number" min={0} max={1} step={0.05} value={temperature} onChange={event => setTemperature(Number(event.target.value))} className="fk-select" style={{ width: 58, marginLeft: 5 }} /></label>
      <label>MAX TOKENS <select value={maxTokens} onChange={event => setMaxTokens(Number(event.target.value))} className="fk-select" style={{ marginLeft: 5 }}><option value={4096}>4096</option><option value={8192}>8192</option><option value={16384}>16384</option></select></label>
      <select className="fk-select" value="" onChange={event => { const pb = composePlaybook(event.target.value); if (pb) setSystemPrompt(pb); }} title="Load a specialized playbook from the prompt library" style={{ minWidth: 150 }}>
        <option value="">▸ PLAYBOOK LIBRARY…</option>
        {getPlaybooks().map(pb => <option key={pb.id} value={pb.id}>{pb.name} ({pb.count})</option>)}
      </select>
      <input value={systemPrompt} onChange={event => setSystemPrompt(event.target.value)} placeholder="Optional system prompt override (or load a playbook)" className="fk-select" style={{ width: '100%', boxSizing: 'border-box' }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: byokKeys[provider] ? '#ffb400' : '#666' }}>🔑 {(allProviders.find(o => o.id === provider)?.name || provider).toUpperCase()} KEY</span>
        <input type="password" value={byokDraft} onChange={event => saveByok(event.target.value)} placeholder={byokKeys[provider] ? '●●●● saved in this browser' : 'paste a free-tier key'} className="fk-select" style={{ width: 190, marginLeft: 5 }} autoComplete="off" />
        {!byokKeys[provider] && PROVIDER_SIGNUP[provider] && (
          <a href={PROVIDER_SIGNUP[provider]} target="_blank" rel="noreferrer noopener" className="fk-btn fk-btn-acc" style={{ textDecoration: 'none' }}>GET FREE KEY ↗</a>
        )}
      </label>
      <span style={{ color: '#555' }}>BYOK stays in this browser; sent only with your own requests, never stored server-side.</span>
    </div>}
    <PipelineStatus stage={stage} text={stageText} streaming={streaming} metrics={metrics} onStop={() => abortRef.current?.abort()} canRetry={retryable && Boolean(latestPromptRef.current)} onRetry={handleRetry} />
    {/* Tablet / narrow layout: one panel at a time with a touch tab bar */}
    {narrow ? (
      <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {panel === 'chat' && <div style={{ flex: 1, minWidth: 0 }}><ChatPanel messages={messages} streaming={streaming} attachments={attachments} onAttachmentsChange={setAttachments} onSend={prompt => { void handleSend(prompt); }} onClear={clearWorkspace} /></div>}
          {panel === 'code' && <div style={{ flex: 1, minWidth: 0 }}><CodeOutput files={files} previousFiles={previousFiles} activeFile={activeFile} onSelectFile={setActiveFile} streaming={streaming} /></div>}
          {panel === 'live' && <div style={{ flex: 1, minWidth: 0 }}><LiveEnvironment files={files} streaming={streaming} /></div>}
        </div>
        <nav aria-label="Console panels" style={{ display: 'flex', flexShrink: 0, borderTop: '4px solid #000', background: '#0e0f14' }}>
          {([
            ['chat', '▤ CHAT'],
            ['code', '◈ CODE'],
            ['live', '▶ LIVE'],
          ] as const).map(([id, label]) => (
            <button key={id} onClick={() => setPanel(id)} className={`fk-btn${panel === id ? ' fk-btn-acc' : ''}`} style={{ flex: 1, padding: '14px 0', fontSize: 10, border: 'none', borderBottom: panel === id ? '4px solid #ffb400' : '4px solid transparent' }}>
              {label}{id === 'live' && !liveEnv ? ' (off)' : ''}
            </button>
          ))}
        </nav>
      </main>
    ) : (
    <main style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns:
        showSidebar && userId && liveEnv ? '200px minmax(250px, 330px) minmax(0, 1fr) minmax(300px, 420px)'
      : showSidebar && userId ? '220px minmax(300px, 380px) minmax(0, 1fr)'
      : liveEnv ? 'minmax(260px, 360px) minmax(0, 1fr) minmax(300px, 420px)'
      : 'minmax(300px, 380px) minmax(0, 1fr)' }}>
      {showSidebar && userId && <SessionSidebar userId={userId} activeSessionId={activeSession} activeProjectId={activeProject?.id || null} refreshKey={sidebarRefresh} onSelect={selectSession} onSelectProject={selectProject} onNew={clearWorkspace} />}
      <div style={{ minWidth: 0, borderRight: '3px solid #000' }}><ChatPanel messages={messages} streaming={streaming} attachments={attachments} onAttachmentsChange={setAttachments} onSend={prompt => { void handleSend(prompt); }} onClear={clearWorkspace} /></div>
      <div style={{ minWidth: 0, borderRight: liveEnv ? '3px solid #000' : undefined }}><CodeOutput files={files} previousFiles={previousFiles} activeFile={activeFile} onSelectFile={setActiveFile} streaming={streaming} /></div>
      {liveEnv && <div style={{ minWidth: 0 }}><LiveEnvironment files={files} streaming={streaming} /></div>}
    </main>
    )}
    <AnimatePresence>{showAnalytics && userId && <AnalyticsDashboard userId={userId} onClose={() => setShowAnalytics(false)} />}{showGitHub && <GitHubExportModal files={files} onClose={() => setShowGitHub(false)} />}</AnimatePresence>
  </div>;
}

const topButton: React.CSSProperties = {};
const selectStyle: React.CSSProperties = {};
