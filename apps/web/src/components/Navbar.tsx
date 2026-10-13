import React from 'react';
import {
  BriefcaseBusiness,
  CircleUserRound,
  FileInput,
  Moon,
  Settings2,
  Sun,
} from 'lucide-react';

interface NavbarProps {
  activeTab: 'master' | 'upload' | 'jobs' | 'settings';
  setActiveTab: (tab: 'master' | 'upload' | 'jobs' | 'settings') => void;
  aiConnected: boolean;
  activeModel: string;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
}

const items = [
  { id: 'master' as const, label: 'Profile', icon: CircleUserRound },
  { id: 'upload' as const, label: 'Import', icon: FileInput },
  { id: 'jobs' as const, label: 'Applications', icon: BriefcaseBusiness },
  { id: 'settings' as const, label: 'Settings', icon: Settings2 },
];

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  aiConnected,
  activeModel,
  theme,
  onThemeToggle,
}) => (
  <>
    <header className="app-header sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-14 max-w-[88rem] items-center gap-6 px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => setActiveTab('master')}
          className="flex shrink-0 items-center gap-2 text-left"
          aria-label="Open profile"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded bg-slate-950 text-xs font-bold text-white dark:bg-white dark:text-slate-950">
            R
          </span>
          <span className="hidden text-sm font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:block">
            ResumeForge
          </span>
        </button>

        <nav className="hidden h-full items-center gap-5 md:flex" aria-label="Primary navigation">
          {items.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              className={`relative h-full text-[13px] font-medium ${
                activeTab === id
                  ? 'text-slate-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-slate-950 dark:text-white dark:after:bg-white'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setActiveTab('settings')}
            className="hidden items-center gap-2 border-r border-slate-200 pr-4 text-xs text-slate-500 hover:text-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-100 sm:flex"
            title={aiConnected ? activeModel : 'Configure AI provider'}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${aiConnected ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
            {aiConnected ? activeModel : 'AI not connected'}
          </button>
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
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setActiveTab(id)}
          aria-current={activeTab === id ? 'page' : undefined}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium ${
            activeTab === id
              ? 'text-slate-950 dark:text-white'
              : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <Icon className="h-[18px] w-[18px]" />
          {label}
        </button>
      ))}
    </nav>
  </>
);
