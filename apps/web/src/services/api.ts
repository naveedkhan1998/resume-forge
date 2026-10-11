import { MasterContext, Profile, Experience, Education, Skill, Project, JobApplication, AISettings } from '../types';

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
  async getAiHealth(endpoint?: string) {
    const query = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : '';
    const res = await fetch(`${API_BASE}/ai/health${query}`);
    return handleResponse(res);
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

  async refineSection(sectionType: string, currentContent: any, instruction: string) {
    const res = await fetch(`${API_BASE}/ai/refine-section`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        section_type: sectionType,
        current_content: currentContent,
        instruction,
      }),
    });
    return handleResponse(res);
  },

  // Master Context
  async getMasterContext(): Promise<MasterContext> {
    const res = await fetch(`${API_BASE}/master/all`);
    return handleResponse<MasterContext>(res);
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

  async createProject(proj: Project) {
    const res = await fetch(`${API_BASE}/master/projects`, {
      method: 'POST',
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

  // Upload Resume
  async uploadResume(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/resumes/upload`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse(res);
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
};
