import { ENTRIES } from '../content/catalogue/portfolio.ts';
import type { PortfolioEntry } from '../content/catalogue/types.ts';

export type ZoneKey = 'BUILD' | 'AUDIT' | 'ADVERSARY' | 'PUBLISH' | 'DOCUMENT' | 'ORCHESTRATE';

export interface ZoneDefinition {
  key: ZoneKey;
  roman: string;
  console: string;
  product: string;
  descriptor: string;
  intake: string;
  output: string;
}

export const ZONES: ZoneDefinition[] = [
  { key: 'BUILD', roman: 'I', console: 'ASSEMBLY BENCH', product: 'fullkonk_>', descriptor: 'shape a runnable system from one controlled brief', intake: 'one-line brief', output: 'build skeleton' },
  { key: 'AUDIT', roman: 'II', console: 'X-RAY PLATE', product: 'AUDITOR', descriptor: 'inspect evidence before it enters the decision lane', intake: 'source material', output: 'finding plate' },
  { key: 'ADVERSARY', roman: 'III', console: 'ATTACK BENCH', product: 'REDAEYE', descriptor: 'pressure-test a controlled surface with safe probes', intake: 'target rules', output: 'probe grade' },
  { key: 'PUBLISH', roman: 'IV', console: 'PRESS DESK', product: 'konknews', descriptor: 'move a reviewed draft through a traceable press lane', intake: 'approved draft', output: 'wire copy' },
  { key: 'DOCUMENT', roman: 'V', console: 'PRINTING PRESS', product: 'ARTIFACTORY', descriptor: 'forge a structured document package from real inputs', intake: 'source notes', output: 'paper pack' },
  { key: 'ORCHESTRATE', roman: 'VI', console: 'PIPELINE BOARD', product: 'FLOOR OPS', descriptor: 'seal handoffs across a human-supervised operating trail', intake: 'work order', output: 'sealed trail' },
];

export interface Bench {
  id: string;
  number: number;
  source: PortfolioEntry;
  zone: ZoneDefinition;
  difficulty: 'easy' | 'medium' | 'hot';
  duration: string;
  intake: string;
  output: string;
}

/**
 * The canonical portfolio has 36 controlled entries. The physical floor gives
 * every entry a numbered bench and evenly staffed six-zone rail; the entry
 * remains the single source for its title and plain-language job to be done.
 */
export const BENCHES: Bench[] = ENTRIES.map((source, index) => {
  const zone = ZONES[index % ZONES.length];
  const difficulty = (['easy', 'medium', 'hot'] as const)[index % 3];
  const duration = `${6 + ((index * 3) % 13)}s`;
  return {
    id: `W-${String(index + 1).padStart(2, '0')}`,
    number: index + 1,
    source,
    zone,
    difficulty,
    duration: `≈ ${duration}`,
    intake: zone.intake,
    output: zone.output,
  };
});

export const benchesFor = (zone: ZoneKey) => BENCHES.filter((bench) => bench.zone.key === zone);
