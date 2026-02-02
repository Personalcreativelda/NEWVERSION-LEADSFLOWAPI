import { Search, Trash2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

interface FilterBarProps {
  origens: string[];
  status: string[];
  onFilterChange: (filters: { origem: string; status: string; busca: string }) => void;
  onRemoveDuplicates?: () => void;
}

export default function FilterBar({ origens, status, onFilterChange, onRemoveDuplicates }: FilterBarProps) {
  const [origem, setOrigem] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [busca, setBusca] = useState('');

  const handleApplyFilters = () => {
    onFilterChange({ origem, status: statusFilter, busca });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleApplyFilters();
    }
  };

  const handleRemoveDuplicates = () => {
    if (onRemoveDuplicates) {
      onRemoveDuplicates();
    }
  };

  return null;
}

