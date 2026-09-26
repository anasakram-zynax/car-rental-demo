'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';

/**
 * Floating "back to top" button.
 * Appears once the user scrolls down the page, and sits directly above the
 * WhatsApp floating button (bottom-right corner).
 */
export function ScrollToTop() {
  const t = useTranslations('Common');
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      // Show once the page is scrolled a meaningful amount (viewport height or 400px, whichever is smaller).
      const threshold = Math.min(window.innerHeight, 400);
      setVisible(window.scrollY > threshold);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={scrollToTop}
          aria-label={t('backToTop')}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          className="group fixed bottom-[92px] right-6 z-50 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/40 bg-gradient-to-br from-brand-teal to-brand-teal-600 text-white shadow-[0_8px_24px_rgba(3,61,74,0.35)] transition-colors duration-300 hover:from-brand-teal-600 hover:to-brand-teal-700"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19.5v-15m0 0l-6.75 6.75M12 4.5l6.75 6.75" />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
