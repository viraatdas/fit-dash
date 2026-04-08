'use client';

import { ExerciseCategory } from '@/types';

interface CategoryFilterProps {
  categories: ExerciseCategory[];
  selected: ExerciseCategory | 'All';
  onChange: (category: ExerciseCategory | 'All') => void;
}

export function CategoryFilter({ categories, selected, onChange }: CategoryFilterProps) {
  const allCategories: (ExerciseCategory | 'All')[] = ['All', ...categories];

  return (
    <div className="flex flex-wrap gap-2">
      {allCategories.map((category) => (
        <button
          key={category}
          onClick={() => onChange(category)}
          className={`
            px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] rounded-pill transition-all duration-200 border
            ${selected === category
              ? 'bg-n-text-display text-n-black border-n-text-display'
              : 'bg-transparent text-n-text-secondary border-n-border-visible hover:border-n-text-secondary'
            }
          `}
        >
          {category}
        </button>
      ))}
    </div>
  );
}
