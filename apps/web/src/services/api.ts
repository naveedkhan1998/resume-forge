import { MasterContext, Profile, Experience, Education, Skill, Project, Certification, JobApplication, AISettings, ResumeUploadResult, LocalOllamaPresetStatus } from '../types';

const API_BASE = '/api';

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
    const res = await fetch(`${API_BASE}/ai/health${query}`);
    return handleResponse<{
      connected: boolean;
      models?: string[];
      error?: string;
      message?: string;
      presets?: LocalOllamaPresetStatus[];
      recommended_endpoint?: string | null;
      system_fallback_available?: boolean;
    }>(res);
  },

  async getAiSettings(): Promise<AISettings> {
    const res = await fetch(`${API_BASE}/ai/settings`);
    return handleResponse<AISettings>(res);
  },

  async updateAiSettings(data: AISettings) {
    const res = await fetch(`${API_BASE}/ai/settings`, {
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
    const res = await fetch(`${API_BASE}/ai/refine-section`, {
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
    const res = await fetch(`${API_BASE}/master/all`);
    return handleResponse<MasterContext>(res);
  },

  async resetAllData(options: {
    confirm: string;
    delete_applications?: boolean;
    delete_ai_settings?: boolean;
  }) {
    const res = await fetch(`${API_BASE}/master/reset`, {
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
    const res = await fetch(`${API_BASE}/master/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    return handleResponse(res);
  },

  async createExperience(exp: Experience) {
    const res = await fetch(`${API_BASE}/master/experiences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exp),
    });
    return handleResponse(res);
  },

  async updateExperience(id: number, exp: Experience) {
    const res = await fetch(`${API_BASE}/master/experiences/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exp),
    });
    return handleResponse(res);
  },

  async deleteExperience(id: number) {
    const res = await fetch(`${API_BASE}/master/experiences/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(res);
  },

  async createEducation(edu: Education) {
    const res = await fetch(`${API_BASE}/master/educations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edu),
    });
    return handleResponse(res);
  },

  async updateEducation(id: number, edu: Education) {
    const res = await fetch(`${API_BASE}/master/educations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edu),
    });
    return handleResponse(res);
  },

  async deleteEducation(id: number) {
    const res = await fetch(`${API_BASE}/master/educations/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(res);
  },

  async createSkill(skill: Skill) {
    const res = await fetch(`${API_BASE}/master/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(skill),
    });
    return handleResponse(res);
  },

  async deleteSkill(id: number) {
    const res = await fetch(`${API_BASE}/master/skills/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(res);
  },

  async replaceSkills(skills: Skill[]) {
    const res = await fetch(`${API_BASE}/master/skills`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(skills),
    });
    return handleResponse(res);
  },

  async createCertification(cert: Certification) {
    const res = await fetch(`${API_BASE}/master/certifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cert),
    });
    return handleResponse(res);
  },

  async updateCertification(id: number, cert: Certification) {
    const res = await fetch(`${API_BASE}/master/certifications/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cert),
    });
    return handleResponse(res);
  },

  async deleteCertification(id: number) {
    const res = await fetch(`${API_BASE}/master/certifications/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(res);
  },

  async replaceCertifications(certifications: Certification[]) {
    const res = await fetch(`${API_BASE}/master/certifications`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(certifications),
    });
    return handleResponse(res);
  },

  async createProject(proj: Project) {
    const res = await fetch(`${API_BASE}/master/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proj),
    });
    return handleResponse(res);
  },

  async updateProject(id: number, proj: Project) {
    const res = await fetch(`${API_BASE}/master/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proj),
    });
    return handleResponse(res);
  },

  async deleteProject(id: number) {
    const res = await fetch(`${API_BASE}/master/projects/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(res);
  },

  // Upload & Parse Resume
  async uploadResume(file: File, mode: 'merge' | 'replace' = 'merge'): Promise<ResumeUploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);
    const res = await fetch(`${API_BASE}/resumes/upload`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<ResumeUploadResult>(res);
  },

  async parseResumeText(raw_text: string, mode: 'merge' | 'replace' = 'merge'): Promise<ResumeUploadResult> {
    const res = await fetch(`${API_BASE}/resumes/parse-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_text, mode }),
    });
    return handleResponse<ResumeUploadResult>(res);
  },

  // Job Applications
  async getJobs(): Promise<JobApplication[]> {
    const res = await fetch(`${API_BASE}/jobs`);
    return handleResponse<JobApplication[]>(res);
  },

  async createJob(job: { company_name: string; job_title: string; job_url?: string; raw_description?: string; notes?: string }) {
    const res = await fetch(`${API_BASE}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job),
    });
    return handleResponse(res);
  },

  async getJobDetail(id: number): Promise<JobApplication> {
    const res = await fetch(`${API_BASE}/jobs/${id}`);
    return handleResponse<JobApplication>(res);
  },

  async updateJob(id: number, data: { status?: string; notes?: string }) {
    const res = await fetch(`${API_BASE}/jobs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async deleteJob(id: number) {
    const res = await fetch(`${API_BASE}/jobs/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(res);
  },

  async tailorJob(jobId: number) {
    const res = await fetch(`${API_BASE}/jobs/${jobId}/tailor`, {
      method: 'POST',
    });
    return handleResponse(res);
  },

  async updateDocumentLatex(docId: number, latex_source: string) {
    const res = await fetch(`${API_BASE}/documents/${docId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latex_source }),
    });
    return handleResponse(res);
  },

  async downloadDocumentLatex(docId: number): Promise<Blob> {
    const res = await fetch(`${API_BASE}/documents/${docId}/export-latex`);
    if (!res.ok) {
      await handleResponse(res);
      throw new Error('Could not download LaTeX.');
    }
    return res.blob();
  },

  async downloadDocumentZip(docId: number): Promise<Blob> {
    const res = await fetch(`${API_BASE}/documents/${docId}/export-zip`);
    if (!res.ok) {
      await handleResponse(res);
      throw new Error('Could not export Overleaf ZIP.');
    }
    return res.blob();
  },

  async downloadCustomOverleafZip(latex_source: string, company_name: string, doc_type: string): Promise<Blob> {
    const res = await fetch(`${API_BASE}/documents/export-zip-custom`, {
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
    const res = await fetch(`${API_BASE}/latex/resumeforge.cls`);
    if (!res.ok) {
      throw new Error('Could not download resumeforge.cls.');
    }
    return res.blob();
  },

  async getClassFileContent(): Promise<string> {
    const res = await fetch(`${API_BASE}/latex/cls-content`);
    const data = await handleResponse<{ content: string }>(res);
    return data.content;
  },

  async reviewDocumentSections(docId: number, latex_source?: string): Promise<{ status: string; latex_source: string }> {
    const res = await fetch(`${API_BASE}/documents/${docId}/review-sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latex_source }),
    });
    return handleResponse<{ status: string; latex_source: string }>(res);
  },

  async reviewCustomLatex(latex_source: string): Promise<{ status: string; latex_source: string }> {
    const res = await fetch(`${API_BASE}/documents/review-latex`, {
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
    const res = await fetch(`${API_BASE}/documents/${docId}/ai-edit`, {
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
    const res = await fetch(`${API_BASE}/documents/ai-edit-latex`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latex_source, instruction, target_section }),
    });
    return handleResponse(res);
  },
};


