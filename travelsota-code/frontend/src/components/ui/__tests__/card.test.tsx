import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from '@/components/ui/card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Content</Card>);
    expect(screen.getByText('Content')).toBeDefined();
  });

  it('renders header when provided', () => {
    render(<Card header={<span>Header</span>}>Body</Card>);
    expect(screen.getByText('Header')).toBeDefined();
  });

  it('renders footer when provided', () => {
    render(<Card footer={<span>Footer</span>}>Body</Card>);
    expect(screen.getByText('Footer')).toBeDefined();
  });

  it('applies elevated variant class', () => {
    const { container } = render(<Card variant="elevated">Elevated</Card>);
    expect(container.innerHTML).toContain('shadow-md');
  });
});
