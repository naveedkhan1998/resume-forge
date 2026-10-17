import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BriefcaseBusiness,
  CircleUserRound,
  Cloud,
  Cpu,
  FileInput,
  Key,
  Lock,
  Moon,
  Settings2,
  Sun,
} from 'lucide-react';
import { DeviceSessionStatus } from '../types';

export type AISourceMode = 'local_ollama' | 'custom_key' | 'system_fallback' | 'offline';

interface NavbarProps {
  aiConnected: boolean;
  activeModel: string;
  aiSourceMode?: AISourceMode;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  sessionStatus?: DeviceSessionStatus | null;
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
  aiSourceMode,
  theme,
  onThemeToggle,
  sessionStatus,
}) => {
  const location = useLocation();
  const currentPath = location.pathname;

  const effectiveSourceMode: AISourceMode =
    aiSourceMode ||
    (!aiConnected
      ? 'offline'
      : sessionStatus?.using_custom_ai
        ? sessionStatus.ai_provider_mode === 'custom_key'
          ? 'custom_key'
          : 'local_ollama'
        : 'system_fallback');

  const isOwnModel =
    effectiveSourceMode === 'local_ollama' || effectiveSourceMode === 'custom_key';

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
            {sessionStatus && !sessionStatus.llm_unlocked && (
              <Link
                to="/import"
                className="hidden items-center gap-1.5 rounded border border-amber-200 bg-amber-50/80 px-2.5 py-1 text-[11px] font-medium text-amber-800 transition-colors hover:bg-amber-100/80 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300 lg:inline-flex"
                title="Import your resume first to unlock AI tailoring and refinement endpoints"
              >
                <Lock className="h-3 w-3 shrink-0" />
                <span>Import resume to unlock AI</span>
              </Link>
            )}

            <Link
              to="/settings"
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                !aiConnected || effectiveSourceMode === 'offline'
                  ? 'border-slate-200 bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                  : isOwnModel
                    ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800 hover:bg-emerald-100/80 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-indigo-200 bg-indigo-50/80 text-indigo-800 hover:bg-indigo-100/80 dark:border-indigo-800/70 dark:bg-indigo-950/40 dark:text-indigo-300'
              }`}
              title={
                !aiConnected || effectiveSourceMode === 'offline'
                  ? 'AI provider offline · Click to configure in Settings'
                  : effectiveSourceMode === 'local_ollama'
                    ? `Using your own Local Ollama model (${activeModel}) · Unlimited calls, 0 system credits used`
                    : effectiveSourceMode === 'custom_key'
                      ? `Using your own Custom API Key (${activeModel}) · Unlimited calls, 0 system credits used`
                      : `Using Server System Fallback Model (${activeModel}) · ${
                          sessionStatus?.llm_quota_remaining ?? 25
                        }/${sessionStatus?.llm_calls_limit ?? 25} demo credits remaining`
              }
            >
              {!aiConnected || effectiveSourceMode === 'offline' ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-600" />
                  <span className="font-semibold">AI Offline</span>
                </>
              ) : effectiveSourceMode === 'local_ollama' ? (
                <>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <Cpu className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-semibold">Own Model (Local)</span>
                  <span className="hidden text-emerald-600/70 dark:text-emerald-400/70 sm:inline">·</span>
                  <span className="hidden font-mono text-[11px] sm:inline">{activeModel}</span>
                  <span className="hidden rounded bg-emerald-200/70 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-900 dark:bg-emerald-900/70 dark:text-emerald-200 md:inline">
                    Unlimited
                  </span>
                </>
              ) : effectiveSourceMode === 'custom_key' ? (
                <>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <Key className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-semibold">Own Model (API Key)</span>
                  <span className="hidden text-emerald-600/70 dark:text-emerald-400/70 sm:inline">·</span>
                  <span className="hidden font-mono text-[11px] sm:inline">{activeModel}</span>
                  <span className="hidden rounded bg-emerald-200/70 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-900 dark:bg-emerald-900/70 dark:text-emerald-200 md:inline">
                    Unlimited
                  </span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                  <Cloud className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-semibold">System Model</span>
                  <span className="hidden text-indigo-600/70 dark:text-indigo-400/70 sm:inline">·</span>
                  <span className="hidden font-mono text-[11px] sm:inline">{activeModel}</span>
                  {sessionStatus && sessionStatus.llm_quota_remaining !== null && (
                    <span className="rounded bg-indigo-200/70 px-1.5 py-0.2 text-[10px] font-semibold text-indigo-900 dark:bg-indigo-900/70 dark:text-indigo-200">
                      {sessionStatus.llm_quota_remaining}/{sessionStatus.llm_calls_limit} left
                    </span>
                  )}
                </>
              )}
            </Link>

            <a
              href="https://github.com/naveedkhan1998/resume-forge"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white sm:inline-flex"
              title="Clone ResumeForge on GitHub to run locally with your own models"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-3.5 w-3.5 fill-current"
              >
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
              </svg>
              <span className="hidden md:inline">GitHub</span>
            </a>

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
