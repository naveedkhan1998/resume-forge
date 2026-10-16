import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BriefcaseBusiness,
  CircleUserRound,
  FileInput,
  Moon,
  Settings2,
  Sun,
} from 'lucide-react';

interface NavbarProps {
  aiConnected: boolean;
  activeModel: string;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  activeTab?: 'master' | 'upload' | 'jobs' | 'settings';
  setActiveTab?: (tab: 'master' | 'upload' | 'jobs' | 'settings') => void;
}

const navItems = [
  { path: '/profile', label: 'Profile', icon: CircleUserRound },
  { path: '/import', label: 'Import', icon: FileInput },
  { path: '/jobs', label: 'Applications', icon: BriefcaseBusiness },
  { path: '/settings', label: 'Settings', icon: Settings2 },
];

export const Navbar: React.FC<NavbarProps> = ({
  aiConnected,
  activeModel,
  theme,
  onThemeToggle,
}) => {
  const location = useLocation();
  const currentPath = location.pathname;

  const isItemActive = (path: string) => {
    if (path === '/profile') {
      return currentPath === '/' || currentPath === '/profile' || currentPath === '/master';
    }
    if (path === '/import') {
      return currentPath.startsWith('/import') || currentPath.startsWith('/upload');
    }
    if (path === '/jobs') {
      return currentPath.startsWith('/jobs') || currentPath.startsWith('/applications');
    }
    if (path === '/settings') {
      return currentPath.startsWith('/settings');
    }
    return currentPath === path;
  };

  return (
    <>
      <header className="app-header sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Link
            to="/profile"
            className="flex shrink-0 items-center gap-2.5 text-left"
            aria-label="Open profile"
          >
            <img
              src="/icon.svg"
              alt="ResumeForge Logo"
              className="h-7 w-7 rounded object-contain shadow-xs"
            />
            <span className="hidden text-sm font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:block">
              ResumeForge
            </span>
          </Link>

          <nav className="hidden h-full items-center gap-5 md:flex" aria-label="Primary navigation">
            {navItems.map(({ path, label }) => {
              const active = isItemActive(path);
              return (
                <Link
                  key={path}
                  to={path}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex h-full items-center text-[13px] font-medium transition-colors ${
                    active
                      ? 'text-slate-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-slate-950 dark:text-white dark:after:bg-white'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/settings"
              className="hidden items-center gap-2 border-r border-slate-200 pr-4 text-xs text-slate-500 hover:text-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-100 sm:flex"
              title={aiConnected ? activeModel : 'Configure AI provider'}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${aiConnected ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
              {aiConnected ? activeModel : 'AI not connected'}
            </Link>
            <button
              onClick={onThemeToggle}
              className="flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      <nav className="mobile-nav fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 md:hidden" aria-label="Primary navigation">
        {navItems.map(({ path, label, icon: Icon }) => {
          const active = isItemActive(path);
          return (
            <Link
              key={path}
              to={path}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
                active
                  ? 'text-slate-950 dark:text-white'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
};
