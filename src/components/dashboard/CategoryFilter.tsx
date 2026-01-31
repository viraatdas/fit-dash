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
            px-3 py-1.5 text-sm font-medium rounded-full transition-colors
            ${selected === category
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }
          `}
        >
          {category}
        </button>
      ))}
    </div>
  );
}
