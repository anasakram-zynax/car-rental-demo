/**
 * Shared progress model for search and booking workflows.
 *
 * Used across hotels, flights, and payment modules to provide
 * meaningful step-by-step progress indicators instead of simple spinners.
 */

export type WorkflowStepStatus =
  | "pending"
  | "running"
  | "success"
  | "warning"
  | "failed"
  | "skipped";

export type WorkflowProvider =
  | "hotelbeds"
  | "ratehawk"
  | "travelport"
  | "payment"
  | "system";

export interface WorkflowStep {
  id: string;
  label: string;
  description?: string;
  status: WorkflowStepStatus;
  progress?: number;
  provider?: WorkflowProvider;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  message?: string;
}

export interface WorkflowProgress {
  workflowId?: string;
  module: "hotels" | "flights" | "payments";
  status: "idle" | "running" | "success" | "failed" | "partial";
  percent: number;
  title: string;
  message?: string;
  steps: WorkflowStep[];
}

/**
 * Estimate the overall progress percentage from a list of steps.
 * Provides a smooth estimate for cases where backend doesn't report exact progress.
 */
export function estimateProgress(steps: WorkflowStep[]): number {
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
  const base = (total / steps.length) * 100;

  // Smooth estimate: if a step is running, add partial progress within that step
  const runningStep = steps.find((s) => s.status === "running");
  if (runningStep?.progress != null) {
    const stepIndex = steps.indexOf(runningStep);
    const stepWeight = 100 / steps.length;
    return Math.min(Math.round(base + stepWeight * (runningStep.progress / 100)), 100);
  }

  return Math.min(Math.round(base), 100);
}

/**
 * Create initial pending steps from a list of step descriptors.
 */
export function createSteps(
  descriptors: Array<{
    id: string;
    label: string;
    description?: string;
    provider?: WorkflowProvider;
  }>,
): WorkflowStep[] {
  return descriptors.map((d) => ({
    id: d.id,
    label: d.label,
    description: d.description,
    status: "pending" as const,
    provider: d.provider,
  }));
}

/**
 * Mark a step as running in a steps array (immutable update).
 */
export function markStepRunning(
  steps: WorkflowStep[],
  stepId: string,
  progress?: number,
): WorkflowStep[] {
  return steps.map((s) =>
    s.id === stepId
      ? {
          ...s,
          status: "running" as const,
          startedAt: s.startedAt ?? new Date().toISOString(),
          ...(progress != null ? { progress } : {}),
        }
      : s,
  );
}

/**
 * Mark a step as success.
 */
export function markStepSuccess(
  steps: WorkflowStep[],
  stepId: string,
  opts?: { durationMs?: number; message?: string },
): WorkflowStep[] {
  return steps.map((s) =>
    s.id === stepId
      ? {
          ...s,
          status: "success" as const,
          completedAt: new Date().toISOString(),
          progress: 100,
          ...opts,
        }
      : s,
  );
}

/**
 * Mark a step as failed.
 */
export function markStepFailed(
  steps: WorkflowStep[],
  stepId: string,
  message?: string,
): WorkflowStep[] {
  return steps.map((s) =>
    s.id === stepId
      ? {
          ...s,
          status: "failed" as const,
          completedAt: new Date().toISOString(),
          message: message ?? s.message,
        }
      : s,
  );
}

/**
 * Mark a step as warning.
 */
export function markStepWarning(
  steps: WorkflowStep[],
  stepId: string,
  message?: string,
): WorkflowStep[] {
  return steps.map((s) =>
    s.id === stepId
      ? {
          ...s,
          status: "warning" as const,
          completedAt: new Date().toISOString(),
          message: message ?? s.message,
        }
      : s,
  );
}

/**
 * Mark a step as skipped.
 */
export function markStepSkipped(
  steps: WorkflowStep[],
  stepId: string,
  message?: string,
): WorkflowStep[] {
  return steps.map((s) =>
    s.id === stepId
      ? {
          ...s,
          status: "skipped" as const,
          completedAt: new Date().toISOString(),
          message: message ?? s.message,
        }
      : s,
  );
}

/**
 * Build a full WorkflowProgress from steps and overall status.
 */
export function buildProgress(
  params: {
    module: WorkflowProgress["module"];
    status: WorkflowProgress["status"];
    title: string;
    message?: string;
    workflowId?: string;
    steps: WorkflowStep[];
  },
): WorkflowProgress {
  return {
    workflowId: params.workflowId,
    module: params.module,
    status: params.status,
    percent: estimateProgress(params.steps),
    title: params.title,
    message: params.message,
    steps: params.steps,
  };
}
