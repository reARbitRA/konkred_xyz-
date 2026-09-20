/**
 * LiveEnvironment — real-time interactive environment for fullKONK_>.
 * Generated code renders AS it streams: Sandpack compiles React/TSX in the
 * browser; HTML/CSS/JS runs in a sandboxed blob iframe; anything not
 * previewable gets an honest summary panel (no fake renders).
 *
 * Source: owner-docs/Live env.md (konkred.xyz variant), restyled to the
 * brutalist console system (fk-* classes).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SandpackProvider,
  SandpackPreview,
  SandpackCodeEditor,
  SandpackConsole,
  useSandpack,
} from '@codesandbox/sandpack-react';
import type { GeneratedFile } from '../../types';

type EnvTab = 'preview' | 'editor' | 'console';
type DeviceMode = 'desktop' | 'tablet' | 'mobile';

interface LiveMetrics {
  renderTime: number;
  fileCount: number;
  linesOfCode: number;
  hasErrors: boolean;
}

/* ── Sandpack file map from generated files ── */
function buildSandpackFiles(files: GeneratedFile[]): Record<string, { code: string; active?: boolean }> {
  const out: Record<string, { code: string; active?: boolean }> = {};

  out['/package.json'] = {
    code: JSON.stringify({
      name: 'fullkonk-preview',
      version: '1.0.0',
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
        'framer-motion': 'latest',
        'lucide-react': 'latest',
        clsx: 'latest',
        'tailwind-merge': 'latest',
      },
      devDependencies: {
        '@types/react': 'latest',
        '@types/react-dom': 'latest',
        typescript: 'latest',
      },
    }, null, 2),
  };

  if (!files.some((f) => f.path.includes('index.html'))) {
    out['/public/index.html'] = {
      code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>fullKONK_&gt; Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
  <style>* { box-sizing: border-box; } body { margin: 0; font-family: 'Space Grotesk', sans-serif; }</style>
</head>
<body>
  <div id="root"></div>
</body>
</html>`,
    };
  }

  let hasApp = false;
  for (const f of files) {
    if (!f.content.trim() || f.content.length < 20) continue;
    if (f.isTest) continue;
    const path = f.path.startsWith('/') ? f.path : `/${f.path}`;
    if (path.includes('App.tsx') || path.includes('App.jsx')) hasApp = true;
    out[path] = { code: f.content };
  }

  if (!hasApp && files.length > 0) {
    const firstReact = files.find((f) => f.language === 'tsx' || f.language === 'jsx');
    if (firstReact) {
      const rel = firstReact.path.replace(/^\//, '').replace(/\.(tsx|jsx)$/, '');
      out['/App.tsx'] = {
        code: `// Auto-generated entry point
import Component from './${rel}';
export default function App() {
  return <Component />;
}`,
        active: true,
      };
    }
  }

  if (!out['/index.tsx'] && !out['/src/index.tsx']) {
    out['/index.tsx'] = {
      code: `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
);`,
    };
  }
  return out;
}

/* ── error hook bridge ── */
const SandpackStatus: React.FC<{ onError: (has: boolean) => void }> = ({ onError }) => {
  const { sandpack } = useSandpack();
  useEffect(() => {
    const state = sandpack.bundlerState as { errors?: Record<string, unknown> } | null;
    onError(Boolean(state?.errors && Object.keys(state.errors).length > 0));
  }, [sandpack.bundlerState, onError]);
  return null;
};

/* ── HTML blob preview for non-React outputs ── */
const HtmlPreview: React.FC<{ files: GeneratedFile[] }> = ({ files }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (!iframeRef.current) return;
    const htmlFile = files.find((f) => f.language === 'html');
    const cssFile = files.find((f) => f.language === 'css' || f.language === 'scss');
    const jsFile = files.find((f) => f.language === 'javascript' || f.language === 'js');
    if (!htmlFile) return;
    let html = htmlFile.content;
    if (cssFile) html = html.replace('</head>', `<style>${cssFile.content}</style></head>`);
    if (jsFile) html = html.replace('</body>', `<script>${jsFile.content}</script></body>`);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    iframeRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [files]);
  return <iframe ref={iframeRef} sandbox="allow-scripts allow-same-origin allow-forms" style={{ width: '100%', height: '100%', border: 'none', background: '#f4f1eb' }} title="HTML preview" />;
};

const DEVICES: Record<DeviceMode, string> = { desktop: '100%', tablet: '768px', mobile: '375px' };
const deviceIcon: Record<DeviceMode, string> = { desktop: '□', tablet: '▭', mobile: '▯' };

interface Props {
  files: GeneratedFile[];
  streaming: boolean;
}

export default function LiveEnvironment({ files, streaming }: Props) {
  const [tab, setTab] = useState<EnvTab>('preview');
  const [device, setDevice] = useState<DeviceMode>('desktop');
  const [hasErrors, setHasErrors] = useState(false);
  const [renderTime, setRenderTime] = useState(0);

  const hasReact = files.some((f) => f.language === 'tsx' || f.language === 'jsx');
  const hasHtml = files.some((f) => f.language === 'html');
  const canPreview = hasReact || hasHtml;

  const metrics: LiveMetrics = useMemo(() => ({
    renderTime,
    fileCount: files.length,
    linesOfCode: files.reduce((acc, f) => acc + f.content.split('\n').length, 0),
    hasErrors,
  }), [files, hasErrors, renderTime]);

  const renderStart = useRef(Date.now());
  useEffect(() => { renderStart.current = Date.now(); }, [files]);
  const handleLoad = useCallback(() => setRenderTime(Date.now() - renderStart.current), []);
  const onError = useCallback((has: boolean) => setHasErrors(has), []);

  const sandpackFiles = useMemo(() => buildSandpackFiles(files), [files]);

  const mono: React.CSSProperties = { fontFamily: '"IBM Plex Mono", monospace' };

  /* empty state */
  if (files.length === 0) {
    return (
      <div className="fk-root" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14 }}>
        {streaming ? (
          <>
            <div className="fk-brand" style={{ fontSize: 30, animation: 'spin 2s linear infinite' }}>◎</div>
            <div style={{ ...mono, fontSize: 10, letterSpacing: 3, color: '#8a857d' }}>BUILDING ENVIRONMENT…</div>
            <div style={{ ...mono, fontSize: 9, color: '#5c5852' }}>Preview appears as code is generated</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 34, color: '#3d3835' }}>◈</div>
            <div style={{ ...mono, fontSize: 10, letterSpacing: 3, color: '#5c5852' }}>NO OUTPUT YET</div>
            <div style={{ ...mono, fontSize: 9, color: '#5c5852' }}>Describe a product and run the pipeline</div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="fk-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* env top bar */}
      <div className="fk-head" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', flexShrink: 0, overflowX: 'auto' }}>
        {(['preview', 'editor', 'console'] as EnvTab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`fk-btn${tab === t ? ' fk-btn-acc' : ''}`}>{t === 'preview' ? '▶ PREVIEW' : t === 'editor' ? '◈ EDIT' : '▤ CONSOLE'}</button>
        ))}
        <div style={{ flex: 1 }} />
        {tab === 'preview' && (Object.keys(DEVICES) as DeviceMode[]).map((d) => (
          <button key={d} onClick={() => setDevice(d)} className={`fk-btn${device === d ? ' fk-btn-acc' : ''}`} title={d} aria-label={`${d} width`}>{deviceIcon[d]}</button>
        ))}
      </div>

      {/* body */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', justifyContent: 'center', background: '#100e0d' }}>
        {streaming && (
          <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 100, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,.85)', border: '2px solid #0a0908', padding: '4px 10px', ...mono, fontSize: 9, color: '#d60019', letterSpacing: 2 }}>
            <span className="fk-led" style={{ background: '#d60019' }} />
            LIVE BUILD
          </div>
        )}

        {canPreview ? (
          <div style={{ width: DEVICES[device], maxWidth: '100%', height: '100%', transition: 'width .2s', borderLeft: '2px solid #0a0908', borderRight: '2px solid #0a0908' }}>
            {hasReact ? (
              <SandpackProvider
                template="react-ts"
                theme="dark"
                files={sandpackFiles}
                options={{ recompileMode: 'delayed', recompileDelay: 900, classes: { 'sp-wrapper': '!h-full' } }}
              >
                <SandpackStatus onError={onError} />
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  {tab === 'preview' && (
                    <div style={{ flex: 1, minHeight: 0 }} onLoadCapture={handleLoad}>
                      <SandpackPreview showOpenInCodeSandbox={false} showRefreshButton style={{ height: '100%' }} />
                    </div>
                  )}
                  {tab === 'editor' && <SandpackCodeEditor style={{ height: '100%' }} showLineNumbers />}
                  {tab === 'console' && <SandpackConsole style={{ height: '100%' }} />}
                </div>
              </SandpackProvider>
            ) : (
              <HtmlPreview files={files} />
            )}
          </div>
        ) : (
          /* honest fallback: no browser-previewable output */
          <div style={{ padding: 22, overflowY: 'auto', width: '100%' }}>
            <p style={{ ...mono, fontSize: 10, color: '#8a857d', letterSpacing: 2, marginBottom: 12 }}>OUTPUT NOT PREVIEWABLE IN BROWSER — FILE SUMMARY</p>
            <ul style={{ listStyle: 'none' }}>
              {files.map((f) => (
                <li key={f.path} style={{ ...mono, fontSize: 10, color: '#5c5852', padding: '6px 0', borderBottom: '1px solid #2a2624', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ color: '#b7b2a9', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.path}</span>
                  <span style={{ color: '#d60019', flexShrink: 0 }}>{f.content.split('\n').length} ln · {f.language}</span>
                </li>
              ))}
            </ul>
            <p style={{ ...mono, fontSize: 9, color: '#5c5852', marginTop: 12 }}>Backend/config output runs outside the browser — export or push to GitHub to execute.</p>
          </div>
        )}
      </div>

      {/* metrics bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '5px 12px', background: '#100e0d', borderTop: '2px solid #0a0908', flexShrink: 0, ...mono, fontSize: 9 }}>
        <span style={{ color: '#5c5852' }}>{metrics.fileCount} files</span>
        <span style={{ color: '#5c5852' }}>{metrics.linesOfCode.toLocaleString()} lines</span>
        {metrics.renderTime > 0 && <span style={{ color: '#5c5852' }}>render: {metrics.renderTime}ms</span>}
        {metrics.hasErrors && <span style={{ color: '#d60019' }}>⚠ errors</span>}
        <span style={{ marginLeft: 'auto', color: streaming ? '#d60019' : '#d60019' }}>
          {streaming ? '● BUILDING' : '● READY'}
        </span>
      </div>
    </div>
  );
}
