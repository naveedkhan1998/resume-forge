import { MasterContext, Profile, Experience, Education, Skill, Project, JobApplication, AISettings } from '../types';

const API_BASE = '/api';

export const api = {
  // AI Health & Settings
  async getAiHealth(endpoint?: string) {
    const query = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : '';
    const res = await fetch(`${API_BASE}/ai/health${query}`);
    return res.json();
  },

  async getAiSettings(): Promise<AISettings> {
    const res = await fetch(`${API_BASE}/ai/settings`);
    return res.json();
  },

  async updateAiSettings(data: AISettings) {
    const res = await fetch(`${API_BASE}/ai/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
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
    return res.json();
  },

  // Master Context
  async getMasterContext(): Promise<MasterContext> {
    const res = await fetch(`${API_BASE}/master/all`);
    return res.json();
  },

  async updateProfile(profile: Profile) {
    const res = await fetch(`${API_BASE}/master/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    return res.json();
  },

  async createExperience(exp: Experience) {
    const res = await fetch(`${API_BASE}/master/experiences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exp),
    });
    return res.json();
  },

  async updateExperience(id: number, exp: Experience) {
    const res = await fetch(`${API_BASE}/master/experiences/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exp),
    });
    return res.json();
  },

  async deleteExperience(id: number) {
    const res = await fetch(`${API_BASE}/master/experiences/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  async createEducation(edu: Education) {
    const res = await fetch(`${API_BASE}/master/educations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edu),
    });
    return res.json();
  },

  async deleteEducation(id: number) {
    const res = await fetch(`${API_BASE}/master/educations/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  async createSkill(skill: Skill) {
    const res = await fetch(`${API_BASE}/master/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(skill),
    });
    return res.json();
  },

  async deleteSkill(id: number) {
    const res = await fetch(`${API_BASE}/master/skills/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  async createProject(proj: Project) {
    const res = await fetch(`${API_BASE}/master/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proj),
    });
    return res.json();
  },

  async deleteProject(id: number) {
    const res = await fetch(`${API_BASE}/master/projects/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  // Upload Resume
  async uploadResume(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/resumes/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || 'Upload failed');
    }
    return res.json();
  },

  // Job Applications
  async getJobs(): Promise<JobApplication[]> {
    const res = await fetch(`${API_BASE}/jobs`);
    return res.json();
  },

  async createJob(job: { company_name: string; job_title: string; job_url?: string; raw_description: string; notes?: string }) {
    const res = await fetch(`${API_BASE}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job),
    });
    return res.json();
  },

  async getJobDetail(id: number): Promise<JobApplication> {
    const res = await fetch(`${API_BASE}/jobs/${id}`);
    return res.json();
  },

  async updateJob(id: number, data: { status?: string; notes?: string }) {
    const res = await fetch(`${API_BASE}/jobs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async deleteJob(id: number) {
    const res = await fetch(`${API_BASE}/jobs/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  async tailorJob(jobId: number) {
    const res = await fetch(`${API_BASE}/jobs/${jobId}/tailor`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Tailoring failed' }));
      throw new Error(err.error || 'Tailoring failed');
    }
    return res.json();
  },

  async updateDocumentLatex(docId: number, latex_source: string) {
    const res = await fetch(`${API_BASE}/documents/${docId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latex_source }),
    });
    return res.json();
  },
};
