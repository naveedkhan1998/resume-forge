import React from 'react';
import { clsx } from 'clsx';

interface SectionHeaderProps {
  title: string;
  description?: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  description,
  className,
  actions,
}) => (
  <div className={clsx('flex flex-wrap items-start justify-between gap-4', className)}>
    <div>
      <h1 className="page-title">{title}</h1>
      {description && <p className="page-description">{description}</p>}
    </div>
    {actions}
  </div>
);
