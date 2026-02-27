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
    expect(screen.getByDisplayValue('All categories')).toBeInTheDocument();
    expect(screen.getByDisplayValue('All rarities')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search items')).toBeInTheDocument();
    expect(screen.getByText('42 items')).toBeInTheDocument();
  });

  it('renders category options correctly', () => {
    render(<PortfolioFilters {...defaultProps} />);
    
    // Check if options exist in the select
    const categorySelect = screen.getByDisplayValue('All categories');
    expect(categorySelect).toBeInTheDocument();
    
    // Note: To check options inside select, we might need to query the options directly
    // but testing-library recommends testing user interactions.
    // However, we can check if the text exists in the document (options are rendered)
    expect(screen.getByText('weapon')).toBeInTheDocument();
    expect(screen.getByText('knife')).toBeInTheDocument();
  });

  it('calls onChange when category is changed', () => {
    render(<PortfolioFilters {...defaultProps} />);
    
    const categorySelect = screen.getByDisplayValue('All categories');
    fireEvent.change(categorySelect, { target: { value: 'knife' } });
    
    expect(defaultProps.onChange).toHaveBeenCalledWith('category', 'knife');
  });

  it('calls onChange when rarity is changed', () => {
    render(<PortfolioFilters {...defaultProps} />);
    
    const raritySelect = screen.getByDisplayValue('All rarities');
    fireEvent.change(raritySelect, { target: { value: 'Covert' } });
    
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
