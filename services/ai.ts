
import { AIProviderID, AIProviderConfig, AuditResult } from '../types.ts';
import { db } from './firebase.ts';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { AIProviderFactory, ChatMessage } from '../lib/ai/providers.ts';
import { AI_PROVIDERS } from '../constants.ts';
import { gatewayComplete, extractJsonFromText } from './gateway.ts';

class UnifiedAIService {
  constructor() {}

  /**
   * Performs an executive AUDIT on a payload using the Google Gemini 3 Pro model.
   * This is the core verification layer for all assets on the platform.
   */
  async runAudit(payload: string, userId: string): Promise<AuditResult> {
    // Standard inference flows through the same-origin /api/ai gateway proxy.
    // The gateway owns provider selection and credentials; the browser never
    // sees a key and contains no provider-specific logic.
    const content = await gatewayComplete({
      taskType: 'general',
      maxTokens: 2048,
      temperature: 0.2,
      messages: [{
        role: "user",
        content: `Perform an exhaustive architecture audit for KONKRED Executive Systems.
          Score the payload on: Logical Integrity (0-100), Safety/Compliance (0-100), and Execution Efficiency (0-100).
          Respond with raw JSON only (no markdown, no commentary) using this shape:
          {"overallScore":number,"logic":number,"safety":number,"efficiency":number,"summary":string,"vulnerabilities":string[],"recommendations":string[]}
          Input: "${payload}"`
      }],
    });

    const data = extractJsonFromText<Record<string, any>>(content) as Partial<AuditResult>;
    const auditId = `aud_${Date.now()}`;
    
    const result: AuditResult = {
      id: auditId,
      userId,
      ...(data as Partial<AuditResult>),
      provider: 'google',
      model: 'gemini-3-pro-preview',
      timestamp: serverTimestamp()
    } as AuditResult;

    await setDoc(doc(db, 'audits', auditId), result);
    return result;
  }

  /**
   * Executes a chat completion using the user's preferred external provider.
   */
  async executiveChat(userId: string, messages: ChatMessage[]) {
    const configRef = doc(db, `users/${userId}/settings/ai`);
    const configSnap = await getDoc(configRef);
    
    const keysRef = doc(db, `users/${userId}/secure/keys`);
    const keysSnap = await getDoc(keysRef);

    if (!configSnap.exists() || !keysSnap.exists()) {
        // Default inference node: the Konkred Gateway selects the model and
        // owns every provider credential server-side.
        return gatewayComplete({
          messages,
          temperature: 0.7,
          maxTokens: 2048,
        });
    }

    const config = configSnap.data() as AIProviderConfig;
    const keys = keysSnap.data() as Record<AIProviderID, string>;
    const providerId = config.primaryProvider;
    const apiKey = keys[providerId];

    if (!apiKey) {
      throw new Error(`API Key for ${providerId} is missing in your secure enclave.`);
    }

    try {
      const provider = AIProviderFactory.getProvider(providerId);
      return await provider.generateResponse(messages, config, apiKey);
    } catch (error: any) {
      // Fallback logic
      if (config.fallbackProvider && keys[config.fallbackProvider]) {
        const fallbackProvider = AIProviderFactory.getProvider(config.fallbackProvider);
        return await fallbackProvider.generateResponse(messages, {
          ...config,
          primaryProvider: config.fallbackProvider
        }, keys[config.fallbackProvider]);
      }
      throw error;
    }
  }

  /**
   * Tests connection to an AI provider node.
   * FIX: Implemented testConnection to verify provider connectivity and measure latency.
   */
  async testConnection(id: AIProviderID, apiKey: string): Promise<{ success: boolean, latency: number, message: string }> {
    const start = Date.now();
    try {
      const provider = AIProviderFactory.getProvider(id);
      // Send a minimal prompt to verify connectivity
      await provider.generateResponse([{ role: 'user', content: 'connection_test' }], {
        primaryProvider: id,
        defaultModel: AI_PROVIDERS[id].models[0],
        temperature: 0.1,
        maxTokens: 1,
        stream: false
      }, apiKey);
      
      return {
        success: true,
        latency: Date.now() - start,
        message: "Neural handshake verified."
      };
    } catch (error: any) {
      return {
        success: false,
        latency: Date.now() - start,
        message: error.message || "Uplink disruption detected."
      };
    }
  }
}

export const aiService = new UnifiedAIService();
