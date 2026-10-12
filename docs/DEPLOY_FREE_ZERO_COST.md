# Deploy KONKRED Completely Free — ۰ تومان

**هدف:** Live غیر production تا ۱۰۰ request/day **بدون پول خرج کردن**

---

## **۱. Neon PostgreSQL — رایگان تا ۵۰۰ MB** ✅

صرفا ۲ دقیقه:

```bash
# ۱. برو https://neon.tech
# ۲. Sign up (GitHub login)
# ۳. Create Database
#    - Region: US East (N. Virginia)
#    - Copy "Pooled Connection String"
```

مثال:
```
postgresql://user:pass@ep-xyz-pooler.us-east-2.neon.tech/neondb
```

**نگهداری داتابیس:**
```bash
# داتابیس رو روی لپتاپت initiate کن:
npm install -D drizzle-orm
export DATABASE_URL="postgresql://..."
npm run db:migrate
```

✅ **Done. ۰ تومان.**

---

## **۲. Vercel — Website Hosting (رایگان)** ✅

۱۵ دقیقه:

```bash
# ۱. برو https://vercel.com
# ۲. GitHub login
# ۳. Import repo (reARbitRA/konkred_xyz-)

# ۴. Environment Variables (Production):
# KONKRED_GATEWAY_URL = https://your-gateway.workers.dev (ما ۳ میسازیم)
# KONKRED_GATEWAY_API_KEY = dev
# FULLKONK_KEY = dev
# DATABASE_URL = <از Neon>
# ANON_SALT = $(openssl rand -hex 32)
# INTERNAL_API_KEY = $(openssl rand -hex 32)
# TRIAL_ENABLED = true
# TRIAL_MESSAGES = 10

# ۵. Deploy (Vercel خودش build + deploy می‌کند)
```

✅ **Done. ۰ تومان. Site live است.**

---

## **۳. Cloudflare Workers — Gateway (رایگان تا ۱۰۰k requests/day!)** 🚀

۳۰ دقیقه:

### **Step A: Cloudflare Account**
```bash
# https://workers.cloudflare.com
# Sign up → Create free account
```

### **Step B: Mock Gateway (کافی برای DEV)**

فایل: `gateway/worker.js`

```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Health check
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ ok: true, configured: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Chat completion (mock)
    if (url.pathname === '/v1/chat/completions' && request.method === 'POST') {
      const body = await request.json();
      return new Response(JSON.stringify({
        id: 'mock-' + Date.now(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'mock-gpt',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Mock response: ' + (body.messages[body.messages.length - 1]?.content || 'hello')
          },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
  }
};
```

### **Step C: Deploy به Cloudflare**

```bash
# ۱. npm install -D wrangler
# ۲. Create wrangler.toml:

[env.production]
routes = [
  { pattern = "gateway.konkred.xyz/*", zone_name = "konkred.xyz" }
]

# ۳. Deploy:
npx wrangler deploy gateway/worker.js

# ۴. خروجی:
# ✓ Uploaded worker
# Your worker is live at:
# https://konkred-gateway.YOUR-NAMESPACE.workers.dev
```

✅ **Done. ۰ تومان. Gateway live است.**

---

## **۴. اتصال همه چیز — TEST**

```bash
# ۱. Website URL (از Vercel):
export SITE="https://konkred-xyz-.vercel.app"

# ۲. Gateway URL (از Cloudflare):
export GATEWAY="https://konkred-gateway.YOUR-NAMESPACE.workers.dev"

# ۳. Update Vercel env var:
vercel env add KONKRED_GATEWAY_URL $GATEWAY

# ۴. Redeploy:
vercel deploy --prod

# ۵. Test:
curl -sS $SITE/api/health | jq
# Expected: { "ok": true, "configured": true, "gatewayReachable": true }

curl -sS $GATEWAY/api/health | jq
# Expected: { "ok": true, "configured": true }
```

---

## **تخمینی COST برای سال اول:**

| Service | Free Tier | Cost |
|---------|-----------|------|
| **Neon DB** | 500 MB, 3GB compute/mo | ۰ تومان |
| **Vercel** | 3 deployments/day, no limits | ۰ تومان |
| **Cloudflare Workers** | 100k requests/day | ۰ تومان |
| **NowPayments** | USDT payments | 0.5% فقط روی transactions |
| **GitHub** | Public repo | ۰ تومان |
| **Firebase** (optional) | 50k reads/day | ۰ تومان |
| **TOTAL** | - | **۰ تومان** |

---

## **محدودیت‌های FREE TIER:**

❌ تا ۱۰۰ request/day (کافی برای testing)
❌ Mock AI responses (نه real Groq/Gemini)
❌ تا ۵۰۰ MB data
❌ بدون SLA

✅ برای production با مدل‌های واقعی، یکی از این کار کن:
1. Provider key‌های رایگان (Groq free tier)
2. یا upgrade gateway به paid tier

---

## **UPGRADE (وقتی درآمد بیاید):**

```
Neon DB:        ~$15/mo (50GB)
Vercel Pro:     ~$20/mo
Cloudflare Pro: ~$200/mo
Groq API:       $0.04/1M tokens
─────────────────────────
Total:          ~$250/mo (قابل کنترل)
```

---

## **فوری شروع کن:**

```bash
# ۱. Neon signup (2 min)
# ۲. Vercel deploy (5 min)  
# ۳. Cloudflare Workers (10 min)
# ۴. Connect (5 min)
# ۵. TEST (5 min)
# ────────────────
# Total: ۲۷ دقیقه
```

**Live خواهی شد تا ساعت دیگر.**

---

## **چی نیست:**

- هیچ provider key (Groq/Gemini) لازم نیست
- هیچ پول نیست
- هیچ credit card ثبت نیست
- کاملا riskless

**حالا کار کن. ۱۱ ماه تمام. بریم LIVE کن.** 🚀
