import React, { useState } from 'react';
import type { ProductRecord } from '../../catalog/types.ts';
import { FIXTURES } from '../../catalog/fixtures.ts';
import { runProductDemo, type DemoRunResult } from '../../services/demoService.ts';
import { validateDemoInput } from '../../catalog/validate.ts';
import { Play, Loader2, AlertTriangle, CheckCircle2, Wand2, Eraser, TerminalSquare, ShieldCheck } from 'lucide-react';
import { track } from '../../utils/analytics.ts';

interface MicroToolProps {
  product: ProductRecord;
  /** Key into the fixture registry (legacy slug) when it differs from the canonical slug. */
  fixtureKey?: string;
}

interface FieldSpec {
  key: string;
  label: string;
  type: string;
  required: boolean;
  isLongText: boolean;
  isJson: boolean;
}

function buildFields(product: ProductRecord): FieldSpec[] {
  const schema = product.inputSchema as { properties?: Record<string, any>; required?: string[] };
  const required = schema.required || [];
  return Object.entries(schema.properties || {}).map(([key, prop]) => {
    const p = prop as { type?: string; minLength?: number };
    const label = key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, c => c.toUpperCase());
    return {
      key,
      label,
      type: p.type || 'string',
      required: required.includes(key),
      isLongText: p.type === 'string' && (p.minLength ?? 0) >= 100,
      isJson: p.type === 'array' || p.type === 'object',
    };
  });
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2);
}

/**
 * Micro-tool UI for each workflow product.
 * - Form fields are generated from the product's input schema.
 * - "Load sample data" fills the form from the public synthetic fixture.
 * - Runs server-side; output is schema-validated before display.
 * - No prompts, schemas, limitations or risk warnings are shown to customers —
 *   those live in the product manifest (backend).
 */
export const MicroTool: React.FC<MicroToolProps> = ({ product, fixtureKey }) => {
  const fields = buildFields(product);
  const fixture = FIXTURES[fixtureKey ?? product.slug] as Record<string, unknown> | undefined;

  const initialValues = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const f of fields) out[f.key] = '';
    return out;
  };

  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<DemoRunResult | null>(null);
  const [clientErrors, setClientErrors] = useState<string[]>([]);

  const setValue = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setClientErrors([]);
    setResult(null);
  };

  const loadSample = () => {
    if (!fixture) return;
    const next: Record<string, string> = {};
    for (const f of fields) {
      const v = fixture[f.key];
      next[f.key] = v === undefined ? '' : formatValue(v);
    }
    setValues(next);
    setClientErrors([]);
    setResult(null);
  };

  const clearForm = () => {
    setValues(initialValues());
    setClientErrors([]);
    setResult(null);
  };

  const buildPayload = (): Record<string, unknown> | null => {
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = (values[f.key] || '').trim();
      if (!raw) continue;
      if (f.isJson) {
        try {
          payload[f.key] = JSON.parse(raw);
        } catch {
          setClientErrors([`${f.label} must be valid JSON. Load sample data or paste a valid JSON value.`]);
          return null;
        }
      } else if (f.type === 'number') {
        const num = Number(raw);
        if (Number.isNaN(num)) {
          setClientErrors([`${f.label} must be a number.`]);
          return null;
        }
        payload[f.key] = num;
      } else {
        payload[f.key] = raw;
      }
    }
    return payload;
  };

  const handleRun = async () => {
    const payload = buildPayload();
    if (!payload) return;

    const inputErrors = validateDemoInput(product, payload);
    if (inputErrors.length > 0) {
      setClientErrors(inputErrors);
      setResult({ status: 'NEEDS_INPUT', productId: product.slug, runId: 'client', sourceRefs: [], message: 'Please complete the required inputs below.', validationErrors: inputErrors });
      return;
    }

    setIsRunning(true);
    setClientErrors([]);
    setResult(null);
    track('demo_start', product.slug);
    try {
      const res = await runProductDemo(product.slug, payload);
      setResult(res);
      if (res.status === 'COMPLETE') track('demo_complete', product.slug);
    } catch (e) {
      setResult({ status: 'ERROR', productId: product.slug, runId: 'client', sourceRefs: [], message: e instanceof Error ? e.message : 'The tool failed to run. Please try again.' });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section
      aria-label={`${product.name} tool`}
      className="border-2 border-black bg-[#171514] rounded-2xl overflow-hidden shadow-[4px_4px_0px_0px_#0a0908]"
    >
      {/* Tool header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-[#171514] px-5 py-3">
        <div className="flex items-center gap-2">
          <TerminalSquare size={15} className="text-amber-400" />
          <span className="font-mono font-black uppercase tracking-widest text-[11px] text-white">
            {product.name}
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 font-mono font-black uppercase tracking-widest text-[9px] text-emerald-400/90 border border-emerald-500/30 bg-emerald-500/10 rounded px-2 py-1">
          <ShieldCheck size={10} />
          Demo · Sample data
        </span>
      </div>

      <div className="p-5 md:p-6 space-y-5">
        <p className="text-xs text-zinc-400 leading-relaxed">
          {product.shortDescription} Paste your own input or load the sample data, then run the tool.
        </p>

        {/* Field inputs */}
        <div className="space-y-4">
          {fields.map(field => (
            <div key={field.key}>
              <label htmlFor={`tool-${product.slug}-${field.key}`} className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5">
                {field.label} {field.required && <span className="text-amber-500">*</span>}
                {field.isJson && <span className="ml-2 text-zinc-600 normal-case">(JSON)</span>}
              </label>
              {field.isJson ? (
                <textarea
                  id={`tool-${product.slug}-${field.key}`}
                  value={values[field.key]}
                  onChange={(e) => setValue(field.key, e.target.value)}
                  rows={4}
                  placeholder='[ { "key": "value" } ]'
                  className="w-full bg-[#0a0908] border-2 border-black rounded-xl p-3 text-xs font-mono text-emerald-300 placeholder-zinc-600 focus:outline-none focus:border-amber-500 transition-colors resize-y"
                />
              ) : field.isLongText ? (
                <textarea
                  id={`tool-${product.slug}-${field.key}`}
                  value={values[field.key]}
                  onChange={(e) => setValue(field.key, e.target.value)}
                  rows={8}
                  placeholder="Paste your text here…"
                  className="w-full bg-[#0a0908] border-2 border-black rounded-xl p-3 text-xs font-mono text-emerald-300 placeholder-zinc-600 focus:outline-none focus:border-amber-500 transition-colors resize-y"
                />
              ) : (
                <input
                  id={`tool-${product.slug}-${field.key}`}
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={values[field.key]}
                  onChange={(e) => setValue(field.key, e.target.value)}
                  placeholder="Enter a value…"
                  className="w-full bg-[#0a0908] border-2 border-black rounded-xl p-3 text-xs font-mono text-emerald-300 placeholder-zinc-600 focus:outline-none focus:border-amber-500 transition-colors"
                />
              )}
            </div>
          ))}
        </div>

        {/* Action row */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="inline-flex items-center gap-2 bg-amber-500 text-black font-mono font-black text-xs uppercase tracking-widest px-6 py-3 border-2 border-black hover:bg-black hover:text-amber-400 hover:border-amber-500 transition-all disabled:opacity-60 cursor-pointer"
          >
            {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {isRunning ? 'Running…' : 'Run Tool'}
          </button>
          {fixture && (
            <button
              onClick={loadSample}
              className="inline-flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-widest px-4 py-3 border-2 border-zinc-700 text-zinc-300 hover:border-amber-500 hover:text-amber-400 transition-all cursor-pointer"
            >
              <Wand2 size={13} />
              Load Sample Data
            </button>
          )}
          <button
            onClick={clearForm}
            className="inline-flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-widest px-4 py-3 text-zinc-500 hover:text-white transition-colors cursor-pointer"
          >
            <Eraser size={13} />
            Clear
          </button>
        </div>

        {/* Client-side validation errors */}
        {clientErrors.length > 0 && (
          <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/40 rounded-xl px-4 py-3" role="alert">
            <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
            <ul className="text-xs text-amber-300 font-mono space-y-1">
              {clientErrors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          </div>
        )}

        {/* Result panel */}
        {result && (
          <div className="space-y-3">
            {result.status === 'COMPLETE' && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-zinc-500">
                  <CheckCircle2 size={12} className="text-emerald-400" />
                  <span>RUN: {result.runId}</span>
                  <span>· MODEL: {result.model}</span>
                  <span>· OUTPUT VALIDATED</span>
                </div>
                <pre className="bg-[#0a0908] border-2 border-emerald-500/30 rounded-xl p-4 text-xs text-emerald-200 font-mono leading-relaxed overflow-x-auto max-h-[480px] overflow-y-auto whitespace-pre-wrap" data-testid="demo-result">
                  {JSON.stringify(result.result ?? result.output, null, 2)}
                </pre>
                {result.validation && (
                  <p className="text-[9px] font-mono text-zinc-600">
                    validation — schema: {result.validation.schema} · provenance: {result.validation.provenance} · safety: {result.validation.safety} · actions executed: none
                  </p>
                )}
              </>
            )}

            {result.status === 'NEEDS_INPUT' && (
              <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/40 rounded-xl px-4 py-3" role="status">
                <TerminalSquare size={15} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-mono font-black uppercase tracking-widest text-amber-400">
                    {result.message}
                  </p>
                  {result.validationErrors && (
                    <ul className="list-disc pl-4 text-[11px] font-mono text-amber-300 space-y-0.5">
                      {result.validationErrors.map((v, i) => <li key={i}>{v}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {result.status === 'NEEDS_EXTERNAL_VALIDATOR' && (
              <div className="flex items-start gap-2.5 bg-purple-500/10 border border-purple-500/40 rounded-xl px-4 py-3" role="status">
                <TerminalSquare size={15} className="text-purple-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-mono font-black uppercase tracking-widest text-purple-400">
                    Engine Provisioned on Request
                  </p>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    This tool's AI engine is enabled for authorized deployments. Use the
                    Workflow Kit, Validation Sprint or Enterprise Pilot options to get it
                    running for your team.
                  </p>
                  {result.message && (
                    <p className="text-[10px] font-mono text-zinc-500 pt-1">{result.message}</p>
                  )}
                </div>
              </div>
            )}

            {(result.status === 'BLOCKED' || result.status === 'ERROR') && (
              <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/40 rounded-xl px-4 py-3" role="alert">
                <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-mono font-black uppercase tracking-widest text-red-400">
                    {result.status === 'BLOCKED' ? 'Output Not Ready' : 'Run Failed'}
                  </p>
                  <p className="text-xs text-zinc-300 leading-relaxed">{result.message}</p>
                  {result.validationErrors && (
                    <ul className="list-disc pl-4 text-[11px] font-mono text-red-300 space-y-0.5">
                      {result.validationErrors.map((v, i) => <li key={i}>{v}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
