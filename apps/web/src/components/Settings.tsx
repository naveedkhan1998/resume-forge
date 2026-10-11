import React, { useState, useEffect } from 'react';
import { AISettings } from '../types';
import { api } from '../services/api';
import { Cpu, Check, AlertCircle, RefreshCw, Save, Loader2 } from 'lucide-react';

interface SettingsProps {
  onSettingsSaved: (settings: AISettings) => void;
}

export const Settings: React.FC<SettingsProps> = ({ onSettingsSaved }) => {
  const [settings, setSettings] = useState<AISettings>({
    ollama_endpoint: 'http://localhost:11434',
    model_name: 'qwen3.5:9b',
    embedding_model: 'nomic-embed-text',
    temperature: 0.7,
    custom_instructions: '',
  });

  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSettings = async () => {
    try {
      const data = await api.getAiSettings();
      if (data && data.ollama_endpoint) {
        setSettings(data);
      }
      testConnection(data?.ollama_endpoint || 'http://localhost:11434');
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const testConnection = async (endpoint: string) => {
    setTesting(true);
    setStatusMsg(null);
    try {
      const res = await api.getAiHealth(endpoint);
      if (res.connected) {
        setAvailableModels(res.models || []);
        setStatusMsg({
          type: 'success',
          text: `Connected to Ollama! Found ${res.models?.length || 0} local models.`,
        });
      } else {
        setAvailableModels([]);
        setStatusMsg({
          type: 'error',
          text: res.error || 'Failed to connect to Ollama endpoint.',
        });
      }
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'Error connecting to Ollama.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateAiSettings(settings);
      onSettingsSaved(settings);
      setStatusMsg({ type: 'success', text: 'Settings saved successfully!' });
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Ollama & AI Settings</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
          Configure your local or remote Ollama server. Connect to any model for parsing and resume tailoring.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-8 space-y-6">
        <form onSubmit={handleSave} className="space-y-6">
          {/* Endpoint Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Ollama Base URL (Local or Remote)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.ollama_endpoint}
                onChange={(e) => setSettings({ ...settings, ollama_endpoint: e.target.value })}
                placeholder="http://localhost:11434"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono focus:outline-indigo-500"
              />
              <button
                type="button"
                onClick={() => testConnection(settings.ollama_endpoint)}
                disabled={testing}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg shrink-0 transition-colors"
              >
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Test
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Default is <code>http://localhost:11434</code>. Can be an ngrok tunnel, cloud GPU instance, or remote IP.
            </p>
          </div>

          {/* Model Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Active Reasoning / Parsing Model
              </label>
              {availableModels.length > 0 ? (
                <select
                  value={settings.model_name}
                  onChange={(e) => setSettings({ ...settings, model_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-indigo-500 font-mono bg-white"
                >
                  {availableModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={settings.model_name}
                  onChange={(e) => setSettings({ ...settings, model_name: e.target.value })}
                  placeholder="qwen3.5:9b"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono focus:outline-indigo-500"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Embedding Model (for Semantic Matching)
              </label>
              <input
                type="text"
                value={settings.embedding_model}
                onChange={(e) => setSettings({ ...settings, embedding_model: e.target.value })}
                placeholder="nomic-embed-text"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono focus:outline-indigo-500"
              />
            </div>
          </div>

          {/* Temperature */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-slate-700">Generation Temperature</label>
              <span className="text-xs font-mono text-slate-500">{settings.temperature}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.05"
              value={settings.temperature}
              onChange={(e) => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
              <span>Precise / Strict (0.1)</span>
              <span>Balanced (0.7)</span>
              <span>Creative (1.0)</span>
            </div>
          </div>

          {/* Custom Instructions */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Custom Prompt Directives (Optional)
            </label>
            <textarea
              rows={3}
              value={settings.custom_instructions || ''}
              onChange={(e) => setSettings({ ...settings, custom_instructions: e.target.value })}
              placeholder="e.g., 'Always emphasize cloud and distributed systems impact. Avoid fluff words.'"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-indigo-500"
            />
          </div>

          {/* Status Message */}
          {statusMsg && (
            <div
              className={`p-3.5 rounded-xl border flex items-center gap-2 text-xs font-medium ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              {statusMsg.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{statusMsg.text}</span>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
