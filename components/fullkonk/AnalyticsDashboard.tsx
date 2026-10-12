// components/fullkonk/AnalyticsDashboard.tsx

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getAuth } from 'firebase/auth';
import { UsageSummary, UsageEvent } from '../../services/fullkonk.analytics';

interface Props {
  userId: string;
  onClose: () => void;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ height: 4, background: '#111', flex: 1, overflow: 'hidden' }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: .8, ease: 'easeOut' }}
        style={{ height: '100%', background: color }}
      />
    </div>
  );
}

function StatCard({ label, value, sub, color = '#e8a46c' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      padding:   '18px 20px',
      border:    '1px solid #1d1a18',
      background:'#050505',
      display:   'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#444', letterSpacing: 2, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontFamily: '"Orbitron", sans-serif', fontSize: 22, fontWeight: 900, color }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#333' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default function AnalyticsDashboard({ userId, onClose }: Props) {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [recent,  setRecent]  = useState<UsageEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [days,    setDays]    = useState(30);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void getAuth().currentUser?.getIdToken().then(token => fetch(`/api/fullkonk/analytics/${userId}?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })).then(async response => {
      const data = await response.json() as { summary?: UsageSummary; recent?: UsageEvent[]; error?: string };
      if (!response.ok || !data.summary) throw new Error(data.error || 'Analytics request failed.');
      setSummary(data.summary);
      setRecent(data.recent ?? []);
    }).catch(fetchError => {
      if (!(fetchError instanceof DOMException && fetchError.name === 'AbortError')) setError(fetchError instanceof Error ? fetchError.message : 'Analytics unavailable.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, days]);

  const providers = summary ? Object.entries(summary.byProvider).sort((a, b) => b[1].count - a[1].count) : [];
  const maxCount  = providers[0]?.[1].count ?? 1;

  const PROVIDER_COLORS: Record<string, string> = {
    groq:       '#e8a46c',
    deepseek:   '#c9c4bb',
    cerebras:   '#b7b2a9',
    sambanova:  '#ff5a63',
    openrouter: '#c4515b',
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position:       'fixed',
        inset:           0,
        background:     'rgba(0,0,0,.92)',
        zIndex:          100,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:         20,
        backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: .96, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        style={{
          background:  '#0a0908',
          border:      '3px solid #1d1a18',
          width:       '100%',
          maxWidth:     900,
          maxHeight:   '88vh',
          overflowY:  'auto',
          fontFamily: '"JetBrains Mono", monospace',
        }}
      >
        {/* Header */}
        <div style={{
          display:       'flex',
          alignItems:    'center',
          justifyContent:'space-between',
          padding:        '14px 20px',
          borderBottom:  '1px solid #1d1a18',
          flexShrink:     0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, letterSpacing: 3, color: '#e8a46c', textTransform: 'uppercase' }}>
              // ANALYTICS
            </span>
            <div style={{ display: 'flex', gap: 0 }}>
              {[7, 30, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  style={{
                    padding:    '3px 10px',
                    background: days === d ? '#e8a46c' : 'transparent',
                    border:     '1px solid #222',
                    borderRight: 'none',
                    color:      days === d ? '#000' : '#444',
                    fontSize:    9,
                    fontWeight:  700,
                    letterSpacing: 1,
                    cursor:      'pointer',
                    fontFamily: '"JetBrains Mono", monospace',
                  }}
                >
                  {d}D
                </button>
              ))}
              <div style={{ width: 1, background: '#222' }} />
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: '1px solid #222', color: '#555', width: 28, height: 28, cursor: 'pointer', fontSize: 13 }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#333', fontSize: 11 }}>
              LOADING...
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#ff1a2e', fontSize: 11 }}>
              {error}
            </div>
          ) : !summary ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#333', fontSize: 11 }}>
              No data yet. Build something first.
            </div>
          ) : (
            <>
              {/* Stat cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1, marginBottom: 1 }}>
                <StatCard label="Generations"  value={summary.totalGenerations} color="#e8a46c" />
                <StatCard label="Total Tokens" value={summary.totalTokens.toLocaleString()} color="#b7b2a9" />
                <StatCard label="Avg Duration" value={`${(summary.avgDurationMs / 1000).toFixed(1)}s`} color="#c9c4bb" />
                <StatCard label="Providers Used" value={Object.keys(summary.byProvider).length} color="#ff1a2e" />
              </div>

              {/* Provider breakdown */}
              {providers.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 9, letterSpacing: 3, color: '#333', textTransform: 'uppercase', marginBottom: 12 }}>
                    // PROVIDER USAGE
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {providers.map(([id, data]) => (
                      <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 80, fontSize: 9, color: PROVIDER_COLORS[id] ?? '#555', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'left', flexShrink: 0 }}>
                          {id}
                        </div>
                        <Bar value={data.count} max={maxCount} color={PROVIDER_COLORS[id] ?? '#555'} />
                        <div style={{ fontSize: 9, color: '#555', width: 60, textAlign: 'right', flexShrink: 0 }}>
                          {data.count} req
                        </div>
                        <div style={{ fontSize: 9, color: '#333', width: 80, textAlign: 'right', flexShrink: 0 }}>
                          {data.tokens.toLocaleString()} tok
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mode breakdown */}
              {Object.keys(summary.byMode).length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 9, letterSpacing: 3, color: '#333', textTransform: 'uppercase', marginBottom: 12 }}>
                    // MODE BREAKDOWN
                  </div>
                  <div style={{ display: 'flex', gap: 1 }}>
                    {Object.entries(summary.byMode).map(([mode, count]) => {
                      const pct = summary.totalGenerations > 0 ? Math.round((count / summary.totalGenerations) * 100) : 0;
                      const modeColors: Record<string, string> = { fullstack: '#e8a46c', frontend: '#c9c4bb', backend: '#b7b2a9', review: '#ff1a2e' };
                      return (
                        <div key={mode} style={{ flex: pct || 1, background: modeColors[mode] ?? '#333', padding: '10px 8px', minWidth: 40 }}>
                          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 8, color: '#000', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                            {mode}
                          </div>
                          <div style={{ fontFamily: '"Orbitron", sans-serif', fontSize: 14, fontWeight: 900, color: '#000', marginTop: 4 }}>
                            {pct}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recent activity */}
              {recent.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 9, letterSpacing: 3, color: '#333', textTransform: 'uppercase', marginBottom: 12 }}>
                    // RECENT ACTIVITY
                  </div>
                  <div style={{ border: '1px solid #111' }}>
                    {recent.map((e, i) => (
                      <div key={e.id} style={{
                        display:       'flex',
                        alignItems:    'center',
                        gap:            12,
                        padding:        '8px 12px',
                        borderBottom:  i < recent.length - 1 ? '1px solid #0d0c0b' : 'none',
                        fontSize:       9,
                      }}>
                        <div style={{ color: e.success ? '#b7b2a9' : '#ff1a2e', width: 8, flexShrink: 0 }}>
                          {e.success ? '●' : '✕'}
                        </div>
                        <div style={{ color: PROVIDER_COLORS[e.provider] ?? '#555', width: 70, flexShrink: 0, letterSpacing: 1 }}>
                          {e.provider}
                        </div>
                        <div style={{ color: '#444', width: 70, flexShrink: 0 }}>
                          {e.mode}
                        </div>
                        <div style={{ color: '#333', flex: 1 }}>
                          {e.tokens.toLocaleString()} tokens
                        </div>
                        <div style={{ color: '#222', flexShrink: 0 }}>
                          {(e.durationMs / 1000).toFixed(1)}s
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
