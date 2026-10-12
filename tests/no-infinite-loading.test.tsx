/**
 * @vitest-environment jsdom
 *
 * The brief's hardest requirement is "no infinite loading states anywhere".
 * Until now that was only verified by reading the source, which is exactly how
 * the original bug shipped: `onAuthStateChanged` *looked* correct.
 *
 * These tests render the real components and assert that every async path
 * reaches a terminal state — including the paths that hang, which are the ones
 * that actually matter.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';

// ── Firebase is stubbed at module level so no network or credentials are used.
// `onAuthStateChanged` is controllable per-test: that is the whole point, since
// the production bug was it never calling back.
let authCallback: ((user: unknown) => void) | null = null;
let authErrorCallback: ((error: unknown) => void) | null = null;
let unsubscribeCalls = 0;

vi.mock('../services/firebase.ts', () => ({
  auth: {},
  db: {},
  storage: {},
  OperationType: { SIGN_IN: 'signIn' },
  handleFirestoreError: () => undefined,
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, next: (u: unknown) => void, error?: (e: unknown) => void) => {
    authCallback = next;
    authErrorCallback = error ?? null;
    return () => { unsubscribeCalls += 1; };
  },
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(async () => undefined),
  GoogleAuthProvider: class {},
  GithubAuthProvider: class {},
  signInWithPopup: vi.fn(),
  updateProfile: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
  serverTimestamp: vi.fn(),
  collection: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })),
}));

beforeEach(() => {
  authCallback = null;
  authErrorCallback = null;
  unsubscribeCalls = 0;
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AuthContext never leaves the app stuck on the boot screen', () => {
  async function renderAuthProbe() {
    const { AuthProvider, useAuth } = await import('../contexts/AuthContext.tsx');
    const Probe: React.FC = () => {
      const auth = useAuth();
      return <div data-testid="state">{auth.isLoading ? 'LOADING' : 'SETTLED'}</div>;
    };
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  }

  it('settles when Firebase reports a signed-out user', async () => {
    await renderAuthProbe();
    expect(screen.getByTestId('state').textContent).toBe('LOADING');

    await act(async () => { authCallback?.(null); });
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('SETTLED'));
  });

  it('settles via the error callback when Firebase fails', async () => {
    await renderAuthProbe();
    expect(authErrorCallback, 'an error callback must be registered').toBeTypeOf('function');

    await act(async () => { authErrorCallback?.(new Error('auth/network-request-failed')); });
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('SETTLED'));
  });

  it('SETTLES VIA THE WATCHDOG when Firebase never calls back at all', async () => {
    // This is the exact production failure: the callback never fires, so
    // without a timeout the app renders AuthLoadingScreen forever.
    vi.useFakeTimers();
    await renderAuthProbe();
    expect(screen.getByTestId('state').textContent).toBe('LOADING');

    await act(async () => { await vi.advanceTimersByTimeAsync(9_000); });
    expect(screen.getByTestId('state').textContent).toBe('SETTLED');
  });

  it('unsubscribes on unmount so no listener leaks', async () => {
    const { AuthProvider } = await import('../contexts/AuthContext.tsx');
    const { unmount } = render(<AuthProvider><div /></AuthProvider>);
    unmount();
    expect(unsubscribeCalls).toBeGreaterThan(0);
  });
});

describe('CheckoutPage reaches a terminal state on every outcome', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  async function renderCheckout() {
    const mod = await import('../pages/CheckoutPage.tsx');
    const CheckoutPage = mod.default;
    render(<CheckoutPage />);
  }

  it('shows plans when the API succeeds', async () => {
    globalThis.fetch = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes('/api/payments/plans')) {
        return new Response(JSON.stringify({
          plans: [{ id: 'pro', name: 'Pro', priceUsd: 19, messages: 500, currency: 'USDT', network: 'TRON (TRC20)' }],
          networkWarning: 'هشدار شبکه',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        authenticated: false, plan: 'free', trialRemaining: 10,
        paidRemaining: 0, totalRemaining: 10, exhausted: false,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;

    await renderCheckout();
    await waitFor(() => expect(screen.getByText('Pro')).toBeTruthy());
    // Never stuck on the loading text.
    expect(screen.queryByText(/در حال بارگذاری بسته‌ها/)).toBeNull();
  });

  it('shows a Persian error AND a retry button when the API fails', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'nope', code: 'BILLING_NOT_CONFIGURED' }), {
        status: 503, headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

    await renderCheckout();
    // Both the balance strip and the plans list offer retry when both requests
    // fail, so assert that at least one retry affordance exists.
    await waitFor(() => expect(screen.getAllByRole('button', { name: /تلاش دوباره/ }).length).toBeGreaterThan(0));
    expect(screen.queryByText(/در حال بارگذاری بسته‌ها/)).toBeNull();
    // A Persian explanation must accompany the button.
    expect(document.body.textContent).toMatch(/سرویس پرداخت|خطایی رخ داد|دریافت/);
  });

  it('does not hang when the network rejects outright', async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;

    await renderCheckout();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /تلاش دوباره/ }).length).toBeGreaterThan(0));
  });

  it('never renders a raw diagnostic code to the user', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'boom', code: 'BILLING_UNAVAILABLE' }), {
        status: 503, headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

    await renderCheckout();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /تلاش دوباره/ }).length).toBeGreaterThan(0));
    // Diagnostics belong in the console, not the UI.
    expect(document.body.textContent).not.toContain('BILLING_UNAVAILABLE');
    expect(document.body.textContent).not.toContain('boom');
  });
});
