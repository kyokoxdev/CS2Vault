/**
 * @vitest-environment jsdom
 */
import '../setup-component';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from '@/components/ui/StatCard';

describe('StatCard Component', () => {
  it('renders label correctly', () => {
    render(<StatCard label="Test Label" value={100} />);
    expect(screen.getByText('Test Label')).toBeInTheDocument();
  });

  it('renders value correctly', () => {
    render(<StatCard label="Test Label" value={100} />);
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('renders string value correctly', () => {
    render(<StatCard label="Status" value="Active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders positive change in green', () => {
    const { container } = render(
      <StatCard label="Performance" value={95} change={5.5} />
    );
    const changeElement = screen.getByText('+5.5%');
    expect(changeElement).toBeInTheDocument();
    expect(changeElement.className).toContain('changePositive');
  });

  it('renders negative change in red', () => {
    const { container } = render(
      <StatCard label="Performance" value={85} change={-3.2} />
    );
    const changeElement = screen.getByText('-3.2%');
    expect(changeElement).toBeInTheDocument();
    expect(changeElement.className).toContain('changeNegative');
  });

  it('renders zero change in neutral color', () => {
    const { container } = render(
      <StatCard label="Performance" value={100} change={0} />
    );
    const changeElement = screen.getByText('0.0%');
    expect(changeElement).toBeInTheDocument();
    expect(changeElement.className).toContain('changeNeutral');
  });

  it('does not render change badge when change prop is not provided', () => {
    render(<StatCard label="Test Label" value={100} />);
    const changeElements = screen.queryAllByText(/%/);
    expect(changeElements.length).toBe(0);
  });

  it('renders prefix before value', () => {
    render(<StatCard label="Portfolio Value" value={1000} prefix="$" />);
    const valueElement = screen.getByText((content, element) => {
      return element?.className.includes('value') && content.includes('$1000');
    });
    expect(valueElement).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    const { container } = render(
      <StatCard label="Test" value={100} icon={<span>📈</span>} />
    );
    expect(screen.getByText('📈')).toBeInTheDocument();
  });

  it('composes Card component internally', () => {
    const { container } = render(
      <StatCard label="Test" value={100} />
    );
    const cardElement = container.querySelector('[class*="card"]');
    expect(cardElement).toBeInTheDocument();
  });
});
