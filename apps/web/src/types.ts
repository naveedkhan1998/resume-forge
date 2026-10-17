export interface Profile {
  full_name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  website_url: string;
  linkedin_url: string;
  github_url: string;
  summary: string;
  raw_resume_text?: string;
}

export interface DeviceSessionStatus {
  token: string;
  username: string;
  resume_uploaded: boolean;
  llm_unlocked: boolean;
  llm_calls_used: number;
  llm_calls_limit: number;
  llm_quota_remaining: number | null;
  using_custom_ai: boolean;
  ai_provider_mode?: 'local_ollama' | 'custom_key' | 'system_fallback';
}

export interface ParsedResumeSummary {
  name?: string;
  profile?: Partial<Profile>;
  experiences_count?: number;
  educations_count?: number;
  skills_count?: number;
  projects_count?: number;
  certifications_count?: number;
}

export interface ResumeUploadResult {
  status: string;
  message: string;
  mode?: 'merge' | 'replace';
  markdown_text?: string;
  parsed_summary?: ParsedResumeSummary;
  session?: DeviceSessionStatus;
}

export interface Experience {
  id?: number;
  company: string;
  role: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  is_current?: boolean;
  description?: string;
  bullet_points: string[];
  technologies: string[];
  order?: number;
}

export interface Education {
  id?: number;
  institution: string;
  degree: string;
  field_of_study?: string;
  start_date?: string;
  end_date?: string;
  gpa?: string;
  highlights: string[];
  order?: number;
}

export interface Skill {
  id?: number;
  category: string;
  name: string;
  proficiency?: string;
  order?: number;
}

export interface Certification {
  id?: number;
  name: string;
  issuer?: string;
  issue_date?: string;
  credential_url?: string;
  order?: number;
}

export interface Project {
  id?: number;
  title: string;
  subtitle?: string;
  role?: string;
  repo_url?: string;
  live_url?: string;
  start_date?: string;
  end_date?: string;
  bullet_points: string[];
  technologies: string[];
  order?: number;
}

export interface LocalOllamaPresetStatus {
  label: string;
  url: string;
  hint?: string;
  connected: boolean;
  models?: string[];
  error?: string;
}

export interface AISettings {
  provider?: 'ollama' | 'pydantic_gateway' | 'openrouter';
  ollama_endpoint: string;
  pydantic_gateway_endpoint?: string;
  openrouter_endpoint?: string;
  api_key?: string;
  model_name: string;
  embedding_model?: string;
  temperature: number;
  custom_instructions?: string;
  system_fallback_available?: boolean;
  system_fallback_model?: string | null;
}

export interface TailoredDocument {
  id: number;
  doc_type: 'resume' | 'cover_letter';
  version: number;
  latex_source: string;
  tailoring_rationale?: string;
  created_at: string;
}

export interface KeywordCoverage {
  matched_keywords: string[];
  missing_in_resume_but_in_profile: string[];
  missing_keywords: string[];
  coverage_pct: number;
}

export interface JobApplication {
  id: number;
  company_name: string;
  job_title: string;
  job_url?: string;
  raw_description?: string;
  status: 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected';
  match_score?: number | null;
  extracted_keywords?: string[];
  keyword_coverage?: KeywordCoverage | null;
  notes?: string;
  created_at: string;
  documents_count?: number;
  documents?: TailoredDocument[];
}

export interface MasterContext {
  profile: Profile;
  experiences: Experience[];
  educations: Education[];
  skills: Skill[];
  projects: Project[];
  certifications: Certification[];
}

