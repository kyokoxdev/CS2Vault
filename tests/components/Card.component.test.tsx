/**
 * @vitest-environment jsdom
 */
import '../setup-component';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from '@/components/ui/Card';

describe('Card Component', () => {
  it('renders children correctly', () => {
    render(<Card>Test content</Card>);
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('applies default variant class', () => {
    const { container } = render(
      <Card>
        <div>Content</div>
      </Card>
    );
    const card = container.querySelector('[class*="card"]');
    expect(card?.className).toMatch(/default/);
  });

  it('applies elevated variant class', () => {
    const { container } = render(
      <Card variant="elevated">
        <div>Content</div>
      </Card>
    );
    const card = container.querySelector('[class*="card"]');
    expect(card?.className).toMatch(/elevated/);
  });

  it('applies custom className prop', () => {
    const { container } = render(
      <Card className="custom-class">
        <div>Content</div>
      </Card>
    );
    const card = container.querySelector('[class*="card"]');
    expect(card?.className).toContain('custom-class');
  });

  it('applies padding md by default', () => {
    const { container } = render(
      <Card>
        <div>Content</div>
      </Card>
    );
    const card = container.querySelector('[class*="card"]');
    expect(card?.className).toMatch(/paddingMd/);
  });

  it('applies padding sm when specified', () => {
    const { container } = render(
      <Card padding="sm">
        <div>Content</div>
      </Card>
    );
    const card = container.querySelector('[class*="card"]');
    expect(card?.className).toMatch(/paddingSm/);
  });

  it('applies padding lg when specified', () => {
    const { container } = render(
      <Card padding="lg">
        <div>Content</div>
      </Card>
    );
    const card = container.querySelector('[class*="card"]');
    expect(card?.className).toMatch(/paddingLg/);
  });

  it('applies noPadding class when noPadding is true', () => {
    const { container } = render(
      <Card noPadding={true}>
        <div>Content</div>
      </Card>
    );
    const card = container.querySelector('[class*="card"]');
    expect(card?.className).toMatch(/noPadding/);
  });
});
