import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center font-mono text-[13px] uppercase tracking-[0.06em] rounded-pill transition-all duration-200 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-n-text-display text-n-black hover:opacity-90',
    secondary: 'bg-transparent border border-n-border-visible text-n-text-primary hover:border-n-text-primary',
    outline: 'border border-n-border-visible text-n-text-primary hover:border-n-text-secondary',
    ghost: 'text-n-text-secondary hover:text-n-text-primary',
    danger: 'bg-transparent border border-n-accent text-n-accent hover:bg-n-accent-subtle',
  };

  const sizes = {
    sm: 'px-4 py-2 min-h-[36px]',
    md: 'px-6 py-3 min-h-[44px]',
    lg: 'px-8 py-3.5 min-h-[48px]',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
