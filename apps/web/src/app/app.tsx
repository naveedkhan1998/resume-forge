import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import { Navbar, AISourceMode } from '../components/Navbar';
import { MasterProfile } from '../components/MasterProfile';
import { ResumeUpload } from '../components/ResumeUpload';
import { JobTracker } from '../components/JobTracker';
import { Settings } from '../components/Settings';
import { MasterContext, AISettings, DeviceSessionStatus } from '../types';
import { api } from '../services/api';
import { initGA, trackPageView } from '../services/analytics';
import { AlertCircle, ArrowRight, FileInput, Loader2, Lock, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );
  const [context, setContext] = useState<MasterContext | null>(null);
  const [sessionStatus, setSessionStatus] = useState<DeviceSessionStatus | null>(null);
  const [aiConnected, setAiConnected] = useState(false);
  const [aiSourceMode, setAiSourceMode] = useState<AISourceMode>('offline');
  const [activeModel, setActiveModel] = useState('qwen3.5:9b');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = async () => {
    setLoadError(null);
    try {
      const sess = await api.initSession().catch(() => null);
      if (sess) {
        setSessionStatus(sess);
      }

      const [ctx, settings] = await Promise.all([
        api.getMasterContext(),
        api.getAiSettings().catch(() => null),
      ]);
      setContext(ctx);

      const isGateway =
        settings?.provider === 'openrouter' || settings?.provider === 'pydantic_gateway';
      const endpoint = isGateway
        ? (settings?.pydantic_gateway_endpoint || settings?.openrouter_endpoint)
        : settings?.ollama_endpoint;

      const health = await api.getAiHealth(settings ? {
        provider: settings.provider,
        endpoint,
        api_key: settings.api_key,
      } : undefined).catch(() => ({ connected: false } as Awaited<ReturnType<typeof api.getAiHealth>>));

      if (health?.session) {
        setSessionStatus(health.session);
      }

      setAiConnected(Boolean(health?.connected || health?.system_fallback_available));
      if (health?.connected) {
        setAiSourceMode(isGateway ? 'custom_key' : 'local_ollama');
        if (settings?.model_name) {
          setActiveModel(settings.model_name);
        } else if (health?.models && health.models.length > 0) {
          setActiveModel(health.models[0]);
        }
      } else if (health?.system_fallback_available) {
        setAiSourceMode('system_fallback');
        setActiveModel(health.system_fallback_model || 'Demo');
      } else {
        setAiSourceMode('offline');
        if (settings?.model_name) {
          setActiveModel(settings.model_name);
        }
      }
    } catch (err) {
      console.error('Failed to load initial app data:', err);
      setLoadError(err instanceof Error ? err.message : 'Could not load application data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initGA();
    loadData();
  }, []);

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);

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
    const isGateway =
      newSettings.provider === 'openrouter' || newSettings.provider === 'pydantic_gateway';
    const endpoint = isGateway
      ? (newSettings.pydantic_gateway_endpoint || newSettings.openrouter_endpoint)
      : newSettings.ollama_endpoint;
    api.getAiHealth({
      provider: newSettings.provider,
      endpoint,
      api_key: newSettings.api_key,
    }).then((res) => {
      setAiConnected(Boolean(res?.connected || res?.system_fallback_available));
      if (res?.session) {
        setSessionStatus(res.session);
      }
      if (res?.connected) {
        setAiSourceMode(isGateway ? 'custom_key' : 'local_ollama');
        setActiveModel(newSettings.model_name);
      } else if (res?.system_fallback_available) {
        setAiSourceMode('system_fallback');
        setActiveModel(res.system_fallback_model || 'Demo');
      } else {
        setAiSourceMode('offline');
      }
    });
  };

  const handleSessionChanged = (newSession: DeviceSessionStatus) => {
    const tokenChanged = Boolean(sessionStatus?.token && newSession.token !== sessionStatus.token);
    setSessionStatus(newSession);
    if (newSession.using_custom_ai) {
      setAiSourceMode(newSession.ai_provider_mode === 'custom_key' ? 'custom_key' : 'local_ollama');
    } else if (aiConnected) {
      setAiSourceMode('system_fallback');
    }
    if (tokenChanged) {
      loadData();
    }
  };

  if (loading) {
    return (
      <div className="app-shell min-h-screen flex items-center justify-center">
        <Card className="loading-card flex flex-col items-center gap-4 border border-slate-200/70 bg-white/80 p-8 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
          <div className="relative flex h-14 w-14 items-center justify-center">
            <img src="/icon.svg" alt="ResumeForge" className="h-12 w-12 rounded-xl object-contain shadow-xs" />
            <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-xs dark:bg-slate-800">
              <Loader2 className="h-3 w-3 animate-spin text-slate-600 dark:text-slate-300" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Opening your workspace</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Initializing your private device session...</p>
          </div>
        </Card>
      </div>
    );
  }

  const isImportRoute = location.pathname.startsWith('/import') || location.pathname.startsWith('/upload');

  return (
    <div className="app-shell min-h-screen flex flex-col font-sans">
      <Navbar
        aiConnected={aiConnected}
        activeModel={activeModel}
        aiSourceMode={aiSourceMode}
        theme={theme}
        onThemeToggle={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
        sessionStatus={sessionStatus}
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

        {sessionStatus && !sessionStatus.using_custom_ai && sessionStatus.llm_quota_remaining === 0 && (
          <div className="mx-auto mt-6 max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded border border-rose-200 bg-rose-50/80 px-4 py-3 text-xs text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-200">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>
                  <strong>This is for demo only.</strong> Please clone this repo and use it locally with your own models:{' '}
                  <a
                    href="https://github.com/naveedkhan1998/resume-forge"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold underline hover:text-rose-700 dark:hover:text-rose-100"
                  >
                    github.com/naveedkhan1998/resume-forge
                  </a>
                </span>
              </div>
            </div>
          </div>
        )}

        {sessionStatus && !sessionStatus.llm_unlocked && !isImportRoute && (
          <div className="mx-auto mt-6 max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-3 rounded border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-xs text-amber-900 sm:flex-row sm:items-center dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="flex items-start gap-2.5">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="font-semibold">
                    Import your resume to unlock AI tailoring & refinement
                  </p>
                  <p className="mt-0.5 text-amber-800/90 dark:text-amber-300/80">
                    Your workspace is isolated to a private token on this device. Upload a PDF/DOCX/TXT resume or paste your career notes in the Import tab to activate AI endpoints.
                  </p>
                </div>
              </div>
              <Link to="/import" className="shrink-0">
                <Button size="sm" className="w-full sm:w-auto">
                  <FileInput className="h-3.5 w-3.5" />
                  Import Resume
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
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
            element={
              <Settings
                onSettingsSaved={handleSettingsSaved}
                sessionStatus={sessionStatus}
                onSessionChanged={handleSessionChanged}
              />
            }
          />

          <Route path="*" element={<Navigate to="/profile" replace />} />
        </Routes>
      </main>

      <footer className="app-footer mt-12 hidden border-t border-slate-200/80 py-6 text-center text-xs text-slate-500 md:block">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 sm:flex-row">
          <div className="flex items-center gap-2">
            <img src="/icon.svg" alt="ResumeForge" className="h-4 w-4 rounded-xs object-contain opacity-80" />
            <p className="font-medium text-slate-600 dark:text-slate-300">ResumeForge · Private device session workspace</p>
          </div>
          <p className="text-slate-400">Private resume intelligence, built around you</p>
        </div>
      </footer>
    </div>
  );
}

export default App;

