import {
  MasterContext,
  Profile,
  Experience,
  Education,
  Skill,
  Project,
  Certification,
  JobApplication,
  AISettings,
  ResumeUploadResult,
  LocalOllamaPresetStatus,
  DeviceSessionStatus,
} from '../types';

const DEFAULT_API_ORIGIN = 'http://localhost:8000';

export function resolveApiBaseUrl(): string {
  const env = import.meta.env;
  const rawUrl = (
    env.VITE_API_URL ||
    env.VITE_API_BASE_URL ||
    (env as Record<string, any>).API_URL ||
    DEFAULT_API_ORIGIN
  )
    .toString()
    .trim()
    .replace(/\/+$/, '');

  if (!rawUrl) {
    return `${DEFAULT_API_ORIGIN}/api`;
  }
  return rawUrl.endsWith('/api') ? rawUrl : `${rawUrl}/api`;
}

const API_BASE = resolveApiBaseUrl();
const SESSION_TOKEN_STORAGE_KEY = 'resumeforge_session_token';
const SESSION_COOKIE_NAME = 'resumeforge_session';

function generateClientToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `rf_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  const randomPart = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('');
  return `rf_${randomPart}`;
}

function syncSessionCookie(token: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; path=/; max-age=31536000; SameSite=Lax`;
}

export function getStoredSessionToken(): string {
  if (typeof window === 'undefined') return '';
  let token = '';
  try {
    token = (localStorage.getItem(SESSION_TOKEN_STORAGE_KEY) || '').trim();
  } catch {
    token = '';
  }
  if (!token || token.length < 16) {
    token = generateClientToken();
    setStoredSessionToken(token);
  } else {
    syncSessionCookie(token);
  }
  return token;
}

export function setStoredSessionToken(token: string): void {
  const cleaned = token.trim();
  if (!cleaned) return;
  try {
    localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, cleaned);
  } catch {
    // Ignore storage errors in restricted contexts
  }
  syncSessionCookie(cleaned);
}

function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getStoredSessionToken();
  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set('X-Session-Token', token);
  }
  return fetch(url, {
    ...init,
    headers,
  });
}

async function handleResponse<T = any>(res: Response): Promise<T> {
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    // Plain text or HTML error (such as a traceback)
    if (!res.ok) {
      if (text.includes('Traceback')) {
        const lines = text.trim().split('\n');
        const lastLine = lines[lines.length - 1] || 'Server error occurred';
        throw new Error(lastLine);
      }
      throw new Error(`Server returned HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return text as unknown as T;
  }

  if (!res.ok) {
    const errorMsg = data?.error || data?.message || data?.detail || `Error (HTTP ${res.status})`;
    throw new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
  }

  return data;
}

export const api = {
  // API Cold-Start & Readiness Health Check
  async checkHealth(): Promise<{ status: string; timestamp?: string }> {
    const res = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      cache: 'no-store',
    });
    return handleResponse<{ status: string; timestamp?: string }>(res);
  },

  async waitForHealth(options?: {
    timeoutMs?: number;
    intervalMs?: number;
    perAttemptTimeoutMs?: number;
    onWaiting?: (attempt: number, elapsedMs: number) => void;
  }): Promise<{ status: string; timestamp?: string }> {
    const timeoutMs = options?.timeoutMs ?? 90000;
    const intervalMs = options?.intervalMs ?? 2000;
    const perAttemptTimeoutMs = options?.perAttemptTimeoutMs ?? 15000;
    const startTime = Date.now();
    let attempt = 0;

    while (true) {
      attempt += 1;
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller
        ? setTimeout(() => controller.abort(), perAttemptTimeoutMs)
        : null;
      try {
        const res = await fetch(`${API_BASE}/health`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller?.signal,
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({ status: 'ok' }));
          return data;
        }
      } catch {
        // Ignore network/timeout errors while free-tier server wakes up from cold start
      } finally {
        if (timer) clearTimeout(timer);
      }

      const elapsedMs = Date.now() - startTime;
      if (elapsedMs >= timeoutMs) {
        throw new Error('API server is taking too long to respond. Please retry.');
      }

      if (options?.onWaiting) {
        options.onWaiting(attempt, elapsedMs);
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  },

  // Device Session Management
  getStoredSessionToken,
  setStoredSessionToken,

  async initSession(): Promise<DeviceSessionStatus> {
    const token = getStoredSessionToken();
    const res = await apiFetch(`${API_BASE}/session/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const status = await handleResponse<DeviceSessionStatus>(res);
    if (status?.token) {
      setStoredSessionToken(status.token);
    }
    return status;
  },

  async getSessionStatus(): Promise<DeviceSessionStatus> {
    const res = await apiFetch(`${API_BASE}/session/status`);
    const status = await handleResponse<DeviceSessionStatus>(res);
    if (status?.token) {
      setStoredSessionToken(status.token);
    }
    return status;
  },

  async restoreSession(token: string): Promise<DeviceSessionStatus> {
    const res = await apiFetch(`${API_BASE}/session/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token.trim() }),
    });
    const status = await handleResponse<DeviceSessionStatus>(res);
    if (status?.token) {
      setStoredSessionToken(status.token);
    }
    return status;
  },

  async createNewSession(): Promise<DeviceSessionStatus> {
    const res = await apiFetch(`${API_BASE}/session/new`, {
      method: 'POST',
    });
    const status = await handleResponse<DeviceSessionStatus>(res);
    if (status?.token) {
      setStoredSessionToken(status.token);
    }
    return status;
  },

  // AI Health & Settings
  async getAiHealth(options?: string | { provider?: string; endpoint?: string; api_key?: string; probe_presets?: boolean }) {
    let query = '';
    if (typeof options === 'string') {
      query = options ? `?endpoint=${encodeURIComponent(options)}` : '';
    } else if (options && typeof options === 'object') {
      const params = new URLSearchParams();
      if (options.provider) params.append('provider', options.provider);
      if (options.endpoint) params.append('endpoint', options.endpoint);
      if (options.api_key) params.append('api_key', options.api_key);
      if (options.probe_presets) params.append('probe_presets', 'true');
      const str = params.toString();
      if (str) query = `?${str}`;
    }
    const res = await apiFetch(`${API_BASE}/ai/health${query}`);
    return handleResponse<{
      connected: boolean;
      endpoint?: string;
      models?: string[];
      error?: string;
      message?: string;
      presets?: LocalOllamaPresetStatus[];
      recommended_endpoint?: string | null;
      system_fallback_available?: boolean;
      system_fallback_model?: string | null;
      session?: DeviceSessionStatus;
    }>(res);
  },

  async getAiSettings(): Promise<AISettings> {
    const res = await apiFetch(`${API_BASE}/ai/settings`);
    return handleResponse<AISettings>(res);
  },

  async updateAiSettings(data: AISettings) {
    const res = await apiFetch(`${API_BASE}/ai/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async refineSection(
    sectionType: string,
    currentContent: unknown,
    instruction: string,
    conversation: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    sectionContext?: Record<string, unknown>,
  ) {
    const res = await apiFetch(`${API_BASE}/ai/refine-section`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        section_type: sectionType,
        current_content: currentContent,
        instruction,
        conversation,
        section_context: sectionContext,
      }),
    });
    return handleResponse(res);
  },

  // Master Context
  async getMasterContext(): Promise<MasterContext> {
    const res = await apiFetch(`${API_BASE}/master/all`);
    return handleResponse<MasterContext>(res);
  },

  async resetAllData(options: {
    confirm: string;
    delete_applications?: boolean;
    delete_ai_settings?: boolean;
  }) {
    const res = await apiFetch(`${API_BASE}/master/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        delete_applications: true,
        delete_ai_settings: false,
        ...options,
      }),
    });
    return handleResponse(res);
  },

  async updateProfile(profile: Profile) {
    const res = await apiFetch(`${API_BASE}/master/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    return handleResponse(res);
  },

  async createExperience(exp: Experience) {
    const res = await apiFetch(`${API_BASE}/master/experiences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exp),
    });
    return handleResponse(res);
  },

  async updateExperience(id: number, exp: Experience) {
    const res = await apiFetch(`${API_BASE}/master/experiences/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exp),
    });
    return handleResponse(res);
  },

  async deleteExperience(id: number) {
    const res = await apiFetch(`${API_BASE}/master/experiences/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(res);
  },

  async createEducation(edu: Education) {
    const res = await apiFetch(`${API_BASE}/master/educations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edu),
    });
    return handleResponse(res);
  },

  async updateEducation(id: number, edu: Education) {
    const res = await apiFetch(`${API_BASE}/master/educations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edu),
    });
    return handleResponse(res);
  },

  async deleteEducation(id: number) {
    const res = await apiFetch(`${API_BASE}/master/educations/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(res);
  },

  async createSkill(skill: Skill) {
    const res = await apiFetch(`${API_BASE}/master/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(skill),
    });
    return handleResponse(res);
  },

  async deleteSkill(id: number) {
    const res = await apiFetch(`${API_BASE}/master/skills/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(res);
  },

  async replaceSkills(skills: Skill[]) {
    const res = await apiFetch(`${API_BASE}/master/skills`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(skills),
    });
    return handleResponse(res);
  },

  async createCertification(cert: Certification) {
    const res = await apiFetch(`${API_BASE}/master/certifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cert),
    });
    return handleResponse(res);
  },

  async updateCertification(id: number, cert: Certification) {
    const res = await apiFetch(`${API_BASE}/master/certifications/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cert),
    });
    return handleResponse(res);
  },

  async deleteCertification(id: number) {
    const res = await apiFetch(`${API_BASE}/master/certifications/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(res);
  },

  async replaceCertifications(certifications: Certification[]) {
    const res = await apiFetch(`${API_BASE}/master/certifications`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(certifications),
    });
    return handleResponse(res);
  },

  async createProject(proj: Project) {
    const res = await apiFetch(`${API_BASE}/master/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proj),
    });
    return handleResponse(res);
  },

  async updateProject(id: number, proj: Project) {
    const res = await apiFetch(`${API_BASE}/master/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proj),
    });
    return handleResponse(res);
  },

  async deleteProject(id: number) {
    const res = await apiFetch(`${API_BASE}/master/projects/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(res);
  },

  // Upload & Parse Resume
  async uploadResume(file: File, mode: 'merge' | 'replace' = 'merge'): Promise<ResumeUploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);
    const res = await apiFetch(`${API_BASE}/resumes/upload`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<ResumeUploadResult>(res);
  },

  async parseResumeText(raw_text: string, mode: 'merge' | 'replace' = 'merge'): Promise<ResumeUploadResult> {
    const res = await apiFetch(`${API_BASE}/resumes/parse-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_text, mode }),
    });
    return handleResponse<ResumeUploadResult>(res);
  },

  // Job Applications
  async getJobs(): Promise<JobApplication[]> {
    const res = await apiFetch(`${API_BASE}/jobs`);
    return handleResponse<JobApplication[]>(res);
  },

  async createJob(job: { company_name: string; job_title: string; job_url?: string; raw_description?: string; notes?: string }) {
    const res = await apiFetch(`${API_BASE}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job),
    });
    return handleResponse(res);
  },

  async getJobDetail(id: number): Promise<JobApplication> {
    const res = await apiFetch(`${API_BASE}/jobs/${id}`);
    return handleResponse<JobApplication>(res);
  },

  async updateJob(id: number, data: { status?: string; notes?: string }) {
    const res = await apiFetch(`${API_BASE}/jobs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async deleteJob(id: number) {
    const res = await apiFetch(`${API_BASE}/jobs/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(res);
  },

  async tailorJob(jobId: number) {
    const res = await apiFetch(`${API_BASE}/jobs/${jobId}/tailor`, {
      method: 'POST',
    });
    return handleResponse(res);
  },

  async updateDocumentLatex(docId: number, latex_source: string) {
    const res = await apiFetch(`${API_BASE}/documents/${docId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latex_source }),
    });
    return handleResponse(res);
  },

  async downloadDocumentLatex(docId: number): Promise<Blob> {
    const res = await apiFetch(`${API_BASE}/documents/${docId}/export-latex`);
    if (!res.ok) {
      await handleResponse(res);
      throw new Error('Could not download LaTeX.');
    }
    return res.blob();
  },

  async downloadDocumentZip(docId: number): Promise<Blob> {
    const res = await apiFetch(`${API_BASE}/documents/${docId}/export-zip`);
    if (!res.ok) {
      await handleResponse(res);
      throw new Error('Could not export Overleaf ZIP.');
    }
    return res.blob();
  },

  async downloadCustomOverleafZip(latex_source: string, company_name: string, doc_type: string): Promise<Blob> {
    const res = await apiFetch(`${API_BASE}/documents/export-zip-custom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latex_source, company_name, doc_type }),
    });
    if (!res.ok) {
      await handleResponse(res);
      throw new Error('Could not export Overleaf ZIP.');
    }
    return res.blob();
  },

  async getClassFile(): Promise<Blob> {
    const res = await apiFetch(`${API_BASE}/latex/resumeforge.cls`);
    if (!res.ok) {
      throw new Error('Could not download resumeforge.cls.');
    }
    return res.blob();
  },

  async getClassFileContent(): Promise<string> {
    const res = await apiFetch(`${API_BASE}/latex/cls-content`);
    const data = await handleResponse<{ content: string }>(res);
    return data.content;
  },

  async reviewDocumentSections(docId: number, latex_source?: string): Promise<{ status: string; latex_source: string }> {
    const res = await apiFetch(`${API_BASE}/documents/${docId}/review-sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latex_source }),
    });
    return handleResponse<{ status: string; latex_source: string }>(res);
  },

  async reviewCustomLatex(latex_source: string): Promise<{ status: string; latex_source: string }> {
    const res = await apiFetch(`${API_BASE}/documents/review-latex`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latex_source }),
    });
    return handleResponse<{ status: string; latex_source: string }>(res);
  },

  async aiEditDocumentLatex(
    docId: number,
    instruction: string,
    options?: { latex_source?: string; target_section?: string },
  ): Promise<{
    status: string;
    latex_source: string;
    changes_summary: string;
    keyword_coverage?: any;
  }> {
    const res = await apiFetch(`${API_BASE}/documents/${docId}/ai-edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction,
        latex_source: options?.latex_source,
        target_section: options?.target_section || 'all',
      }),
    });
    return handleResponse(res);
  },

  async aiEditCustomLatex(
    latex_source: string,
    instruction: string,
    target_section = 'all',
  ): Promise<{ status: string; latex_source: string; changes_summary: string }> {
    const res = await apiFetch(`${API_BASE}/documents/ai-edit-latex`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latex_source, instruction, target_section }),
    });
    return handleResponse(res);
  },
};



