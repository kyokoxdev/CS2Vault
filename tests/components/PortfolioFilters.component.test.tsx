// @vitest-environment jsdom
import '../setup-component';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PortfolioFilters } from '@/components/portfolio/PortfolioFilters';

describe('PortfolioFilters', () => {
  const defaultProps = {
    category: '',
    rarity: '',
    search: '',
    price: 'all',
    filterOptions: {
      categories: ['weapon', 'knife', 'glove'],
      rarities: ['Covert', 'Classified', 'Restricted']
    },
    itemCount: 42,
    onChange: vi.fn(),
    onClear: vi.fn()
  };

  it('renders filter dropdowns and search input', () => {
    render(<PortfolioFilters {...defaultProps} />);

    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('All categories')).toBeInTheDocument();
    expect(screen.getByText('All rarities')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search items')).toBeInTheDocument();
    expect(screen.getByText('42 items')).toBeInTheDocument();
  });

  it('renders category options correctly', () => {
    render(<PortfolioFilters {...defaultProps} />);
    
    const categoryButton = screen.getByText('All categories');
    expect(categoryButton).toBeInTheDocument();
    
    fireEvent.click(categoryButton);
    
    expect(screen.getByText('weapon')).toBeInTheDocument();
    expect(screen.getByText('knife')).toBeInTheDocument();
  });

  it('calls onChange when category is changed', () => {
    render(<PortfolioFilters {...defaultProps} />);
    
    const categoryButton = screen.getByText('All categories');
    fireEvent.click(categoryButton);
    
    const knifeOption = screen.getByText('knife');
    fireEvent.click(knifeOption);
    
    expect(defaultProps.onChange).toHaveBeenCalledWith('category', 'knife');
  });

  it('calls onChange when rarity is changed', () => {
    render(<PortfolioFilters {...defaultProps} />);
    
    const rarityButton = screen.getByText('All rarities');
    fireEvent.click(rarityButton);
    
    const covertOption = screen.getByText('Covert');
    fireEvent.click(covertOption);
    
    expect(defaultProps.onChange).toHaveBeenCalledWith('rarity', 'Covert');
  });

  it('updates search input value locally and calls onChange on Enter', () => {
    render(<PortfolioFilters {...defaultProps} />);
    
    const searchInput = screen.getByPlaceholderText('Search items');
    
    // Type in the input
    fireEvent.change(searchInput, { target: { value: 'Dragon Lore' } });
    
    // Value should update locally
    expect(searchInput).toHaveValue('Dragon Lore');
    
    // Press Enter
    fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
    
    expect(defaultProps.onChange).toHaveBeenCalledWith('search', 'Dragon Lore');
  });

  it('calls onChange when Apply button is clicked', () => {
    render(<PortfolioFilters {...defaultProps} />);
    
    const searchInput = screen.getByPlaceholderText('Search items');
    fireEvent.change(searchInput, { target: { value: 'Dragon Lore' } });
    
    const applyButton = screen.getByText('Apply');
    fireEvent.click(applyButton);
    
    expect(defaultProps.onChange).toHaveBeenCalledWith('search', 'Dragon Lore');
  });

  it('calls onClear when Clear button is clicked', () => {
    render(<PortfolioFilters {...defaultProps} />);
    
    const clearButton = screen.getByText('Clear');
    fireEvent.click(clearButton);
    
    expect(defaultProps.onClear).toHaveBeenCalled();
  });

  it('initializes search input with search prop', () => {
    render(<PortfolioFilters {...defaultProps} search="Initial Search" />);
    
    expect(screen.getByDisplayValue('Initial Search')).toBeInTheDocument();
  });
});
