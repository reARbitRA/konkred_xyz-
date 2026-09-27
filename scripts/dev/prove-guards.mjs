#!/usr/bin/env node
/**
 * Guard reversion proof.
 *
 * A test that passes proves nothing on its own: it may assert something the
 * code could not violate even if the guard were deleted. For each guard added
 * in this work, this script
 *
 *   1. edits the source to remove exactly that guard,
 *   2. runs the test that is supposed to catch it,
 *   3. records the RAW failure output,
 *   4. restores the file byte-for-byte.
 *
 * A guard whose test still passes with the guard removed is reported as
 * NOT PROVEN — that is a defect in the test, not a success.
 *
 * Usage:  node scripts/dev/prove-guards.mjs [--out docs/GUARD_REVERSION_PROOF.md]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const outFlag = process.argv.indexOf('--out');
const OUT = outFlag > -1 ? process.argv[outFlag + 1] : 'docs/GUARD_REVERSION_PROOF.md';

/** @type {{id:string,guard:string,file:string,find:string,replace:string,test:string,name:string}[]} */
const GUARDS = [
  {
    id: 'G1',
    guard: 'humanApprovalRequired is forced true server-side',
    file: 'server/workflow-run.ts',
    find: "const output = { ...(parsed as Record<string, unknown>), humanApprovalRequired: true };",
    replace: "const output = { ...(parsed as Record<string, unknown>) };",
    test: 'tests/workflow-runner.test.ts',
    name: 'is true even when the model explicitly returns false',
  },
  {
    id: 'G2',
    guard: 'a failed run is refunded',
    file: 'server/workflow-routes.ts',
    find: "          await deps.billing!.grantRefund(identity, credits, scopedKey);",
    replace: "          void 0; // guard reverted: no refund",
    test: 'tests/workflow-runner.test.ts',
    name: 'refunds when the gateway is unreachable',
  },
  {
    id: 'G3',
    guard: 'anonymous callers cannot run non-public products',
    file: 'server/workflow-routes.ts',
    find: "if (!product.runnableForAnon && identity.startsWith('anon:')) {",
    replace: "if (false) {",
    test: 'tests/workflow-runner.test.ts',
    name: 'a STANDARD_KIT product refuses an anonymous caller with 401',
  },
  {
    id: 'G4',
    guard: 'ENTERPRISE_INTEGRATION products are not self-serve',
    file: 'server/workflow-routes.ts',
    find: "    // 2 ── status gate\n    if (!product.runnable) {",
    replace: "    // 2 ── status gate\n    if (false) {",
    test: 'tests/workflow-runner.test.ts',
    name: 'ENTERPRISE_INTEGRATION is not self-serve',
  },
  {
    id: 'G5',
    guard: 'model output is validated against the product schema',
    file: 'server/workflow-run.ts',
    find: "  const outputErrors = validateDemoOutput(product, output);",
    replace: "  const outputErrors: string[] = []; // guard reverted: no output validation",
    test: 'tests/workflow-runner.test.ts',
    name: 'refunds when the output violates the schema',
  },
  {
    id: 'G6',
    guard: 'the quota paywall blocks a run that cannot be paid for',
    file: 'server/workflow-routes.ts',
    find: "      if (spend.ok === false) {",
    replace: "      if (false) {",
    test: 'tests/workflow-runner.test.ts',
    name: '402 QUOTA_EXHAUSTED with an upgradeUrl once the balance',
  },
  {
    id: 'G7',
    guard: 'an idempotency key is replayed instead of re-charged',
    file: 'server/workflow-routes.ts',
    find: "        if (prior && prior.status === 'ok') {",
    replace: "        if (false) {",
    test: 'tests/workflow-runner.test.ts',
    name: 'a replayed key returns the identical result and charges nothing more',
  },
  {
    id: 'G8',
    guard: 'per-IP demo rate limit',
    file: 'server/workflow-routes.ts',
    find: "      if (ipCount >= demoIpMax) {",
    replace: "      if (false) {",
    test: 'tests/workflow-runner.test.ts',
    name: 'enforces a per-IP hourly limit',
  },
  {
    id: 'G9',
    guard: 'global 24h demo ceiling',
    file: 'server/workflow-routes.ts',
    find: "      if (globalCount >= demoGlobalMax) {",
    replace: "      if (false) {",
    test: 'tests/workflow-runner.test.ts',
    name: 'enforces a global 24h ceiling that no single IP can evade',
  },
  {
    id: 'G10',
    guard: 'demos fail closed when the abuse ledger is unavailable',
    file: 'server/workflow-routes.ts',
    find: "    if (!deps.store) {\n      return fail(\n        res,\n        503,\n        'DEMO_UNAVAILABLE',",
    replace: "    if (false) {\n      return fail(\n        res,\n        503,\n        'DEMO_UNAVAILABLE',",
    test: 'tests/workflow-runner.test.ts',
    name: 'fails CLOSED with no database',
  },
  {
    id: 'G11',
    guard: 'oversized input is refused, never truncated',
    file: 'server/workflow-run.ts',
    find: "  if (plan.estimatedTokens > product.maxInputTokens) {",
    replace: "  if (false) {",
    test: 'tests/workflow-runner.test.ts',
    name: 'input above the product maximum is refused, never truncated',
  },
  {
    id: 'G12',
    guard: 'no /api route answers with HTML',
    file: 'server/api-error-handler.ts',
    find: "  if (!req.path.startsWith('/api')) return next(error);",
    replace: "  return next(error); // guard reverted: fall through to Express's HTML page",
    test: 'tests/workflow-catalogue.test.ts',
    name: 'a malformed JSON body still yields JSON',
  },
  {
    id: 'G13',
    guard: 'validateDemoOutput accepts scalar arrays',
    file: 'catalog/validate.ts',
    find: "        if (itemSchema.type === 'string' || itemSchema.type === 'number' || itemSchema.type === 'boolean') {",
    replace: "        if (false) {",
    test: 'tests/workflow-products.test.ts',
    name: 'accepts an array of strings where the schema says items: string',
  },
  {
    id: 'G14',
    guard: 'manifest fields stay in sync with catalog/types.ts',
    file: 'catalog/product-manifest.json',
    find: '"creditsPerRun": 16,',
    replace: '"creditsPerRun": 999,',
    test: 'tests/workflow-manifest-sync.test.ts',
    name: 'creditsPerRun equals',
  },
];

function runTest(file, name) {
  const res = spawnSync('npx', ['vitest', 'run', file, '-t', name], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, CI: '1', NO_COLOR: '1', FORCE_COLOR: '0' },
    timeout: 180_000,
  });
  const out = `${res.stdout || ''}${res.stderr || ''}`.replace(/\u001b\[[0-9;]*m/g, '');
  // "Tests  3 passed | 1 failed (4)" — how many test cases actually executed.
  const summary = /Tests\s+(.+?)\s+\((\d+)\)/.exec(out);
  const ran = summary ? Number(summary[2]) : 0;
  const passed = /(\d+) passed/.exec(summary ? summary[1] : '');
  const failed = /(\d+) failed/.exec(summary ? summary[1] : '');
  return {
    code: res.status,
    out,
    ran,
    passed: passed ? Number(passed[1]) : 0,
    failed: failed ? Number(failed[1]) : 0,
    started: /Test Files/.test(out),
  };
}

/** Trim vitest noise down to the part a reader needs. */
function excerpt(output) {
  const lines = output.replace(/\u001b\[[0-9;]*m/g, '').split('\n');
  const start = lines.findIndex((l) => /Failed Tests|FAIL |AssertionError/.test(l));
  const slice = start > -1 ? lines.slice(start, start + 26) : lines.slice(-26);
  return slice.join('\n').trim();
}

const results = [];
for (const guard of GUARDS) {
  const abs = path.join(ROOT, guard.file);
  const original = readFileSync(abs, 'utf8');
  const occurrences = original.split(guard.find).length - 1;

  if (occurrences !== 1) {
    results.push({ ...guard, verdict: 'SKIPPED', detail: `anchor matched ${occurrences} times; the script needs updating`, output: '' });
    process.stderr.write(`${guard.id} SKIPPED (anchor matched ${occurrences}×)\n`);
    continue;
  }

  // Control run: with the guard in place the named test must exist, execute,
  // and pass. Without this a broken CLI invocation would look like proof.
  const control = runTest(guard.test, guard.name);
  if (!control.started || control.passed === 0 || control.code !== 0) {
    results.push({
      ...guard,
      verdict: 'INCONCLUSIVE',
      detail: !control.started
        ? 'the test runner did not start — the proof would be meaningless'
        : control.passed === 0
          ? 'the -t filter selected no test (vitest treats it as a regex)'
          : 'the test does not pass with the guard in place',
      baseline: `${control.passed} passed, ${control.failed} failed, exit ${control.code}`,
      output: excerpt(control.out),
    });
    process.stderr.write(`${guard.id} INCONCLUSIVE (control run)\n`);
    continue;
  }

  writeFileSync(abs, original.replace(guard.find, guard.replace));
  let run;
  try {
    run = runTest(guard.test, guard.name);
  } finally {
    writeFileSync(abs, original);
  }
  const restored = readFileSync(abs, 'utf8') === original;

  let verdict;
  let detail = restored ? '' : 'FILE NOT RESTORED';
  if (!run.started) {
    verdict = 'INCONCLUSIVE';
    detail = 'the test runner did not start after the reversion';
  } else if (run.passed === 0 && run.failed === 0) {
    verdict = 'INCONCLUSIVE';
    detail = 'no test executed after the reversion';
  } else if (run.failed > 0) {
    verdict = 'PROVEN';
  } else {
    verdict = 'NOT PROVEN';
  }

  results.push({
    ...guard,
    verdict,
    detail,
    baseline: `${control.passed} passed, exit ${control.code}`,
    reverted: `${run.passed} passed, ${run.failed} failed, exit ${run.code}`,
    output: excerpt(run.out),
  });
  process.stderr.write(`${guard.id} ${verdict}${detail ? ` (${detail})` : ''}\n`);
}

const proven = results.filter((r) => r.verdict === 'PROVEN').length;
const stamp = new Date().toISOString().slice(0, 10);

let md = `# Guard reversion proof

Generated by \`node scripts/dev/prove-guards.mjs\` on ${stamp}.
Do not edit by hand — regenerate it.

For each guard the source is edited to remove that guard, the test that is
supposed to catch it is run, the raw failure is recorded, and the file is
restored byte-for-byte. **PROVEN** means the test failed with the guard
removed. **NOT PROVEN** means the test passed anyway and is therefore not
testing what it claims.

Result: **${proven} of ${results.length} guards proven.**

Each guard is also given a **control run** first: with the guard still in
place the named test must match at least one case and pass. A guard whose
control run does not pass is reported INCONCLUSIVE rather than counted.

| # | Guard | File | Test | Control | Reverted | Verdict |
|---|-------|------|------|---------|----------|---------|
`;
for (const r of results) {
  md += `| ${r.id} | ${r.guard} | \`${r.file}\` | \`${r.name}\` | ${r.baseline || '—'} | ${r.reverted || '—'} | **${r.verdict}** |\n`;
}

md += '\n## Raw output\n';
for (const r of results) {
  md += `\n### ${r.id} — ${r.guard}\n\n`;
  md += `**File:** \`${r.file}\`\n\n`;
  md += `**Reverted by replacing**\n\n\`\`\`\n${r.find}\n\`\`\`\n\n**with**\n\n\`\`\`\n${r.replace}\n\`\`\`\n\n`;
  md += `**Command:** \`npx vitest run ${r.test} -t "${r.name}"\`\n\n`;
  if (r.baseline) md += `**Control (guard in place):** ${r.baseline}\n\n`;
  if (r.reverted) md += `**After reversion:** ${r.reverted}\n\n`;
  md += `**Verdict:** ${r.verdict}${r.detail ? ` — ${r.detail}` : ''}\n\n`;
  if (r.output) md += `\`\`\`\n${r.output}\n\`\`\`\n`;
}

writeFileSync(path.join(ROOT, OUT), md);
process.stderr.write(`\nwrote ${OUT} — ${proven}/${results.length} proven\n`);
process.exit(proven === results.length ? 0 : 1);
