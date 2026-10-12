
// Unified types for the KONKRED platform - PRODUCTION GRADE

export type PageView = 
    | 'landing' | 'forge_audit' | 'audit' | 'fullkonk' | 'redaeye' | 'redaeye_sandbox'
    | 'catalogue' | 'suite_detail' | 'workflow_detail' | 'pricing' | 'kit_detail'
    | 'sprint' | 'enterprise' | 'partners' | 'validation' | 'not_found'
    | 'academy' | 'intel' | 'network' | 'advisory' | 'documentation' | 'career'
    | 'resources' | 'enter' | 'join_network' | 'account' | 'contact' | 'style_guide' | 'verify_email'
    | 'checkout';

export type AIProviderID = 
  | 'openai' | 'anthropic' | 'google' | 'openrouter' | 'groq' 
  | 'xai' | 'deepseek' | 'mistral' | 'qwen' | 'cerebras' 
  | 'sambanova' | 'together' | 'fireworks' | 'perplexity' | 'cohere';

// ─── fullKONK_> TYPES ────────────────────────────────────────────

export type ProviderID = 'google' | 'groq' | 'deepseek' | 'cerebras' | 'sambanova' | 'openrouter' | 'github' | 'nvidia' | 'huggingface';

export type BuildMode = 'fullstack' | 'frontend' | 'backend' | 'review';

export type PipelineStage =
  | 'idle'
  | 'architect'
  | 'frontend'
  | 'backend'
  | 'verify'
  | 'test'
  | 'review'
  | 'done'
  | 'error';

export interface FKMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  stage?: PipelineStage;
  timestamp: number;
}

export interface GeneratedFile {
  path: string;
  content: string;
  /** Normalized lowercase language identifier. */
  language: string;
  isTest?: boolean;
}

export interface AttachedCodeFile {
  path: string;
  contentBase64: string;
  size: number;
}

export interface FKProject {
  id: string;
  userId: string;
  name: string;
  description: string;
  stack: string[];
  files: GeneratedFile[];
  sessions: string[];
  createdAt: number;
  updatedAt: number;
}

export interface GenerateRequest {
  prompt: string;
  mode: BuildMode;
  provider?: ProviderID;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  projectId?: string;
  attachedFiles?: AttachedCodeFile[];
}

export type StreamChunk =
  | { type: 'stage'; stage: PipelineStage; content?: string }
  | { type: 'delta'; content: string }
  | { type: 'provider'; provider: string; model: string }
  | { type: 'failover'; from: string; to?: string; error?: string }
  | { type: 'metrics'; data: { tokensPerSecond: number; totalTokens: number; provider: string } }
  | { type: 'reset'; characters: number }
  | { type: 'file'; file: GeneratedFile }
  | { type: 'done' }
  | { type: 'error'; error: string; kind?: 'configuration' | 'provider'; retryable?: boolean };

export interface AIProviderConfig {
  primaryProvider: AIProviderID;
  fallbackProvider?: AIProviderID;
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  stream: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'buyer' | 'seller' | 'pro_seller';
  verified: boolean;
  tier: 'free' | 'pro' | 'enterprise';
  balance: { fiat: number; crypto: number };
  stats: {
    totalPurchases: number;
    totalSales: number;
    totalEarnings: number;
    rating: number;
    reviewCount: number;
  };
  aiConfig?: AIProviderConfig;
  payoutThreshold: number;
  kycStatus: 'unverified' | 'verified' | 'pending';
  acceptedCopyrightTerms: boolean;
  canGenerateBlogs: boolean;
  createdAt: any; // Firestore Timestamp
}

export interface Listing {
  id: string;
  sellerId: string;
  seller: {
    name: string;
    verified: boolean;
    totalSales: number;
  };
  title: string;
  shortDescription: string;
  description: string;
  type: 'prompt' | 'agent' | 'workflow' | 'dataset' | 'api' | 'prompt_system' | 'protocol';
  category: string;
  pricing: {
    mode: 'one_time' | 'subscription' | 'usage';
    amount: number;
    currency: string;
    interval?: 'month' | 'year';
    unit?: string;
  };
  delivery: 'download' | 'api_key' | 'hosted_demo' | 'repo_access' | 'booking';
  auditScore: number;
  auditReportId?: string;
  rating: number;
  reviewCount: number;
  featured: boolean;
  trending?: boolean;
  tags: string[];
  salesCount: number;
  viewCount: number;
  createdAt: any;
  updatedAt: any;
}

export interface Protocol {
  id: string;
  category: string;
  level: string;
  title: string;
  description: string;
  price: string;
  isVerified: boolean;
  tags: string[];
  acquisitionCount: number;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface GlobalStats {
  totalUsers: number;
  totalProtocols: number;
  totalAgents: number;
  totalAudits: number;
  totalVolume: number;
  activeNodes: number;
}

export interface AuditResult {
  id: string;
  assetId?: string;
  userId: string;
  overallScore: number;
  logic: number;
  safety: number;
  efficiency: number;
  summary: string;
  vulnerabilities: string[];
  recommendations: string[];
  provider: AIProviderID;
  model: string;
  timestamp: any;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

export type ModalType = 
  | 'ProtocolDetails' 
  | 'AuditReport' 
  | 'AddCredits' 
  | 'Withdrawal' 
  | 'DemoView' 
  | 'UpgradePrompt'
  | 'ConfirmPurchase'
  | 'NewFolder'
  | 'AddFile'
  | 'NewNote'
  | 'AddMember';

export interface ModalState {
  type: ModalType | null;
  props: any;
}

export interface FileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  downloadURL: string;
  storagePath: string;
  createdAt: any;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: any;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: any;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  createdAt: any;
}

/**
 * FIX: Added missing AppData interface for global app configuration data.
 */
export interface AppData {
  hero: {
    status: string;
    headline: string;
    subheadline: string;
  };
  protocols: Protocol[];
  tools: Tool[];
  footer: {
    systemStatus: string;
    version: string;
  };
}

/**
 * FIX: Added missing Tool interface for platform utility cards.
 */
export interface Tool {
  id: string;
  name: string;
  status: string;
  description: string;
  type: string;
  access: string;
}

/**
 * FIX: Added missing LicenseType used in marketplace and checkout flows.
 */
export type LicenseType = 'personal' | 'commercial' | 'enterprise';

/**
 * FIX: Added missing AuthResult for explicit typing of auth service responses.
 */
export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}
