/**
 * Pure helpers that turn generated markdown into a file set.
 *
 * Extracted from pages/FullKonkPage.tsx (which re-exports them for backwards
 * compatibility) so the stream state machine in utils/streamState.ts can be
 * unit-tested without rendering the page.
 */
import type { GeneratedFile } from '../types';

export const EXTENSIONS: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', html: 'html', css: 'css',
  json: 'json', prisma: 'prisma', sql: 'sql', yaml: 'yaml', yml: 'yaml', sh: 'bash', bash: 'bash',
};

export function normalizeLanguage(value: string, path: string): string {
  const raw = value.toLowerCase().trim();
  if (raw && raw !== 'text' && raw !== 'plaintext') return EXTENSIONS[raw] || raw;
  const extension = path.split('.').pop()?.toLowerCase() || 'text';
  return EXTENSIONS[extension] || extension;
}

export function cleanPath(value: string): string {
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

export function mergeFiles(base: GeneratedFile[], generated: GeneratedFile[]): GeneratedFile[] {
  const merged = new Map(base.map(file => [file.path, file]));
  generated.forEach(file => merged.set(file.path, file));
  return [...merged.values()];
}
