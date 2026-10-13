import React, { useState, useEffect } from 'react';
import { Navbar } from '../components/Navbar';
import { MasterProfile } from '../components/MasterProfile';
import { ResumeUpload } from '../components/ResumeUpload';
import { JobTracker } from '../components/JobTracker';
import { Settings } from '../components/Settings';
import { MasterContext, AISettings } from '../types';
import { api } from '../services/api';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<'master' | 'upload' | 'jobs' | 'settings'>('master');
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

      const endpoint = settings?.provider === 'openrouter'
        ? settings?.openrouter_endpoint
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

  const handleSettingsSaved = (newSettings: AISettings) => {
    setActiveModel(newSettings.model_name);
    const endpoint = newSettings.provider === 'openrouter'
      ? newSettings.openrouter_endpoint
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-sm font-medium text-slate-600">Loading ResumeForge...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        aiConnected={aiConnected}
        activeModel={activeModel}
      />

      <main className="flex-1">
        {loadError && (
          <div className="mx-auto mt-6 flex max-w-4xl items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span><strong>API unavailable.</strong> {loadError}</span>
            </div>
            <button onClick={loadData} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold shadow-sm">
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}
        {activeTab === 'master' && context && (
          <MasterProfile
            context={context}
            onRefresh={loadData}
            activeModel={activeModel}
          />
        )}

        {activeTab === 'upload' && (
          <ResumeUpload
            onUploadSuccess={() => {
              loadData();
              setActiveTab('master');
            }}
            activeModel={activeModel}
          />
        )}

        {activeTab === 'jobs' && <JobTracker activeModel={activeModel} />}

        {activeTab === 'settings' && (
          <Settings onSettingsSaved={handleSettingsSaved} />
        )}
      </main>

      <footer className="border-t border-slate-200/80 bg-white py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>ResumeForge · Your career data stays on your machine</p>
          <p className="text-slate-400">Private resume optimization with Ollama & OpenRouter</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
