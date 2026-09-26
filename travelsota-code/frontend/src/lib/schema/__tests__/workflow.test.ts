import { describe, it, expect } from 'vitest';
import {
  createSteps,
  markStepRunning,
  markStepSuccess,
  markStepFailed,
  markStepSkipped,
  markStepWarning,
  estimateProgress,
  buildProgress,
  type WorkflowStep,
} from '../workflow';

describe('createSteps', () => {
  it('creates pending steps from descriptors', () => {
    const steps = createSteps([
      { id: 'step_1', label: 'Step 1', provider: 'hotelbeds' },
      { id: 'step_2', label: 'Step 2', provider: 'system' },
    ]);

    expect(steps).toHaveLength(2);
    expect(steps[0].id).toBe('step_1');
    expect(steps[0].label).toBe('Step 1');
    expect(steps[0].status).toBe('pending');
    expect(steps[0].provider).toBe('hotelbeds');
    expect(steps[1].provider).toBe('system');
  });

  it('creates empty array for empty input', () => {
    expect(createSteps([])).toEqual([]);
  });
});

describe('markStepRunning', () => {
  it('marks the correct step as running', () => {
    const steps = createSteps([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);

    const updated = markStepRunning(steps, 'a');

    expect(updated[0].status).toBe('running');
    expect(updated[0].startedAt).toBeDefined();
    expect(updated[1].status).toBe('pending');
  });

  it('is immutable — does not modify original array', () => {
    const steps = createSteps([{ id: 'a', label: 'A' }]);
    const updated = markStepRunning(steps, 'a');
    expect(steps[0].status).toBe('pending');
    expect(updated[0].status).toBe('running');
  });

  it('does nothing if step id does not exist', () => {
    const steps = createSteps([{ id: 'a', label: 'A' }]);
    const updated = markStepRunning(steps, 'nonexistent');
    expect(updated).toEqual(steps);
  });
});

describe('markStepSuccess', () => {
  it('marks step as success with optional message and duration', () => {
    const steps = createSteps([{ id: 'a', label: 'A' }]);
    const updated = markStepSuccess(steps, 'a', { durationMs: 1200, message: 'Done!' });

    expect(updated[0].status).toBe('success');
    expect(updated[0].completedAt).toBeDefined();
    expect(updated[0].durationMs).toBe(1200);
    expect(updated[0].message).toBe('Done!');
    expect(updated[0].progress).toBe(100);
  });
});

describe('markStepFailed', () => {
  it('marks step as failed with message', () => {
    const steps = createSteps([{ id: 'a', label: 'A' }]);
    const updated = markStepFailed(steps, 'a', 'Something went wrong');

    expect(updated[0].status).toBe('failed');
    expect(updated[0].completedAt).toBeDefined();
    expect(updated[0].message).toBe('Something went wrong');
  });
});

describe('markStepSkipped', () => {
  it('marks step as skipped', () => {
    const steps = createSteps([{ id: 'a', label: 'A' }]);
    const updated = markStepSkipped(steps, 'a');

    expect(updated[0].status).toBe('skipped');
    expect(updated[0].completedAt).toBeDefined();
  });
});

describe('markStepWarning', () => {
  it('marks step as warning with message', () => {
    const steps = createSteps([{ id: 'a', label: 'A' }]);
    const updated = markStepWarning(steps, 'a', 'Pending from hotel');

    expect(updated[0].status).toBe('warning');
    expect(updated[0].completedAt).toBeDefined();
    expect(updated[0].message).toBe('Pending from hotel');
  });
});

describe('estimateProgress', () => {
  it('returns 0 for all pending steps', () => {
    const steps = createSteps([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);
    expect(estimateProgress(steps)).toBe(0);
  });

  it('returns 50 for half success, half pending', () => {
    const steps = createSteps([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]);
    const updated = markStepSuccess(steps, 'a');
    expect(estimateProgress(updated)).toBe(50);
  });

  it('returns 100 for all success', () => {
    const steps = createSteps([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]);
    const updated = markStepSuccess(steps, 'a');
    const final = markStepSuccess(updated, 'b');
    expect(estimateProgress(final)).toBe(100);
  });

  it('handles running steps with progress', () => {
    const steps = createSteps([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]);
    const updated = markStepSuccess(steps, 'a');
    const running = markStepRunning(updated, 'b', 50);
    // a = success (weight 1), b = running (weight 0.5)
    // base = (1 + 0.5) / 2 * 100 = 75
    // running bonus = (100/2) * (50/100) = 25
    // result = min(75 + 25, 100) = 100
    expect(estimateProgress(running)).toBe(100);
  });

  it('returns 0 for empty array', () => {
    expect(estimateProgress([])).toBe(0);
  });

  it('counts skipped as fully complete', () => {
    const steps = createSteps([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]);
    const updated = markStepSkipped(steps, 'a');
    expect(estimateProgress(updated)).toBe(50);
  });

  it('counts failed at 50% weight', () => {
    const steps = createSteps([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]);
    const updated = markStepFailed(steps, 'a');
    expect(estimateProgress(updated)).toBe(25);
  });

  it('counts warning at 75% weight', () => {
    const steps = createSteps([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]);
    const updated = markStepWarning(steps, 'a');
    expect(estimateProgress(updated)).toBe(38); // (0.75 + 0) / 2 * 100 = 37.5 → 38
  });
});

describe('buildProgress', () => {
  it('builds a complete WorkflowProgress object', () => {
    const steps = createSteps([{ id: 'a', label: 'A' }]);
    const completed = markStepSuccess(steps, 'a');

    const progress = buildProgress({
      module: 'hotels',
      status: 'success',
      title: 'Done',
      message: 'All good',
      workflowId: 'wf-1',
      steps: completed,
    });

    expect(progress.module).toBe('hotels');
    expect(progress.status).toBe('success');
    expect(progress.title).toBe('Done');
    expect(progress.message).toBe('All good');
    expect(progress.workflowId).toBe('wf-1');
    expect(progress.percent).toBe(100);
  });
});
