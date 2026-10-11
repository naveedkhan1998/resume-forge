import React, { useState, useEffect } from 'react';
import { Navbar } from '../components/Navbar';
import { MasterProfile } from '../components/MasterProfile';
import { ResumeUpload } from '../components/ResumeUpload';
import { JobTracker } from '../components/JobTracker';
import { Settings } from '../components/Settings';
import { MasterContext, AISettings } from '../types';
import { api } from '../services/api';
import { Loader2 } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<'master' | 'upload' | 'jobs' | 'settings'>('master');
  const [context, setContext] = useState<MasterContext | null>(null);
  const [aiConnected, setAiConnected] = useState(false);
  const [activeModel, setActiveModel] = useState('qwen3.5:9b');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [ctx, health, settings] = await Promise.all([
        api.getMasterContext(),
        api.getAiHealth().catch(() => ({ connected: false })),
        api.getAiSettings().catch(() => null),
      ]);
      setContext(ctx);
      setAiConnected(Boolean(health?.connected));
      if (settings?.model_name) {
        setActiveModel(settings.model_name);
      } else if (health?.models && health.models.length > 0) {
        setActiveModel(health.models[0]);
      }
    } catch (err) {
      console.error('Failed to load initial app data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSettingsSaved = (newSettings: AISettings) => {
    setActiveModel(newSettings.model_name);
    api.getAiHealth(newSettings.ollama_endpoint).then((res) => {
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

      {/* Footer */}
      <footer className="border-t border-slate-200/80 bg-white py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>ResumeForge • Open Source Local AI Resume Builder & Job Tracker</p>
          <p className="text-slate-400">Powered by Django Ninja, React, PostgreSQL (pgvector) & Ollama</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
