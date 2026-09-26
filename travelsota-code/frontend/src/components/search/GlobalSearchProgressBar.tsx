'use client';

import { useSearchProgress } from '@/context/SearchProgressContext';
import { motion, AnimatePresence } from 'motion/react';

const ease = [0.16, 1, 0.3, 1] as const;

const BAR_HEIGHT = 3;
const MESSAGE_HEIGHT = 36;

export function GlobalSearchProgressBar() {
  const { state, presentation } = useSearchProgress();

  const isComplete = state.lifecycle === 'succeeded' || state.lifecycle === 'partial';
  const isFailed = state.lifecycle === 'failed';
  const barColor = isComplete
    ? 'bg-emerald-500'
    : isFailed
      ? 'bg-red-500'
      : 'bg-brand-teal';

  return (
    <AnimatePresence>
      {presentation.visible && (
        <motion.div
          initial={{ y: -(BAR_HEIGHT + MESSAGE_HEIGHT) }}
          animate={{ y: 0 }}
          exit={{ y: -(BAR_HEIGHT + MESSAGE_HEIGHT), transition: { duration: 0.35, ease } }}
          transition={{ duration: 0.3, ease }}
          className="fixed inset-x-0 top-0 z-[60]"
        >
          {/* Thin progress bar */}
          <div className="relative h-[3px] w-full bg-gray-100">
            <motion.div
              className={`absolute inset-y-0 left-0 transition-colors duration-700 ${barColor}`}
              initial={{ width: '0%' }}
              animate={{ width: `${Math.min(presentation.displayProgress, 100)}%` }}
              transition={{ duration: 0.5, ease }}
            />
          </div>

          {/* Status message row */}
          <div className="flex h-9 items-center justify-center border-b border-gray-100 bg-white/95 px-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] backdrop-blur-sm">
            <div className="flex items-center gap-2.5">
              {state.lifecycle === 'searching' && (
                <span className="inline-block h-2 w-2 rounded-full bg-brand-teal animate-pulse" />
              )}
              {isComplete && (
                <svg
                  className="h-4 w-4 text-emerald-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {isFailed && (
                <svg
                  className="h-4 w-4 text-red-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866 1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              )}
              <p className="text-sm font-medium text-gray-800">{presentation.headline || presentation.detail}</p>
              {state.lifecycle === 'searching' && (
                <span className="text-xs font-semibold text-gray-400 tabular-nums">
                  {Math.round(presentation.displayProgress)}%
                </span>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
