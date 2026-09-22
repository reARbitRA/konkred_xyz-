import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Persian checkout / billing page (RTL).
 *
 * Every async operation follows the same discipline established during the
 * production incident: explicit loading, success and error states, a timeout,
 * a retry control, a plain-Persian message for the user, and the diagnostic
 * code in the console only. Nothing here can spin forever.
 *
 * No secret ever reaches this component: it talks only to same-origin /api
 * routes, which attach credentials server-side.
 */

interface Plan {
  id: string;
  name: string;
  priceUsd: number;
  messages: number;
  currency: string;
  network: string;
}

interface Quota {
  authenticated: boolean;
  plan: string;
  trialRemaining: number;
  paidRemaining: number;
  totalRemaining: number;
  exhausted: boolean;
}

interface Invoice {
  orderId: string;
  invoiceUrl: string;
  plan: { id: string; name: string };
  priceUsd: number;
  currency: string;
  network: string;
  address: string;
  warning: string;
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

const TIMEOUT_MS = 12_000;

/** fetch with a hard timeout so no request can hang the UI. */
async function fetchJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const body = (await response.json().catch(() => ({}))) as T & { error?: string; code?: string };
    if (!response.ok) {
      const error = new Error(body?.error || 'REQUEST_FAILED') as Error & { code?: string; status?: number };
      error.code = body?.code;
      error.status = response.status;
      throw error;
    }
    return body;
  } finally {
    window.clearTimeout(timer);
  }
}

function persianError(error: unknown): string {
  const err = error as { name?: string; code?: string; status?: number };
  if (err?.name === 'AbortError') return 'زمان پاسخ به پایان رسید. لطفاً دوباره تلاش کنید.';
  if (err?.code === 'BILLING_NOT_CONFIGURED' || err?.code === 'PAYMENTS_NOT_CONFIGURED') {
    return 'سرویس پرداخت هنوز پیکربندی نشده است. لطفاً با پشتیبانی تماس بگیرید.';
  }
  if (err?.code === 'BILLING_UNAVAILABLE') return 'سرویس پرداخت موقتاً در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید.';
  if (err?.status === 429) return 'تعداد درخواست‌ها زیاد است. لطفاً کمی صبر کنید.';
  return 'خطایی رخ داد. لطفاً دوباره تلاش کنید.';
}

const CheckoutPage: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [warning, setWarning] = useState('');
  const [plansStatus, setPlansStatus] = useState<Status>('idle');
  const [plansError, setPlansError] = useState('');

  const [quota, setQuota] = useState<Quota | null>(null);
  const [quotaStatus, setQuotaStatus] = useState<Status>('idle');

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [invoiceStatus, setInvoiceStatus] = useState<Status>('idle');
  const [invoiceError, setInvoiceError] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<string>('');

  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const loadPlans = useCallback(async () => {
    setPlansStatus('loading');
    setPlansError('');
    try {
      const data = await fetchJson<{ plans: Plan[]; networkWarning: string }>('/api/payments/plans');
      if (!mounted.current) return;
      setPlans(data.plans || []);
      setWarning(data.networkWarning || '');
      setPlansStatus('ready');
    } catch (error) {
      if (!mounted.current) return;
      console.warn('[checkout] plans failed', (error as { code?: string })?.code);
      setPlansError(persianError(error));
      setPlansStatus('error');
    }
  }, []);

  const loadQuota = useCallback(async () => {
    setQuotaStatus('loading');
    try {
      const data = await fetchJson<Quota>('/api/quota');
      if (!mounted.current) return;
      setQuota(data);
      setQuotaStatus('ready');
    } catch (error) {
      if (!mounted.current) return;
      console.warn('[checkout] quota failed', (error as { code?: string })?.code);
      setQuotaStatus('error');
    }
  }, []);

  useEffect(() => { void loadPlans(); void loadQuota(); }, [loadPlans, loadQuota]);

  const buy = useCallback(async (planId: string) => {
    setInvoiceStatus('loading');
    setInvoiceError('');
    try {
      const data = await fetchJson<Invoice>('/api/payments/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      if (!mounted.current) return;
      setInvoice(data);
      setInvoiceStatus('ready');
      setPaymentStatus('pending');
    } catch (error) {
      if (!mounted.current) return;
      console.warn('[checkout] invoice failed', (error as { code?: string })?.code);
      setInvoiceError(persianError(error));
      setInvoiceStatus('error');
    }
  }, []);

  /** Manual refresh: confirmation is asynchronous (blockchain + webhook). */
  const refreshPayment = useCallback(async () => {
    if (!invoice) return;
    try {
      const data = await fetchJson<{ status: string; granted: boolean; totalRemaining: number }>(
        `/api/payments/status?orderId=${encodeURIComponent(invoice.orderId)}`,
      );
      if (!mounted.current) return;
      setPaymentStatus(data.status);
      if (data.granted) void loadQuota();
    } catch (error) {
      if (!mounted.current) return;
      console.warn('[checkout] status failed', (error as { code?: string })?.code);
    }
  }, [invoice, loadQuota]);

  // Poll while a payment is outstanding, and stop once it settles.
  useEffect(() => {
    if (!invoice || paymentStatus === 'confirmed') return;
    const timer = window.setInterval(() => { void refreshPayment(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [invoice, paymentStatus, refreshPayment]);

  const box: React.CSSProperties = { border: '2px solid var(--k-line, #2a2f3a)', padding: 18, background: 'rgba(255,255,255,0.02)' };

  return (
    <div dir="rtl" style={{ maxWidth: 940, margin: '0 auto', padding: '28px 18px 80px', fontFamily: 'Vazirmatn, Tahoma, system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 6 }}>خرید اعتبار KONKRED</h1>
      <p style={{ color: 'var(--k-mut, #98a2b3)', fontSize: 13, marginBottom: 22 }}>
        پرداخت غیرحضانتی با USDT روی شبکهٔ ترون. هیچ کلید خصوصی یا عبارت بازیابی در این سایت ذخیره نمی‌شود.
      </p>

      {/* ── Current balance ─────────────────────────────────────────────── */}
      <section style={{ ...box, marginBottom: 20 }} aria-live="polite">
        <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>اعتبار فعلی شما</h2>
        {quotaStatus === 'loading' && <p style={{ fontSize: 13 }}>در حال بارگذاری…</p>}
        {quotaStatus === 'error' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#ffb4b6' }}>دریافت اعتبار ممکن نشد.</span>
            <button type="button" onClick={() => void loadQuota()} style={btn}>تلاش دوباره</button>
          </div>
        )}
        {quotaStatus === 'ready' && quota && (
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 13 }}>
            <span>پیام‌های آزمایشی باقی‌مانده: <b>{quota.trialRemaining}</b></span>
            <span>پیام‌های خریداری‌شده: <b>{quota.paidRemaining}</b></span>
            <span>مجموع: <b>{quota.totalRemaining}</b></span>
            <span style={{ color: 'var(--k-mut, #98a2b3)' }}>{quota.authenticated ? 'حساب کاربری تأیید شده' : 'کاربر مهمان'}</span>
          </div>
        )}
        {quotaStatus === 'ready' && quota?.exhausted && (
          <p style={{ marginTop: 10, fontSize: 13, color: '#ffd28a' }}>
            سهمیهٔ رایگان شما به پایان رسیده است. برای ادامه، یکی از بسته‌های زیر را تهیه کنید.
          </p>
        )}
      </section>

      {/* ── Network warning (must appear BEFORE payment) ────────────────── */}
      {warning && (
        <div role="alert" style={{ ...box, borderColor: '#ffb020', background: 'rgba(255,176,32,0.08)', marginBottom: 20, fontSize: 13 }}>
          ⚠ {warning}
        </div>
      )}

      {/* ── Plans ───────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>بسته‌ها</h2>

        {plansStatus === 'loading' && <p style={{ fontSize: 13 }}>در حال بارگذاری بسته‌ها…</p>}

        {plansStatus === 'error' && (
          <div style={{ ...box, borderColor: '#ff4d4f' }}>
            <p style={{ fontSize: 13, marginBottom: 10 }}>{plansError}</p>
            <button type="button" onClick={() => void loadPlans()} style={btn}>تلاش دوباره</button>
          </div>
        )}

        {plansStatus === 'ready' && plans.length === 0 && (
          <p style={{ fontSize: 13 }}>در حال حاضر بسته‌ای برای فروش موجود نیست.</p>
        )}

        {plansStatus === 'ready' && plans.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {plans.map((plan) => (
              <div key={plan.id} style={box}>
                <h3 style={{ fontSize: 17, fontWeight: 900, marginBottom: 6 }}>{plan.name}</h3>
                <p style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>${plan.priceUsd}</p>
                <p style={{ fontSize: 13, marginBottom: 4 }}>{plan.messages} پیام</p>
                <p style={{ fontSize: 11, color: 'var(--k-mut, #98a2b3)', marginBottom: 12 }}>
                  {plan.currency} · {plan.network}
                </p>
                <button
                  type="button"
                  onClick={() => void buy(plan.id)}
                  disabled={invoiceStatus === 'loading'}
                  style={{ ...btn, width: '100%' }}
                >
                  {invoiceStatus === 'loading' ? 'در حال ایجاد صورت‌حساب…' : 'خرید'}
                </button>
              </div>
            ))}
          </div>
        )}

        {invoiceStatus === 'error' && (
          <div role="alert" style={{ ...box, borderColor: '#ff4d4f', marginTop: 14 }}>
            <p style={{ fontSize: 13, marginBottom: 10 }}>{invoiceError}</p>
            <button type="button" onClick={() => void loadPlans()} style={btn}>تلاش دوباره</button>
          </div>
        )}
      </section>

      {/* ── Invoice ─────────────────────────────────────────────────────── */}
      {invoice && (
        <section style={{ ...box, borderColor: '#19d3c5' }} aria-live="polite">
          <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>صورت‌حساب شما</h2>
          <dl style={{ fontSize: 13, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', marginBottom: 14 }}>
            <dt>بسته:</dt><dd>{invoice.plan.name}</dd>
            <dt>مبلغ:</dt><dd>${invoice.priceUsd}</dd>
            <dt>ارز:</dt><dd>{invoice.currency}</dd>
            <dt>شبکه:</dt><dd><b>{invoice.network}</b></dd>
            <dt>شمارهٔ سفارش:</dt><dd style={{ direction: 'ltr', textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>{invoice.orderId}</dd>
            <dt>وضعیت:</dt><dd>{statusLabel(paymentStatus)}</dd>
          </dl>

          <div role="alert" style={{ border: '2px solid #ffb020', background: 'rgba(255,176,32,0.08)', padding: 12, fontSize: 12, marginBottom: 14 }}>
            ⚠ {invoice.warning}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a href={invoice.invoiceUrl} target="_blank" rel="noopener noreferrer" style={{ ...btn, textDecoration: 'none', display: 'inline-block' }}>
              رفتن به صفحهٔ پرداخت
            </a>
            <button type="button" onClick={() => void refreshPayment()} style={btnGhost}>بررسی وضعیت پرداخت</button>
          </div>

          <p style={{ fontSize: 11, color: 'var(--k-mut, #98a2b3)', marginTop: 14, lineHeight: 1.9 }}>
            پس از پرداخت، تأیید تراکنش ممکن است چند دقیقه طول بکشد. این صفحه به‌صورت خودکار وضعیت را بررسی می‌کند.
            اگر اعتبار شما پس از ۳۰ دقیقه اضافه نشد، شمارهٔ سفارش بالا را برای پشتیبانی ارسال کنید.
          </p>
        </section>
      )}
    </div>
  );
};

const btn: React.CSSProperties = {
  background: '#19d3c5', color: '#0b0d10', border: '2px solid #000', padding: '9px 16px',
  fontWeight: 800, fontSize: 13, cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  background: 'transparent', color: 'inherit', border: '2px solid var(--k-line, #2a2f3a)',
  padding: '9px 16px', fontWeight: 800, fontSize: 13, cursor: 'pointer',
};

function statusLabel(status: string): string {
  switch (status) {
    case 'confirmed': return 'پرداخت تأیید شد ✓';
    case 'pending': return 'در انتظار پرداخت';
    case 'failed': return 'ناموفق';
    case 'expired': return 'منقضی شده';
    case 'refunded': return 'بازگشت داده شده';
    default: return status || '—';
  }
}

export default CheckoutPage;
