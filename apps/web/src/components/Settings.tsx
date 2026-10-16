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
  HelpCircle,
  Key,
  Loader2,
  Radar,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { AISettings, LocalOllamaPresetStatus } from '../types';
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
  pydantic_gateway_endpoint: 'https://gateway.pydantic.dev/v1',
  openrouter_endpoint: 'https://gateway.pydantic.dev/v1',
  api_key: '',
  model_name: 'qwen3.5:9b',
  embedding_model: 'nomic-embed-text',
  temperature: 0.7,
  custom_instructions: '',
  system_fallback_available: false,
};

const LOCAL_OLLAMA_ENDPOINT_PRESETS: Array<{
  label: string;
  url: string;
  hint: string;
}> = [
  {
    label: 'Standard Localhost',
    url: 'http://localhost:11434',
    hint: 'Direct host execution (native backend + local Ollama)',
  },
  {
    label: 'IPv4 Loopback',
    url: 'http://127.0.0.1:11434',
    hint: 'Bypasses IPv6 ::1 resolution issues on localhost',
  },
  {
    label: 'Docker Host Internal',
    url: 'http://host.docker.internal:11434',
    hint: 'Backend in Docker connecting to host Ollama (Mac / Windows / Docker Desktop)',
  },
  {
    label: 'Linux Docker Bridge',
    url: 'http://172.17.0.1:11434',
    hint: 'Backend in Linux Docker connecting to host machine',
  },
  {
    label: 'Docker Compose Service',
    url: 'http://ollama:11434',
    hint: 'Ollama running as a sibling service in docker-compose',
  },
];

const OLLAMA_MODEL_PRESETS = [
  'qwen3.5:9b',
  'qwen2.5:7b',
  'llama3.1:8b',
  'mistral:7b',
  'deepseek-r1:8b',
];

const PYDANTIC_GATEWAY_MODEL_PRESETS = [
  { id: 'qwen3.5:9b', label: 'Qwen 3.5 9B (Ollama Cloud)' },
  { id: 'llama3.3:70b', label: 'Llama 3.3 70B (Ollama Cloud)' },
  { id: 'qwen2.5:72b', label: 'Qwen 2.5 72B' },
  { id: 'deepseek-r1:14b', label: 'DeepSeek R1 14B' },
  { id: 'gemma3:12b', label: 'Gemma 3 12B' },
];

type StatusMessage = { type: 'success' | 'error'; text: string };

export const Settings: React.FC<SettingsProps> = ({ onSettingsSaved }) => {
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [probingPresets, setProbingPresets] = useState(false);
  const [presetStatuses, setPresetStatuses] = useState<Record<string, LocalOllamaPresetStatus>>({});
  const [showApiKey, setShowApiKey] = useState(false);
  const [showGatewayHelpModal, setShowGatewayHelpModal] = useState(false);
  const [statusMsg, setStatusMsg] = useState<StatusMessage | null>(null);
  const [saving, setSaving] = useState(false);

  const getGatewayEndpoint = (s: AISettings) =>
    s.pydantic_gateway_endpoint ||
    s.openrouter_endpoint ||
    DEFAULT_SETTINGS.pydantic_gateway_endpoint ||
    'https://gateway.pydantic.dev/v1';

  const testConnection = async (targetSettings?: AISettings, probeLocal = false) => {
    const current = targetSettings || settings;
    const isLocalProvider = (current.provider || 'ollama') === 'ollama';
    const endpoint = isLocalProvider
      ? current.ollama_endpoint || DEFAULT_SETTINGS.ollama_endpoint
      : getGatewayEndpoint(current);

    setTesting(true);
    if (probeLocal) setProbingPresets(true);
    setStatusMsg(null);
    try {
      const response = await api.getAiHealth({
        provider: current.provider || 'ollama',
        endpoint,
        api_key: current.api_key || '',
        probe_presets: isLocalProvider && probeLocal,
      });

      if (typeof response.system_fallback_available === 'boolean') {
        setSettings((prev) => ({
          ...prev,
          system_fallback_available: response.system_fallback_available,
        }));
      }

      if (response.presets) {
        const map: Record<string, LocalOllamaPresetStatus> = {};
        for (const p of response.presets) {
          map[p.url.replace(/\/+$/, '')] = p;
        }
        setPresetStatuses(map);
      }

      if (!response.connected) {
        setAvailableModels([]);
        // If probing found a working local Ollama preset, offer or switch to it automatically
        if (isLocalProvider && response.recommended_endpoint) {
          const workingPreset = response.presets?.find(
            (p) => p.url.replace(/\/+$/, '') === response.recommended_endpoint?.replace(/\/+$/, '')
          );
          setSettings((prev) => ({
            ...prev,
            ollama_endpoint: response.recommended_endpoint || prev.ollama_endpoint,
          }));
          if (workingPreset?.models) {
            setAvailableModels(workingPreset.models);
          }
          setStatusMsg({
            type: 'success',
            text: `Primary endpoint (${endpoint}) was unreachable, but auto-detected Ollama at ${response.recommended_endpoint}! Click Save settings to keep this endpoint.`,
          });
          return;
        }

        const providerLabel = isLocalProvider ? 'Local Ollama' : 'Pydantic AI Gateway';
        const fallbackNote = response.system_fallback_available
          ? ' (System-level fallback LLM is active and will handle requests automatically.)'
          : '';
        setStatusMsg({
          type: 'error',
          text:
            (response.error ||
              `Could not connect to ${providerLabel}. Check the endpoint and credentials.`) +
            fallbackNote,
        });
        return;
      }

      setAvailableModels(response.models || []);
      setStatusMsg({
        type: 'success',
        text:
          response.message ||
          `${isLocalProvider ? 'Local Ollama' : 'Pydantic AI Gateway'} responded successfully${
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
            : `Could not connect to ${isLocalProvider ? 'Local Ollama' : 'Pydantic AI Gateway'}.`,
      });
    } finally {
      setTesting(false);
      setProbingPresets(false);
    }
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await api.getAiSettings();
        const normalizedProvider =
          data?.provider === 'openrouter' || data?.provider === 'pydantic_gateway'
            ? 'pydantic_gateway'
            : 'ollama';
        const gwUrl =
          data?.pydantic_gateway_endpoint ||
          (data?.openrouter_endpoint && !data.openrouter_endpoint.includes('openrouter.ai')
            ? data.openrouter_endpoint
            : DEFAULT_SETTINGS.pydantic_gateway_endpoint);
        const loaded: AISettings = {
          ...DEFAULT_SETTINGS,
          ...data,
          provider: normalizedProvider,
          pydantic_gateway_endpoint: gwUrl,
          openrouter_endpoint: gwUrl,
          temperature:
            typeof data?.temperature === 'number'
              ? data.temperature
              : DEFAULT_SETTINGS.temperature,
        };
        setSettings(loaded);
        await testConnection(loaded, false);
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

  const handleProviderChange = (provider: 'ollama' | 'pydantic_gateway') => {
    setAvailableModels([]);
    setStatusMsg(null);
    setSettings({
      ...settings,
      provider,
    });
  };

  const handleSelectOllamaPresetUrl = async (url: string) => {
    const updated: AISettings = {
      ...settings,
      provider: 'ollama',
      ollama_endpoint: url,
    };
    setSettings(updated);
    await testConnection(updated, false);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const gwUrl = getGatewayEndpoint(settings);
      const payload: AISettings = {
        ...settings,
        pydantic_gateway_endpoint: gwUrl,
        openrouter_endpoint: gwUrl,
      };
      const res = await api.updateAiSettings(payload);
      const updatedSettings: AISettings = {
        ...payload,
        system_fallback_available:
          typeof res?.system_fallback_available === 'boolean'
            ? res.system_fallback_available
            : settings.system_fallback_available,
      };
      setSettings(updatedSettings);
      onSettingsSaved(updatedSettings);
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
  const modelPresets = isOllama
    ? OLLAMA_MODEL_PRESETS.map((preset) => ({ id: preset, label: preset }))
    : PYDANTIC_GATEWAY_MODEL_PRESETS;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <SectionHeader
        title="Settings"
        description="Configure your personal Local Ollama instance or Pydantic AI Gateway connection for resume parsing, section enhancement, and job tailoring."
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
                    <span className="block text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                      Local Ollama
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">
                      Localhost, Docker bridge, or self-hosted Ollama
                    </span>
                  </span>
                  {isOllama && <Check className="ml-auto h-4 w-4 text-slate-500" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleProviderChange('pydantic_gateway')}
                  className={`settings-provider ${!isOllama ? 'settings-provider-active' : ''}`}
                >
                  <span className="settings-provider-icon"><Globe className="h-4 w-4" /></span>
                  <span className="min-w-0 text-left">
                    <span className="block text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                      Pydantic AI Gateway
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">
                      Managed gateway for Ollama Cloud & upstream keys
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
                  title={probingPresets ? 'Scanning local Ollama presets…' : 'Testing connection'}
                  description="Checking endpoint reachability and credentials…"
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

              <div className="mt-4 flex flex-col gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => testConnection(undefined, false)}
                  disabled={testing}
                >
                  {testing && !probingPresets ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Test connection
                </Button>

                {isOllama && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => testConnection(undefined, true)}
                    disabled={testing}
                  >
                    {probingPresets ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Radar className="h-3.5 w-3.5" />
                    )}
                    Auto-detect local Ollama URL
                  </Button>
                )}
              </div>
            </Panel>

            <div className="space-y-3 rounded border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex gap-3">
                <Server className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                      System-level fallback
                    </p>
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        settings.system_fallback_available
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                          : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                      }`}
                    >
                      {settings.system_fallback_available ? 'Configured' : 'Not set'}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    {settings.system_fallback_available
                      ? 'If your personal LLM settings are unconfigured or unreachable, ResumeForge automatically falls back to the server environment LLM. Server fallback keys are strictly hidden and never exposed via the API.'
                      : 'Each user can configure their own model below. Server admins can also set SYSTEM_LLM_API_KEY and SYSTEM_LLM_BASE_URL in environment variables as a hidden system-wide fallback.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5 lg:col-span-8">
            <Panel
              title={isOllama ? 'Local Ollama connection' : 'Pydantic AI Gateway connection'}
              icon={isOllama ? Cpu : Globe}
              action={
                !isOllama ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowGatewayHelpModal(true)}
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                    How to set up Pydantic Gateway
                  </Button>
                ) : undefined
              }
            >
              <div className="space-y-4">
                <Field
                  label={isOllama ? 'Ollama Base URL' : 'Pydantic Gateway Connection URL'}
                  hint={
                    isOllama
                      ? 'Select a preset below based on how your app and Ollama are running, or enter a custom URL.'
                      : 'Paste the gateway base URL / connection string from your Pydantic AI Gateway project.'
                  }
                >
                  <TextInput
                    type="url"
                    className="font-mono"
                    value={
                      isOllama
                        ? settings.ollama_endpoint
                        : getGatewayEndpoint(settings)
                    }
                    onChange={(event) =>
                      setSettings(
                        isOllama
                          ? { ...settings, ollama_endpoint: event.target.value }
                          : {
                              ...settings,
                              pydantic_gateway_endpoint: event.target.value,
                              openrouter_endpoint: event.target.value,
                            },
                      )
                    }
                    placeholder={
                      isOllama
                        ? DEFAULT_SETTINGS.ollama_endpoint
                        : DEFAULT_SETTINGS.pydantic_gateway_endpoint
                    }
                  />
                </Field>

                {isOllama && (
                  <div className="rounded border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Local Ollama Connection Presets
                      </span>
                      <button
                        type="button"
                        onClick={() => testConnection(undefined, true)}
                        disabled={testing}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                      >
                        <Radar className="h-3 w-3" />
                        Probe all presets
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {LOCAL_OLLAMA_ENDPOINT_PRESETS.map((preset) => {
                        const normalizedPreset = preset.url.replace(/\/+$/, '');
                        const isSelected =
                          (settings.ollama_endpoint || '').replace(/\/+$/, '') === normalizedPreset;
                        const status = presetStatuses[normalizedPreset];
                        return (
                          <button
                            key={preset.url}
                            type="button"
                            onClick={() => handleSelectOllamaPresetUrl(preset.url)}
                            className={`flex flex-col items-start rounded border p-2.5 text-left transition ${
                              isSelected
                                ? 'border-slate-900 bg-white shadow-xs dark:border-slate-200 dark:bg-slate-900'
                                : 'border-slate-200 bg-white/70 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-slate-700'
                            }`}
                          >
                            <div className="flex w-full items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                                {preset.label}
                              </span>
                              {status && (
                                <span
                                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                    status.connected
                                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                      : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                  }`}
                                >
                                  {status.connected ? 'Online' : 'Offline'}
                                </span>
                              )}
                            </div>
                            <code className="mt-1 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                              {preset.url}
                            </code>
                            <span className="mt-1 text-[10px] leading-snug text-slate-500">
                              {preset.hint}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <Field
                  label={isOllama ? 'API key (optional)' : 'Pydantic Gateway API Key'}
                  hint={
                    isOllama
                      ? 'Only needed when your Ollama reverse proxy requires authentication.'
                      : 'Enter your Pydantic AI Gateway key (or leave blank to use system fallback if configured).'
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
                        isOllama
                          ? 'Leave empty for standard local Ollama'
                          : 'pylf_v1_… or gateway bearer token'
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
                    <div className="mt-2 flex flex-wrap items-center gap-4">
                      <button
                        type="button"
                        onClick={() => setShowGatewayHelpModal(true)}
                        className="entry-link text-left"
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                        Step-by-step setup guide (Ollama Key + Pydantic Gateway)
                      </button>
                      <a
                        href="https://ollama.com/settings/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="entry-link"
                      >
                        Ollama API Keys <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </Field>
              </div>
            </Panel>

            <Panel title="Models" icon={Database}>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <Field
                    label="Generation model"
                    hint="Used for resume parsing, section studio refinement, and tailored LaTeX generation."
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
                        placeholder="qwen3.5:9b"
                      />
                    )}
                  </Field>

                  <div className="mt-3">
                    <p className="group-label mb-2">Model Presets</p>
                    <div className="flex flex-wrap gap-1.5">
                      {modelPresets.map((preset) => (
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
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Temperature</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Lower values keep generated content more deterministic.
                      </p>
                    </div>
                    <output className="min-w-10 rounded border border-slate-200 px-2 py-1 text-center font-mono text-xs text-slate-700 dark:border-slate-800 dark:text-slate-200">
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
                    placeholder="Emphasize measurable outcomes, domain-specific credentials, and clear action verbs. Keep bullets concise."
                  />
                </Field>
              </div>
            </Panel>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500">
            Saving applies this provider and model to your account for future parsing and tailoring operations.
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

      {showGatewayHelpModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pydantic-gateway-guide-title"
        >
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <h2
                  id="pydantic-gateway-guide-title"
                  className="text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  How to Set Up Pydantic AI Gateway with Ollama
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Follow these 3 steps to route your LLM calls through your own Pydantic AI Gateway and Ollama account.
                </p>
              </div>
              <IconButton
                type="button"
                onClick={() => setShowGatewayHelpModal(false)}
                aria-label="Close setup guide"
              >
                <X className="h-4 w-4" />
              </IconButton>
            </div>

            <div className="mt-5 space-y-5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <div className="rounded border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  1. Create an Ollama Account & Generate an API Key
                </p>
                <ol className="mt-2 list-decimal space-y-1.5 pl-4">
                  <li>
                    Sign in or create a free account at{' '}
                    <a
                      href="https://ollama.com"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline"
                    >
                      ollama.com
                    </a>
                    .
                  </li>
                  <li>
                    Navigate to{' '}
                    <a
                      href="https://ollama.com/settings/keys"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline"
                    >
                      ollama.com/settings/keys
                    </a>{' '}
                    and click <strong>Add API Key</strong>.
                  </li>
                  <li>
                    Copy your generated Ollama API key — you will add this as an upstream provider credential inside Pydantic AI Gateway.
                  </li>
                </ol>
              </div>

              <div className="rounded border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  2. Configure a Route in Pydantic AI Gateway
                </p>
                <ol className="mt-2 list-decimal space-y-1.5 pl-4">
                  <li>
                    Open your{' '}
                    <a
                      href="https://logfire.pydantic.dev"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline"
                    >
                      Pydantic Logfire / Pydantic AI Gateway dashboard
                    </a>{' '}
                    and create or select a project.
                  </li>
                  <li>
                    Go to <strong>AI Gateway / Upstream Providers</strong>, add a new upstream provider for <strong>Ollama</strong> (or OpenAI-compatible Ollama endpoint <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono dark:bg-slate-800">https://ollama.com/v1</code>), and paste your Ollama API key there.
                  </li>
                  <li>
                    Create a <strong>Gateway API Key</strong> for your route and copy the <strong>Gateway Connection URL / Base URL</strong> (for example <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono dark:bg-slate-800">https://gateway.pydantic.dev/v1</code> or your custom project proxy URL).
                  </li>
                </ol>
              </div>

              <div className="rounded border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  3. Connect Your Gateway in ResumeForge
                </p>
                <ol className="mt-2 list-decimal space-y-1.5 pl-4">
                  <li>
                    Paste the <strong>Pydantic Gateway Connection URL</strong> into the <strong>Pydantic Gateway Connection URL</strong> field on this page.
                  </li>
                  <li>
                    Paste your <strong>Pydantic Gateway API Key</strong> into the <strong>Pydantic Gateway API Key</strong> field.
                  </li>
                  <li>
                    Enter or select the upstream model name (such as <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono dark:bg-slate-800">qwen3.5:9b</code> or <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono dark:bg-slate-800">llama3.3:70b</code>), click <strong>Test connection</strong>, and click <strong>Save settings</strong>.
                  </li>
                </ol>
              </div>
            </div>

            <div className="mt-6 flex justify-end border-t border-slate-200 pt-4 dark:border-slate-800">
              <Button
                type="button"
                onClick={() => setShowGatewayHelpModal(false)}
              >
                Got it
              </Button>
            </div>
          </div>
        </div>
      )}
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
      <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
    </div>
  </div>
);
