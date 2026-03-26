import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from '../../components/StatCard';

describe('StatCard', () => {
  it('renders label and value correctly', () => {
    render(<StatCard label="Total Tasks" value={42} icon="📋" color="#3b82f6" />);
    expect(screen.getByText('Total Tasks')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders icon when not loading', () => {
    render(<StatCard label="Test" value={10} icon="🎯" color="#10b981" />);
    expect(screen.getByText('🎯')).toBeInTheDocument();
  });

  it('shows loading skeleton when loading prop is true', () => {
    render(<StatCard label="Loading" value={0} icon="📊" color="#8b5cf6" loading />);
    const container = document.querySelector('.card');
    expect(container).toBeInTheDocument();
    expect(container?.querySelector('[style*="animation"]')).toBeInTheDocument();
  });

  it('accepts string value', () => {
    render(<StatCard label="Status" value="Active" icon="🔵" color="#3b82f6" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('accepts number value', () => {
    render(<StatCard label="Count" value={123} icon="🔢" color="#3b82f6" />);
    expect(screen.getByText('123')).toBeInTheDocument();
  });
});
