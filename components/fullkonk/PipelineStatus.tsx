import { motion } from 'framer-motion';
import { PipelineStage } from '../../types';

export interface PipelineMetrics {
  tokensPerSecond: number;
  totalTokens: number;
  provider: string;
  elapsedMs: number;
  transition?: string;
}

interface Props {
  stage: PipelineStage;
  text: string;
  streaming: boolean;
  metrics: PipelineMetrics;
  onStop: () => void;
  /** Shown only for recoverable failures, once every candidate model failed. */
  canRetry?: boolean;
  onRetry?: () => void;
}

const PROVIDER_COLORS: Record<string, string> = { google: '#4285F4', groq: '#F55036', deepseek: '#4D6BFE', cerebras: '#00FF88', sambanova: '#FF6B00', openrouter: '#9B00FF', github: '#FFFFFF', nvidia: '#76B900', huggingface: '#FFD21E' };
const NORMAL_STAGES: PipelineStage[] = ['architect', 'frontend', 'backend', 'verify', 'test', 'done'];
const LABELS: Partial<Record<PipelineStage, string>> = { architect: 'ARCHITECT', frontend: 'FRONTEND', backend: 'BACKEND', verify: 'VERIFY', test: 'TEST', review: 'REVIEW', done: 'COMPLETE', error: 'ERROR' };

export default function PipelineStatus({ stage, text, streaming, metrics, onStop, canRetry = false, onRetry }: Props) {
  if (stage === 'idle') return null;
  const stages = stage === 'review' ? ['review', 'done'] as PipelineStage[] : NORMAL_STAGES;
  const effectiveStage = stage === 'error' ? stages[Math.max(0, stages.length - 2)] : stage;
  const activeIndex = stages.indexOf(effectiveStage);
  const providerKey = metrics.provider.toLowerCase().split(' ')[0];
  const providerColor = PROVIDER_COLORS[providerKey] || '#FFD700';
  return <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '7px 16px', borderBottom: `1px solid ${stage === 'error' ? '#ff1a2e' : '#1a1a1a'}`, background: stage === 'error' ? '#120006' : '#050505', fontFamily: '"JetBrains Mono", monospace', fontSize: 9, flexWrap: 'wrap' }}>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{stages.map((item, index) => {
      const done = stage === 'done' || index < activeIndex;
      const active = index === activeIndex && stage !== 'done';
      const color = done ? '#00FF88' : active ? stage === 'error' ? '#ff1a2e' : '#FFD700' : '#292929';
      return <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 5, color }}><span style={{ border: `1px solid ${color}`, width: 16, height: 16, display: 'grid', placeItems: 'center' }}>{done ? '✓' : active ? '>' : index + 1}</span><span>{LABELS[item]}</span>{index < stages.length - 1 && <span style={{ width: 10, height: 1, background: done ? '#00FF88' : '#222' }} />}</div>;
    })}</div>
    <div style={{ flex: 1, color: stage === 'error' ? '#ff1a2e' : '#555', minWidth: 120 }}>{text}</div>
    {metrics.provider && <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#888' }}><motion.span animate={{ opacity: streaming ? [1, .25, 1] : 1 }} transition={{ repeat: Infinity, duration: .8 }} style={{ width: 6, height: 6, background: providerColor, boxShadow: `0 0 7px ${providerColor}` }} />{metrics.provider.toUpperCase()}</div>}
    {metrics.transition && <motion.div initial={{ background: '#ff1a2e', color: '#fff' }} animate={{ background: '#002a13', color: '#00FF88' }} transition={{ duration: .8 }} style={{ padding: '2px 6px' }}>{metrics.transition}</motion.div>}
    <span style={{ color: '#00FF88' }}>{metrics.tokensPerSecond.toFixed(1)} TOK/S</span>
    <span style={{ color: '#FFD700' }}>{metrics.totalTokens.toLocaleString()} TOK</span>
    <span style={{ color: '#555' }}>{(metrics.elapsedMs / 1000).toFixed(1)}S</span>
    {streaming && <button onClick={onStop} style={{ background: '#ff1a2e', border: 0, color: '#fff', padding: '4px 10px', fontFamily: 'inherit', fontSize: 9, fontWeight: 700, cursor: 'pointer' }}>■ STOP</button>}
    {!streaming && stage === 'error' && canRetry && onRetry && <button onClick={onRetry} style={{ background: '#FFD700', border: 0, color: '#000', padding: '4px 10px', fontFamily: 'inherit', fontSize: 9, fontWeight: 700, letterSpacing: 1, cursor: 'pointer' }}>↻ RETRY</button>}
  </div>;
}
