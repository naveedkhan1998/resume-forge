import React from 'react';
import { FileText, Briefcase, UploadCloud, Cpu, Sparkles, AlertCircle } from 'lucide-react';

interface NavbarProps {
  activeTab: 'master' | 'upload' | 'jobs' | 'settings';
  setActiveTab: (tab: 'master' | 'upload' | 'jobs' | 'settings') => void;
  aiConnected: boolean;
  activeModel: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  aiConnected,
  activeModel,
}) => {
  const items = [
    { id: 'master' as const, label: 'Career profile', shortLabel: 'Profile', icon: FileText },
    { id: 'upload' as const, label: 'Import resume', shortLabel: 'Import', icon: UploadCloud },
    { id: 'jobs' as const, label: 'Applications', shortLabel: 'Jobs', icon: Briefcase },
    { id: 'settings' as const, label: 'Local AI', shortLabel: 'AI', icon: Cpu },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 items-center justify-between gap-4">
          <button onClick={() => setActiveTab('master')} className="flex items-center gap-3 text-left">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-200">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg text-slate-950 tracking-tight">ResumeForge</span>
              <p className="hidden text-xs text-slate-500 sm:block">Private, local-first job search workspace</p>
            </div>
          </button>

          <nav className="hidden items-center gap-1 rounded-xl bg-slate-100 p-1 lg:flex">
            {items.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  activeTab === id
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </nav>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                aiConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
          >
            {aiConnected ? <span className="h-2 w-2 rounded-full bg-emerald-500" /> : <AlertCircle className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{aiConnected ? activeModel : 'Ollama offline'}</span>
          </button>
        </div>

        <nav className="grid grid-cols-4 border-t border-slate-100 py-2 lg:hidden">
          {items.map(({ id, shortLabel, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold ${
                activeTab === id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500'
              }`}
            >
              <Icon className="h-4 w-4" /> {shortLabel}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
};
