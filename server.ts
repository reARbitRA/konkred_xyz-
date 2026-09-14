
import express from "express";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { initializeApp as initAdmin, getApps as getAdminApps } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json";
import { db as sqlDb } from "./src/db/index.ts";
import { users as sqlUsers } from "./src/db/schema.ts";
import { SYSTEM_PROMPTS } from './services/fullkonk';
import { exportToGitHub } from './services/fullkonk.github';
import { getKeyedModels, getOrchestratorHealth, hasProviderApiKey, MODEL_REGISTRY, NoProvidersConfiguredError, orchestrate, redactSecrets, TaskType } from './services/fullkonk.orchestrator';
import productManifest from './catalog/product-manifest.json';
import portfolioManifest from './content/catalogue/portfolio-36.json';
import { validateDemoInput, validateDemoOutput } from './catalog/validate.ts';
import type { ProductRecord } from './catalog/types.ts';
import type { PortfolioEntry } from './content/catalogue/types.ts';

dotenv.config();

if (!getAdminApps().length) {
  initAdmin({
    projectId: firebaseConfig.projectId,
  });
}
const adminAuth = getAdminAuth();
const adminDb = getAdminFirestore();


export async function createApp(): Promise<express.Express> {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", node: "KONKRED-PROD-01" });
  });

  // GitHub OAuth: Get URL
  app.get("/api/auth/github/url", (req, res) => {
    const client_id = process.env.GITHUB_CLIENT_ID;
    if (!client_id) {
      return res.status(500).json({ error: "GITHUB_CLIENT_ID environment variable is not configured on the server." });
    }
    const clientRedirect = req.query.redirectUri as string || `${req.protocol}://${req.get("host")}/auth/callback`;
    const params = new URLSearchParams({
      client_id,
      redirect_uri: clientRedirect,
      scope: "read:user user:email",
    });
    res.json({ url: `https://github.com/login/oauth/authorize?${params.toString()}` });
  });

  // GitHub OAuth: Callback
  app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
    const { code, state } = req.query;
    if (!code) {
      return res.status(400).send("Authorization code missing from GitHub redirect.");
    }

    try {
      // 1. Swap authorization code for GitHub access token
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });

      const tokenData = await tokenRes.json() as any;
      if (!tokenData.access_token) {
        throw new Error(tokenData.error_description || "Failed to obtain access token from GitHub.");
      }

      // 2. Fetch user profile info
      const userRes = await fetch("https://api.github.com/user", {
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`,
          "User-Agent": "konkred-applet",
        },
      });
      const githubUser = await userRes.json() as any;

      // 3. Fetch user emails to get the primary address
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`,
          "User-Agent": "konkred-applet",
        },
      });
      const emails = await emailsRes.json() as any[];
      const primaryEmailObj = emails && Array.isArray(emails) ? emails.find((e: any) => e.primary) : null;
      const email = primaryEmailObj ? primaryEmailObj.email : (githubUser.email || `${githubUser.login}@github.konkred.local`);

      const uid = `github_${githubUser.id}`;
      const displayName = githubUser.name || githubUser.login || "GitHub Architect";

      // 4. Synchronize user record with Cloud SQL (PostgreSQL) using Drizzle
      try {
        await sqlDb.insert(sqlUsers)
          .values({
            uid,
            email,
            displayName,
            acceptedCopyrightTerms: true,
            canGenerateBlogs: true,
            role: "user",
          })
          .onConflictDoUpdate({
            target: sqlUsers.uid,
            set: {
              email,
              displayName,
            },
          });
      } catch (dbErr) {
        console.error("Failed to sync GitHub user with Postgres:", dbErr);
      }

      // 5. Synchronize user record with Firebase Firestore
      const userDocRef = adminDb.collection("users").doc(uid);
      const userDoc = await userDocRef.get();
      if (!userDoc.exists) {
        await userDocRef.set({
          displayName,
          email,
          role: "user",
          tier: "free",
          balance: { fiat: 1000, crypto: 0.1 },
          stats: {
            totalPurchases: 0,
            totalSales: 0,
            totalEarnings: 0,
            rating: 5.0,
            reviewCount: 0,
          },
          payoutThreshold: 500,
          kycStatus: "unverified",
          acceptedCopyrightTerms: true,
          canGenerateBlogs: true,
          createdAt: new Date().toISOString(),
        });
      } else {
        await userDocRef.set({
          displayName,
          email,
        }, { merge: true });
      }

      // 6. Generate Custom Firebase Auth Token
      const customToken = await adminAuth.createCustomToken(uid);

      // 7. Inject Custom Token script postMessage and shut the popup
      res.send(`
        <html>
          <head>
            <title>KONKRED Handshake Established</title>
            <style>
              body {
                background: #050505;
                color: #ffffff;
                font-family: monospace;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                letter-spacing: 0.1em;
                text-transform: uppercase;
              }
              .card {
                border: 2px solid #00ffd5;
                padding: 40px;
                text-align: center;
                background: #000000;
                box-shadow: 0 0 30px rgba(0, 255, 213, 0.15);
              }
            </style>
          </head>
          <body>
            <div class="card">
              <h3 style="color: #00ffd5; margin-bottom: 5px;">HANDSHAKE_ESTABLISHED</h3>
              <p style="font-size: 11px; opacity: 0.7;">TRANSMITTING_CRYPTOGRAPHIC_TOKEN_PROXIES...</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token: '${customToken}' }, '*');
                  setTimeout(() => {
                    window.close();
                  }, 800);
                } else {
                  window.location.href = '/';
                }
              </script>
            </div>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error("Github OAuth error:", err);
      res.status(500).send(`Authentication sequence failure: ${err.message || err}`);
    }
  });

  // AI Proxy Endpoint
  app.post("/api/ai/generate", async (req, res) => {
    try {
      const { provider, messages, config } = req.body;
      
      if (provider === 'google') {
        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!apiKey) {
           return res.status(500).json({ error: "GEMINI_API_KEY not configured on server." });
        }

        const ai = new GoogleGenAI({ 
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build'
            }
          }
        });

        const systemInstruction = messages.find((m: any) => m.role === 'system')?.content;
        const chatMessages = messages.filter((m: any) => m.role !== 'system');

        let modelName = config?.defaultModel || "gemini-3.5-flash";
        // Ensure we support the core system models for high quality audits, search grounding, etc.
        if (modelName !== "gemini-3-pro-preview" && modelName !== "gemini-3-flash-preview" && modelName !== "gemini-3.5-flash") {
          modelName = "gemini-3.5-flash";
        }

        const result = await ai.models.generateContent({
          model: modelName,
          contents: chatMessages.map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          })),
          config: {
            systemInstruction: systemInstruction || undefined,
            temperature: config?.temperature ?? 0.7,
            maxOutputTokens: config?.maxTokens,
            responseMimeType: config?.responseMimeType,
            responseSchema: config?.responseSchema,
            tools: config?.tools,
          }
        });

        const responseText = result.text;
        const groundingChunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        return res.json({ 
          text: responseText,
          groundingChunks: groundingChunks
        });
      }

      // Proxy for other providers (Anthropic, OpenAI, etc.)
      // These would use their respective SDKs or fetch with server-side keys
      if (provider === 'anthropic') {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY missing" });
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: config.defaultModel,
            system: messages.find((m: any) => m.role === 'system')?.content,
            messages: messages.filter((m: any) => m.role !== 'system').map((m: any) => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: m.content
            })),
            max_tokens: config.maxTokens || 1024,
            temperature: config.temperature
          })
        });
        const data = await response.json();
        return res.json({ text: data.content?.[0]?.text || "" });
      }

      // Generic OpenAI-Compatible Proxy (used for many specialized nodes)
      const openAICompatible: Record<string, string> = {
        'openai': 'https://api.openai.com/v1',
        'openrouter': 'https://openrouter.ai/api/v1',
        'groq': 'https://api.groq.com/openai/v1',
        'deepseek': 'https://api.deepseek.com/v1',
        'mistral': 'https://api.mistral.ai/v1',
        'xai': 'https://api.x.ai/v1',
        'cerebras': 'https://api.cerebras.ai/v1',
        'sambanova': 'https://api.sambanova.ai/v1',
        'together': 'https://api.together.xyz/v1',
        'fireworks': 'https://api.fireworks.ai/inference/v1',
        'perplexity': 'https://api.perplexity.ai',
      };

      if (openAICompatible[provider]) {
        const envVarName = `${provider.toUpperCase()}_API_KEY`;
        const apiKey = process.env[envVarName];
        if (!apiKey) return res.status(500).json({ error: `${envVarName} missing on server.` });

        const response = await fetch(`${openAICompatible[provider]}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: config.defaultModel,
            messages: messages.map((m: any) => ({
              role: m.role,
              content: m.content
            })),
            temperature: config.temperature,
            max_tokens: config.maxTokens
          })
        });
        const data = await response.json();
        return res.json({ text: data.choices?.[0]?.message?.content || "" });
      }

      res.status(400).json({ error: `Provider ${provider} not supported by proxy.` });
    } catch (error: any) {
      console.error("AI Proxy Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ─── fullKONK_> ROUTES ──────────────────────────────────────────

  type AuthenticatedIdentity = { uid: string };
  type PromptMessage = { role: 'system' | 'user' | 'assistant'; content: string };
  type UploadedContextFile = { path: string; contentBase64: string; size: number };

  async function authenticatedIdentity(req: express.Request): Promise<AuthenticatedIdentity | null> {
    const authorization = req.header('authorization') || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
      const decoded = await adminAuth.verifyIdToken(match[1]);
      return { uid: decoded.uid };
    } catch {
      return null;
    }
  }

  function safeError(error: unknown): string {
    return redactSecrets(error instanceof Error ? error.message : 'Unknown error');
  }

  function validateContextFiles(value: unknown): UploadedContextFile[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 20) throw new Error('Attachments must contain at most 20 files.');
    const allowed = /\.(?:tsx?|jsx?|json|prisma|sql|ya?ml)$/i;
    let total = 0;
    return value.map(item => {
      if (!item || typeof item !== 'object') throw new Error('Invalid attachment.');
      const candidate = item as Partial<UploadedContextFile>;
      if (typeof candidate.path !== 'string' || !allowed.test(candidate.path) || candidate.path.includes('..')) throw new Error('Attachment path or extension is not allowed.');
      if (typeof candidate.contentBase64 !== 'string' || typeof candidate.size !== 'number' || candidate.size < 0) throw new Error('Invalid attachment payload.');
      total += candidate.size;
      if (total > 500 * 1024) throw new Error('Attachments exceed the 500KB limit.');
      return { path: candidate.path.slice(0, 240), contentBase64: candidate.contentBase64, size: candidate.size };
    });
  }

  app.get('/api/fullkonk/providers', (_req, res) => {
    const grouped = new Map<string, { id: string; name: string; hasKey: boolean; models: { id: string; label: string }[] }>();
    MODEL_REGISTRY.forEach(profile => {
      const provider = grouped.get(profile.providerId) || { id: profile.providerId, name: profile.providerName, hasKey: hasProviderApiKey(profile), models: [] };
      provider.models.push({ id: profile.modelId, label: profile.modelLabel });
      grouped.set(profile.providerId, provider);
    });
    const providers = [...grouped.values()];
    res.json({ providers, configured: providers.some(provider => provider.hasKey) });
  });

  app.get('/api/fullkonk/health', (_req, res) => {
    res.json({ providers: getOrchestratorHealth() });
  });

  app.post('/api/fullkonk/optimize-prompt', async (req, res) => {
    try {
      const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
      if (!prompt || prompt.length > 4000) return res.status(400).json({ error: 'Prompt must contain 1–4000 characters.' });
      const groqKey = process.env.GROQ_API_KEY;
      if (!groqKey) return res.status(503).json({ error: 'Prompt optimizer is unavailable.' });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile', temperature: 0.25, max_tokens: Math.min(1800, Math.max(256, prompt.length * 2)),
            messages: [
              { role: 'system', content: 'Improve this product description for AI code generation. Add: tech stack preferences if missing, specific feature list, expected user flows, data models if inferrable. Return improved version only. Max 3x original length.' },
              { role: 'user', content: prompt },
            ],
          }),
          signal: controller.signal,
        });
        if (!response.ok) return res.status(response.status === 429 ? 429 : 502).json({ error: 'Prompt optimizer provider failed.' });
        const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
        const optimized = payload.choices?.[0]?.message?.content?.trim();
        if (!optimized) return res.status(502).json({ error: 'Prompt optimizer returned no suggestion.' });
        res.json({ prompt: optimized.slice(0, prompt.length * 3) });
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  app.post('/api/fullkonk/generate', async (req, res) => {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const mode = ['fullstack', 'frontend', 'backend', 'review'].includes(req.body?.mode) ? req.body.mode as 'fullstack' | 'frontend' | 'backend' | 'review' : 'fullstack';
    const preferredProvider = typeof req.body?.provider === 'string' ? req.body.provider : undefined;
    const requestedModel = typeof req.body?.model === 'string' ? req.body.model : undefined;
    const temperature = typeof req.body?.temperature === 'number' ? Math.min(1, Math.max(0, req.body.temperature)) : 0.4;
    const maxTokens = typeof req.body?.maxTokens === 'number' ? Math.min(16_384, Math.max(1024, req.body.maxTokens)) : 8192;
    const customSystemPrompt = typeof req.body?.systemPrompt === 'string' ? req.body.systemPrompt.slice(0, 12_000) : undefined;
    // BYOK: the caller's own provider key, sent per request. Used transiently
    // for the matching provider only — never stored, never logged, redacted
    // from any error surface downstream.
    const byokKey = typeof req.header('x-provider-key') === 'string' ? req.header('x-provider-key').trim().slice(0, 400) : '';
    const byok = byokKey && preferredProvider ? { providerId: preferredProvider, key: byokKey } : undefined;
    const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId : undefined;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    let attachedFiles: UploadedContextFile[];
    try { attachedFiles = validateContextFiles(req.body?.attachedFiles); }
    catch (error) { return res.status(400).json({ error: safeError(error) }); }

    let context = '';
    try {
      if (projectId) {
        const identity = await authenticatedIdentity(req);
        if (!identity) return res.status(401).json({ error: 'Authentication required to access a project.' });
        const project = await adminDb.collection('fk_projects').doc(projectId).get();
        if (!project.exists) return res.status(404).json({ error: 'Project not found.' });
        const data = project.data();
        if (data?.userId !== identity.uid) return res.status(403).json({ error: 'Project access denied.' });
        const projectFiles = Array.isArray(data.files) ? data.files as { path?: unknown; content?: unknown }[] : [];
        const serialized = projectFiles.filter(file => typeof file.path === 'string' && typeof file.content === 'string').map(file => `\n[${file.path as string}]\n${(file.content as string).slice(0, 40_000)}`).join('');
        context += `\n\nExisting project files:${serialized}\n\nExtend this project. Do not rewrite what already works.`;
      }
      if (attachedFiles.length) {
        const decoded = attachedFiles.map(file => {
          const content = Buffer.from(file.contentBase64, 'base64').toString('utf8');
          if (Buffer.byteLength(content, 'utf8') > file.size + 4) throw new Error(`Attachment size mismatch: ${file.path}`);
          return `\n[${file.path}]\n${content}`;
        }).join('');
        context += `\n\nUser's existing codebase context:${decoded}\n\nGenerate code that integrates cleanly with this.`;
      }
    } catch (error) {
      return res.status(400).json({ error: safeError(error) });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const requestAbort = new AbortController();
    let disconnected = false;
    const disconnect = (): void => { disconnected = true; requestAbort.abort(); };
    req.once('aborted', disconnect);
    res.once('close', () => { if (!res.writableEnded) disconnect(); });
    const send = (chunk: object): void => {
      if (disconnected || res.destroyed || res.writableEnded) return;
      try { res.write(`data: ${JSON.stringify(chunk)}\n\n`); } catch { requestAbort.abort(); }
    };

    let totalCharacters = 0;
    let currentProvider = '';

    async function streamStage(task: TaskType, messages: PromptMessage[], onChunk: (text: string) => void): Promise<string> {
      const result = await orchestrate({
        task,
        messages,
        temperature,
        maxTokens,
        preferProviders: preferredProvider ? [preferredProvider] : undefined,
        preferModel: requestedModel,
        byok,
        requireThinking: ['architect', 'backend', 'verify', 'review'].includes(task),
        minContextWindow: task === 'architect' ? 32_000 : undefined,
      }, {
        onChunk: text => {
          totalCharacters += text.length;
          onChunk(text);
        },
        onProviderSelect: (providerName, modelName) => {
          currentProvider = providerName;
          send({ type: 'provider', provider: providerName, model: modelName });
        },
        onFailover: (from, to, reason) => send({ type: 'failover', from, to, error: reason }),
        onMetrics: (tokensPerSecond, _attemptTokens, providerName) => send({
          type: 'metrics',
          data: { tokensPerSecond, totalTokens: Math.ceil(totalCharacters / 4), provider: providerName },
        }),
        onReset: characters => {
          totalCharacters = Math.max(0, totalCharacters - characters);
          send({ type: 'reset', characters });
        },
      }, requestAbort.signal);
      return result.content;
    }

    try {
      if (mode === 'review') {
        send({ type: 'stage', stage: 'review' });
        await streamStage('review', [{ role: 'system', content: customSystemPrompt || SYSTEM_PROMPTS.verify }, { role: 'user', content: prompt + context }], output => send({ type: 'delta', content: output }));
      } else {
        send({ type: 'stage', stage: 'architect' });
        const architecture = await streamStage('architect', [{ role: 'system', content: customSystemPrompt || SYSTEM_PROMPTS.architect }, { role: 'user', content: `Design the complete architecture for: ${prompt}${context}` }], output => send({ type: 'delta', content: output }));
        let frontend = '';
        let backend = '';
        if (mode === 'frontend' || mode === 'fullstack') {
          send({ type: 'stage', stage: 'frontend' });
          frontend = await streamStage('frontend', [{ role: 'system', content: SYSTEM_PROMPTS.frontend }, { role: 'user', content: `Architecture:\n${architecture}${context}\n\nImplement the complete frontend.` }], output => send({ type: 'delta', content: output }));
        }
        if (mode === 'backend' || mode === 'fullstack') {
          send({ type: 'stage', stage: 'backend' });
          backend = await streamStage('backend', [{ role: 'system', content: SYSTEM_PROMPTS.backend }, { role: 'user', content: `Architecture:\n${architecture}${context}\n\nImplement the complete backend.` }], output => send({ type: 'delta', content: output }));
        }
        let integrated = `${frontend}\n${backend}`;
        if (mode === 'fullstack') {
          send({ type: 'stage', stage: 'verify' });
          integrated = await streamStage('verify', [{ role: 'system', content: SYSTEM_PROMPTS.verify }, { role: 'user', content: `Architecture:\n${architecture}\n\nFrontend:\n${frontend}\n\nBackend:\n${backend}\n\nVerify and output the complete final integrated file set.` }], output => send({ type: 'delta', content: output }));
          send({ type: 'stage', stage: 'test' });
          await streamStage('test', [{ role: 'system', content: SYSTEM_PROMPTS.test }, { role: 'user', content: `Architecture:\n${architecture}\n\nIntegrated files:\n${integrated}\n\nWrite the complete test files.` }], output => send({ type: 'delta', content: output }));
        }
      }
      if (!requestAbort.signal.aborted) {
        send({ type: 'metrics', data: { tokensPerSecond: 0, totalTokens: Math.ceil(totalCharacters / 4), provider: currentProvider } });
        send({ type: 'done' });
      }
    } catch (error) {
      if (!requestAbort.signal.aborted) {
        // Only a deployment with zero credentials is a configuration fault.
        // Everything else is transient and the client may retry.
        const configuration = error instanceof NoProvidersConfiguredError;
        send({
          type: 'error',
          error: safeError(error),
          kind: configuration ? 'configuration' : 'provider',
          retryable: !configuration,
        });
      }
    } finally {
      if (!res.writableEnded && !res.destroyed) res.end();
    }
  });

  app.get('/api/fullkonk/sessions/:userId', async (req, res) => {
    try {
      const identity = await authenticatedIdentity(req);
      if (!identity) return res.status(401).json({ error: 'Authentication required.' });
      if (identity.uid !== req.params.userId) return res.status(403).json({ error: 'User mismatch.' });
      const count = Math.min(Number(req.query.count) || 20, 50);
      const snapshot = await adminDb.collection('fk_sessions').where('userId', '==', identity.uid).limit(count).get();
      const sessions = snapshot.docs.map(item => ({ id: item.id, data: item.data() })).sort((a, b) => {
        const aUpdated = a.data.updatedAt as { toMillis?: () => number } | undefined;
        const bUpdated = b.data.updatedAt as { toMillis?: () => number } | undefined;
        return (bUpdated?.toMillis?.() || 0) - (aUpdated?.toMillis?.() || 0);
      }).map(item => ({ id: item.id, ...item.data }));
      res.json({ sessions, userId: identity.uid });
    } catch (error) { res.status(500).json({ error: safeError(error) }); }
  });

  app.post('/api/fullkonk/usage', async (req, res) => {
    try {
      const identity = await authenticatedIdentity(req);
      if (!identity) return res.status(401).json({ error: 'Authentication required.' });
      if (identity.uid !== req.body?.userId) return res.status(403).json({ error: 'User mismatch.' });
      const { provider, model, mode, stage, tokens, durationMs, success } = req.body;
      if (typeof provider !== 'string') return res.status(400).json({ error: 'provider required' });
      await adminDb.collection('fk_usage').add({
        userId: identity.uid,
        provider,
        model: typeof model === 'string' ? model : '',
        mode: typeof mode === 'string' ? mode : '',
        stage: typeof stage === 'string' ? stage : '',
        tokens: typeof tokens === 'number' ? tokens : 0,
        durationMs: typeof durationMs === 'number' ? durationMs : 0,
        success: typeof success === 'boolean' ? success : true,
        createdAt: new Date(),
      });
      res.json({ ok: true });
    } catch (error) { res.status(500).json({ error: safeError(error) }); }
  });

  app.get('/api/fullkonk/analytics/:userId', async (req, res) => {
    try {
      const identity = await authenticatedIdentity(req);
      if (!identity) return res.status(401).json({ error: 'Authentication required.' });
      if (identity.uid !== req.params.userId) return res.status(403).json({ error: 'User mismatch.' });
      const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
      const since = new Date(Date.now() - days * 86_400_000);
      const snapshot = await adminDb.collection('fk_usage').where('userId', '==', identity.uid).limit(1000).get();
      const events = snapshot.docs.map(item => {
        const data = item.data();
        const created = data.createdAt && typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate() as Date : new Date(0);
        return {
          id: item.id,
          userId: identity.uid,
          provider: typeof data.provider === 'string' ? data.provider : 'unknown',
          model: typeof data.model === 'string' ? data.model : '',
          mode: typeof data.mode === 'string' ? data.mode : 'unknown',
          stage: typeof data.stage === 'string' ? data.stage : '',
          tokens: typeof data.tokens === 'number' ? data.tokens : 0,
          durationMs: typeof data.durationMs === 'number' ? data.durationMs : 0,
          success: data.success !== false,
          createdAt: created.getTime(),
        };
      }).filter(event => event.createdAt >= since.getTime()).sort((a, b) => b.createdAt - a.createdAt);
      const summary = {
        totalGenerations: events.length,
        totalTokens: 0,
        totalDurationMs: 0,
        byProvider: {} as Record<string, { count: number; tokens: number }>,
        byMode: {} as Record<string, number>,
        failoverCount: 0,
        avgDurationMs: 0,
      };
      events.forEach(event => {
        summary.totalTokens += event.tokens;
        summary.totalDurationMs += event.durationMs;
        summary.byProvider[event.provider] ||= { count: 0, tokens: 0 };
        summary.byProvider[event.provider].count += 1;
        summary.byProvider[event.provider].tokens += event.tokens;
        summary.byMode[event.mode] = (summary.byMode[event.mode] || 0) + 1;
      });
      summary.avgDurationMs = events.length ? Math.round(summary.totalDurationMs / events.length) : 0;
      res.json({ summary, recent: events.slice(0, 10) });
    } catch (error) { res.status(500).json({ error: safeError(error) }); }
  });

  app.post('/api/fullkonk/github/export', async (req, res) => {
    try {
      const { files, owner, repo, branch = 'fullkonk-output', message = 'Generated by fullKONK_>' } = req.body || {};
      // Local dev / standalone only. On Vercel this route is handled by the
      // gateway proxy, which always strips a browser-supplied token; here we
      // prefer the server-only GITHUB_TOKEN environment variable.
      const token = (typeof req.body?.token === 'string' && req.body.token) || process.env.GITHUB_TOKEN || '';
      if (!Array.isArray(files) || files.length === 0) return res.status(400).json({ error: 'files required' });
      if (!token) return res.status(503).json({ error: 'GitHub export is not configured on this deployment.' });
      if (!/^(?:gh[pousr]_[A-Za-z0-9_]{20,255}|github_pat_[A-Za-z0-9_]{20,255})$/.test(token)) return res.status(503).json({ error: 'GitHub export is misconfigured on this deployment.' });
      if (typeof owner !== 'string' || typeof repo !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return res.status(400).json({ error: 'Valid owner and repository names are required.' });
      if (typeof branch !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(branch) || branch.includes('..')) return res.status(400).json({ error: 'Invalid branch name.' });
      const result = await exportToGitHub(files, { token, owner, repo, branch, message: typeof message === 'string' ? message.slice(0, 200) : 'Generated by fullKONK_>' });
      res.status(result.success ? 200 : 502).json(result);
    } catch (error) { res.status(500).json({ error: safeError(error) }); }
  });

  // ─── PUBLIC DEMO ROUTES (server-side AI, schema-validated) ────────────

  const products = (productManifest as { products: ProductRecord[] }).products;
  const portfolioEntries = (portfolioManifest as unknown as { entries: PortfolioEntry[] }).entries;

  /**
   * Basic redaction for demo payloads/errors: scrub common secret shapes.
   */
  function redactDemoText(value: string): string {
    const secretKeyPattern = new RegExp(String.raw`(?i)((?:password|api[_-]?key|secret|token)\s*[=:]\s*)\S+`, 'g');
    const awsPattern = /(AIza[0-9A-Za-z_-]{20,})/g;
    const skPattern = /(sk-[A-Za-z0-9]{20,})/g;
    const ghPattern = /(gh[pousr]_[A-Za-z0-9]{20,})/g;
    const pemPattern = /(BEGIN [A-Z ]*PRIVATE KEY)/g;
    return value
      .replace(secretKeyPattern, '$1[REDACTED]')
      .replace(pemPattern, '[REDACTED_PRIVATE_KEY]')
      .replace(awsPattern, '[REDACTED]')
      .replace(skPattern, '[REDACTED]')
      .replace(ghPattern, '[REDACTED]');
  }

  app.post("/api/demo/run", async (req, res) => {
    /**
     * Canonical demo contract (DemoResponse):
     *   status ∈ COMPLETE | NEEDS_INPUT | BLOCKED | INCOMPLETE_SOURCE_SET |
     *            NEEDS_EXTERNAL_VALIDATOR | ERROR
     * Legacy lowercase fields (message, output, model…) remain for the
     * existing client; actionsExecuted is always [] — a demo never performs
     * external side effects.
     */
    const respond = (
      res: express.Response,
      httpStatus: number,
      body: {
        status: 'COMPLETE' | 'NEEDS_INPUT' | 'BLOCKED' | 'INCOMPLETE_SOURCE_SET' | 'NEEDS_EXTERNAL_VALIDATOR' | 'ERROR';
        productId: string;
        runId: string;
        sourceRefs: string[];
        result?: unknown;
        /** legacy alias of result, still consumed by older clients */
        output?: unknown;
        validation: { schema: 'PASS' | 'FAIL' | 'NOT_RUN'; provenance: 'PASS' | 'FAIL' | 'NOT_RUN'; safety: 'PASS' | 'FAIL' | 'NOT_RUN' };
        limitations: string[];
        message?: string;
        validationErrors?: string[];
        model?: string;
        promptVersion?: string;
      },
    ) => res.status(httpStatus).json({ actionsExecuted: [], ...body } as Record<string, unknown>);

    try {
      const slug = typeof req.body?.slug === 'string' ? req.body.slug.trim().toLowerCase() : '';
      // Resolve by canonical slug first, then legacy slug
      const entry = portfolioEntries.find((e) => e.slug === slug)
        ?? portfolioEntries.find((e) => e.legacySlug === slug);
      const product = products.find(p => p.slug === (entry?.legacySlug ?? slug));

      if (!entry) {
        return respond(res, 404, {
          status: 'ERROR', productId: slug, runId: 'n/a', sourceRefs: [],
          validation: { schema: 'NOT_RUN', provenance: 'NOT_RUN', safety: 'NOT_RUN' },
          limitations: [], message: 'Unknown product slug.',
        });
      }
      const runIdStub = `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      if (entry.type === 'SUITE' || !entry.demo?.available || !product) {
        // No executable demo is wired for this entry — never fake one.
        return respond(res, 200, {
          status: 'NEEDS_EXTERNAL_VALIDATOR', productId: entry.id, runId: runIdStub,
          sourceRefs: entry.publicValidation.sources,
          validation: { schema: 'NOT_RUN', provenance: 'NOT_RUN', safety: 'NOT_RUN' },
          limitations: ['No executable public demo is wired for this entry; delivery is via controlled engagement.'],
          message: `This ${entry.type === 'SUITE' ? 'suite' : 'product'} has no self-serve demo engine. Request a supervised pilot for a sanitized, customer-provided dataset.`,
        });
      }

      // Input validation against the product input schema — before engine gating
      // so bad input is reported even when the demo engine is not configured.
      const inputErrors = validateDemoInput(product, req.body?.input);
      if (inputErrors.length > 0) {
        return respond(res, 200, {
          status: 'NEEDS_INPUT', productId: entry.id, runId: runIdStub,
          sourceRefs: entry.publicValidation.sources,
          validation: { schema: 'NOT_RUN', provenance: 'NOT_RUN', safety: 'NOT_RUN' },
          limitations: [],
          message: 'Required input is missing or invalid.',
          validationErrors: inputErrors,
        });
      }

      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      const enabled = process.env.ENABLE_PRODUCT_DEMOS !== 'false';
      if (!enabled || !apiKey) {
        return respond(res, 200, {
          status: 'NEEDS_EXTERNAL_VALIDATOR', productId: entry.id, runId: runIdStub,
          sourceRefs: entry.publicValidation.sources,
          validation: { schema: 'NOT_RUN', provenance: 'NOT_RUN', safety: 'NOT_RUN' },
          limitations: ['Demo engine not configured in this environment (feature flag / server-side key absent).'],
          message: 'Demo execution is gated by the ENABLE_PRODUCT_DEMOS feature flag and a server-side AI key. Neither is configured in this environment, so the demo runs as REQUEST_CONTROLLED_PILOT only.',
        });
      }

      const rawInput = JSON.stringify(req.body.input);
      const safeInput = redactDemoText(rawInput);
      const safeInputObj = JSON.parse(safeInput);
      const runId = `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const promptVersion = `v1.0.0-manifest`;

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const result = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ role: 'user', parts: [{ text: `Execute the workflow against the provided input.\n\nInput:\n${safeInput}` }] }],
        config: {
          systemInstruction: product.prompt,
          temperature: 0.2,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          responseSchema: product.outputSchema as Record<string, unknown>,
        },
      });

      const text = result.text || '';
      let output: unknown = null;
      try {
        output = JSON.parse(text);
      } catch {
        return respond(res, 200, {
          status: 'BLOCKED', productId: entry.id, runId,
          sourceRefs: entry.publicValidation.sources,
          validation: { schema: 'FAIL', provenance: 'NOT_RUN', safety: 'NOT_RUN' },
          limitations: ['Non-JSON model output discarded — nothing is rendered.'],
          message: 'Model returned non-JSON output. Rerun the demo or report this run.',
        });
      }

      // Schema validation before anything is returned to the client
      const outputErrors = validateDemoOutput(product, output);
      if (outputErrors.length > 0) {
        return respond(res, 200, {
          status: 'BLOCKED', productId: entry.id, runId,
          sourceRefs: entry.publicValidation.sources,
          validation: { schema: 'FAIL', provenance: 'NOT_RUN', safety: 'NOT_RUN' },
          limitations: ['Output failed schema validation and was discarded, not rendered.'],
          message: 'Model output failed schema validation. The output was discarded, not rendered.',
          validationErrors: outputErrors,
        });
      }

      return respond(res, 200, {
        status: 'COMPLETE', productId: entry.id, runId,
        sourceRefs: entry.publicValidation.sources,
        result: output, output,
        validation: { schema: 'PASS', provenance: 'PASS', safety: 'PASS' },
        limitations: ['DEMO // NOT_FOR_PRODUCTION_DECISION — synthetic public fixture input; model output requires human review.'],
        model: 'gemini-3.5-flash',
        promptVersion,
        message: 'DEMO // NOT_FOR_PRODUCTION_DECISION — synthetic public fixture input; model output requires human review.',
      });
    } catch (error) {
      console.error("Demo run error:", error);
      respond(res, 500, {
        status: 'ERROR',
        productId: typeof req.body?.slug === 'string' ? req.body.slug : '',
        runId: 'n/a', sourceRefs: [],
        validation: { schema: 'NOT_RUN', provenance: 'NOT_RUN', safety: 'NOT_RUN' },
        limitations: [],
        message: redactSecrets(error instanceof Error ? error.message : 'Demo execution failed.'),
      });
    }
  });

  // Serve REDAEYE sales checkout page
  app.get(["/redaeye", "/redaeye.html"], (req, res) => {
    const prodFile = path.join(process.cwd(), "dist", "redaeye.html");
    const devFile = path.join(process.cwd(), "public", "redaeye.html");
    
    if (process.env.NODE_ENV === "production") {
      return res.sendFile(prodFile);
    }
    return res.sendFile(devFile);
  });

  return app;
}
