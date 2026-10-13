import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Cpu,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Key,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { AISettings } from '../types';
import { api } from '../services/api';
import { SectionHeader } from './ui/section-header';
import { Button } from './ui/button';
import { IconButton, Panel } from './ui/panel';
import { Field, TextArea, TextInput } from './ui/field';

interface SettingsProps {
  onSettingsSaved: (settings: AISettings) => void;
}

const DEFAULT_SETTINGS: AISettings = {
  provider: 'ollama',
  ollama_endpoint: 'http://localhost:11434',
  openrouter_endpoint: 'https://openrouter.ai/api/v1',
  api_key: '',
  model_name: 'qwen3.5:9b',
  embedding_model: 'nomic-embed-text',
  temperature: 0.7,
  custom_instructions: '',
};

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

type StatusMessage = { type: 'success' | 'error'; text: string };

export const Settings: React.FC<SettingsProps> = ({ onSettingsSaved }) => {
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [statusMsg, setStatusMsg] = useState<StatusMessage | null>(null);
  const [saving, setSaving] = useState(false);

  const testConnection = async (targetSettings?: AISettings) => {
    const current = targetSettings || settings;
    const isLocalProvider = (current.provider || 'ollama') === 'ollama';
    const endpoint = isLocalProvider
      ? current.ollama_endpoint || DEFAULT_SETTINGS.ollama_endpoint
      : current.openrouter_endpoint || DEFAULT_SETTINGS.openrouter_endpoint || '';

    setTesting(true);
    setStatusMsg(null);
    try {
      const response = await api.getAiHealth({
        provider: current.provider || 'ollama',
        endpoint,
        api_key: current.api_key || '',
      });

      if (!response.connected) {
        setAvailableModels([]);
        setStatusMsg({
          type: 'error',
          text:
            response.error ||
            `Could not connect to ${isLocalProvider ? 'Ollama' : 'OpenRouter'}. Check the endpoint and credentials.`,
        });
        return;
      }

      setAvailableModels(response.models || []);
      setStatusMsg({
        type: 'success',
        text: `${isLocalProvider ? 'Ollama' : 'OpenRouter'} responded successfully${
          response.models?.length ? ` with ${response.models.length} available models` : ''
        }.`,
      });
    } catch (error) {
      setAvailableModels([]);
      setStatusMsg({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : `Could not connect to ${isLocalProvider ? 'Ollama' : 'OpenRouter'}.`,
      });
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await api.getAiSettings();
        const loaded: AISettings = {
          ...DEFAULT_SETTINGS,
          ...data,
          provider: data?.provider || 'ollama',
          temperature:
            typeof data?.temperature === 'number'
              ? data.temperature
              : DEFAULT_SETTINGS.temperature,
        };
        setSettings(loaded);
        await testConnection(loaded);
      } catch (error) {
        console.error(error);
        setStatusMsg({
          type: 'error',
          text: error instanceof Error ? error.message : 'Could not load AI settings.',
        });
      }
    };

    loadSettings();
  }, []);

  const handleProviderChange = (provider: 'ollama' | 'openrouter') => {
    setAvailableModels([]);
    setStatusMsg(null);

    let modelName = settings.model_name;
    if (
      provider === 'openrouter' &&
      (modelName.startsWith('qwen3') || modelName.startsWith('llama3.1:'))
    ) {
      modelName = 'meta-llama/llama-3.3-70b-instruct';
    } else if (provider === 'ollama' && modelName.includes('/')) {
      modelName = 'qwen3.5:9b';
    }

    setSettings({ ...settings, provider, model_name: modelName });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.updateAiSettings(settings);
      onSettingsSaved(settings);
      setStatusMsg({ type: 'success', text: 'Settings saved.' });
    } catch (error) {
      setStatusMsg({
        type: 'error',
        text: error instanceof Error ? error.message : 'Could not save settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  const isOllama = (settings.provider || 'ollama') === 'ollama';
  const presets = isOllama
    ? OLLAMA_PRESETS.map((preset) => ({ id: preset, label: preset }))
    : OPENROUTER_PRESETS;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <SectionHeader
        title="Settings"
        description="Configure the model connection used for resume parsing, matching, and document tailoring."
      />

      <form onSubmit={handleSave} className="space-y-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="space-y-5 lg:col-span-4">
            <Panel title="Provider" icon={Cpu}>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleProviderChange('ollama')}
                  className={`settings-provider ${isOllama ? 'settings-provider-active' : ''}`}
                >
                  <span className="settings-provider-icon"><Cpu className="h-4 w-4" /></span>
                  <span className="min-w-0 text-left">
                    <span className="block text-[13px] font-semibold text-slate-900">Ollama</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">
                      Local or self-hosted models
                    </span>
                  </span>
                  {isOllama && <Check className="ml-auto h-4 w-4 text-slate-500" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleProviderChange('openrouter')}
                  className={`settings-provider ${!isOllama ? 'settings-provider-active' : ''}`}
                >
                  <span className="settings-provider-icon"><Globe className="h-4 w-4" /></span>
                  <span className="min-w-0 text-left">
                    <span className="block text-[13px] font-semibold text-slate-900">OpenRouter</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">
                      Cloud model gateway
                    </span>
                  </span>
                  {!isOllama && <Check className="ml-auto h-4 w-4 text-slate-500" />}
                </button>
              </div>
            </Panel>

            <Panel title="Connection status" icon={ShieldCheck}>
              {testing ? (
                <StatusRow
                  icon={<Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                  title="Testing connection"
                  description="Checking endpoint and credentials…"
                />
              ) : statusMsg ? (
                <StatusRow
                  icon={
                    statusMsg.type === 'success' ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-rose-600" />
                    )
                  }
                  title={
                    statusMsg.type === 'success'
                      ? 'Connection available'
                      : 'Connection unavailable'
                  }
                  description={statusMsg.text}
                />
              ) : (
                <p className="text-xs leading-relaxed text-slate-500">
                  Test the connection after changing the endpoint or credentials.
                </p>
              )}

              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-4 w-full"
                onClick={() => testConnection()}
                disabled={testing}
              >
                {testing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Test connection
              </Button>
            </Panel>

            <div className="rounded border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div>
                  <p className="text-xs font-medium text-slate-700">Stored locally</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    Endpoints, credentials, and prompt preferences stay in this application's database.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5 lg:col-span-8">
            <Panel
              title={isOllama ? 'Ollama connection' : 'OpenRouter connection'}
              icon={isOllama ? Cpu : Globe}
            >
              <div className="space-y-4">
                <Field
                  label={isOllama ? 'Base URL' : 'API endpoint'}
                  hint={
                    isOllama
                      ? 'Use localhost for a local server, or enter a remote Ollama endpoint.'
                      : 'The standard OpenRouter endpoint works for most configurations.'
                  }
                >
                  <TextInput
                    type="url"
                    className="font-mono"
                    value={
                      isOllama
                        ? settings.ollama_endpoint
                        : settings.openrouter_endpoint || DEFAULT_SETTINGS.openrouter_endpoint
                    }
                    onChange={(event) =>
                      setSettings(
                        isOllama
                          ? { ...settings, ollama_endpoint: event.target.value }
                          : { ...settings, openrouter_endpoint: event.target.value },
                      )
                    }
                    placeholder={
                      isOllama
                        ? DEFAULT_SETTINGS.ollama_endpoint
                        : DEFAULT_SETTINGS.openrouter_endpoint
                    }
                  />
                </Field>

                <Field
                  label={isOllama ? 'API key (optional)' : 'API key'}
                  hint={
                    isOllama
                      ? 'Only needed when your remote proxy requires authentication.'
                      : 'Create and manage keys from your OpenRouter account.'
                  }
                >
                  <div className="relative">
                    <Key className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <TextInput
                      type={showApiKey ? 'text' : 'password'}
                      className="px-9 font-mono"
                      value={settings.api_key || ''}
                      onChange={(event) =>
                        setSettings({ ...settings, api_key: event.target.value })
                      }
                      placeholder={
                        isOllama ? 'Leave empty for unauthenticated Ollama' : 'sk-or-v1-…'
                      }
                    />
                    <IconButton
                      type="button"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => setShowApiKey((visible) => !visible)}
                      aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                    >
                      {showApiKey ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </IconButton>
                  </div>
                  {!isOllama && (
                    <a
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noreferrer"
                      className="entry-link mt-2"
                    >
                      Manage OpenRouter keys <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </Field>
              </div>
            </Panel>

            <Panel title="Models" icon={Database}>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <Field
                    label="Generation model"
                    hint="Used for parsing, refinement, and tailored documents."
                  >
                    {availableModels.length > 0 ? (
                      <select
                        value={settings.model_name}
                        onChange={(event) =>
                          setSettings({ ...settings, model_name: event.target.value })
                        }
                        className="field-input font-mono"
                      >
                        {!availableModels.includes(settings.model_name) && (
                          <option value={settings.model_name}>
                            {settings.model_name} (current)
                          </option>
                        )}
                        {availableModels.map((model) => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                      </select>
                    ) : (
                      <TextInput
                        type="text"
                        className="font-mono"
                        value={settings.model_name}
                        onChange={(event) =>
                          setSettings({ ...settings, model_name: event.target.value })
                        }
                        placeholder={
                          isOllama
                            ? 'qwen3.5:9b'
                            : 'meta-llama/llama-3.3-70b-instruct'
                        }
                      />
                    )}
                  </Field>

                  <div className="mt-3">
                    <p className="group-label mb-2">Presets</p>
                    <div className="flex flex-wrap gap-1.5">
                      {presets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            setSettings({ ...settings, model_name: preset.id })
                          }
                          className={`model-preset ${
                            settings.model_name === preset.id
                              ? 'model-preset-active'
                              : ''
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <Field
                  label="Embedding model"
                  hint="Used for semantic similarity between job requirements and profile evidence."
                >
                  <TextInput
                    type="text"
                    className="font-mono"
                    value={settings.embedding_model || 'nomic-embed-text'}
                    onChange={(event) =>
                      setSettings({ ...settings, embedding_model: event.target.value })
                    }
                    placeholder="nomic-embed-text"
                  />
                </Field>
              </div>
            </Panel>

            <Panel title="Generation defaults" icon={SlidersHorizontal}>
              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium text-slate-700">Temperature</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Lower values keep generated content more deterministic.
                      </p>
                    </div>
                    <output className="min-w-10 rounded border border-slate-200 px-2 py-1 text-center font-mono text-xs text-slate-700 dark:border-slate-800">
                      {settings.temperature.toFixed(2)}
                    </output>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.temperature}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        temperature: Number.parseFloat(event.target.value),
                      })
                    }
                    className="settings-range w-full"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                    <span>Factual</span>
                    <span>Balanced</span>
                    <span>Creative</span>
                  </div>
                </div>

                <Field
                  label="Custom instructions"
                  hint="Applied to tailoring and section review while preserving factual profile data."
                >
                  <TextArea
                    rows={4}
                    value={settings.custom_instructions || ''}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        custom_instructions: event.target.value,
                      })
                    }
                    placeholder="Emphasize distributed systems and measurable outcomes. Keep bullets concise."
                  />
                </Field>
              </div>
            </Panel>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500">
            Saving applies this provider and model to future parsing and tailoring operations.
          </p>
          <Button type="submit" disabled={saving} className="shrink-0">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </form>
    </div>
  );
};

const StatusRow: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
}> = ({ icon, title, description }) => (
  <div className="flex items-start gap-3">
    <span className="mt-0.5 shrink-0">{icon}</span>
    <div>
      <p className="text-[13px] font-medium text-slate-700">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
    </div>
  </div>
);
