'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { loadStripe, type StripeElementsOptions } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getPublicEnv } from '@/lib/env/env';
import { confirmPayment } from '@/features/payments/api/confirm-payment';
import { getGatewayPublicConfig } from '@/features/payments/api/get-gateway-config';
import { formatCurrencyWithCode } from '@/lib/utils/currency';

interface StripeFormInnerProps {
  clientSecret: string;
  paymentId: string;
  bookingId: string;
  amount: number;
  currency: string;
  onSuccess: () => void;
  onError: (message: string) => void;
}

const ACCEPTED_CARDS = [
  { name: 'Visa', digits: '4', color: 'text-blue-600' },
  { name: 'Mastercard', digits: '5', color: 'text-orange-600' },
  { name: 'Amex', digits: '34/37', color: 'text-sky-700' },
] as const;

function StripeFormInner({ clientSecret, paymentId, bookingId, amount, currency, onSuccess, onError }: StripeFormInnerProps) {
  const stripe = useStripe();
  const elements = useElements();
  const tCheckout = useTranslations('Checkout');
  const [processing, setProcessing] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setFieldError(null);
    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement)!,
          billing_details: { name: `Booking ${bookingId.slice(0, 8)}` },
        },
      });

      if (error) {
        if (error.type === 'validation_error') {
          setFieldError(error.message ?? tCheckout('stripeCardCheckDetails'));
        } else if (error.type === 'card_error') {
          if (error.code === 'card_declined') {
            setFieldError(tCheckout('stripeCardDeclined'));
          } else if (error.code === 'expired_card') {
            setFieldError(tCheckout('stripeCardExpired'));
          } else if (error.code === 'incorrect_cvc') {
            setFieldError(tCheckout('stripeCardCvcMismatch'));
          } else if (error.code === 'insufficient_funds') {
            setFieldError(tCheckout('stripeCardInsufficientFunds'));
          } else {
            setFieldError(error.message ?? tCheckout('stripeCardFailedFallback'));
          }
        } else if (error.type === 'invalid_request_error') {
          setFieldError(error.message ?? tCheckout('stripeCardProcessingError'));
        } else {
          onError(error.message ?? tCheckout('stripeCardUnexpectedError'));
        }
      } else if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'requires_capture') {
        await confirmPayment(paymentId);
        onSuccess();
      } else if (paymentIntent?.status === 'requires_action') {
        setFieldError(tCheckout('stripeCardRequiresAction'));
      } else {
        onError(tCheckout('stripeCardStatusUnknown', { status: paymentIntent?.status?.replace(/_/g, ' ') ?? 'unknown' }));
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : tCheckout('stripeCardGenericError'));
    } finally {
      setProcessing(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-sm font-semibold text-charcoal">{tCheckout('stripeCardDetailsTitle')}</h2>
          <div className="flex items-center gap-0.5 text-[11px] text-zinc-400">
            <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            {tCheckout('stripeSecureBadge')}
          </div>
        </div>
        <p className="text-xs text-zinc-500 mb-4">
          {tCheckout('stripeCardPrivacyNote')}
        </p>

        {/* Card input container */}
        <div
          className={`rounded-xl border bg-white transition-colors duration-200 ${
            fieldError ? 'border-red-300 bg-red-50/20' : 'border-zinc-200 focus-within:border-brand-teal/40 focus-within:ring-2 focus-within:ring-brand-teal/10'
          }`}
        >
          {/* Card icon bar */}
          <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
              </svg>
              <span className="text-xs font-medium text-zinc-600">{tCheckout('stripeCardNumberLabel')}</span>
            </div>
            {/* Card brand logos */}
            <div className="flex items-center gap-1.5">
              {ACCEPTED_CARDS.map((card) => (
                <span
                  key={card.name}
                  className="text-[10px] font-semibold text-zinc-400 tracking-wide"
                  title={card.name}
                >
                  {card.name === 'Mastercard' ? 'MC' : card.name}
                </span>
              ))}
            </div>
          </div>

          {/* Stripe CardElement */}
          <div className="px-4 pb-3 pt-0.5">
            <CardElement
              onChange={(e) => {
                setCardComplete(e.complete);
                if (e.error) {
                  setFieldError(e.error.message ?? null);
                } else {
                  setFieldError(null);
                }
              }}
              options={{
                style: {
                  base: {
                    fontSize: '16px',
                    color: '#191919',
                    fontFamily: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
                    '::placeholder': { color: '#a1a1aa', fontWeight: '400' },
                    iconColor: '#a1a1aa',
                  },
                  invalid: {
                    color: '#dc2626',
                    iconColor: '#dc2626',
                  },
                },
                hidePostalCode: true,
              }}
            />
          </div>

          {/* Expiry & CVC hints */}
          <div className="flex items-center border-t border-zinc-100 px-4 py-2.5 text-[11px] text-zinc-400">
            <div className="flex items-center gap-1.5">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              <span className="font-medium text-zinc-500">MM / YY</span>
            </div>
            <div className="ml-6 flex items-center gap-1.5">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <span className="font-medium text-zinc-500">CVC</span>
              <span
                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-300 text-[9px] font-semibold text-zinc-400 cursor-help"
                title={tCheckout('stripeCvcHint')}
                aria-label={tCheckout('stripeCvcHint')}
              >
                ?
              </span>
            </div>
          </div>
        </div>

        {/* Inline field error */}
        {fieldError ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
            <svg className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-xs text-red-700 leading-relaxed">{fieldError}</p>
          </div>
        ) : null}

        {/* Accepted cards */}
        <div className="mt-3 flex items-center gap-3 text-[11px] text-zinc-400">
          <span className="text-zinc-500">{tCheckout('stripeAcceptedLabel')}</span>
          <div className="flex items-center gap-1.5">
            {ACCEPTED_CARDS.map((card) => (
              <span
                key={card.name}
                className="rounded border border-zinc-200 px-1.5 py-0.5 font-semibold text-zinc-500"
              >
                {card.name === 'Mastercard' ? 'MC' : card.name}
              </span>
            ))}
          </div>
        </div>
      </Card>

      {/* Pay button */}
      <Button
        type="submit"
        disabled={!stripe || processing || !cardComplete}
        loading={processing}
        className="mt-4 w-full"
        size="lg"
      >
        {processing ? (
          <span className="flex items-center gap-2">
            <svg className="h-3.5 w-3.5 text-white/70" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            {tCheckout('processingPayment')}
          </span>
        ) : (
          tCheckout('stripePayButton', { amount: formatCurrencyWithCode(amount, currency) })
        )}
      </Button>

      {/* Trust microcopy below CTA */}
      <p className="mt-3 text-center text-[11px] text-zinc-400 leading-relaxed">
        {tCheckout('stripeTrustNote')}
      </p>
    </form>
  );
}

interface StripePaymentFormProps {
  clientSecret: string;
  paymentId: string;
  bookingId: string;
  amount: number;
  currency: string;
  onSuccess: () => void;
  onError: (message: string) => void;
}

// ponytail: module-level promise cache — loadStripe per render creates new Element instances
const stripePromiseCache = new Map<string, ReturnType<typeof loadStripe>>();

function getStripePromise(key: string) {
  let p = stripePromiseCache.get(key);
  if (!p) {
    p = loadStripe(key);
    stripePromiseCache.set(key, p);
  }
  return p;
}

export function StripePaymentForm(props: StripePaymentFormProps) {
  const tCheckout = useTranslations('Checkout');
  const [stripeKey, setStripeKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const env = getPublicEnv();
    if (env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && !env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_XXXX')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStripeKey(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
      setLoading(false);
      return;
    }

    getGatewayPublicConfig('stripe').then((cfg) => {
      if (cfg.enabled && cfg.publishableKey) {
        setStripeKey(cfg.publishableKey);
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <Card>
        <div className="flex items-center justify-center gap-3 py-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-brand-teal" />
          <span className="text-sm text-zinc-500">{tCheckout('stripeLoadingForm')}</span>
        </div>
      </Card>
    );
  }

  if (!stripeKey) {
    return (
      <Card>
        <div className="flex items-start gap-3 text-sm">
          <svg className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="font-medium text-amber-800">{tCheckout('stripeNotConfiguredTitle')}</p>
            <p className="mt-0.5 text-amber-700">
              {tCheckout('stripeNotConfiguredHint')}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const stripePromise = getStripePromise(stripeKey);
  const options: StripeElementsOptions = {
    clientSecret: props.clientSecret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#033d4a',
        colorText: '#191919',
        colorDanger: '#dc2626',
        fontFamily: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
        borderRadius: '10px',
        spacingUnit: '4px',
      },
    },
  };

  return (
    <Elements stripe={stripePromise} options={options}>
      <StripeFormInner {...props} />
    </Elements>
  );
}
