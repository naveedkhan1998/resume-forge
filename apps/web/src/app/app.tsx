import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { MasterProfile } from '../components/MasterProfile';
import { ResumeUpload } from '../components/ResumeUpload';
import { JobTracker } from '../components/JobTracker';
import { Settings } from '../components/Settings';
import { MasterContext, AISettings } from '../types';
import { api } from '../services/api';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';

export function App() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );
  const [context, setContext] = useState<MasterContext | null>(null);
  const [aiConnected, setAiConnected] = useState(false);
  const [activeModel, setActiveModel] = useState('qwen3.5:9b');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = async () => {
    setLoadError(null);
    try {
      const [ctx, settings] = await Promise.all([
        api.getMasterContext(),
        api.getAiSettings().catch(() => null),
      ]);
      setContext(ctx);

      const endpoint = settings?.provider === 'openrouter' || settings?.provider === 'pydantic_gateway'
        ? (settings?.pydantic_gateway_endpoint || settings?.openrouter_endpoint)
        : settings?.ollama_endpoint;

      const health = await api.getAiHealth(settings ? {
        provider: settings.provider,
        endpoint,
        api_key: settings.api_key,
      } : undefined).catch(() => ({ connected: false }));

      setAiConnected(Boolean(health?.connected));
      if (settings?.model_name) {
        setActiveModel(settings.model_name);
      } else if (health?.models && health.models.length > 0) {
        setActiveModel(health.models[0]);
      }
    } catch (err) {
      console.error('Failed to load initial app data:', err);
      setLoadError(err instanceof Error ? err.message : 'Could not load application data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      isDark ? '#090d17' : '#f7f8fc'
    );
    localStorage.setItem('resumeforge-theme', theme);
  }, [theme]);

  const handleSettingsSaved = (newSettings: AISettings) => {
    setActiveModel(newSettings.model_name);
    const endpoint = newSettings.provider === 'openrouter' || newSettings.provider === 'pydantic_gateway'
      ? (newSettings.pydantic_gateway_endpoint || newSettings.openrouter_endpoint)
      : newSettings.ollama_endpoint;
    api.getAiHealth({
      provider: newSettings.provider,
      endpoint,
      api_key: newSettings.api_key,
    }).then((res) => {
      setAiConnected(Boolean(res?.connected));
    });
  };

  if (loading) {
    return (
      <div className="app-shell min-h-screen flex items-center justify-center">
        <Card className="loading-card flex flex-col items-center gap-4 border border-slate-200/70 bg-white/80 dark:border-slate-700 dark:bg-slate-900/80">
          <div className="brand-mark flex h-12 w-12 items-center justify-center rounded-2xl">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Opening your workspace</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Loading your private career data...</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen flex flex-col font-sans">
      <Navbar
        aiConnected={aiConnected}
        activeModel={activeModel}
        theme={theme}
        onThemeToggle={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
      />

      <main className="workspace-main flex-1 pb-20 md:pb-0">
        {loadError && (
          <div className="mx-auto mt-6 max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between gap-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span><strong>API unavailable.</strong> {loadError}</span>
              </div>
              <Button variant="secondary" size="sm" onClick={loadData} className="shrink-0 border-rose-200 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-100 dark:hover:bg-slate-800">
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          </div>
        )}

        <Routes>
          <Route
            path="/"
            element={
              context ? (
                <MasterProfile
                  context={context}
                  onRefresh={loadData}
                  activeModel={activeModel}
                />
              ) : null
            }
          />
          <Route
            path="/profile"
            element={
              context ? (
                <MasterProfile
                  context={context}
                  onRefresh={loadData}
                  activeModel={activeModel}
                />
              ) : null
            }
          />
          <Route path="/master" element={<Navigate to="/profile" replace />} />

          <Route
            path="/import"
            element={
              <ResumeUpload
                onUploadSuccess={() => {
                  loadData();
                  navigate('/profile');
                }}
              />
            }
          />
          <Route path="/upload" element={<Navigate to="/import" replace />} />

          <Route
            path="/jobs"
            element={<JobTracker activeModel={activeModel} />}
          />
          <Route path="/applications" element={<Navigate to="/jobs" replace />} />

          <Route
            path="/settings"
            element={<Settings onSettingsSaved={handleSettingsSaved} />}
          />

          <Route path="*" element={<Navigate to="/profile" replace />} />
        </Routes>
      </main>

      <footer className="app-footer mt-12 hidden border-t border-slate-200/80 py-6 text-center text-xs text-slate-500 md:block">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 sm:px-6 lg:px-8 sm:flex-row">
          <p className="font-medium">ResumeForge · Your career data stays on your machine</p>
          <p className="text-slate-400">Private resume intelligence, built around you</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
