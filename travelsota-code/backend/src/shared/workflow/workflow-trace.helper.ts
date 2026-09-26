/**
 * Shared workflow trace helpers for booking progress tracking.
 *
 * Used by both hotel and flight booking services to record structured
 * progress steps that the frontend progress polling endpoint returns.
 */

import { randomUUID } from 'node:crypto';

export type WorkflowStepStatus = 'pending' | 'running' | 'success' | 'warning' | 'failed' | 'skipped';

export interface WorkflowStep {
  id: string;
  label: string;
  description?: string;
  status: WorkflowStepStatus;
  provider?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  message?: string;
}

export interface WorkflowTraceData {
  workflowId?: string;
  status: 'running' | 'success' | 'failed' | 'partial';
  percent: number;
  title: string;
  message?: string;
  steps: WorkflowStep[];
}

/**
 * Create initial workflow trace with all steps in pending state.
 */
export function initWorkflowTrace(params: {
  title: string;
  module: 'hotels' | 'flights';
  message?: string;
  steps: Array<{ id: string; label: string; description?: string; provider?: string }>;
}): WorkflowTraceData {
  return {
    workflowId: randomUUID().slice(0, 8),
    status: 'running',
    percent: 0,
    title: params.title,
    message: params.message,
    steps: params.steps.map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
      status: 'pending' as const,
      provider: s.provider,
    })),
  };
}

/**
 * Mark a step as running in a workflow trace.
 */
export function markStepRunning(trace: WorkflowTraceData, stepId: string): WorkflowTraceData {
  return {
    ...trace,
    steps: trace.steps.map((s) =>
      s.id === stepId
        ? { ...s, status: 'running' as const, startedAt: s.startedAt ?? new Date().toISOString() }
        : s,
    ),
  };
}

/**
 * Mark a step as success.
 */
export function markStepSuccess(
  trace: WorkflowTraceData,
  stepId: string,
  opts?: { durationMs?: number; message?: string },
): WorkflowTraceData {
  const updatedSteps = trace.steps.map((s) =>
    s.id === stepId
      ? {
          ...s,
          status: 'success' as const,
          completedAt: new Date().toISOString(),
          durationMs: opts?.durationMs ?? s.durationMs,
          message: opts?.message ?? s.message,
        }
      : s,
  );
  return { ...trace, steps: updatedSteps };
}

/**
 * Mark a step as failed.
 */
export function markStepFailed(
  trace: WorkflowTraceData,
  stepId: string,
  message?: string,
): WorkflowTraceData {
  const updatedSteps = trace.steps.map((s) =>
    s.id === stepId
      ? { ...s, status: 'failed' as const, completedAt: new Date().toISOString(), message: message ?? s.message }
      : s,
  );
  return { ...trace, steps: updatedSteps };
}

/**
 * Mark a step as warning.
 */
export function markStepWarning(
  trace: WorkflowTraceData,
  stepId: string,
  message?: string,
): WorkflowTraceData {
  const updatedSteps = trace.steps.map((s) =>
    s.id === stepId
      ? { ...s, status: 'warning' as const, completedAt: new Date().toISOString(), message: message ?? s.message }
      : s,
  );
  return { ...trace, steps: updatedSteps };
}

/**
 * Mark a step as skipped.
 */
export function markStepSkipped(
  trace: WorkflowTraceData,
  stepId: string,
  message?: string,
): WorkflowTraceData {
  const updatedSteps = trace.steps.map((s) =>
    s.id === stepId
      ? { ...s, status: 'skipped' as const, completedAt: new Date().toISOString(), message: message ?? s.message }
      : s,
  );
  return { ...trace, steps: updatedSteps };
}

/**
 * Calculate estimated progress percentage from step statuses.
 */
export function estimateStepProgress(steps: WorkflowStep[]): number {
  const weights: Record<WorkflowStepStatus, number> = {
    pending: 0,
    running: 0.5,
    success: 1,
    warning: 0.75,
    failed: 0.5,
    skipped: 1,
  };

  if (steps.length === 0) return 0;
  const total = steps.reduce((sum, s) => sum + weights[s.status], 0);
  return Math.min(Math.round((total / steps.length) * 100), 100);
}

/**
 * Get the overall workflow status from step statuses.
 */
export function deduceWorkflowStatus(trace: WorkflowTraceData): 'running' | 'success' | 'failed' | 'partial' {
  const allDone = trace.steps.every((s) =>
    ['success', 'failed', 'skipped'].includes(s.status),
  );
  if (!allDone) return 'running';
  const anyFailed = trace.steps.some((s) => s.status === 'failed');
  const anyWarning = trace.steps.some((s) => s.status === 'warning');
  if (anyFailed) return 'failed';
  if (anyWarning) return 'partial';
  return 'success';
}

/**
 * Finalize a workflow trace: mark all remaining pending/running steps
 * as skipped and set the overall status + percent.
 */
export function finalizeWorkflowTrace(
  trace: WorkflowTraceData,
  finalStatus?: 'success' | 'failed' | 'partial',
  message?: string,
): WorkflowTraceData {
  const status = finalStatus ?? deduceWorkflowStatus(trace);
  const steps = trace.steps.map((s) => {
    if (s.status === 'pending' || s.status === 'running') {
      return { ...s, status: 'skipped' as const, completedAt: new Date().toISOString() };
    }
    return s;
  });

  return {
    ...trace,
    status,
    percent: 100,
    title: status === 'success' ? 'Complete' : status === 'failed' ? 'Failed' : 'Partial',
    message: message ?? trace.message,
    steps,
  };
}
