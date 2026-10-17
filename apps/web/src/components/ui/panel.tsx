import React from 'react';
import { clsx } from 'clsx';
import { Wand2 } from 'lucide-react';

type IconType = React.ComponentType<{ className?: string }>;

interface PanelProps {
  title?: string;
  icon?: IconType;
  count?: number;
  actions?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export const Panel: React.FC<PanelProps> = ({
  title,
  icon: Icon,
  count,
  actions,
  action,
  children,
  className,
  bodyClassName,
}) => {
  const headerActions = actions ?? action;
  return (
    <section className={clsx('panel', className)}>
      {title && (
        <header className="panel-head">
          <div className="flex min-w-0 items-center gap-2">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />}
            <h2 className="truncate text-[13px] sm:text-sm font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h2>
            {typeof count === 'number' && <span className="panel-count">{count}</span>}
          </div>
          {headerActions && (
            <div className="flex flex-wrap shrink-0 items-center gap-1.5">{headerActions}</div>
          )}
        </header>
      )}
      <div className={clsx('p-3.5 sm:p-5', bodyClassName)}>{children}</div>
    </section>
  );
};

interface EmptyStateProps {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, hint, action }) => (
  <div className="rounded-lg border border-dashed border-slate-300 px-4 py-7 text-center dark:border-slate-700/80">
    <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">{title}</p>
    {hint && (
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {hint}
      </p>
    )}
    {action && <div className="mt-3 flex justify-center">{action}</div>}
  </div>
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export const RefineButton: React.FC<ButtonProps & { label?: string }> = ({
  label = 'Refine',
  className,
  ...props
}) => (
  <button type="button" className={clsx('quiet-btn', className)} {...props}>
    <Wand2 className="h-3.5 w-3.5" />
    <span>{label}</span>
  </button>
);

export const QuietButton: React.FC<ButtonProps> = ({ className, ...props }) => (
  <button type="button" className={clsx('quiet-btn', className)} {...props} />
);

export const IconButton: React.FC<ButtonProps & { tone?: 'neutral' | 'danger' }> = ({
  tone = 'neutral',
  className,
  ...props
}) => (
  <button
    type="button"
    className={clsx('icon-btn', tone === 'danger' && 'icon-btn-danger', className)}
    {...props}
  />
);

export const RowActions: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div
    className={clsx(
      'flex shrink-0 items-center gap-0.5 sm:gap-1 transition-opacity focus-within:opacity-100 md:opacity-0 md:group-hover:opacity-100',
      className,
    )}
  >
    {children}
  </div>
);
