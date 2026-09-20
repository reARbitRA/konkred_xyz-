import { AIProviderID, AIProviderConfig } from '../../types.ts';
import { gatewayComplete } from '../../services/gateway.ts';

/**
 * Standardized message format for all providers
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Interface for any AI Provider implementation
 */
export interface ProviderImplementation {
  id: AIProviderID;
  generateResponse(
    messages: ChatMessage[],
    config: AIProviderConfig,
    _apiKey?: string
  ): Promise<string>;
}

/**
 * Gateway-backed provider implementation.
 *
 * Provider/model selection, failover and credentials all live server-side in
 * the Konkred AI Ecosystem Gateway. The browser only talks to the same-origin
 * /api/ai proxy; it never receives a provider key.
 */
class GatewayAIProvider implements ProviderImplementation {
  constructor(public id: AIProviderID) {}

  async generateResponse(messages: ChatMessage[], config: AIProviderConfig): Promise<string> {
    return gatewayComplete({
      messages,
      temperature: typeof config?.temperature === 'number' ? config.temperature : 0.3,
      maxTokens: typeof config?.maxTokens === 'number' ? config.maxTokens : 2048,
    });
  }
}

/**
 * Factory and Registry for AI Providers
 *
 * Every logical provider id is routed through the gateway; the id is retained
 * on the client for display/preference purposes only.
 */
export class AIProviderFactory {
  private static providers: Map<AIProviderID, ProviderImplementation> = new Map();

  static {
    const providerIds: AIProviderID[] = [
      'google', 'anthropic', 'cohere', 'openai', 'openrouter',
      'groq', 'xai', 'deepseek', 'mistral', 'qwen',
      'cerebras', 'sambanova', 'together', 'fireworks', 'perplexity'
    ];

    providerIds.forEach(id => {
      this.providers.set(id, new GatewayAIProvider(id));
    });
  }

  static getProvider(id: AIProviderID): ProviderImplementation {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Provider ${id} is not available.`);
    return provider;
  }
}
