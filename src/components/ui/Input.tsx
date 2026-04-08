import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({
  label,
  error,
  className = '',
  id,
  ...props
}: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block font-mono text-[11px] uppercase tracking-[0.08em] text-n-text-secondary mb-2"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`
          w-full px-3 py-2.5 bg-transparent border-b font-mono text-sm text-n-text-primary
          focus:outline-none focus:border-n-text-primary
          disabled:opacity-40 disabled:cursor-not-allowed
          transition-colors duration-200
          ${error ? 'border-n-accent' : 'border-n-border-visible'}
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-n-accent">{error}</p>
      )}
    </div>
  );
}
