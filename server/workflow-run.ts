/**
 * Workflow execution core (server-only, framework-agnostic, no I/O of its own).
 *
 * Everything here is pure or takes its one side effect (`callGateway`) as an
 * injected dependency, so the whole run sequence can be exercised in tests
 * without a gateway, a database or a network.
 *
 * The gateway is the ONLY inference path. This module never talks to a
 * provider, never holds a provider key, and never streams.
 */
import { validateDemoInput, validateDemoOutput } from '../catalog/validate.ts';
import { CHUNK_THRESHOLD_TOKENS } from '../catalog/runtime.ts';
import type { ProductRecord } from '../catalog/types.ts';

// ─── token estimation ───────────────────────────────────────────────────────
/**
 * Approximate token count. Deliberately the same crude 4-chars-per-token rule
 * the gateway uses for its own budgeting, so the two sides agree about whether
 * a payload is "big" — a more accurate tokeniser here would just disagree with
 * the component that actually enforces the limit.
 */
export function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4);
}

/** Canonical serialisation of a workflow input. Stable key order, readable. */
export function serialiseInput(input: unknown): string {
  return JSON.stringify(input, null, 2) ?? '';
}

// ─── JSON extraction ────────────────────────────────────────────────────────
const FENCE_RE = /```(?:json|JSON)?\s*([\s\S]*?)```/;

/**
 * Pull a JSON object out of free model text.
 *
 * Handles, in order: a bare JSON object; a ```json fenced block; leading prose
 * followed by an object; trailing prose after an object. Scans for the first
 * balanced `{...}` while respecting string literals and escapes, so a `}`
 * inside a quoted clause cannot end the object early.
 *
 * Returns `null` rather than throwing: an unparseable model response is an
 * expected outcome that the caller turns into a controlled 502.
 */
export function extractJsonObject(raw: string): unknown | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;

  const candidates: string[] = [];
  const trimmed = raw.trim();
  candidates.push(trimmed);

  const fenced = FENCE_RE.exec(raw);
  if (fenced && fenced[1]) candidates.push(fenced[1].trim());

  const balanced = firstBalancedObject(raw);
  if (balanced) candidates.push(balanced);

  for (const candidate of candidates) {
    if (!candidate.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

function firstBalancedObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { if (inString) escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

// ─── chunking ───────────────────────────────────────────────────────────────
export interface InputPlan {
  /** One serialised payload per upstream call. Length 1 when no chunking. */
  chunks: string[];
  chunked: boolean;
  estimatedTokens: number;
  /** Name of the field that was split, for provenance. */
  splitField: string | null;
}

/**
 * Split an oversized input into ordered chunks.
 *
 * NEVER truncates. The largest field is divided into contiguous pieces that
 * together reconstruct the original exactly; every other field is repeated in
 * full on every chunk so each call keeps its context. A caller can verify the
 * reconstruction — `planInput` guarantees `pieces.join('') === original` for
 * string fields and a partition (no loss, no duplication) for arrays.
 *
 * Fidelity cost is recorded in the product's `limitations`, not hidden: a
 * relationship that spans two chunks can be weakened by the synthesis pass.
 */
export function planInput(product: ProductRecord, input: unknown, thresholdTokens = CHUNK_THRESHOLD_TOKENS): InputPlan {
  const serialised = serialiseInput(input);
  const total = estimateTokens(serialised);
  if (total <= thresholdTokens || !input || typeof input !== 'object' || Array.isArray(input)) {
    return { chunks: [serialised], chunked: false, estimatedTokens: total, splitField: null };
  }

  const record = input as Record<string, unknown>;
  const entries = Object.entries(record);
  let splitField: string | null = null;
  let splitSize = 0;
  for (const [key, value] of entries) {
    const size = JSON.stringify(value)?.length ?? 0;
    if ((typeof value === 'string' || Array.isArray(value)) && size > splitSize) {
      splitField = key;
      splitSize = size;
    }
  }
  if (!splitField) {
    // Nothing splittable. Return the whole payload and let the size check that
    // precedes this reject it, rather than quietly sending a doomed request.
    return { chunks: [serialised], chunked: false, estimatedTokens: total, splitField: null };
  }

  // Overhead = everything except the field being split, repeated per chunk.
  const rest: Record<string, unknown> = {};
  for (const [k, v] of entries) if (k !== splitField) rest[k] = v;
  const overheadTokens = estimateTokens(serialiseInput(rest));
  const budgetTokens = Math.max(2_000, thresholdTokens - overheadTokens - 500);
  const budgetChars = budgetTokens * 4;

  const value = record[splitField];
  const pieces: unknown[] =
    typeof value === 'string' ? splitString(value, budgetChars) : splitArray(value as unknown[], budgetChars);

  const chunks = pieces.map((piece, index) =>
    serialiseInput({
      ...rest,
      [splitField as string]: piece,
      _chunk: { index: index + 1, of: pieces.length, field: splitField },
    }),
  );
  return { chunks, chunked: chunks.length > 1, estimatedTokens: total, splitField };
}

/** Contiguous slices on paragraph, then line, then hard boundaries. */
export function splitString(text: string, budgetChars: number): string[] {
  if (text.length <= budgetChars) return [text];
  const out: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(text.length, cursor + budgetChars);
    if (end < text.length) {
      const window = text.slice(cursor, end);
      const para = window.lastIndexOf('\n\n');
      const line = window.lastIndexOf('\n');
      const boundary = para > budgetChars * 0.4 ? para + 2 : line > budgetChars * 0.4 ? line + 1 : -1;
      if (boundary > 0) end = cursor + boundary;
    }
    out.push(text.slice(cursor, end));
    cursor = end;
  }
  return out;
}

/** Partition an array into groups whose serialised size fits the budget. */
export function splitArray(items: unknown[], budgetChars: number): unknown[][] {
  if (!Array.isArray(items) || items.length === 0) return [items ?? []];
  const out: unknown[][] = [];
  let current: unknown[] = [];
  let size = 2;
  for (const item of items) {
    const itemSize = (JSON.stringify(item)?.length ?? 0) + 1;
    if (current.length > 0 && size + itemSize > budgetChars) {
      out.push(current);
      current = [];
      size = 2;
    }
    current.push(item);
    size += itemSize;
  }
  if (current.length > 0 || out.length === 0) out.push(current);
  return out;
}

// ─── gateway contract ───────────────────────────────────────────────────────
export interface GatewayRequest {
  taskType: string;
  systemPrompt: string;
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  privacy: string;
  maxTokens: number;
}

export interface GatewayAttempt {
  modelId: string | null;
  provider: string | null;
  status: number | null;
  errorClass: string | null;
  latencyMs: number;
}

export type GatewayOutcome =
  | {
      ok: true;
      content: string;
      provider: string;
      model: string;
      modelId: string;
      cached: boolean;
      latencyMs: number;
      attempts: GatewayAttempt[];
    }
  | { ok: false; status: number; code: string; retryAfter?: number };

export type CallGateway = (request: GatewayRequest, idempotencyKey: string) => Promise<GatewayOutcome>;

// ─── run result ─────────────────────────────────────────────────────────────
export interface RunProvenance {
  provider: string | null;
  model: string | null;
  attempts: GatewayAttempt[];
  cached: boolean;
  demo: boolean;
  latencyMs: number;
  chunked: boolean;
  chunkCount: number;
  upstreamCalls: number;
  repaired: boolean;
  taskType: string;
  privacy: string;
  creditsCharged: number;
}

export interface RunFailure {
  ok: false;
  status: number;
  code:
    | 'INVALID_INPUT'
    | 'INPUT_TOO_LARGE'
    | 'UPSTREAM_UNAVAILABLE'
    | 'MODEL_OUTPUT_UNPARSEABLE'
    | 'OUTPUT_SCHEMA_VIOLATION';
  message: string;
  details?: string[];
  provenance: RunProvenance;
}

export interface RunSuccess {
  ok: true;
  output: Record<string, unknown>;
  provenance: RunProvenance;
}

export type RunOutcome = RunSuccess | RunFailure;

const REPAIR_INSTRUCTION =
  'Your previous response could not be parsed as JSON. Reply again with the SAME analysis, but emit ' +
  'ONLY a single valid JSON object conforming to the required output schema. No prose, no markdown ' +
  'fences, no commentary before or after the object.';

const SYNTHESIS_INSTRUCTION =
  'The input was too large for one request, so it was split into ordered chunks and each chunk was ' +
  'analysed separately. Below are the per-chunk JSON results in order. Merge them into ONE JSON object ' +
  'conforming to the required output schema: concatenate list-valued fields in chunk order, de-duplicate ' +
  'identical entries, and write summary fields to describe the whole input rather than any single chunk. ' +
  'Do not invent anything that is not present in a chunk result. Reply with ONLY the JSON object.';

function emptyProvenance(product: ProductRecord, demo: boolean): RunProvenance {
  return {
    provider: null,
    model: null,
    attempts: [],
    cached: false,
    demo,
    latencyMs: 0,
    chunked: false,
    chunkCount: 1,
    upstreamCalls: 0,
    repaired: false,
    taskType: product.taskType,
    privacy: product.privacy,
    creditsCharged: 0,
  };
}

export interface RunOptions {
  product: ProductRecord;
  input: unknown;
  idempotencyKey: string;
  callGateway: CallGateway;
  demo?: boolean;
  now?: () => number;
  chunkThresholdTokens?: number;
}

/**
 * Steps 3 and 7–11 of the run sequence. Slug resolution, the status gate,
 * idempotency and credit accounting are the caller's job (see
 * server/workflow-routes.ts) because they need identity and a database; this
 * function stays pure so every failure branch is cheap to test.
 */
export async function executeWorkflow(options: RunOptions): Promise<RunOutcome> {
  const { product, input, idempotencyKey, callGateway } = options;
  const demo = Boolean(options.demo);
  const now = options.now ?? Date.now;
  const started = now();
  const provenance = emptyProvenance(product, demo);

  // ── step 3: the product's own input schema, minLength included ────────────
  const inputErrors = validateDemoInput(product, input);
  if (inputErrors.length > 0) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_INPUT',
      message: 'The request body does not satisfy this product\'s input schema.',
      details: inputErrors,
      provenance,
    };
  }

  // Refuse oversized input loudly. A contract is never silently truncated.
  const plan = planInput(product, input, options.chunkThresholdTokens);
  if (plan.estimatedTokens > product.maxInputTokens) {
    return {
      ok: false,
      status: 400,
      code: 'INPUT_TOO_LARGE',
      message:
        `Input is approximately ${plan.estimatedTokens} tokens; this product accepts at most ` +
        `${product.maxInputTokens}. Split the document and run it in parts — nothing is truncated for you.`,
      provenance,
    };
  }

  provenance.chunked = plan.chunked;
  provenance.chunkCount = plan.chunks.length;

  // ── step 7: the gateway, once per chunk ───────────────────────────────────
  const partials: string[] = [];
  for (let index = 0; index < plan.chunks.length; index += 1) {
    const outcome = await callGateway(
      {
        taskType: product.taskType,
        systemPrompt: product.prompt,
        messages: [{ role: 'user', content: plan.chunks[index] }],
        privacy: product.privacy,
        maxTokens: product.maxOutputTokens,
      },
      plan.chunks.length > 1 ? `${idempotencyKey}-c${index + 1}` : idempotencyKey,
    );
    provenance.upstreamCalls += 1;
    if (outcome.ok === false) {
      return {
        ok: false,
        status: 503,
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'The inference gateway could not complete this run. Nothing was charged. Please retry.',
        provenance: { ...provenance, latencyMs: now() - started },
      };
    }
    absorb(provenance, outcome);
    partials.push(outcome.content);
  }

  // ── synthesis pass for chunked input ──────────────────────────────────────
  let text = partials[0];
  if (plan.chunks.length > 1) {
    const merged = await callGateway(
      {
        taskType: product.taskType,
        systemPrompt: product.prompt,
        messages: [
          {
            role: 'user',
            content: `${SYNTHESIS_INSTRUCTION}\n\n${partials
              .map((p, i) => `--- chunk ${i + 1} of ${partials.length} ---\n${p}`)
              .join('\n\n')}`,
          },
        ],
        privacy: product.privacy,
        maxTokens: product.maxOutputTokens,
      },
      `${idempotencyKey}-synth`,
    );
    provenance.upstreamCalls += 1;
    if (merged.ok === false) {
      return {
        ok: false,
        status: 503,
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'The inference gateway could not complete the synthesis pass. Nothing was charged. Please retry.',
        provenance: { ...provenance, latencyMs: now() - started },
      };
    }
    absorb(provenance, merged);
    text = merged.content;
  }

  // ── step 8: extract JSON, one repair attempt ──────────────────────────────
  let parsed = extractJsonObject(text);
  if (parsed === null) {
    const repair = await callGateway(
      {
        taskType: product.taskType,
        systemPrompt: product.prompt,
        messages: [
          { role: 'user', content: plan.chunked ? partials.join('\n\n') : plan.chunks[0] },
          { role: 'assistant', content: text.slice(0, 4000) },
          { role: 'user', content: REPAIR_INSTRUCTION },
        ],
        privacy: product.privacy,
        maxTokens: product.maxOutputTokens,
      },
      `${idempotencyKey}-repair`,
    );
    provenance.upstreamCalls += 1;
    provenance.repaired = true;
    if (repair.ok === true) {
      absorb(provenance, repair);
      parsed = extractJsonObject(repair.content);
    }
    if (parsed === null) {
      return {
        ok: false,
        status: 502,
        code: 'MODEL_OUTPUT_UNPARSEABLE',
        message: 'The model did not return parseable JSON after a repair attempt. Nothing was charged.',
        provenance: { ...provenance, latencyMs: now() - started },
      };
    }
  }

  // ── step 10: humanApprovalRequired is forced, never trusted ───────────────
  const output = { ...(parsed as Record<string, unknown>), humanApprovalRequired: true };

  // ── step 9: the product's own output schema ───────────────────────────────
  const outputErrors = validateDemoOutput(product, output);
  if (outputErrors.length > 0) {
    return {
      ok: false,
      status: 502,
      code: 'OUTPUT_SCHEMA_VIOLATION',
      message: 'The model output failed this product\'s output schema and was discarded, not returned.',
      details: outputErrors,
      provenance: { ...provenance, latencyMs: now() - started },
    };
  }

  provenance.latencyMs = now() - started;
  return { ok: true, output, provenance };
}

function absorb(provenance: RunProvenance, outcome: Extract<GatewayOutcome, { ok: true }>): void {
  provenance.provider = outcome.provider || provenance.provider;
  provenance.model = outcome.model || provenance.model;
  provenance.cached = provenance.cached || outcome.cached;
  provenance.attempts.push(...outcome.attempts);
}
