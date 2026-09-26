'use client';

/**
 * Compatibility re-export. The toast system lives in @/lib/toast
 * (built on sonner). This shim keeps the historical import path
 * (`@/hooks/useToast`) working for all existing call sites.
 */
export { useToast } from '@/lib/toast';
