'use client';
import { useTranslations } from 'next-intl';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getPublicEnv } from '@/lib/env/env';
import { confirmPayment } from '@/features/payments/api/confirm-payment';
import { getGatewayPublicConfig } from '@/features/payments/api/get-gateway-config';
import { formatCurrencyWithCode } from '@/lib/utils/currency';

interface PayPalPaymentButtonProps {
  paymentId: string;
  checkoutUrl: string;
  amount: number;
  currency: string;
  onSuccess: () => void;
  onError: (message: string) => void;
  containerId?: string;
  /** When true (e.g. inside a modal), never fall back to full-page redirect — SDK render or error. */
  sdkOnly?: boolean;
}

declare global {
  interface Window {
    paypal?: {
      Buttons: (config: {
        createOrder?: () => string | Promise<string>;
        onApprove?: (data: Record<string, unknown>, actions: Record<string, unknown>) => void | Promise<void>;
        onCancel?: (data: Record<string, unknown>) => void;
        onError?: (err: unknown) => void;
        style?: Record<string, string>;
      }) => { render: (container: string) => void };
    };
  }
}

function extractToken(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('token') ?? parsed.searchParams.get('ba_token');
  } catch {
    return null;
  }
}

export function PayPalPaymentButton({ paymentId, checkoutUrl, amount, currency, onSuccess, onError, containerId = 'paypal-button-container', sdkOnly = false }: PayPalPaymentButtonProps) {
  const t = useTranslations('Checkout');
  const [mode, setMode] = useState<'loading' | 'sdk' | 'redirect' | 'error'>('loading');
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);
  const renderedForRef = useRef<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    if (configLoaded) return;

    const env = getPublicEnv();
    if (env.NEXT_PUBLIC_PAYPAL_CLIENT_ID && !env.NEXT_PUBLIC_PAYPAL_CLIENT_ID.startsWith('YOUR_')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setClientId(env.NEXT_PUBLIC_PAYPAL_CLIENT_ID!);
      setConfigLoaded(true);
      return;
    }

    getGatewayPublicConfig('paypal').then((cfg) => {
      if (cfg.enabled && cfg.clientId) {
        setClientId(cfg.clientId);
      }
      setConfigLoaded(true);
    }).catch(() => {
      setConfigLoaded(true);
    });
  }, [configLoaded]);

  const token = extractToken(checkoutUrl);
  const hasClientId = clientId && !clientId.startsWith('YOUR_');

  useEffect(() => {
    if (!configLoaded) return;

    if (!hasClientId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode(sdkOnly ? 'error' : 'redirect');
      return;
    }

    const expectedSrc = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}`;

    // If a script with the exact expected URL (matching currency) already exists, re-use it
    const matchingScript = document.querySelector(`script[src="${expectedSrc}"]`);
    if (matchingScript && window.paypal) {
      setMode('sdk');
      return;
    }

    // If a stale script exists with a different currency, remove it and clear PayPal
    const staleScript = document.querySelector('script[src*="paypal.com/sdk/js"]');
    if (staleScript) {
      staleScript.remove();
      delete window.paypal;
      renderedRef.current = false;
    }

    setMode('loading');

    const script = document.createElement('script');
    script.src = expectedSrc;
    script.async = true;
    script.onload = () => setMode('sdk');
    script.onerror = () => setMode(sdkOnly ? 'error' : 'redirect');
    document.body.appendChild(script);
  }, [configLoaded, hasClientId, clientId, currency, sdkOnly]);

  useEffect(() => {
    // New payment → allow re-render into (possibly new) container
    renderedRef.current = false;
    renderedForRef.current = null;
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = '';
  }, [paymentId, containerId]);

  useEffect(() => {
    if (mode !== 'sdk' || !containerRef.current || !window.paypal) return;
    if (renderedRef.current && renderedForRef.current === paymentId) return;

    try {
      window.paypal.Buttons({
        createOrder: token ? () => token : undefined,
        onApprove: async () => {
          try {
            await confirmPayment(paymentId);
            onSuccess();
          } catch (err) {
            onError(err instanceof Error ? err.message : 'Failed to confirm payment.');
          }
        },
        onCancel: () => onError('PayPal payment was cancelled.'),
        onError: (err) => onError(String(err)),
        style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
      }).render(`#${containerId}`);
      renderedRef.current = true;
      renderedForRef.current = paymentId;
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode(sdkOnly ? 'error' : 'redirect');
    }
  }, [mode, token, onSuccess, onError, paymentId, containerId, sdkOnly]);

  if (mode === 'loading') {
    return (
      <Card>
        <h2 className="text-base font-semibold text-zinc-900 mb-1">Pay with PayPal</h2>
        <p className="text-xs text-zinc-500 mb-4">Pay using your PayPal account</p>
        <div className="flex items-center justify-center py-6">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
            <span className="text-sm text-zinc-500">Loading PayPal...</span>
          </div>
        </div>
      </Card>
    );
  }

  if (mode === 'error' || (sdkOnly && configLoaded && !hasClientId)) {
    return (
      <Card>
        <h2 className="text-base font-semibold text-zinc-900 mb-1">Pay with PayPal</h2>
        <p className="text-xs text-zinc-500 mb-4">PayPal is not available right now. Please try card payment or another method.</p>
      </Card>
    );
  }

  if ((mode === 'redirect' || !hasClientId) && configLoaded) {
    return (
      <Card>
        <h2 className="text-base font-semibold text-zinc-900 mb-1">Pay with PayPal</h2>
        <p className="text-xs text-zinc-500 mb-4">You&apos;ll be redirected to PayPal to complete your payment</p>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-center mb-4">
          <svg className="h-8 w-8 mx-auto text-zinc-700" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z"/>
          </svg>
          <p className="mt-2 text-sm font-medium text-zinc-900">PayPal</p>
          <p className="mt-0.5 text-xs text-zinc-500">{formatCurrencyWithCode(amount, currency)}</p>
        </div>

        <Button
          onClick={() => { setRedirecting(true); window.location.href = checkoutUrl; }}
          loading={redirecting}
          disabled={redirecting}
          className="w-full"
          size="lg"
        >
          {redirecting ? 'Redirecting...' : `Pay ${formatCurrencyWithCode(amount, currency)} with PayPal`}
        </Button>

        <p className="mt-3 text-center text-[11px] text-zinc-400">
          You&apos;ll be redirected to PayPal to securely complete your payment.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-zinc-900 mb-1">Pay with PayPal</h2>
      <p className="text-xs text-zinc-500 mb-4">Complete your payment securely with PayPal</p>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-center mb-4">
        <svg className="h-8 w-8 mx-auto text-zinc-700" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z"/>
        </svg>
        <p className="mt-1 text-sm font-medium text-zinc-900">{formatCurrencyWithCode(amount, currency)}</p>
      </div>

      <div ref={containerRef}>
        <div id={containerId} className="min-h-[40px]" />
      </div>

      <p className="mt-3 text-center text-[11px] text-zinc-400">
        <span className="flex items-center justify-center gap-1">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          Secured by PayPal. Your financial details stay with PayPal.
        </span>
      </p>
    </Card>
  );
}
