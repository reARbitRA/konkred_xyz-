# Gateway patch list (proposed — not applied)

The gateway repository `reARbitRA/konkred-AI-ecosystem` is **read-only** for
this work. Nothing here has been committed, pushed or deployed to it. This is a
patch list for its owner, with the evidence that motivates each change.

Everything below was read with `gh api` against the default branch and
mirrored to `/tmp/gw/` during Phase 0; file and field names are quoted as
found. Re-verify line numbers before applying — they drift.

---

## P4-1 — `cerebras:gpt-oss-120b` declares an 8 192-token context window

**Severity: high. This one silently truncates paid input today.**

`policies.registry.json` declares:

```json
"cerebras:gpt-oss-120b": {
  "provider": "cerebras",
  "contextWindow": 8192,
  ...
}
```

The real context window for that model on Cerebras is 131 072 tokens. The
gateway sizes its input budget as `contextWindow * contextTrimRatio` with
`contextTrimRatio: 0.45`, i.e. **≈3 686 tokens** of input, and trims anything
above it. A 24 000-token contract routed to this model therefore has roughly
85 % of its text dropped before the model sees it, and the response comes back
confident and wrong.

```diff
   "cerebras:gpt-oss-120b": {
     "provider": "cerebras",
-    "contextWindow": 8192,
+    "contextWindow": 131072,
```

**How to verify after applying:** send a 20 000-token prompt pinned to that
model and confirm `usage.prompt_tokens` is not clamped near 3 700.

---

## P4-2 — `cerebras:llama-8b` declares 8 192 instead of 128 000

Same mechanism, smaller blast radius (the model is a fallback, not a primary).

```diff
   "cerebras:llama-8b": {
     "provider": "cerebras",
-    "contextWindow": 8192,
+    "contextWindow": 128000,
```

---

## P4-3 — Verify, do not blindly change, two further entries

* `cloudflare:llama-8b` — declared 8 192. Cloudflare Workers AI has historically
  served this model with a genuinely small window. **Do not change without
  checking the current Workers AI model card**; an over-declared window is worse
  than an under-declared one, because the request fails upstream instead of
  being trimmed.
* `cerebras:qwen3-235b` — declared 65 536. Plausible; confirm against the
  provider's current documentation.

No diff proposed for these two. Unknown is recorded as unknown.

---

## P4-4 — The `extraction` lane has no private-safe preference

Under `privacy: 'private'` the router filters out every model flagged
`trainsOnData: true` — which is exactly `gemini:*` and `mistral:*`. The
`extraction` preference list is built around those, so a private extraction
request falls through to 8-billion-parameter, quality-2 models. Worse, the −40
preference penalty in `rankCandidates` outweighs the quality term, so a
higher-quality private-safe model that is *not* on the preference list loses to
a weaker one that is.

Suggested shape (names must be checked against the registry before applying):

```diff
   "extraction": {
-    "preferred": ["gemini:flash", "mistral:small", "..."]
+    "preferred": ["gemini:flash", "mistral:small", "..."],
+    "preferredPrivate": ["groq:llama-70b", "cerebras:gpt-oss-120b", "..."]
   }
```

…with `rankCandidates` selecting `preferredPrivate` when
`request.privacy === 'private'`.

**Mitigation already applied on this side, requiring no gateway change:** no
KONKRED product uses `extraction` (decision D-3). The site is not exposed to
this bug. The patch is still worth applying for other gateway consumers.

---

## P4-5 — Consider surfacing the trim decision in `meta`

When the gateway trims input to fit a context window, the caller currently
cannot tell. A single boolean would let this repo refuse to bill for a
truncated answer:

```diff
   meta: {
     ...
+    inputTrimmed: Boolean(trimmedTokens),
+    trimmedTokens,
   }
```

This is additive and backward-compatible. Until it exists, this repo defends
itself by refusing oversized input outright (`400 INPUT_TOO_LARGE`) and by
chunking below that ceiling rather than relying on the gateway to cope —
`server/workflow-run.ts`, decision D-8.

---

## Not proposed

* **Streaming.** Out of scope by instruction. The existing post-hoc SSE
  `stage`/`delta` contract is used exactly as-is.
* **New provider lanes.** Out of scope.
* **Auth or rate-limit changes.** The gateway's `x-api-key` check is correct
  for this use; the per-caller limits belong on this side, where the identity
  is known.
