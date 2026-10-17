import React from 'react';
import { clsx } from 'clsx';

export type ButtonVariant = 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  default: 'bg-slate-900 text-white hover:bg-slate-800 border border-slate-900 dark:bg-slate-100 dark:text-slate-950 dark:border-slate-100 dark:hover:bg-white',
  primary: 'bg-slate-900 text-white hover:bg-slate-800 border border-slate-900 dark:bg-slate-100 dark:text-slate-950 dark:border-slate-100 dark:hover:bg-white',
  secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-700',
  outline: 'bg-transparent text-slate-700 hover:bg-slate-100 border border-slate-200 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 border border-rose-600 shadow-xs',
  success: 'bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-600 shadow-xs',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-9 px-3.5 text-xs sm:text-[13px]',
  lg: 'h-11 px-5 text-sm',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'default', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/70 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
});
