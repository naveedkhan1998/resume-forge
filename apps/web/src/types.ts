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

export interface AISettings {
  ollama_endpoint: string;
  model_name: string;
  embedding_model: string;
  temperature: number;
  custom_instructions?: string;
}

export interface TailoredDocument {
  id: number;
  doc_type: 'resume' | 'cover_letter';
  version: number;
  latex_source: string;
  tailoring_rationale?: string;
  created_at: string;
}

export interface JobApplication {
  id: number;
  company_name: string;
  job_title: string;
  job_url?: string;
  raw_description?: string;
  status: 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected';
  match_score?: number | null;
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
  certifications?: any[];
}
