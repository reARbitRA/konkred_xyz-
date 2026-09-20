# SYSTEM_DOCUMENTATION.md - KONKRED PRODUCTION NODE

## 1. PROJECT OVERVIEW
**Name:** KONKRED – Production Node (v2.5.0)
**Purpose:** An enterprise-grade ecosystem for Structural AI Capital. It provides verified protocols, autonomous agent builders (Forge), and advanced adversarial red-teaming diagnostics (Redaeye). The platform bridges the gap between raw LLM capabilities and deterministic, production-ready enterprise frameworks.

## 2. TECHNICAL SPECIFICATION
- **Language:** TypeScript (Strict Mode)
- **Frontend Framework:** React 19 (Vite)
- **Backend Architecture:** Full-stack integration
  - **Server:** Node.js / Express 5 (Custom API Gateway)
  - **Database:** Firebase Firestore (Cloud persistence)
  - **Authentication:** Firebase Auth
  - **ORM:** Drizzle ORM (configured for PostgreSQL/Cloud SQL support)
- **AI Engine:** Unified Provider Gateway (Gemini 3 Pro, Claude 3.5, Llama 3.3, GPT-4o) via `@google/genai` and custom API proxies.
- **Styling:** Tailwind CSS (Modern Utility-First)
- **Animations:** Motion (Framer Motion v12)
- **Data Visualization:** D3.js, Recharts
- **PDF Generation:** jsPDF, html2canvas

## 3. DESIGN SYSTEM & UI/UX
- **Archetype:** Neo-Brutalist Technical / Cyber-Forensic Dark
- **Visual Language:** High contrast, glassmorphic panels, animated scanlines, and glow accents.
- **Color Palette:**
  - Background: `#000000` (Void Black)
  - Surface: `#0A0A0A` (Core Onyx)
  - Border: `#333333` (Tactile Wireframe)
  - Accent: `#FF003C` (Signal Crimson / Redaeye Red)
  - Highlight: `#FFD700` (Tactical Yellow)
- **Typography:**
  - Display: Orbitron (Uppercase, Heavy)
  - Technical: JetBrains Mono / Fira Code
  - Body: Inter / Sans-serif

## 4. CORE FEATURES & IMPLEMENTATION STATUS
| Feature Module | Implementation Status | Description |
| :--- | :--- | :--- |
| **KONKRED REDAEYE** | **FULL** | Adversarial suite for AI safety. Includes P-H-A-S-E vector synthesis, diagnostic engine, and forensic reporting. |
| **fullKONK_>** | **FULL** | Flagship product builder replacing The Forge. Features a 3-stage generation pipeline (Architect, Build, Verify) with multi-provider failover and full-stack output. |
| **THE FORGE** | **DEPRECATED** | Merged into fullKONK_>. Page redirects to the new workspace. |
| **MARKETPLACE** | **PARTIAL** | Listing grid, protocol details, and acquisition workflows. |
| **ENCLAVE** | **PARTIAL** | Secure file management, team collaboration, and smart notes. |
| **VALUATION ENGINE** | **IMPLEMENTED** | Terminal-based automated protocol valuation. |
| **INTEL REPORT** | **IMPLEMENTED** | Dynamic intelligence feeds and classification layers. |
| **USAGE METRICS** | **IMPLEMENTED** | Real-time telemetry for API usage and spend. |
| **AUTH SYSTEM** | **FULL** | Login, Signup, and Email Verification with Firebase. |
| **GATEWAY API** | **FULL** | Express server proxying multi-provider AI requests. |

## 5. FILE STRUCTURE (CORE)
```text
/
├── components/           # Modular UI components
│   ├── common/           # Shared atoms (Buttons, Inputs, Modals)
│   ├── enclave/          # Enclave-specific logic
│   ├── forge/            # Agent building tools
│   ├── landing/          # Hero and marketing widgets
│   ├── marketplace/      # Trading UI
│   ├── redaeye/          # Adversarial suite components
│   └── Navbar.tsx        # Dynamic global navigation
├── pages/                # Route-level view containers
│   ├── LandingPage.tsx   # Core entrance
│   ├── RedaeyePage.tsx   # Adversarial Lab
│   ├── ForgePage.tsx     # Agent Builder
│   └── AccountPage.tsx   # Profile & Security
├── services/             # API and Database abstractions
│   ├── ai.ts             # Multi-provider logic
│   └── firebase.ts       # Cloud initialization
├── styles/               # Global CSS & Tailwind imports
├── types.ts              # Global TypeScript interfaces
├── server.ts             # Express entry point
├── metadata.json         # Project configuration
└── package.json          # Dependency manifest
```

## 6. DEVELOPMENT TIMELINE
- **Project Initiation:** 2026-08-09
- **Core Architecture Freeze:** 2026-08-09
- **Redaeye Integration:** 2026-08-10 (Current Focus)
- **Production Readiness:** Target V2.5.0 Deployment

## 7. BACKEND & INTEGRATIONS
- **Konkred AI Ecosystem Gateway:** `/fullkonk` provider discovery, SSE generation, GitHub export, and standard inference (`/api/ai`) flow through same-origin Vercel Node routes (`api/index.ts` → `server/gateway-proxy.ts`) that attach all credentials server-side. See **`docs/fullkonk/GATEWAY_INTEGRATION.md`** for architecture, environment variables, security, SSE, and rollback.
- **Vercel function env (server-only):** `KONKRED_GATEWAY_URL`, `FULLKONK_KEY`, `KONKRED_GATEWAY_API_KEY` (legacy `BRAIN_URL`/`BRAIN_KEY` aliases supported). Never prefixed for public exposure.
- **Firestore:** Stores users, listings, audit logs, and fullKONK session/project/usage history (sessions/usage/analytics routes remain on the bundled Express app).
- **Payments:** **Not configured.** Product, kit, sprint, and pilot CTAs currently collect explicit inquiries only; no checkout, wallet, invoice, payment intent, or settlement flow is exposed.
- **Security:** Firestore Rules enforced for level-based access control; proxy strips spoofed credential headers, caps/validates bodies, screens upstream responses, and preserves status/Retry-After.
- **Persistence:** LocalStorage used for the operator's own BYOK provider key (sent only to the same-origin generate route) and UI state; gateway credentials never touch the browser.

---
*Documentation Generated: 2026-08-10*
