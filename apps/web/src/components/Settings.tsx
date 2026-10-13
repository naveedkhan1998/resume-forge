import React, { useState, useEffect } from 'react';
import { AISettings } from '../types';
import { api } from '../services/api';
import {
  Cpu,
  Globe,
  Check,
  AlertCircle,
  RefreshCw,
  Save,
  Loader2,
  Key,
  Eye,
  EyeOff,
  ExternalLink,
  Sparkles,
} from 'lucide-react';

interface SettingsProps {
  onSettingsSaved: (settings: AISettings) => void;
}

const OLLAMA_PRESETS = [
  'qwen3.5:9b',
  'qwen2.5:7b',
  'llama3.1:8b',
  'mistral:7b',
  'deepseek-r1:8b',
];

const OPENROUTER_PRESETS = [
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
  { id: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B' },
  { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
  { id: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
];

export const Settings: React.FC<SettingsProps> = ({ onSettingsSaved }) => {
  const [settings, setSettings] = useState<AISettings>({
    provider: 'ollama',
    ollama_endpoint: 'http://localhost:11434',
    openrouter_endpoint: 'https://openrouter.ai/api/v1',
    api_key: '',
    model_name: 'qwen3.5:9b',
    embedding_model: 'nomic-embed-text',
    temperature: 0.7,
    custom_instructions: '',
  });

  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSettings = async () => {
    try {
      const data = await api.getAiSettings();
      if (data) {
        const loaded: AISettings = {
          provider: data.provider || 'ollama',
          ollama_endpoint: data.ollama_endpoint || 'http://localhost:11434',
          openrouter_endpoint: data.openrouter_endpoint || 'https://openrouter.ai/api/v1',
          api_key: data.api_key || '',
          model_name: data.model_name || 'qwen3.5:9b',
          embedding_model: data.embedding_model || 'nomic-embed-text',
          temperature: typeof data.temperature === 'number' ? data.temperature : 0.7,
          custom_instructions: data.custom_instructions || '',
        };
        setSettings(loaded);
        testConnection(loaded);
      } else {
        testConnection(settings);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const testConnection = async (targetSettings?: AISettings) => {
    const current = targetSettings || settings;
    const isOllama = (current.provider || 'ollama') === 'ollama';
    const endpoint = isOllama
      ? current.ollama_endpoint || 'http://localhost:11434'
      : current.openrouter_endpoint || 'https://openrouter.ai/api/v1';

    setTesting(true);
    setStatusMsg(null);
    try {
      const res = await api.getAiHealth({
        provider: current.provider || 'ollama',
        endpoint,
        api_key: current.api_key || '',
      });

      if (res.connected) {
        setAvailableModels(res.models || []);
        setStatusMsg({
          type: 'success',
          text: isOllama
            ? `Connected to Ollama! Found ${res.models?.length || 0} models.`
            : `Connected to OpenRouter! Access verified for ${res.models?.length || 0}+ models.`,
        });
      } else {
        setAvailableModels([]);
        setStatusMsg({
          type: 'error',
          text: res.error || `Failed to connect to ${isOllama ? 'Ollama' : 'OpenRouter'}. Check endpoint and credentials.`,
        });
      }
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || `Error connecting to ${isOllama ? 'Ollama' : 'OpenRouter'}.`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleProviderChange = (newProvider: 'ollama' | 'openrouter') => {
    setAvailableModels([]);
    setStatusMsg(null);
    let defaultModel = settings.model_name;
    if (newProvider === 'openrouter' && (settings.model_name.startsWith('qwen3') || settings.model_name.startsWith('llama3.1:'))) {
      defaultModel = 'meta-llama/llama-3.3-70b-instruct';
    } else if (newProvider === 'ollama' && settings.model_name.includes('/')) {
      defaultModel = 'qwen3.5:9b';
    }
    const updated = {
      ...settings,
      provider: newProvider,
      model_name: defaultModel,
    };
    setSettings(updated);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateAiSettings(settings);
      onSettingsSaved(settings);
      setStatusMsg({ type: 'success', text: 'AI configuration saved successfully!' });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

  const isOllama = (settings.provider || 'ollama') === 'ollama';

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6">
      <div className="text-center mb-8">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">AI Intelligence Core</p>
        <h1 className="text-3xl font-bold text-slate-950 tracking-tight">Configure Your LLM Provider</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-lg mx-auto">
          Choose between zero-latency local/remote Ollama or cloud models via OpenRouter for resume parsing and tailoring.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-6">
        {/* Provider Switcher */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-2">AI Provider</label>
          <div className="grid grid-cols-2 gap-3 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => handleProviderChange('ollama')}
              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-semibold transition-all ${
                isOllama
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>Ollama (Local / Remote)</span>
            </button>
            <button
              type="button"
              onClick={() => handleProviderChange('openrouter')}
              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-semibold transition-all ${
                !isOllama
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Globe className="w-4 h-4" />
              <span>OpenRouter (Cloud API)</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Provider Specific Settings */}
          {isOllama ? (
            <div className="space-y-4 rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
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
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono focus:outline-indigo-500 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => testConnection()}
                    disabled={testing}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg shrink-0 transition-colors"
                  >
                    {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Test
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Default is <code>http://localhost:11434</code>. For remote Ollama, enter your tunnel or cloud server URL (e.g. Cloudflare tunnel, ngrok, or remote IP).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remote API Key / Bearer Token <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Key className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={settings.api_key || ''}
                    onChange={(e) => setSettings({ ...settings, api_key: e.target.value })}
                    placeholder="Leave empty for local Ollama without auth"
                    className="w-full pl-9 pr-10 py-2 text-sm rounded-lg border border-slate-300 font-mono focus:outline-indigo-500 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Only required if your remote Ollama reverse proxy or cloud tunnel mandates an Authorization Bearer header.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/30 p-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  OpenRouter Base Endpoint
                </label>
                <input
                  type="text"
                  value={settings.openrouter_endpoint || 'https://openrouter.ai/api/v1'}
                  onChange={(e) => setSettings({ ...settings, openrouter_endpoint: e.target.value })}
                  placeholder="https://openrouter.ai/api/v1"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono focus:outline-indigo-500 bg-white"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Standard endpoint is <code>https://openrouter.ai/api/v1</code>.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">OpenRouter API Key</label>
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Get API Key <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Key className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={settings.api_key || ''}
                      onChange={(e) => setSettings({ ...settings, api_key: e.target.value })}
                      placeholder="sk-or-v1-..."
                      className="w-full pl-9 pr-10 py-2 text-sm rounded-lg border border-slate-300 font-mono focus:outline-indigo-500 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => testConnection()}
                    disabled={testing}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shrink-0 transition-colors"
                  >
                    {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Test Key
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Your key is securely stored in your local application database and never shared.
                </p>
              </div>
            </div>
          )}

          {/* Model Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Active Reasoning / Parsing Model
              </label>
              {availableModels.length > 0 ? (
                <div className="space-y-1.5">
                  <select
                    value={settings.model_name}
                    onChange={(e) => setSettings({ ...settings, model_name: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-indigo-500 font-mono bg-white"
                  >
                    {!availableModels.includes(settings.model_name) && (
                      <option value={settings.model_name}>{settings.model_name} (Current)</option>
                    )}
                    {availableModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={settings.model_name}
                    onChange={(e) => setSettings({ ...settings, model_name: e.target.value })}
                    placeholder="Or type custom model ID..."
                    className="w-full px-2.5 py-1 text-xs rounded-md border border-slate-200 font-mono text-slate-600"
                  />
                </div>
              ) : (
                <input
                  type="text"
                  value={settings.model_name}
                  onChange={(e) => setSettings({ ...settings, model_name: e.target.value })}
                  placeholder={isOllama ? 'qwen3.5:9b' : 'meta-llama/llama-3.3-70b-instruct'}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono focus:outline-indigo-500"
                />
              )}

              {/* Quick Model Presets Chips */}
              <div className="mt-2">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Popular Presets:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {isOllama
                    ? OLLAMA_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setSettings({ ...settings, model_name: preset })}
                          className={`text-[11px] px-2 py-0.5 rounded-md font-mono border transition-all ${
                            settings.model_name === preset
                              ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {preset}
                        </button>
                      ))
                    : OPENROUTER_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setSettings({ ...settings, model_name: preset.id })}
                          className={`text-[11px] px-2 py-0.5 rounded-md font-mono border transition-all ${
                            settings.model_name === preset.id
                              ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Embedding Model (for Semantic Matching)
              </label>
              <input
                type="text"
                value={settings.embedding_model || 'nomic-embed-text'}
                onChange={(e) => setSettings({ ...settings, embedding_model: e.target.value })}
                placeholder="nomic-embed-text"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono focus:outline-indigo-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Used for vector cosine similarity rankings between job keywords and bullet points.
              </p>
            </div>
          </div>

          {/* Temperature */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-slate-700">Generation Temperature</label>
              <span className="text-xs font-mono font-bold text-indigo-600">{settings.temperature}</span>
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
              <span>Strict / Factual (0.1–0.3)</span>
              <span>Balanced (0.5–0.7)</span>
              <span>Creative (1.0)</span>
            </div>
          </div>

          {/* Custom Instructions */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Custom Prompt Directives <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={3}
              value={settings.custom_instructions || ''}
              onChange={(e) => setSettings({ ...settings, custom_instructions: e.target.value })}
              placeholder="e.g., 'Emphasize cloud architecture, distributed systems, and low-latency performance. Keep bullet points quantitative.'"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-indigo-500"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Injected into tailoring and LaTeX section review prompts. Models are instructed to prioritize these directives while preserving factual truth.
            </p>
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
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all"
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
