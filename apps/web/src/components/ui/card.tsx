import React from 'react';
import { clsx } from 'clsx';

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div
    className={clsx(
      'rounded border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900',
      className,
    )}
    {...props}
  />
);

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={clsx('flex items-center justify-between gap-4 p-5', className)} {...props} />
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={clsx('px-5 pb-5', className)} {...props} />
);
