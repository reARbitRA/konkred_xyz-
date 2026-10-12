/**
 * Pure state machine for the fullKONK stream.
 *
 * It mirrors exactly what pages/FullKonkPage.tsx renders (pipeline stage,
 * provider/failover badges, metrics, generated text, extracted files, done and
 * error states) but contains no React, DOM or network code — which makes the
 * whole Browser → Vercel route → Gateway → UI pipeline testable end to end
 * (see tests/gateway-proxy.test.ts).
 *
 * Message history updates are returned as small operations so the React layer
 * keeps ownership of its own message list.
 */
import type { BuildMode, GeneratedFile, PipelineStage, StreamChunk } from '../types';
import { extractFiles, mergeFiles } from './codeFiles';

export interface StreamMetrics {
  tokensPerSecond: number;
  totalTokens: number;
  provider: string;
  elapsedMs: number;
  transition?: string;
}

export type StreamMessageOp =
  | { type: 'append'; content: string; stage: PipelineStage }
  | { type: 'trimLast'; characters: number; stage: PipelineStage };

export interface StreamFailure {
  message: string;
  kind: 'configuration' | 'provider';
  retryable: boolean;
}

export interface StreamState {
  mode: BuildMode;
  baseFiles: GeneratedFile[];
  /**
   * Files announced by explicit `file` events. Kept separate from the files
   * parsed out of streamed markdown so a later delta/reset cannot silently drop
   * a file the gateway already delivered.
   */
  explicitFiles: GeneratedFile[];
  stage: PipelineStage;
  stageText: string;
  provider: string;
  model: string;
  metrics: StreamMetrics;
  text: string;
  files: GeneratedFile[];
  completed: boolean;
  failure: StreamFailure | null;
}

export const createStreamState = (options: { mode: BuildMode; baseFiles?: GeneratedFile[] }): StreamState => ({
  mode: options.mode,
  baseFiles: options.baseFiles ?? [],
  explicitFiles: [],
  stage: options.mode === 'review' ? 'review' : 'architect',
  stageText: 'INITIALIZING PIPELINE',
  provider: '',
  model: '',
  metrics: { tokensPerSecond: 0, totalTokens: 0, provider: '', elapsedMs: 0 },
  text: '',
  files: options.baseFiles ?? [],
  completed: false,
  failure: null,
});

export interface ReduceResult {
  state: StreamState;
  ops: StreamMessageOp[];
}

/**
 * Applies one decoded stream chunk. Unknown chunks are ignored so a malformed
 * or future event can never blank the workspace or throw.
 */
export const reduceStreamChunk = (state: StreamState, chunk: StreamChunk): ReduceResult => {
  const ops: StreamMessageOp[] = [];
  switch (chunk.type) {
    case 'stage':
      return {
        state: { ...state, stage: chunk.stage, stageText: chunk.content || chunk.stage.toUpperCase() },
        ops,
      };

    case 'provider':
      return {
        state: { ...state, provider: chunk.provider, model: chunk.model || state.model, stageText: `${chunk.provider} / ${chunk.model}` },
        ops,
      };

    case 'failover':
      return {
        state: {
          ...state,
          metrics: { ...state.metrics, transition: `${chunk.from} → ${chunk.to || 'NEXT PROVIDER'}` },
        },
        ops,
      };

    case 'metrics':
      return {
        state: {
          ...state,
          metrics: {
            ...state.metrics,
            ...chunk.data,
            provider: chunk.data.provider || state.metrics.provider,
            transition: state.metrics.transition,
          },
        },
        ops,
      };

    case 'reset': {
      const text = state.stage === 'architect'
        ? state.text
        : state.text.slice(0, Math.max(0, state.text.length - chunk.characters));
      if (state.stage !== 'architect') ops.push({ type: 'trimLast', characters: chunk.characters, stage: state.stage });
      return {
        state: { ...state, text, files: mergeFiles(mergeFiles(state.baseFiles, extractFiles(text)), state.explicitFiles) },
        ops,
      };
    }

    case 'delta': {
      const text = state.stage === 'architect' ? state.text : state.text + chunk.content;
      ops.push({ type: 'append', content: chunk.content, stage: state.stage });
      return {
        state: {
          ...state,
          text,
          files: state.stage === 'architect'
            ? state.files
            : mergeFiles(mergeFiles(state.baseFiles, extractFiles(text)), state.explicitFiles),
        },
        ops,
      };
    }

    case 'file': {
      const file = { ...chunk.file, language: chunk.file.language.toLowerCase() };
      return {
        state: {
          ...state,
          explicitFiles: mergeFiles(state.explicitFiles, [file]),
          files: mergeFiles(state.files, [file]),
        },
        ops,
      };
    }

    case 'done':
      return { state: { ...state, completed: true, stage: 'done', stageText: 'BUILD COMPLETE' }, ops };

    case 'error':
      return {
        state: {
          ...state,
          failure: {
            message: chunk.error,
            kind: chunk.kind === 'configuration' ? 'configuration' : 'provider',
            retryable: chunk.retryable ?? chunk.kind !== 'configuration',
          },
        },
        ops,
      };

    default:
      return { state, ops };
  }
};

/** Convenience for tests and non-React consumers: fold a whole stream. */
export const foldStream = (seed: StreamState, chunks: StreamChunk[]): { state: StreamState; ops: StreamMessageOp[] } => {
  let state = seed;
  const ops: StreamMessageOp[] = [];
  for (const chunk of chunks) {
    const result = reduceStreamChunk(state, chunk);
    state = result.state;
    ops.push(...result.ops);
  }
  return { state, ops };
};
