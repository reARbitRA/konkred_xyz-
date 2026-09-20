import { ChangeEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import DiffMatchPatch from 'diff-match-patch';
import { AttachedCodeFile, FKMessage } from '../../types';
import { FULLKONK_TEMPLATES } from '../../services/fullkonk.templates';

interface Props {
  messages: FKMessage[];
  streaming: boolean;
  attachments: AttachedCodeFile[];
  onAttachmentsChange: (files: AttachedCodeFile[]) => void;
  onSend: (prompt: string) => void;
  onClear: () => void;
}

const ACCEPT = '.ts,.tsx,.js,.jsx,.json,.prisma,.sql,.yaml,.yml';
const MAX_FILES = 20;
const MAX_BYTES = 500 * 1024;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

export default function ChatPanel({ messages, streaming, attachments, onAttachmentsChange, onSend, onClear }: Props) {
  const [input, setInput] = useState('');
  const [enhanced, setEnhanced] = useState('');
  const [optimizerLoading, setOptimizerLoading] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const optimizerRef = useRef<AbortController | null>(null);
  const enhancementDiff = useMemo(() => enhanced ? new DiffMatchPatch().diff_main(input.trim(), enhanced) : [], [enhanced, input]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    optimizerRef.current?.abort();
    setEnhanced('');
    const prompt = input.trim();
    if (prompt.length < 12 || streaming) return;
    const timer = window.setTimeout(() => {
      const controller = new AbortController();
      optimizerRef.current = controller;
      setOptimizerLoading(true);
      fetch('/api/fullkonk/optimize-prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }), signal: controller.signal })
        .then(async response => {
          const data = await response.json() as { prompt?: string; error?: string };
          if (!response.ok) throw new Error(data.error || 'Optimization failed');
          if (data.prompt && data.prompt !== prompt) setEnhanced(data.prompt);
        })
        .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setEnhanced(''); })
        .finally(() => { if (!controller.signal.aborted) setOptimizerLoading(false); });
    }, 1500);
    return () => { window.clearTimeout(timer); optimizerRef.current?.abort(); };
  }, [input, streaming]);

  const send = () => {
    const prompt = input.trim();
    if (!prompt || streaming) return;
    setInput('');
    setEnhanced('');
    onSend(prompt);
  };

  const attach = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    const combinedCount = attachments.length + selected.length;
    const combinedBytes = attachments.reduce((sum, file) => sum + file.size, 0) + selected.reduce((sum, file) => sum + file.size, 0);
    if (combinedCount > MAX_FILES || combinedBytes > MAX_BYTES) {
      setAttachmentError('MAX 20 FILES / 500KB TOTAL');
      return;
    }
    const next = await Promise.all(selected.map(async file => ({ path: file.webkitRelativePath || file.name, size: file.size, contentBase64: toBase64(new Uint8Array(await file.arrayBuffer())) })));
    onAttachmentsChange([...attachments, ...next]);
    setAttachmentError('');
  };

  return <section style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0a0908', minWidth: 0 }}>
    <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: '1px solid #171514' }}>
      <span style={{ flex: 1, color: '#5c5852', fontFamily: '"JetBrains Mono", monospace', fontSize: 9, letterSpacing: 2 }}>// PRODUCT TERMINAL</span>
      <label style={buttonStyle}>＋ ATTACH<input type="file" accept={ACCEPT} multiple onChange={event => { void attach(event); }} style={{ display: 'none' }} /></label>
      <button onClick={onClear} disabled={streaming} style={buttonStyle}>CLEAR</button>
    </header>
    {(attachments.length > 0 || attachmentError) && <div style={{ padding: '7px 10px', display: 'flex', flexWrap: 'wrap', gap: 5, borderBottom: '1px solid #171514' }}>
      {attachments.map(file => <button key={file.path} onClick={() => onAttachmentsChange(attachments.filter(item => item.path !== file.path))} title="Remove attachment" style={{ ...buttonStyle, color: '#d60019', borderColor: '#3a201f' }}>{file.path} ✕</button>)}
      {attachmentError && <span style={{ color: '#d60019', fontSize: 8, fontFamily: '"JetBrains Mono", monospace' }}>{attachmentError}</span>}
    </div>}
    <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {messages.length === 0 ? <div style={{ margin: 'auto', width: '100%', maxWidth: 330 }}>
        <motion.div animate={{ opacity: [.45, 1, .45] }} transition={{ duration: 2, repeat: Infinity }} style={{ textAlign: 'center', color: '#d60019', fontFamily: 'Orbitron, sans-serif', fontWeight: 900, letterSpacing: 3, marginBottom: 16 }}>fullKONK_&gt;</motion.div>
        {FULLKONK_TEMPLATES.map(template => <button key={template.id} onClick={() => { setInput(template.prompt); inputRef.current?.focus(); }} style={{ width: '100%', background: '#0a0908', border: '1px solid #171514', color: '#5c5852', padding: '7px 10px', marginBottom: 5, textAlign: 'left', fontFamily: '"JetBrains Mono", monospace', fontSize: 9, cursor: 'pointer' }}><span style={{ color: '#d60019' }}>{template.name}</span><br />{template.prompt}</button>)}
      </div> : messages.map((message, index) => <div key={message.id} style={{ position: 'relative', background: message.role === 'user' ? '#171514' : '#100e0d', border: `1px solid ${message.role === 'user' ? '#2a2624' : '#3a201f'}`, padding: '9px 11px', color: message.role === 'user' ? '#f4f1eb' : '#d60019', fontFamily: message.role === 'user' ? 'Space Grotesk, sans-serif' : '"JetBrains Mono", monospace', fontSize: message.role === 'user' ? 12 : 10, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.stage && <span style={{ display: 'block', color: '#5c5852', fontSize: 7, letterSpacing: 2, marginBottom: 5 }}>{message.stage.toUpperCase()}</span>}{message.content}{streaming && index === messages.length - 1 && message.role === 'assistant' && <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: .6 }}> ▌</motion.span>}</div>)}
      <div ref={bottomRef} />
    </div>
    <footer style={{ padding: 10, borderTop: '1px solid #171514', background: '#0a0908' }}>
      {enhanced && <div style={{ border: '1px solid #3a201f', background: '#100e0d', padding: 8, marginBottom: 7, fontFamily: '"JetBrains Mono", monospace', fontSize: 9 }}><div style={{ color: '#d60019', marginBottom: 5 }}>✦ ENHANCED PROMPT AVAILABLE</div><div style={{ color: '#7a756d', maxHeight: 90, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{enhancementDiff.map(([operation, text], index) => <span key={`${index}-${text.slice(0, 8)}`} style={{ color: operation === 1 ? '#d60019' : operation === -1 ? '#ff1a2e' : '#7a756d', background: operation === 1 ? '#120d0c' : operation === -1 ? '#120d0c' : 'transparent', textDecoration: operation === -1 ? 'line-through' : 'none' }}>{text}</span>)}</div><div style={{ display: 'flex', gap: 6, marginTop: 7 }}><button onClick={() => { setInput(enhanced); setEnhanced(''); }} style={buttonStyle}>USE</button><button onClick={() => setEnhanced('')} style={buttonStyle}>DISMISS</button></div></div>}
      {optimizerLoading && <div style={{ color: '#3d3835', fontFamily: '"JetBrains Mono", monospace', fontSize: 8, marginBottom: 5 }}>✦ OPTIMIZING...</div>}
      <div style={{ display: 'flex', gap: 8 }}><textarea ref={inputRef} value={input} onChange={event => setInput(event.target.value)} onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} disabled={streaming} rows={2} placeholder="Describe the product or next iteration..." style={{ flex: 1, resize: 'none', background: '#0d0c0b', border: '1px solid #2a2624', color: '#f4f1eb', padding: '8px 10px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, outline: 0 }} /><button onClick={send} disabled={!input.trim() || streaming} style={{ background: '#d60019', border: 0, color: '#0a0908', fontFamily: '"JetBrains Mono", monospace', fontSize: 9, fontWeight: 900, letterSpacing: 1, padding: '8px 14px', cursor: 'pointer', opacity: !input.trim() || streaming ? .35 : 1 }}>BUILD →</button></div>
    </footer>
  </section>;
}

const buttonStyle: React.CSSProperties = { background: '#0a0908', border: '1px solid #2a2624', color: '#7a756d', padding: '4px 8px', fontFamily: '"JetBrains Mono", monospace', fontSize: 8, letterSpacing: 1, cursor: 'pointer' };
