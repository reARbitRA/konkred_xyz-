import React, { useState, useEffect } from 'react';
import { 
  Newspaper, 
  ArrowUpRight, 
  Search, 
  Hash, 
  Clock, 
  Eye, 
  MessageSquare, 
  Bookmark, 
  ArrowLeft, 
  Upload, 
  FileText, 
  Code, 
  Eye as EyeIcon, 
  Sparkles, 
  CheckCircle2, 
  Plus, 
  ChevronRight, 
  FileCode, 
  BookOpen, 
  Trash2,
  Share2,
  Lock,
  UserCheck,
  ShieldAlert,
  Terminal,
  Cpu,
  Loader2
} from 'lucide-react';
import Badge from '../components/common/Badge.tsx';
import DOMPurify from 'dompurify';
import { PageView } from '../types.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { db, OperationType, handleFirestoreError } from '../services/firebase.ts';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';

interface BlogPost {
  id: string | number;
  title: string;
  category: string;
  date: string;
  readTime: string;
  desc: string;
  views?: string;
  comments?: number;
  htmlContent: string;
  authorId?: string;
  isUserUploaded?: boolean;
}

const DEFAULT_POSTS: BlogPost[] = [
  { 
    id: 1, 
    title: 'The Rise of Structural AI Capital', 
    category: 'Strategy', 
    date: 'NOV 22, 2024', 
    readTime: '8 min', 
    desc: 'Why enterprise value is shifting from raw compute power to verified logic maps and deterministic operating procedures.', 

    htmlContent: `
      <div class="space-y-8">
        <p class="text-lg leading-relaxed text-neutral-300 font-light">
          The architecture of software valuation has completed a fundamental phase transition. Historically, enterprise multiples were calculated on predictable, recurring software usage metrics. In the agentic era, however, raw foundation models represent commoditised utilities. The actual enterprise value is shifting entirely to <strong>Structural AI Capital</strong>—the proprietary logic maps, validation consensus protocols, and curated prompting nets that sit on top.
        </p>
        
        <div class="h-[1px] bg-cyan-400/20 my-8"></div>
        
        <h3 class="text-2xl font-bold text-white font-display mt-8">Computed Commodities vs. Local Epfficacy</h3>
        <p class="text-neutral-300 leading-relaxed font-light">
          Any developer with credit credentials can query foundation models. When LLM execution is distributed globally, the competitive edge is no longer "access to the model" but "deterministic containment of the model." This realization is fueling the demand for verified, sandboxed, and audited structures like the ones listed on the KONKRED index.
        </p>

        <div class="p-6 bg-cyan-400/5 border border-cyan-400/20 space-y-4 my-8">
          <h4 class="text-sm font-mono text-accent-cyan uppercase tracking-widest">Key Metric Indicators:</h4>
          <ul class="space-y-2 text-sm text-neutral-400 font-mono">
            <li class="flex items-center gap-2"><span class="text-accent-cyan">◆</span> Average workflow failure rate without audit constraints: 14.2%</li>
            <li class="flex items-center gap-2"><span class="text-accent-cyan">◆</span> Average workflow failure rate under Arbitra validation: &lt;0.01%</li>
            <li class="flex items-center gap-2"><span class="text-accent-cyan">◆</span> Asset multiple increase for audited prompt repositories: 4.8x</li>
          </ul>
        </div>

        <h3 class="text-2xl font-bold text-white font-display">Token Governance as a Balance Sheet Asset</h3>
        <p class="text-neutral-300 leading-relaxed font-light">
          As compliance authorities scrutinize AI-assisted decision making, deterministic prompt architectures are transforming from standard software artifacts to high-grade corporate assets. Organizations can no longer rely on opaque "system role" guidelines that are vulnerable to jailbreaking or severe logic degradation over time.
        </p>

        <p class="text-neutral-300 leading-relaxed font-light">
          By wrapping natural language logic inside autonomous micro-agents and subjecting them to continuous stress assessments, modern enterprises are producing tradeable IP and securing lasting valuation advantages. The era of the "uncontained chatbot" is officially dead.
        </p>
      </div>
    `
  },
  { 
    id: 2, 
    title: 'Auditing LLM Efficacy: A Quantitative Framework', 
    category: 'Engineering', 
    date: 'NOV 20, 2024', 
    readTime: '12 min', 
    desc: 'A deep dive into the KONKRED AUDIT v4.0 scoring system. How we measure logic, safety, and operational efficiency.', 

    htmlContent: `
      <div class="space-y-8">
        <p class="text-lg leading-relaxed text-neutral-300 font-light">
          How do you evaluate stability inside a system that operates on fuzzy, non-deterministic natural language? This is the fundamental engineering bottleneck we resolved with the release of the <strong>KONKRED AUDIT v4.0 scoring protocol</strong>.
        </p>

        <div class="h-[1px] bg-cyan-400/20 my-8"></div>

        <h3 class="text-2xl font-bold text-white font-display">Multi-Vector Penetration Stress</h3>
        <p class="text-neutral-300 leading-relaxed font-light">
          A robust prompt is not just a highly detailed instruction card. It represents an engineered interface limit. Our framework subjects candidates to automated adversarial evaluation across three distinct axes:
        </p>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 my-8">
          <div class="p-5 bg-neutral-900 border border-neutral-800">
            <span class="text-xs font-mono text-accent-cyan block mb-2">AXIS A: INJECTION</span>
            <p class="text-xs text-neutral-400">Dynamic execution of escape vectors to bypass primary system roles and leakage filters.</p>
          </div>
          <div class="p-5 bg-neutral-900 border border-neutral-800">
            <span class="text-xs font-mono text-accent-emerald block mb-2">AXIS B: DRIFT</span>
            <p class="text-xs text-neutral-400">High-concurrency logic evaluations under high temperatures to calculate maximum entropy parameters.</p>
          </div>
          <div class="p-5 bg-neutral-900 border border-neutral-800">
            <span class="text-xs font-mono text-neon-purple block mb-2">AXIS C: ALIGNMENT</span>
            <p class="text-xs text-neutral-400">Comparing final outputs mathematically using cosine vector similarity against predefined functional ranges.</p>
          </div>
        </div>

        <h3 class="text-2xl font-bold text-white font-display">System Integrity Metric Calculations</h3>
        <p class="text-neutral-300 leading-relaxed font-light">
          The resulting audit report generates a numerical representation of risk. Users purchasing templates or agents from the KONKRED App Store can inspect these scores transparently. A score of 95+ indicates the protocol is capable of direct, standalone interaction within automated workflows, while scores below 85 require continuous supervisor monitoring.
        </p>
      </div>
    `
  },
  { 
    id: 3, 
    title: 'Market Analysis: SaaS Multiples in the Age of Agents', 
    category: 'Finance', 
    date: 'NOV 18, 2024', 
    readTime: '15 min', 
    desc: 'Why buyers increasingly pay for documented, trusted AI workflows and what that means for enterprise purchasing in 2025.',

    htmlContent: `
      <div class="space-y-8">
        <p class="text-lg leading-relaxed text-neutral-300 font-light">
          As enterprise valuations face pressure, we are witnessing a massive transfer of value from generic SaaS interfaces to localized intelligence endpoints that perform domain-specific corporate labor autonomously.
        </p>

        <div class="h-[1px] bg-cyan-400/20 my-8"></div>

        <h3 class="text-2xl font-bold text-white font-display">The Transition to Autonomous Multiples</h3>
        <p class="text-neutral-300 leading-relaxed font-light">
          Acquirers are no longer interested in buying bloated wrapper apps that charge high fees for simple layout updates. They are looking directly for logic units that can be integrated inside pre-existing tech pipelines to immediately optimize operation costs.
        </p>

        <blockquote class="border-l-4 border-accent-cyan pl-6 my-8 py-2 italic text-cyan-400 font-light text-base bg-cyan-950/20">
          "The acquisition metrics have changed. We don't evaluate seat counts anymore. We evaluate prompt reliability indexes, token-to-dollar multipliers, and model-agnostic layer portability."
        </blockquote>

        <p class="text-neutral-300 leading-relaxed font-light">
          This analysis examines why buyers increasingly favor documented, auditable AI workflows over undocumented models, and what purchasing teams should look for in 2025.
        </p>
      </div>
    `
  }
];

const BlogHub: React.FC<{ onNavigate: (page: PageView) => void }> = ({ onNavigate }) => {
  const { user, isAuthenticated } = useAuth();
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Console state: publish section toggle
  const [showConsole, setShowConsole] = useState(false);
  const [consoleTab, setConsoleTab] = useState<'upload' | 'write'>('upload');
  
  // Custom blog upload states
  const [htmlFileText, setHtmlFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Strategy');
  const [desc, setDesc] = useState('');
  const [readTime, setReadTime] = useState('5 min');
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [fileError, setFileError] = useState('');

  // Drag over visual state
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [subscribeSuccess, setSubscribeSuccess] = useState(false);
  const [emailInput, setEmailInput] = useState('');

  // Authorization & Permissions control
  const [showAuthGate, setShowAuthGate] = useState(false);

  // Load and merge default posts with Firestore blogs
  useEffect(() => {
    const fetchBlogs = async () => {
      setLoading(true);
      try {
        const blogsRef = collection(db, 'blogs');
        const q = query(blogsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const firestorePosts = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          isUserUploaded: true,
          date: doc.data().createdAt ? new Date(doc.data().createdAt.seconds * 1000).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : 'RECENT'
        } as BlogPost));
        
        setBlogPosts([...firestorePosts, ...DEFAULT_POSTS]);
      } catch (err) {
        console.error("Critical: Hub feed synchronization failed.", err);
        setBlogPosts(DEFAULT_POSTS);
      } finally {
        setLoading(false);
      }
    };
    
    fetchBlogs();
  }, []);

  // Filter posts based on search
  const filteredPosts = blogPosts.filter(post => 
    post.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    post.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
    post.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Fast parsing of HTML input to auto-extract valuable metrics
  const parseHtmlAndExtractMetadata = (htmlStr: string) => {
    const titleMatch = htmlStr.match(/<title>([\s\S]*?)<\/title>/i) || 
                       htmlStr.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
                       htmlStr.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const firstP = htmlStr.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    
    if (titleMatch && titleMatch[1]) {
      setTitle(titleMatch[1].replace(/<[^>]*>/g, '').trim().substring(0, 80));
    } else {
      setTitle('Strategic Executive Digest');
    }

    if (firstP && firstP[1]) {
      setDesc(firstP[1].replace(/<[^>]*>/g, '').trim().substring(0, 160) + '...');
    } else {
      setDesc('High-fidelity brief containing verified technical execution frameworks and system telemetry logs.');
    }

    const plainText = htmlStr.replace(/<[^>]*>/g, '');
    const wordCount = plainText.split(/\s+/).filter(Boolean).length;
    const estTime = Math.max(1, Math.ceil(wordCount / 200));
    setReadTime(`${estTime} min`);
    
    setHtmlFileText(htmlStr);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processHtmlFile(file);
  };

  const processHtmlFile = (file: File) => {
    if (!file.name.endsWith('.html') && !file.name.endsWith('.htm') && !file.name.endsWith('.txt')) {
      setFileError('Invalid system format. Please upload valid HTML (.html) format.');
      return;
    }
    setFileError('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target && typeof event.target.result === 'string') {
        parseHtmlAndExtractMetadata(event.target.result);
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processHtmlFile(file);
    }
  };

  const handleDeletePost = async (id: string | number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;

    try {
      if (typeof id === 'string' && id.startsWith('user-')) {
          // This case shouldn't happen with firestore but for safety
          return;
      }
      
      const postRef = doc(db, 'blogs', id as string);
      await deleteDoc(postRef);
      setBlogPosts(prev => prev.filter(p => p.id !== id));
      
      if (selectedPost?.id === id) {
        setSelectedPost(null);
      }
    } catch (err) {
      console.error("Disposal failure:", err);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!htmlFileText.trim()) {
      setFileError('Execution error: Raw HTML content core cannot be empty.');
      return;
    }

    setIsPublishing(true);
    setFileError('');

    try {
      const blogsRef = collection(db, 'blogs');
      const blogData = {
        authorId: user.id,
        title: title || 'Strategic Executive Digest',
        category: category || 'Strategy',
        readTime: readTime || '5 min',
        desc: desc || 'Briefing with documented computational workflows.',

        htmlContent: htmlFileText,
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(blogsRef, blogData);
      
      const newPost: BlogPost = {
        id: docRef.id,
        ...blogData,
        date: new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase(),
        isUserUploaded: true
      } as BlogPost;

      setBlogPosts(prev => [newPost, ...prev]);

      setUploadSuccess(true);
      setTimeout(() => {
        setUploadSuccess(false);
        setShowConsole(false);
        setHtmlFileText('');
        setFileName('');
        setTitle('');
        setDesc('');
      }, 1500);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'blogs');
    } finally {
      setIsPublishing(false);
    }
  };

  const canShowConsole = user?.canGenerateBlogs && user?.acceptedCopyrightTerms;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-void font-mono">
        <Loader2 size={48} className="text-neon-cyan animate-spin mb-4" />
        <p className="text-[10px] text-neon-cyan uppercase tracking-[0.4em] animate-pulse">SYNCHRONIZING_INTEL_NETWORK...</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 min-h-screen brutalist-bg concrete-texture bg-blend-overlay pt-28 font-sans text-text-primary selection:bg-neon-cyan selection:text-black relative">
      
      {/* Brutalist styling: Scanline CRT aesthetic overlay */}
      <div className="scanline-overlay pointer-events-none opacity-10"></div>

      {/* Embedded stylesheet to styled generic HTML tags rendered under DangerousHTML */}
      <style>{`
        #raw-html-outlet {
          color: #eae7e1;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 1rem;
          line-height: 1.8;
        }
        @media (min-width: 768px) {
          #raw-html-outlet {
            font-size: 1.1rem;
          }
        }
        #raw-html-outlet h1, 
        #raw-html-outlet h2, 
        #raw-html-outlet h3, 
        #raw-html-outlet h4 {
          color: #f4f1eb;
          font-family: var(--font-display, 'Space Grotesk', 'Inter', sans-serif);
          font-weight: 700;
          letter-spacing: -0.02em;
          margin-top: 2.22rem;
          margin-bottom: 1.2rem;
          line-height: 1.3;
          border-left: 3px solid #d60019;
          padding-left: 1rem;
        }
        #raw-html-outlet h1 {
          font-size: 2rem;
        }
        #raw-html-outlet h2 {
          font-size: 1.6rem;
          border-bottom: 1px solid rgba(204, 255, 0, 0.15);
          padding-bottom: 0.4rem;
        }
        #raw-html-outlet h3 {
          font-size: 1.35rem;
        }
        #raw-html-outlet p {
          margin-top: 0;
          margin-bottom: 1.4rem;
          color: #b7b2a9;
          font-weight: 300;
        }
        #raw-html-outlet ul, 
        #raw-html-outlet ol {
          margin-top: 1.2rem;
          margin-bottom: 1.2rem;
          padding-left: 1.6rem;
          background-color: rgba(204, 255, 0, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding-top: 1rem;
          padding-bottom: 1rem;
        }
        #raw-html-outlet ul {
          list-style-type: square;
        }
        #raw-html-outlet ol {
          list-style-type: decimal;
        }
        #raw-html-outlet li {
          margin-bottom: 0.6rem;
          color: #8a857d;
          font-weight: 400;
        }
        #raw-html-outlet li::marker {
          color: #d60019;
        }
        #raw-html-outlet blockquote {
          border-left: 4px solid #d60019;
          padding: 1rem 1.4rem;
          color: #d60019;
          background: rgba(204, 255, 0, 0.04);
          font-style: italic;
          margin: 1.8rem 0;
          font-family: var(--font-mono, monospace);
          font-size: 0.95rem;
        }
        #raw-html-outlet strong {
          color: #d60019;
          font-weight: 600;
        }
        #raw-html-outlet code {
          font-family: var(--font-mono, monospace);
          background-color: rgba(204, 255, 0, 0.08);
          padding: 0.15rem 0.35rem;
          font-size: 0.85em;
          color: #d60019;
          border: 1px dashed rgba(204, 255, 0, 0.2);
        }
        #raw-html-outlet pre {
          background-color: #100e0d;
          border: 1px solid rgba(204, 255, 0, 0.2);
          padding: 1.2rem;
          overflow-x: auto;
          font-family: var(--font-mono, monospace);
          font-size: 0.85rem;
          color: #f4f1eb;
          margin: 1.8rem 0;
          box-shadow: inset 3px 3px 10px rgba(0,0,0,0.8);
        }
      `}</style>

      <div className="max-w-7xl mx-auto space-y-12 relative z-10">
        
        {/* Navigation & Controls Area */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b-2 border-neutral-800" id="blog-hub-controls">
          <button 
            onClick={() => {
              if (selectedPost) {
                setSelectedPost(null);
              } else {
                onNavigate('landing');
              }
            }}
            className="inline-flex items-center gap-2 border-2 border-neutral-800 bg-[#0a0908] hover:bg-neutral-900 text-text-secondary hover:text-neon-cyan px-4 py-2 text-[10px] uppercase tracking-widest font-mono transition-all duration-200 hover:shadow-[2px_2px_0px_#d60019]"
            id="btn-blog-back"
          >
            <ArrowLeft size={12} className="text-neon-cyan" /> 
            {selectedPost ? 'SYS_RETURN_FEED' : 'SYS_RETURN_BASE'}
          </button>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                if (!isAuthenticated) {
                  onNavigate('enter');
                  return;
                }
                
                if (canShowConsole) {
                  setShowConsole(!showConsole);
                  setShowAuthGate(false);
                } else {
                  setShowAuthGate(!showAuthGate);
                  setShowConsole(false);
                }
              }}
              className={`px-5 py-2.5 border-2 text-xs font-mono tracking-widest font-bold uppercase transition-all flex items-center gap-2 ${
                showConsole || showAuthGate
                  ? 'bg-neon-cyan text-black border-neon-cyan shadow-[3px_3px_0px_rgba(255,255,255,0.15)]' 
                  : 'bg-[#0a0908] text-white hover:text-black hover:bg-neon-cyan border-neutral-800 hover:border-neon-cyan hover:shadow-[3px_3px_0px_#d60019] active:translate-y-[2px]'
              }`}
              id="btn-toggle-publisher"
            >
              <Plus size={14} className={`transform transition-transform duration-300 ${showConsole || showAuthGate ? 'rotate-45' : ''}`} />
              {isAuthenticated ? (canShowConsole ? (showConsole ? 'CLOSE_CONSOLE' : 'UPLINK_HTML_BLOG') : (showAuthGate ? 'CANCEL_SYS_AUTH' : 'AUTHORIZE_UPLINK')) : 'LOGIN_TO_UPLINK'}
            </button>
          </div>
        </div>

        {/* Secure Authorization Gate Section */}
        {showAuthGate && !canShowConsole && isAuthenticated && (
          <div className="bg-[#0a0908] border-2 border-red-500/40 concrete-card p-6 md:p-8 animate-in fade-in slide-in-from-top-4 duration-300 relative overflow-hidden" id="authority-barrier-box">
            {/* Red alert accent boundary */}
            <div className="absolute top-0 left-0 w-full h-[4px] bg-gradient-to-r from-red-600 via-red-500 to-red-600"></div>
            
            <div className="max-w-xl mx-auto text-center space-y-6">
              <div className="w-14 h-14 bg-red-500/10 border-2 border-red-500/30 text-red-400 rounded-none flex items-center justify-center mx-auto shadow-[3px_3px_0px_rgba(239,68,68,0.2)]">
                <Lock size={22} className="animate-pulse" />
              </div>
              
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-white font-display tracking-tight uppercase">PRECISE PERMISSION REQUIRED</h3>
                <div className="text-xs text-text-secondary font-mono leading-relaxed px-4 space-y-4 text-left">
                  <p>Deploying articles to the live KONKRED Intel feed requires explicit cryptographic clearance from the Root Administrator.</p>
                  
                  <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl space-y-2">
                    <p className="text-white flex items-center gap-2">
                       {user?.acceptedCopyrightTerms ? <CheckCircle2 size={12} className="text-neon-cyan" /> : <Lock size={12} className="text-red-500" />}
                       COPYRIGHT_TERMS_ACCEPTED: {user?.acceptedCopyrightTerms ? 'TRUE' : 'FALSE'}
                    </p>
                    <p className="text-white flex items-center gap-2">
                       {user?.canGenerateBlogs ? <CheckCircle2 size={12} className="text-neon-cyan" /> : <Lock size={12} className="text-red-500" />}
                       INTEL_PUBLISH_PERMISSION: {user?.canGenerateBlogs ? 'TRUE' : 'FALSE'}
                    </p>
                  </div>
                  
                  <p className="italic opacity-60">Sequence: Only members who signed up agreeing to precise KONKRED copyright rules can be granted this permission. If you have not agreed, your node cannot be elevated.</p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setShowAuthGate(false)}
                  className="w-full bg-[#171514] border-2 border-neutral-800 text-white font-bold py-3.5 rounded-none text-xs font-mono tracking-widest uppercase transition-all hover:bg-neutral-900"
                >
                  DISMISS_BARRIER
                </button>
              </div>
            </div>
          </div>
        )}

        {/* HTML Uploader Console Area - Matches brutalist concrete panel */}
        {showConsole && canShowConsole && (
          <div className="bg-[#100e0d] border-2 border-neon-cyan/40 concrete-card p-6 md:p-8 animate-in fade-in slide-in-from-top-6 duration-300 relative overflow-hidden" id="publisher-console-box">
            <div className="absolute top-0 right-0 p-2 font-mono text-[9px] text-neon-cyan/40 pointer-events-none select-none">
              UPLINK_TERM_v4.45
            </div>
            
            <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-8 pb-4 border-b border-neutral-800 gap-4">
              <div>
                <h3 className="text-2xl font-bold text-white font-display flex items-center gap-2 tracking-tight">
                  <Cpu size={22} className="text-neon-cyan" /> TERMINAL: HTML DIRECT_DEPLOY
                </h3>
                <p className="text-xs text-text-secondary font-mono mt-0.5">Publish custom responsive HTML payloads directly to root directories as {user?.name}.</p>
              </div>

              {/* Console Mode Tab Controller */}
              <div className="flex bg-[#0a0908] p-1 border-2 border-neutral-800 font-mono text-[9px]">
                <button
                  type="button"
                  onClick={() => setConsoleTab('upload')}
                  className={`px-4 py-2 font-bold uppercase tracking-wider transition-all ${
                    consoleTab === 'upload' 
                      ? 'bg-neon-cyan text-black' 
                      : 'text-text-secondary hover:text-white'
                  }`}
                >
                  SYSTEM_FILE_DROP
                </button>
                <button
                  type="button"
                  onClick={() => setConsoleTab('write')}
                  className={`px-4 py-2 font-bold uppercase tracking-wider transition-all ${
                    consoleTab === 'write' 
                      ? 'bg-neon-cyan text-black' 
                      : 'text-text-secondary hover:text-white'
                  }`}
                >
                  CONSOLE_INTEGRATION
                </button>
              </div>
            </div>

            {uploadSuccess ? (
              <div className="text-center py-12 space-y-4" id="upload-success-feedback">
                <div className="w-16 h-16 bg-accent-emerald/10 text-accent-emerald border-2 border-accent-emerald/30 font-bold flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 size={32} />
                </div>
                <h4 className="text-xl font-bold text-white font-display tracking-tight">HTML COMPONENT DEPLOYED</h4>
                <p className="text-xs text-text-secondary font-mono">Payload synchronized inside index registry blocks.</p>
              </div>
            ) : (
              <form onSubmit={handlePublish} className="space-y-6">
                
                {/* Drag and drop module */}
                {consoleTab === 'upload' && (
                  <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed p-8 text-center transition-all cursor-pointer relative ${
                      isDragging 
                        ? 'border-neon-cyan bg-neon-cyan/10' 
                        : 'border-neutral-805 bg-[#0a0908] hover:border-neutral-700'
                    }`}
                  >
                    <input 
                      type="file" 
                      accept=".html,.htm,.txt"
                      onChange={handleFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="max-w-md mx-auto space-y-4 pointer-events-none">
                      <div className="w-12 h-12 bg-neutral-900 border border-neutral-800 flex items-center justify-center mx-auto text-text-secondary">
                        <Upload size={20} className="text-neon-cyan" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-white uppercase tracking-wider">DRAG_DROP RAW HTML INFRASTRUCTURE</p>
                        <p className="text-[10px] text-text-secondary font-mono">Accepts HTML documents formatted under default markup structures.</p>
                      </div>
                      {fileName && (
                        <div className="inline-flex items-center gap-2 bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 px-3 py-1.5 text-xs font-mono uppercase mt-2">
                          <FileText size={12} /> {fileName}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Plain raw textarea console */}
                {consoleTab === 'write' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-text-secondary uppercase tracking-[0.21em] block">HTML SOURCE STRING</label>
                    <div className="relative overflow-hidden border-2 border-neutral-800 bg-[#0a0908]">
                      <div className="bg-[#100e0d] px-4 py-2 flex items-center gap-2 border-b border-neutral-800">
                        <Code size={14} className="text-neon-cyan" />
                        <span className="text-[9px] font-mono font-bold text-text-secondary uppercase tracking-wider">MarkUp Console Editor</span>
                      </div>
                      <textarea
                        required={consoleTab === 'write'}
                        rows={8}
                        value={htmlFileText}
                        onChange={(e) => parseHtmlAndExtractMetadata(e.target.value)}
                        placeholder={`<div class="space-y-6">\n  <p>Your strategic documentation briefs go here...</p>\n</div>`}
                        className="w-full bg-transparent p-5 font-mono text-xs text-[#d60019] focus:outline-none leading-relaxed h-64 resize-y"
                      ></textarea>
                    </div>
                  </div>
                )}

                {/* Extracted Metadata Dashboard Panel */}
                {htmlFileText && (
                  <div className="bg-[#0a0908] border-2 border-neutral-800 p-6 space-y-6" id="metadata-tuning-panel">
                    <div className="flex items-center gap-2 pb-2 border-b border-neutral-800">
                      <Terminal size={14} className="text-neon-cyan animate-pulse" />
                      <h4 className="text-[10px] font-mono text-white tracking-[0.2em] uppercase">
                        TELEMETRY DIRECTIVES
                      </h4>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-mono text-text-secondary uppercase tracking-wider block">Document Label / Title</label>
                        <input
                           type="text"
                           required
                           value={title}
                           onChange={(e) => setTitle(e.target.value)}
                           className="w-full bg-[#171514] border-2 border-neutral-800 px-4 py-3 text-xs text-white focus:outline-none focus:border-neon-cyan transition-all"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-[10px] font-mono text-text-secondary uppercase tracking-wider block">Archive Category</label>
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="w-full bg-[#171514] border-2 border-neutral-800 px-4 py-3 text-xs text-white focus:outline-none focus:border-neon-cyan transition-all"
                        >
                          <option value="Strategy">Strategic Capital (Strategy)</option>
                          <option value="Engineering">Neural Engineering (Engineering)</option>
                          <option value="Finance">Financial Modeling (Finance)</option>
                          <option value="Governance">Governance Protocols</option>
                          <option value="Security">Security Enclaves</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-mono text-text-secondary uppercase tracking-wider block">Calculated Rating (Read Duration)</label>
                        <input
                          type="text"
                          required
                          value={readTime}
                          onChange={(e) => setReadTime(e.target.value)}
                          className="w-full bg-[#171514] border-2 border-neutral-800 px-4 py-3 text-xs text-white focus:outline-none focus:border-neon-cyan transition-all font-mono"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-mono text-text-secondary uppercase tracking-wider block">Article Snippet</label>
                        <textarea
                          rows={2}
                          required
                          value={desc}
                          onChange={(e) => setDesc(e.target.value)}
                          className="w-full bg-[#171514] border-2 border-neutral-800 px-4 py-3 text-xs text-white focus:outline-none focus:border-neon-cyan transition-all"
                        ></textarea>
                      </div>
                    </div>

                    <div className="flex items-center justify-end border-t border-neutral-850 pt-4">
                      <button
                        type="submit"
                        disabled={isPublishing}
                        className="px-6 py-3.5 bg-neon-cyan text-black font-semibold text-xs font-mono uppercase tracking-widest hover:bg-white transition-all duration-200 flex items-center gap-1.5 shadow-[3px_3px_0px_#f4f1eb] disabled:opacity-50"
                      >
                        {isPublishing ? <Loader2 size={14} className="animate-spin" /> : <>DEPLOY TO INTEL NODE <ChevronRight size={14} /></>}
                      </button>
                    </div>
                  </div>
                )}
                
                {fileError && (
                  <p className="text-xs text-red-400 font-mono flex items-center gap-1.5 bg-red-950/20 px-3 py-2 border border-red-500/20">
                    ⚠️ {fileError}
                  </p>
                )}
              </form>
            )}

            {/* Operator Guidelines */}
            <div className="mt-8 pt-6 border-t-2 border-neutral-800 space-y-4">
                <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl">
                   <p className="text-[10px] text-text-secondary font-mono leading-relaxed"><span className="text-neon-cyan">NOTICE:</span> Your credentials are bound to this deployment. All HTML briefings must comply with the <span className="text-neon-cyan">KONKRED Copyright Rules</span>. Plagiarism or unauthorized asset extraction will result in severe reputation penalties and node revocation.</p>
                </div>
            </div>

          </div>
        )}

        {/* Selected Post Reader Mode */}
        {selectedPost ? (
          <article className="max-w-4xl mx-auto space-y-10 animate-in fade-in duration-500" id="blog-reader-view">
            {/* Cover Info */}
            <header className="space-y-6 pb-8 border-b-2 border-neutral-800">
              <div className="flex flex-wrap items-center gap-4">
                <Badge variant="cyan">{selectedPost.category}</Badge>
                <div className="flex items-center gap-2 text-[10px] text-text-secondary font-mono uppercase tracking-widest">
                  <span>{selectedPost.date}</span>
                  <span>/</span>
                  <span>{selectedPost.readTime} ESTIMATED LENGTH</span>
                </div>
              </div>
              
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white font-display leading-[1.15]">
                {selectedPost.title}
              </h1>

              <div className="p-4 bg-neon-cyan/5 border-l-4 border-neon-cyan text-neon-cyan leading-relaxed font-mono text-xs max-w-3xl">
                <span className="text-[9px] text-neon-cyan/60 block mb-1 uppercase tracking-widest">SUMMARY_INDEX // BRIEF</span>
                {selectedPost.desc}
              </div>
            </header>

            {/* Pure markup direct HTML render */}
            <div 
              className="prose prose-invert max-w-none text-text-secondary leading-relaxed font-light font-sans space-y-6"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedPost.htmlContent) }}
              id="raw-html-outlet"
            />

            {/* Actions Footer */}
            <div className="pt-12 border-t-2 border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-6" id="reader-actions-footer">
              <button
                onClick={() => setSelectedPost(null)}
                className="flex items-center gap-2 text-xs font-mono text-text-secondary hover:text-neon-cyan uppercase tracking-widest transition-colors duration-200"
              >
                <ArrowLeft size={14} /> Back to all Briefings
              </button>

              <div className="flex items-center gap-3">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="px-4 py-2.5 bg-[#0a0908] hover:bg-zinc-900 border-2 border-neutral-800 hover:border-neon-cyan text-text-secondary hover:text-white transition-all text-[10px] font-mono uppercase tracking-wider flex items-center gap-2 hover:shadow-[2px_2px_0px_#d60019]"
                  title="Share document link"
                >
                  <Share2 size={13} className="text-neon-cyan" />
                  <span>{copied ? 'LINK_PIPELINE_COPIED' : 'COPY_DOCK_LINK'}</span>
                </button>
              </div>
            </div>
          </article>
        ) : (
          /* Normal Feed Layout */
          <div className="space-y-12">
            
            {/* Header Brief */}
            <header className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-10 pb-8 border-b-2 border-neutral-800">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 bg-neon-cyan/10 border border-neon-cyan/30 rounded-none px-3 py-1 text-[9px] font-mono uppercase tracking-[0.2em] text-neon-cyan mb-1">
                  <BookOpen size={11} className="text-neon-cyan animate-pulse" /> INTEL_OPERATING_CHANNELS
                </div>
                <h1 className="text-4xl md:text-6xl font-display font-bold text-white tracking-tight uppercase">
                  KONKRED <span className="text-neon-cyan font-display">Intel</span>
                </h1>
                <p className="text-text-secondary text-sm md:text-base font-light leading-relaxed max-w-2xl">
                  High-fidelity telemetry on natural language nodes, prompt security validations, and decentralized consensus networks under industrial constraints.
                </p>
              </div>
              
              {/* Brutalist styling Search container */}
              <div className="relative w-full md:w-96">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neon-cyan" size={15} />
                <input 
                  type="text"
                  placeholder="QUERY DATA ARCHIVES..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0a0908] border-2 border-neutral-800 rounded-none pl-12 pr-6 py-4 text-xs text-white focus:outline-none focus:border-neon-cyan focus:shadow-[3px_3px_0px_#d60019] font-mono tracking-widest transition-all placeholder:text-neutral-600"
                />
              </div>
            </header>

            {/* Grid layout */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-12" id="blog-feed-core-grid">
              
              {/* Feed lists */}
              <div className="lg:col-span-3 space-y-6">
                {filteredPosts.length === 0 ? (
                  <div className="text-center py-20 bg-[#0a0908] border-2 border-neutral-800 rounded-none" id="empty-search-state">
                    <p className="text-text-secondary font-mono text-xs uppercase tracking-[0.2em]">0 MATCHING DEPLOYMENTS FOUND</p>
                  </div>
                ) : (
                  filteredPosts.map((post) => (
                    <article 
                      key={post.id} 
                      onClick={() => setSelectedPost(post)}
                      className="group bg-[#0a0908] border-2 border-neutral-800 hover:border-neon-cyan concrete-card p-6 md:p-8 hover:shadow-[4px_4px_0px_#d60019] transition-all duration-300 cursor-pointer flex flex-col justify-between relative overflow-hidden"
                    >
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <span className="text-[9px] font-mono px-2.5 py-1 rounded-none bg-neon-cyan/10 border border-neon-cyan/30 font-bold uppercase text-neon-cyan tracking-wider">
                              {post.category}
                            </span>
                            <div className="flex items-center gap-3 text-[10px] text-text-secondary font-mono tracking-wider">
                              <span className="flex items-center gap-1 text-neutral-400"><Clock size={11} className="text-neon-cyan" /> {post.readTime}</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-text-secondary font-mono tracking-widest uppercase">
                              {post.date}
                            </span>
                            {post.isUserUploaded && (
                              <button
                                onClick={(e) => handleDeletePost(post.id, e)}
                                className="p-1.5 bg-[#171514] hover:bg-red-950/30 text-text-secondary hover:text-red-400 border border-neutral-800 hover:border-red-500/50 rounded-none transition-colors"
                                title="Delete HTML Post"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>

                        <h2 className="text-xl md:text-2xl font-bold text-white group-hover:text-neon-cyan transition-colors font-display line-clamp-1 tracking-tight">
                          {post.title}
                        </h2>
                        
                        <p className="text-text-secondary text-sm leading-relaxed font-light line-clamp-2">
                          {post.desc}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-5 mt-5 border-t border-neutral-850">
                        <span className="text-[9px] font-mono tracking-[0.25em] uppercase text-neon-cyan font-bold transition-all flex items-center gap-1 group-hover:translate-x-1.5 duration-300">
                          DECRYPT BRIEFING <ArrowUpRight size={12} className="text-neon-cyan" />
                        </span>
                        
                        <span className="text-[9px] font-mono text-neutral-600 block">
                          NODE_ADDR: 0x{post.id}
                        </span>
                      </div>
                    </article>
                  ))
                )}
              </div>

              {/* Sidebar */}
              <aside className="space-y-8" id="blog-feeds-sidebar">
                
                {/* Channels dispatch subscription card */}
                <div className="bg-[#0a0908] border-2 border-neutral-800 concrete-card p-6 relative overflow-hidden hover:border-neon-cyan/40 transition-all duration-300 shadow-[3px_3px_0px_rgba(255,255,255,0.02)]">
                  <div className="absolute -bottom-8 -right-8 p-4 opacity-5 pointer-events-none text-neon-cyan">
                    <Bookmark size={120} />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-none bg-neon-cyan animate-ping"></div>
                    <h3 className="text-xs font-mono font-bold text-white uppercase tracking-[0.2em]">Intel Dispatch</h3>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed mb-6 font-light">Join 4,000+ operators receiving secure weekly telemetries. Clean, technical content.</p>
                  
                  {subscribeSuccess ? (
                    <div className="p-4 bg-accent-emerald/10 border-2 border-accent-emerald/20 text-center space-y-2 animate-in fade-in duration-300">
                      <span className="text-[10px] font-mono text-accent-emerald font-bold block tracking-widest">UPLINK_ESTABLISHED</span>
                      <p className="text-[10px] text-text-secondary">Downlink successfully integrated with operator index.</p>
                    </div>
                  ) : (
                    <form 
                      onSubmit={(e) => { 
                        e.preventDefault(); 
                        setSubscribeSuccess(true); 
                        setEmailInput('');
                      }} 
                      className="space-y-3"
                    >
                      <input 
                        type="email" 
                        required
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="ari@konkred.xyz" 
                        className="w-full bg-[#171514] border-2 border-neutral-800 rounded-none px-4 py-3 text-xs text-white focus:outline-none focus:border-neon-cyan focus:shadow-[2px_2px_0px_#d60019] transition-all font-mono tracking-wider placeholder:text-neutral-700"
                      />
                      <button 
                        type="submit"
                        className="w-full bg-neon-cyan hover:bg-white text-black font-bold py-3.5 rounded-none text-[10px] font-mono tracking-widest uppercase transition-all shadow-[3px_3px_0px_#f4f1eb]"
                      >
                        ESTABLISH UPLINK
                      </button>
                    </form>
                  )}
                </div>

                {/* Direct industry note */}
                <div className="bg-[#0a0908]/60 border-2 border-dashed border-neutral-805 p-6 space-y-4">
                  <div className="flex items-center gap-1.5">
                    <Code size={13} className="text-neon-cyan" />
                    <h4 className="text-[10px] font-mono text-white tracking-[0.2em] uppercase">
                      SYSTEM_NOTICE
                    </h4>
                  </div>
                  <p className="text-[11px] text-[#8a857d] leading-relaxed font-light">
                    The intelligence matrix allows authorized coordinators to project custom HTML slides instantly. All components are sandboxed.
                  </p>
                </div>
              </aside>

            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BlogHub;
