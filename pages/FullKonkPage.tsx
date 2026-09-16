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
import { AttachedCodeFile, BuildMode, FKMessage, FKProject, GeneratedFile, PipelineStage } from '../types';
// Shared, framework-free helpers (also exercised by the test-suite).
import { extractFiles, mergeFiles } from '../utils/codeFiles';
import { SseParser, decodeStreamChunk } from '../utils/sse';
import { createStreamState, reduceStreamChunk, StreamMessageOp, StreamState } from '../utils/streamState';

// Kept exported for backwards compatibility; implementation lives in utils/codeFiles.ts.
export { extractFiles } from '../utils/codeFiles';

const MODES: { id: BuildMode; label: string }[] = [
  { id: 'fullstack', label: 'FULL-STACK' }, { id: 'frontend', label: 'FRONTEND' }, { id: 'backend', label: 'BACKEND' }, { id: 'review', label: 'REVIEW' },
];
const PROVIDER_SIGNUP: Record<string, string> = {
  groq: 'https://console.groq.com/keys', cerebras: 'https://cloud.cerebras.ai/', google: 'https://aistudio.google.com/apikey',
  sambanova: 'https://cloud.sambanova.ai/apis', deepseek: 'https://platform.deepseek.com/api_keys', openrouter: 'https://openrouter.ai/settings/keys',
  huggingface: 'https://huggingface.co/settings/tokens', mistral: 'https://console.mistral.ai/api-keys/', nvidia: 'https://build.nvidia.com/',
  fireworks: 'https://fireworks.ai/account/api-keys', cloudflare: 'https://dash.cloudflare.com/',
};
interface ProviderOption { id: string; name: string; hasKey: boolean; models: { id: string; label: string }[] }

/** A pipeline failure that the user may retry, as opposed to a real misconfiguration. */
class RetryablePipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryablePipelineError';
  }
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
  const [retryable, setRetryable] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamRef = useRef<StreamState | null>(null);
  const mountedRef = useRef(true);
  const startTimeRef = useRef(0);
  const generationTextRef = useRef('');
  const baseFilesRef = useRef<GeneratedFile[]>([]);
  const latestPromptRef = useRef('');
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

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/fullkonk/providers', { signal: controller.signal })
      .then(response => response.json() as Promise<{ providers?: ProviderOption[] }>)
      .then(data => {
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
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  useEffect(() => () => {
    // Cancellation + unmount safety: abort the in-flight build and refuse any
    // later state update from a request that can no longer be rendered.
    mountedRef.current = false;
    abortRef.current?.abort();
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

  /** Mirror the pure stream state into the console UI. */
  const applyStreamState = useCallback((next: StreamState, ops: StreamMessageOp[]) => {
    if (!mountedRef.current) return;
    generationTextRef.current = next.text;
    setStage(next.stage);
    setStageText(next.stageText);
    metricsRef.current = { ...metricsRef.current, ...next.metrics };
    setMetrics(value => ({ ...value, ...next.metrics }));
    setFiles(next.files);
    for (const op of ops) {
      if (op.type === 'append') {
        appendToLast(op.content, op.stage);
        continue;
      }
      // Backspace the tail of the current stage's assistant message (provider
      // retry / context reset): the pipeline rewinds that many characters.
      setMessages(previous => {
        const last = previous.at(-1);
        if (!last || last.role !== 'assistant' || last.stage !== op.stage) return previous;
        const content = last.content.slice(0, Math.max(0, last.content.length - op.characters));
        return content ? [...previous.slice(0, -1), { ...last, content }] : previous.slice(0, -1);
      });
    }
  }, [appendToLast]);

  const handleSend = useCallback(async (rawPrompt: string) => {
    const prompt = rawPrompt.trim();
    // One build at a time: `streaming` state alone can lag a fast double-click,
    // so the live AbortController is the authoritative guard.
    if (!prompt || streaming || abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    startTimeRef.current = Date.now();
    latestPromptRef.current = prompt;
    generationTextRef.current = '';
    baseFilesRef.current = activeProject?.files || files;
    streamRef.current = createStreamState({ mode, baseFiles: baseFilesRef.current });
    setPreviousFiles(baseFilesRef.current);
    setStreaming(true);
    setRetryable(false);
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
    try {
      const headers = await authHeaders();
      const byok = byokKeys[provider] ? { 'x-provider-key': byokKeys[provider] } : {};
      const response = await fetch('/api/fullkonk/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...byok, ...headers },
        body: JSON.stringify({ prompt, mode, provider, model, temperature, maxTokens, systemPrompt: systemPrompt || undefined, projectId: activeProject?.id, attachedFiles: attachments }),
        signal: controller.signal,
      });
      if (!response.ok) {
        // Non-stream failure (405/413/429/5xx/config). Retry-After is surfaced
        // so the user knows when the gateway quota window reopens.
        const payload = await response.json().catch(() => ({ error: 'Generation request failed.' })) as { error?: string; code?: string; retryAfter?: number };
        const headerRetry = Number(response.headers.get('retry-after'));
        const retryAfter = Number.isFinite(headerRetry) && headerRetry > 0 ? headerRetry : Number(payload.retryAfter);
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? ` Retry in ${Math.ceil(retryAfter)}s.` : '';
        throw new Error(`${payload.error || 'Generation request failed.'}${wait}`);
      }
      if (!response.body) throw new Error('Generation stream was empty.');

      // Robust SSE consumption: network reads never equal events, chunks may
      // split JSON payloads, several events may share one read, and CRLF/LF are
      // both valid. Malformed events are skipped instead of crashing the build.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = new SseParser();
      let stream = streamRef.current ?? createStreamState({ mode, baseFiles: baseFilesRef.current });
      while (true) {
        const result = await reader.read();
        const text = decoder.decode(result.value || new Uint8Array(), { stream: !result.done });
        const events = parser.push(text);
        if (result.done) events.push(...parser.flush());
        for (const event of events) {
          const chunk = decodeStreamChunk(event.data);
          if (!chunk) continue;
          const reduced = reduceStreamChunk(stream, chunk);
          stream = reduced.state;
          streamRef.current = stream;
          applyStreamState(stream, reduced.ops);
          if (chunk.type === 'done') completed = true;
          // A provider-level failure means the orchestrator already exhausted
          // every candidate; surface it as retryable rather than terminal.
          if (chunk.type === 'error') {
            throw chunk.kind === 'configuration'
              ? new Error(chunk.error)
              : new RetryablePipelineError(chunk.error);
          }
        }
        if (result.done) break;
      }

      if (!completed) throw new RetryablePipelineError('Generation stream closed before completion.');
      const finalFiles = mergeFiles(baseFilesRef.current, extractFiles(streamRef.current?.text ?? generationTextRef.current));
      if (mountedRef.current) {
        setFiles(finalFiles);
        setActiveFile(current => current && finalFiles.some(file => file.path === current) ? current : finalFiles[0]?.path || null);
        setAttachments([]);
        setSidebarRefresh(value => value + 1);
      }
      if (userId) void logUsage({ userId, provider: metricsRef.current.provider || provider, model, mode, stage: 'done', tokens: metricsRef.current.totalTokens, durationMs: Date.now() - startTimeRef.current, success: true });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // User pressed STOP (or the page unmounted) — nothing to report.
        if (mountedRef.current) { setStage('idle'); setStageText(''); }
      } else {
        const message = error instanceof Error ? error.message : 'Unknown pipeline error';
        // Exhausted failover and network faults are recoverable; only a real
        // server-side configuration fault is reported as terminal.
        if (mountedRef.current) {
          setRetryable(error instanceof RetryablePipelineError || error instanceof TypeError);
          setStage('error'); setStageText(message); addMessage({ role: 'assistant', stage: 'error', content: `ERROR: ${message}` });
        }
        if (userId) void logUsage({ userId, provider, model, mode, stage: 'error', tokens: metricsRef.current.totalTokens, durationMs: Date.now() - startTimeRef.current, success: false });
      }
    } finally {
      if (mountedRef.current) setStreaming(false);
      abortRef.current = null;
    }
  }, [activeProject, activeSession, addMessage, appendToLast, applyStreamState, attachments, files, maxTokens, mode, model, provider, streaming, systemPrompt, temperature, userId]);

  /** Re-runs the last prompt after a recoverable failure. */
  const handleRetry = useCallback(() => {
    const prompt = latestPromptRef.current;
    if (!prompt || streaming) return;
    setRetryable(false);
    void handleSend(prompt);
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
      <select className="fk-select" value={provider} disabled={streaming} onChange={event => { const next = providerOptions.find(option => option.id === event.target.value); setProvider(event.target.value); if (next?.models[0]) setModel(next.models[0].id); }}>{providerOptions.length ? providerOptions.map(option => <option key={option.id} value={option.id}>{option.name.toUpperCase()}</option>) : <option value={provider}>{providersLoaded ? 'NO KEY — PICK ONE, ADD KEY IN ⚙' : 'LOADING…'}</option>}</select>
      <select value={model} disabled={streaming} onChange={event => setModel(event.target.value)} className="fk-select">{(providerOptions.find(option => option.id === provider)?.models || [{ id: model, label: model }]).map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
    </header>
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
