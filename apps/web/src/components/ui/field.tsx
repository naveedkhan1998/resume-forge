import React from 'react';
import { clsx } from 'clsx';

interface FieldProps {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({ label, hint, className, children }) => (
  <label className={clsx('block', className)}>
    <span className="field-label">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
  </label>
);

export const TextInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className,
  ...props
}) => <input className={clsx('field-input', className)} {...props} />;

export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({
  className,
  ...props
}) => <textarea className={clsx('field-input resize-none', className)} {...props} />;
