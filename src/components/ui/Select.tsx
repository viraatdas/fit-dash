import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export function Select({
  label,
  options,
  className = '',
  id,
  ...props
}: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="relative">
      {label && (
        <label
          htmlFor={selectId}
          className="block font-mono text-[11px] uppercase tracking-[0.08em] text-n-text-secondary mb-2"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={`
            appearance-none w-full px-4 py-2.5 pr-10
            bg-n-surface-raised border border-n-border-visible rounded-nothing-sm
            text-n-text-primary font-mono text-sm
            focus:outline-none focus:border-n-text-secondary
            hover:border-n-text-disabled transition-colors duration-200
            cursor-pointer
            ${className}
          `}
          {...props}
        >
          {options.map(option => (
            <option key={option.value} value={option.value} className="bg-n-surface text-n-text-primary">
              {option.label}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          <svg
            className="w-4 h-4 text-n-text-secondary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
