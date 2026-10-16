import React, { useState, useEffect, useMemo } from 'react';
import {
  MasterContext,
  Profile,
  Experience,
  Education,
  Skill,
  Project,
  Certification,
} from '../types';
import { api } from '../services/api';
import { diffLines } from '../utils/diff';
import { SectionHeader } from './ui/section-header';
import { Button } from './ui/button';
import { Panel, EmptyState, RefineButton, IconButton, RowActions } from './ui/panel';
import { Field, TextInput, TextArea } from './ui/field';
import {
  User,
  Briefcase,
  GraduationCap,
  Wrench,
  FolderGit2,
  Wand2,
  Plus,
  Trash2,
  Check,
  X,
  Loader2,
  Award,
  Send,
  RotateCcw,
  AlertTriangle,
  ListChecks,
  GitCompare,
  ExternalLink,
  GitBranch,
} from 'lucide-react';

interface MasterProfileProps {
  context: MasterContext;
  onRefresh: () => void;
  activeModel: string;
}

type RefineTargetKind = 'summary' | 'experience' | 'project' | 'education' | 'skills' | 'certifications';
type RefineMessage = { role: 'user' | 'assistant'; content: string };

const contentItems = (content: unknown): string[] => {
  if (typeof content === 'string') return content ? [content] : [];
  if (!Array.isArray(content)) return [];
  return content.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      if (record.name && record.category) return `${record.name} · ${record.category}`;
      if (record.name) return `${record.name}${record.issuer ? ` — ${record.issuer}` : ''}`;
    }
    return JSON.stringify(item);
  });
};

export const MasterProfile: React.FC<MasterProfileProps> = ({
  context,
  onRefresh,
  activeModel,
}) => {
  const [profile, setProfile] = useState<Profile>(context.profile);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Synchronize local form state whenever context.profile updates from API/Upload
  useEffect(() => {
    if (context.profile) {
      setProfile(context.profile);
    }
  }, [context.profile]);

  // AI Refine Modal state
  const [refineModalOpen, setRefineModalOpen] = useState(false);
  const [refineSectionType, setRefineSectionType] = useState('experience');
  const [refineTargetId, setRefineTargetId] = useState<number | null>(null);
  const [refineTargetKind, setRefineTargetKind] = useState<RefineTargetKind>('experience');
  const [refineTargetLabel, setRefineTargetLabel] = useState('Experience');
  const [refineSectionContext, setRefineSectionContext] = useState<Record<string, unknown> | undefined>(undefined);
  const [refineOriginalContent, setRefineOriginalContent] = useState<unknown>(null);
  const [refineDraftContent, setRefineDraftContent] = useState<unknown>(null);
  const [refineOriginalTech, setRefineOriginalTech] = useState<string[]>([]);
  const [refineProposedTech, setRefineProposedTech] = useState<string[]>([]);
  const [refinePrompt, setRefinePrompt] = useState('');
  const [refining, setRefining] = useState(false);
  const [refineMessages, setRefineMessages] = useState<RefineMessage[]>([]);
  const [refineExplanation, setRefineExplanation] = useState('');
  const [refineError, setRefineError] = useState<string | null>(null);
  const [refineConfirmOpen, setRefineConfirmOpen] = useState(false);
  const [savingRefine, setSavingRefine] = useState(false);
  const [refinePanel, setRefinePanel] = useState<'draft' | 'diff'>('draft');

  // Reset / delete all data state
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetApplications, setResetApplications] = useState(true);
  const [resetAiSettings, setResetAiSettings] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    if (!resetOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !resetting) setResetOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [resetOpen, resetting]);

  // Experience Add/Edit state
  const emptyExp: Experience = {
    company: '',
    role: '',
    location: '',
    start_date: '',
    end_date: '',
    is_current: false,
    bullet_points: [''],
    technologies: [],
  };
  const [newExpOpen, setNewExpOpen] = useState(false);
  const [editingExpId, setEditingExpId] = useState<number | null>(null);
  const [newExp, setNewExp] = useState<Experience>(emptyExp);

  // Project Add/Edit state
  const emptyProject: Project = {
    title: '',
    subtitle: '',
    role: '',
    repo_url: '',
    live_url: '',
    start_date: '',
    end_date: '',
    bullet_points: [''],
    technologies: [],
  };
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [newProject, setNewProject] = useState<Project>(emptyProject);

  // Education Add/Edit state
  const emptyEducation: Education = {
    institution: '',
    degree: '',
    field_of_study: '',
    start_date: '',
    end_date: '',
    gpa: '',
    highlights: [''],
  };
  const [newEduOpen, setNewEduOpen] = useState(false);
  const [editingEduId, setEditingEduId] = useState<number | null>(null);
  const [newEdu, setNewEdu] = useState<Education>(emptyEducation);

  // Certification Add state
  const emptyCert: Certification = {
    name: '',
    issuer: '',
    issue_date: '',
    credential_url: '',
  };
  const [newCertOpen, setNewCertOpen] = useState(false);
  const [newCert, setNewCert] = useState<Certification>(emptyCert);

  // New Skill Modal
  const [newSkillOpen, setNewSkillOpen] = useState(false);
  const [newSkill, setNewSkill] = useState<Skill>({
    category: 'Technical Skills',
    name: '',
  });

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.updateProfile(profile);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveExperience = async () => {
    if (!newExp.company.trim() || !newExp.role.trim()) return;
    try {
      const cleanBullets = newExp.bullet_points.map((b) => b.trim()).filter((b) => b.length > 0);
      const payload = { ...newExp, bullet_points: cleanBullets };
      if (editingExpId) {
        await api.updateExperience(editingExpId, payload);
      } else {
        await api.createExperience(payload);
      }
      setNewExpOpen(false);
      setEditingExpId(null);
      setNewExp(emptyExp);
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditExperience = (exp: Experience) => {
    setEditingExpId(exp.id || null);
    setNewExp({
      company: exp.company || '',
      role: exp.role || '',
      location: exp.location || '',
      start_date: exp.start_date || '',
      end_date: exp.end_date || '',
      is_current: Boolean(exp.is_current),
      bullet_points: exp.bullet_points?.length ? [...exp.bullet_points] : [''],
      technologies: exp.technologies ? [...exp.technologies] : [],
    });
    setNewExpOpen(true);
  };

  const handleDeleteExperience = async (id?: number) => {
    if (!id) return;
    if (confirm('Delete this experience?')) {
      await api.deleteExperience(id);
      onRefresh();
    }
  };

  const handleSaveProject = async () => {
    if (!newProject.title.trim()) return;
    try {
      const cleanBullets = newProject.bullet_points.map((b) => b.trim()).filter((b) => b.length > 0);
      const payload = { ...newProject, bullet_points: cleanBullets };
      if (editingProjectId) {
        await api.updateProject(editingProjectId, payload);
      } else {
        await api.createProject(payload);
      }
      setNewProjectOpen(false);
      setEditingProjectId(null);
      setNewProject(emptyProject);
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditProject = (proj: Project) => {
    setEditingProjectId(proj.id || null);
    setNewProject({
      title: proj.title || '',
      subtitle: proj.subtitle || '',
      role: proj.role || '',
      repo_url: proj.repo_url || '',
      live_url: proj.live_url || '',
      start_date: proj.start_date || '',
      end_date: proj.end_date || '',
      bullet_points: proj.bullet_points?.length ? [...proj.bullet_points] : [''],
      technologies: proj.technologies ? [...proj.technologies] : [],
    });
    setNewProjectOpen(true);
  };

  const handleDeleteProject = async (id?: number) => {
    if (!id) return;
    if (confirm('Delete this project?')) {
      await api.deleteProject(id);
      onRefresh();
    }
  };

  const handleSaveEducation = async () => {
    if (!newEdu.institution.trim() || !newEdu.degree.trim()) return;
    try {
      const cleanHighlights = newEdu.highlights.map((h) => h.trim()).filter((h) => h.length > 0);
      const payload = { ...newEdu, highlights: cleanHighlights };
      if (editingEduId) {
        await api.updateEducation(editingEduId, payload);
      } else {
        await api.createEducation(payload);
      }
      setNewEduOpen(false);
      setEditingEduId(null);
      setNewEdu(emptyEducation);
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditEducation = (edu: Education) => {
    setEditingEduId(edu.id || null);
    setNewEdu({
      institution: edu.institution || '',
      degree: edu.degree || '',
      field_of_study: edu.field_of_study || '',
      start_date: edu.start_date || '',
      end_date: edu.end_date || '',
      gpa: edu.gpa || '',
      highlights: edu.highlights?.length ? [...edu.highlights] : [''],
    });
    setNewEduOpen(true);
  };

  const handleDeleteEducation = async (id?: number) => {
    if (!id) return;
    if (confirm('Delete this education entry?')) {
      await api.deleteEducation(id);
      onRefresh();
    }
  };

  const handleAddCertification = async () => {
    if (!newCert.name.trim()) return;
    try {
      await api.createCertification(newCert);
      setNewCertOpen(false);
      setNewCert(emptyCert);
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCertification = async (id?: number) => {
    if (!id) return;
    await api.deleteCertification(id);
    onRefresh();
  };

  const handleAddSkill = async () => {
    if (!newSkill.name.trim()) return;
    try {
      await api.createSkill(newSkill);
      setNewSkillOpen(false);
      setNewSkill({ category: 'Technical Skills', name: '' });
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSkill = async (id?: number) => {
    if (!id) return;
    await api.deleteSkill(id);
    onRefresh();
  };

  const openRefineChat = (
    kind: RefineTargetKind,
    sectionType: string,
    targetId: number | null,
    label: string,
    content: unknown,
    starter: string,
    sectionMeta?: Record<string, unknown>,
    initialTechnologies?: string[],
  ) => {
    setRefineTargetKind(kind);
    setRefineSectionType(sectionType);
    setRefineTargetId(targetId);
    setRefineTargetLabel(label);
    setRefineSectionContext(sectionMeta);
    setRefineOriginalContent(content);
    setRefineDraftContent(content);
    const techs = initialTechnologies ? [...initialTechnologies] : [];
    setRefineOriginalTech(techs);
    setRefineProposedTech(techs);
    setRefinePrompt(starter);
    setRefineMessages([]);
    setRefineExplanation('');
    setRefineError(null);
    setRefineConfirmOpen(false);
    setRefinePanel('draft');
    setRefineModalOpen(true);
  };

  const openAiRefineForExp = (exp: Experience) => {
    openRefineChat(
      'experience',
      'experience',
      exp.id || null,
      `${exp.role} at ${exp.company}`,
      exp.bullet_points || [],
      'Strengthen these bullets with strong action verbs, clear domain expertise, and concrete impact without inventing metrics.',
      {
        role: exp.role,
        company: exp.company,
        location: exp.location,
        start_date: exp.start_date,
        end_date: exp.is_current ? 'Present' : exp.end_date,
        technologies: exp.technologies || [],
      },
      exp.technologies || [],
    );
  };

  const openAiRefineForProject = (proj: Project) => {
    openRefineChat(
      'project',
      'project',
      proj.id || null,
      proj.title,
      proj.bullet_points || [],
      'Emphasize key contributions, methods or tools used, and measurable outcomes.',
      {
        title: proj.title,
        subtitle: proj.subtitle,
        role: proj.role,
        technologies: proj.technologies || [],
        repo_url: proj.repo_url,
      },
      proj.technologies || [],
    );
  };

  const openAiRefineForEducation = (edu: Education) => {
    openRefineChat(
      'education',
      'education',
      edu.id || null,
      `${edu.degree} at ${edu.institution}`,
      edu.highlights || [],
      'Tighten these academic highlights into concise, recruiter-friendly phrasing.',
      {
        institution: edu.institution,
        degree: edu.degree,
        field_of_study: edu.field_of_study,
        gpa: edu.gpa,
      },
    );
  };

  const openAiRefineForSummary = () => {
    openRefineChat(
      'summary',
      'summary',
      null,
      'Professional summary',
      profile.summary || '',
      'Write a sharp, high-signal 2-3 sentence summary grounded in my experience, core strengths, and impact.',
      {
        headline: profile.headline,
      },
    );
  };

  const openAiRefineForSkills = () => {
    openRefineChat(
      'skills',
      'skills',
      null,
      'Skills inventory',
      context.skills.map(({ category, name, proficiency }) => ({ category, name, proficiency: proficiency || '' })),
      'Reorganize my skills into clean categories suited to my profession, standardize naming, and surface any skills or tools from my experience and projects that are missing.',
    );
  };

  const openAiRefineForCertifications = () => {
    openRefineChat(
      'certifications',
      'certifications',
      null,
      'Certifications',
      (context.certifications || []).map(({ name, issuer, issue_date, credential_url }) => ({
        name,
        issuer: issuer || '',
        issue_date: issue_date || '',
        credential_url: credential_url || '',
      })),
      'Clean up and standardize this certification list without adding credentials I have not provided.',
    );
  };

  const runRefineInstruction = async (instructionText: string) => {
    const instruction = instructionText.trim();
    if (!instruction) return;
    setRefineError(null);
    setRefining(true);
    try {
      const contextWithTech =
        refineTargetKind === 'experience' || refineTargetKind === 'project'
          ? { ...(refineSectionContext || {}), technologies: refineProposedTech }
          : refineSectionContext;

      const res = await api.refineSection(
        refineSectionType,
        refineDraftContent,
        instruction,
        refineMessages,
        contextWithTech,
      );
      setRefineDraftContent(res.proposed_content);
      if (Array.isArray(res.proposed_technologies) && res.proposed_technologies.length > 0) {
        setRefineProposedTech(res.proposed_technologies);
      }
      setRefineExplanation(res.explanation || '');
      setRefineMessages((current) => [
        ...current,
        { role: 'user', content: instruction },
        { role: 'assistant', content: res.assistant_message || res.explanation || 'Draft updated.' },
      ]);
      setRefinePrompt('');
    } catch (err) {
      console.error(err);
      setRefineError(err instanceof Error ? err.message : 'AI refinement failed.');
    } finally {
      setRefining(false);
    }
  };

  const handleRunAiRefine = async () => {
    await runRefineInstruction(refinePrompt);
  };

  const handleApplyRefine = async () => {
    setSavingRefine(true);
    setRefineError(null);
    try {
      if (refineTargetKind === 'summary') {
        const updatedProfile = { ...profile, summary: String(refineDraftContent || '') };
        await api.updateProfile(updatedProfile);
        setProfile(updatedProfile);
      } else if (refineTargetKind === 'skills') {
        await api.replaceSkills(refineDraftContent as Skill[]);
      } else if (refineTargetKind === 'certifications') {
        await api.replaceCertifications(refineDraftContent as Certification[]);
      } else if (refineTargetKind === 'experience' && refineTargetId) {
        const experience = context.experiences.find((item) => item.id === refineTargetId);
        if (!experience) throw new Error('Experience no longer exists.');
        await api.updateExperience(refineTargetId, {
          ...experience,
          bullet_points: (refineDraftContent as string[]).map((b) => b.trim()).filter(Boolean),
          technologies: refineProposedTech,
        });
      } else if (refineTargetKind === 'project' && refineTargetId) {
        const project = context.projects.find((item) => item.id === refineTargetId);
        if (!project) throw new Error('Project no longer exists.');
        await api.updateProject(refineTargetId, {
          ...project,
          bullet_points: (refineDraftContent as string[]).map((b) => b.trim()).filter(Boolean),
          technologies: refineProposedTech,
        });
      } else if (refineTargetKind === 'education' && refineTargetId) {
        const education = context.educations.find((item) => item.id === refineTargetId);
        if (!education) throw new Error('Education entry no longer exists.');
        await api.updateEducation(refineTargetId, {
          ...education,
          highlights: (refineDraftContent as string[]).map((b) => b.trim()).filter(Boolean),
        });
      } else {
        throw new Error('This section is no longer available.');
      }
      setRefineModalOpen(false);
      setRefineConfirmOpen(false);
      onRefresh();
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : 'Could not apply these changes.');
      setRefineConfirmOpen(false);
    } finally {
      setSavingRefine(false);
    }
  };

  const handleResetAllData = async () => {
    setResetting(true);
    setResetError(null);
    try {
      await api.resetAllData({
        confirm: resetConfirmText.trim(),
        delete_applications: resetApplications,
        delete_ai_settings: resetAiSettings,
      });
      setResetOpen(false);
      setResetConfirmText('');
      setProfile({
        full_name: '',
        headline: '',
        email: '',
        phone: '',
        location: '',
        website_url: '',
        linkedin_url: '',
        github_url: '',
        summary: '',
      });
      onRefresh();
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Could not reset your data.');
    } finally {
      setResetting(false);
    }
  };

  const refineDiff = diffLines(contentItems(refineOriginalContent), contentItems(refineDraftContent));
  const techChanged =
    (refineTargetKind === 'experience' || refineTargetKind === 'project') &&
    refineOriginalTech.join('|') !== refineProposedTech.join('|');
  const refineChangeCount = refineDiff.added + refineDiff.removed + refineDiff.changed + (techChanged ? 1 : 0);

  const quickPresetsByKind: Record<RefineTargetKind, string[]> = {
    summary: [
      'Write a punchy 2-3 sentence summary grounded in my experience and core strengths',
      'Make it more concise and ATS-friendly without generic buzzwords',
      'Emphasize leadership, domain expertise, and measurable impact',
    ],
    experience: [
      'Strengthen action verbs, highlight scope & expertise, and keep every metric intact',
      'Make bullets tighter (1-2 lines each) for a 1-page resume',
      'Extract any tools, methods, or technologies mentioned in bullets into the tags list',
      'Reorder bullets by strongest impact and outcomes first',
    ],
    project: [
      'Highlight key contributions, methods or tools used, and concrete outcomes',
      'Condense into 2-3 high-impact bullets suitable for a 1-page resume',
      'Extract all tools, media, or technologies used into the project tags list',
    ],
    education: [
      'Tighten academic coursework, clinical rotations, honors, and awards into concise bullets',
      'Keep only the highest-signal academic highlights',
    ],
    skills: [
      'Group into clean categories suited to my profession & remove duplicates',
      'Add any missing skills, tools, or competencies mentioned in my experiences and projects',
      'Standardize naming and capitalization across all skills',
    ],
    certifications: [
      'Standardize certification and license names and issuer formatting',
      'Remove duplicate credentials',
    ],
  };

  const skillGroups = useMemo(() => {
    const groups = new Map<string, Skill[]>();
    for (const skill of context.skills) {
      const category = skill.category?.trim() || 'Other';
      const bucket = groups.get(category);
      if (bucket) bucket.push(skill);
      else groups.set(category, [skill]);
    }
    return Array.from(groups, ([category, skills]) => ({ category, skills })).sort((a, b) =>
      a.category.localeCompare(b.category),
    );
  }, [context.skills]);

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      <SectionHeader
        title="Career profile"
        description={
          <>
            Keep your experience, education, skills, and links in one editable profile.
          </>
        }
        actions={
          <button
            onClick={() => {
              setResetConfirmText('');
              setResetError(null);
              setResetApplications(true);
              setResetAiSettings(false);
              setResetOpen(true);
            }}
            className="flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-rose-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-rose-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete data
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: 'Experience', value: context.experiences.length, icon: Briefcase },
          { label: 'Skills', value: context.skills.length, icon: Wrench },
          { label: 'Projects', value: context.projects.length, icon: FolderGit2 },
          { label: 'Education', value: context.educations.length, icon: GraduationCap },
          { label: 'Credentials', value: context.certifications.length, icon: Award },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="stat-tile">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Icon className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium">{label}</span>
            </div>
            <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-slate-950 dark:text-white">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        {/* Left column: identity, skills, supporting work */}
        <div className="space-y-5 xl:col-span-2">
          <Panel title="Personal details" icon={User}>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <Field label="Full name">
                <TextInput
                  type="text"
                  value={profile.full_name}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  placeholder="Jane Doe"
                />
              </Field>

              <Field label="Headline">
                <TextInput
                  type="text"
                  value={profile.headline}
                  onChange={(e) => setProfile({ ...profile, headline: e.target.value })}
                  placeholder="Senior Full-Stack Engineer"
                />
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Email">
                  <TextInput
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    placeholder="jane@example.com"
                  />
                </Field>
                <Field label="Phone">
                  <TextInput
                    type="text"
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    placeholder="+1 555 010 1234"
                  />
                </Field>
              </div>

              <Field label="Location">
                <TextInput
                  type="text"
                  value={profile.location}
                  onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                  placeholder="San Francisco, CA"
                />
              </Field>

              <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <p className="group-label">Links</p>
                <Field label="LinkedIn">
                  <TextInput
                    type="text"
                    value={profile.linkedin_url}
                    onChange={(e) => setProfile({ ...profile, linkedin_url: e.target.value })}
                    placeholder="linkedin.com/in/username"
                  />
                </Field>
                <Field label="GitHub">
                  <TextInput
                    type="text"
                    value={profile.github_url}
                    onChange={(e) => setProfile({ ...profile, github_url: e.target.value })}
                    placeholder="github.com/username"
                  />
                </Field>
                <Field label="Website">
                  <TextInput
                    type="text"
                    value={profile.website_url || ''}
                    onChange={(e) => setProfile({ ...profile, website_url: e.target.value })}
                    placeholder="janedoe.dev"
                  />
                </Field>
              </div>

              <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label htmlFor="profile-summary" className="field-label mb-0">
                    Professional summary
                  </label>
                  <RefineButton onClick={openAiRefineForSummary} />
                </div>
                <TextArea
                  id="profile-summary"
                  rows={5}
                  value={profile.summary}
                  onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
                  placeholder="Two or three sentences on what you build, the scale you work at, and the impact you aim for."
                />
              </div>

              <Button type="submit" disabled={savingProfile} className="w-full">
                {savingProfile ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Saving
                  </>
                ) : profileSaved ? (
                  <>
                    <Check className="h-4 w-4" /> Saved
                  </>
                ) : (
                  'Save profile'
                )}
              </Button>
            </form>
          </Panel>

          <Panel
            title="Skills"
            icon={Wrench}
            count={context.skills.length}
            actions={
              <>
                <RefineButton onClick={openAiRefineForSkills} />
                <IconButton onClick={() => setNewSkillOpen((open) => !open)} aria-label="Add skill">
                  <Plus className="h-4 w-4" />
                </IconButton>
              </>
            }
          >
            {newSkillOpen && (
              <div className="inline-form mb-4 space-y-3">
                <Field label="Skill">
                  <TextInput
                    type="text"
                    autoFocus
                    placeholder="Python"
                    value={newSkill.name}
                    onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSkill();
                      }
                    }}
                  />
                </Field>
                <Field label="Category">
                  <TextInput
                    type="text"
                    placeholder="Languages"
                    value={newSkill.category}
                    onChange={(e) => setNewSkill({ ...newSkill, category: e.target.value })}
                  />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setNewSkillOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAddSkill} disabled={!newSkill.name.trim()}>
                    Add skill
                  </Button>
                </div>
              </div>
            )}

            {context.skills.length === 0 ? (
              <EmptyState
                title="No skills yet"
                hint="Add them one at a time, or import a resume and let the parser fill this in."
              />
            ) : (
              <div className="max-h-96 space-y-4 overflow-y-auto pr-1">
                {skillGroups.map((group) => (
                  <div key={group.category}>
                    <p className="group-label mb-2">
                      {group.category} · {group.skills.length}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.skills.map((skill) => (
                        <span key={skill.id ?? skill.name} className="skill-chip group">
                          {skill.name}
                          <button
                            type="button"
                            onClick={() => handleDeleteSkill(skill.id)}
                            aria-label={`Remove ${skill.name}`}
                            className="text-slate-400 transition-colors hover:text-rose-600 md:opacity-0 md:group-hover:opacity-100"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="Projects"
            icon={FolderGit2}
            count={context.projects.length}
            actions={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingProjectId(null);
                  setNewProject(emptyProject);
                  setNewProjectOpen((open) => !open);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            }
          >
            {newProjectOpen && (
              <div className="inline-form mb-4 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Project title">
                    <TextInput
                      type="text"
                      autoFocus
                      placeholder="ResumeForge AI"
                      value={newProject.title}
                      onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
                    />
                  </Field>
                  <Field label="Subtitle / Role">
                    <TextInput
                      type="text"
                      placeholder="Creator & Lead Developer"
                      value={newProject.subtitle || ''}
                      onChange={(e) => setNewProject({ ...newProject, subtitle: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Repository URL">
                    <TextInput
                      type="text"
                      placeholder="https://github.com/..."
                      value={newProject.repo_url || ''}
                      onChange={(e) => setNewProject({ ...newProject, repo_url: e.target.value })}
                    />
                  </Field>
                  <Field label="Live URL">
                    <TextInput
                      type="text"
                      placeholder="https://..."
                      value={newProject.live_url || ''}
                      onChange={(e) => setNewProject({ ...newProject, live_url: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Highlights — one per line">
                  <TextArea
                    rows={3}
                    value={newProject.bullet_points.join('\n')}
                    onChange={(e) => setNewProject({ ...newProject, bullet_points: e.target.value.split('\n') })}
                    placeholder={'Built an end-to-end LaTeX resume tailoring engine\nReduced compilation latency by 40%'}
                  />
                </Field>
                <Field label="Technologies — comma separated">
                  <TextInput
                    type="text"
                    placeholder="TypeScript, React, Django, PostgreSQL"
                    value={newProject.technologies.join(', ')}
                    onChange={(e) =>
                      setNewProject({
                        ...newProject,
                        technologies: e.target.value
                          .split(',')
                          .map((item) => item.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setNewProjectOpen(false);
                      setEditingProjectId(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSaveProject} disabled={!newProject.title.trim()}>
                    {editingProjectId ? 'Update project' : 'Save project'}
                  </Button>
                </div>
              </div>
            )}

            {context.projects.length === 0 ? (
              <EmptyState
                title="No projects yet"
                hint="Side projects and open-source work give tailored resumes more to draw from."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-1">
                {context.projects.map((proj) => (
                  <div key={proj.id} className="entry-card group flex flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-[13px] font-semibold text-slate-900">{proj.title}</h3>
                        {proj.subtitle && <p className="mt-0.5 text-xs text-slate-600">{proj.subtitle}</p>}
                      </div>
                      <RowActions>
                        <RefineButton onClick={() => openAiRefineForProject(proj)} />
                        <button
                          type="button"
                          onClick={() => handleEditProject(proj)}
                          className="rounded px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                          Edit
                        </button>
                        <IconButton
                          tone="danger"
                          onClick={() => handleDeleteProject(proj.id)}
                          aria-label={`Delete ${proj.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                      </RowActions>
                    </div>

                    {proj.bullet_points && proj.bullet_points.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {proj.bullet_points.filter(Boolean).map((bullet, idx) => (
                          <li key={idx} className="flex gap-2 text-xs leading-relaxed text-slate-600">
                            <span className="bullet-dot" />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {proj.technologies && proj.technologies.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {proj.technologies.map((tech) => (
                          <span key={tech} className="chip">
                            {tech}
                          </span>
                        ))}
                      </div>
                    )}

                    {(proj.repo_url || proj.live_url) && (
                      <div className="mt-auto flex flex-wrap items-center gap-3 pt-3">
                        {proj.repo_url && (
                          <a href={proj.repo_url} target="_blank" rel="noreferrer" className="entry-link">
                            <GitBranch className="h-3 w-3" /> Source
                          </a>
                        )}
                        {proj.live_url && (
                          <a href={proj.live_url} target="_blank" rel="noreferrer" className="entry-link">
                            <ExternalLink className="h-3 w-3" /> Live
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="Certifications"
            icon={Award}
            count={context.certifications.length}
            actions={
              <>
                <RefineButton onClick={openAiRefineForCertifications} />
                <IconButton onClick={() => setNewCertOpen((open) => !open)} aria-label="Add certification">
                  <Plus className="h-4 w-4" />
                </IconButton>
              </>
            }
          >
            {newCertOpen && (
              <div className="inline-form mb-4 space-y-3">
                <Field label="Certification name">
                  <TextInput
                    type="text"
                    autoFocus
                    placeholder="AWS Certified Solutions Architect"
                    value={newCert.name}
                    onChange={(e) => setNewCert({ ...newCert, name: e.target.value })}
                  />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Issuer">
                    <TextInput
                      type="text"
                      placeholder="Amazon Web Services"
                      value={newCert.issuer || ''}
                      onChange={(e) => setNewCert({ ...newCert, issuer: e.target.value })}
                    />
                  </Field>
                  <Field label="Issue date">
                    <TextInput
                      type="text"
                      placeholder="2025"
                      value={newCert.issue_date || ''}
                      onChange={(e) => setNewCert({ ...newCert, issue_date: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Credential URL (optional)">
                  <TextInput
                    type="text"
                    placeholder="https://..."
                    value={newCert.credential_url || ''}
                    onChange={(e) => setNewCert({ ...newCert, credential_url: e.target.value })}
                  />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setNewCertOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAddCertification} disabled={!newCert.name.trim()}>
                    Add credential
                  </Button>
                </div>
              </div>
            )}

            {context.certifications.length === 0 ? (
              <EmptyState
                title="No certifications yet"
                hint="Add a credential directly or open Refine to clean up your certifications."
              />
            ) : (
              <div className="space-y-2">
                {context.certifications.map((certification) => (
                  <div
                    key={certification.id ?? `${certification.name}-${certification.issuer}`}
                    className="entry-card group flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-slate-900">{certification.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {[certification.issuer, certification.issue_date].filter(Boolean).join(' · ') ||
                          'No issuer recorded'}
                      </p>
                      {certification.credential_url && (
                        <a
                          href={certification.credential_url}
                          target="_blank"
                          rel="noreferrer"
                          className="entry-link mt-1.5"
                        >
                          <ExternalLink className="h-3 w-3" /> View credential
                        </a>
                      )}
                    </div>
                    {certification.id && (
                      <IconButton
                        tone="danger"
                        onClick={() => handleDeleteCertification(certification.id)}
                        aria-label={`Delete ${certification.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Right column: experience and education */}
        <div className="space-y-5 xl:col-span-3">
          <Panel
            title="Work experience"
            icon={Briefcase}
            count={context.experiences.length}
            actions={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingExpId(null);
                  setNewExp(emptyExp);
                  setNewExpOpen((open) => !open);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            }
          >
            {newExpOpen && (
              <div className="inline-form mb-5 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Company">
                    <TextInput
                      type="text"
                      autoFocus
                      placeholder="Acme Corp"
                      value={newExp.company}
                      onChange={(e) => setNewExp({ ...newExp, company: e.target.value })}
                    />
                  </Field>
                  <Field label="Role">
                    <TextInput
                      type="text"
                      placeholder="Senior Engineer"
                      value={newExp.role}
                      onChange={(e) => setNewExp({ ...newExp, role: e.target.value })}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Location">
                    <TextInput
                      type="text"
                      placeholder="Remote"
                      value={newExp.location}
                      onChange={(e) => setNewExp({ ...newExp, location: e.target.value })}
                    />
                  </Field>
                  <Field label="Start date">
                    <TextInput
                      type="text"
                      placeholder="Jan 2022"
                      value={newExp.start_date}
                      onChange={(e) => setNewExp({ ...newExp, start_date: e.target.value })}
                    />
                  </Field>
                  <Field label="End date">
                    <TextInput
                      type="text"
                      placeholder="Present"
                      disabled={newExp.is_current}
                      value={newExp.is_current ? '' : newExp.end_date}
                      onChange={(e) => setNewExp({ ...newExp, end_date: e.target.value })}
                    />
                  </Field>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={!!newExp.is_current}
                    onChange={(e) => setNewExp({ ...newExp, is_current: e.target.checked })}
                    className="h-3.5 w-3.5 accent-slate-900"
                  />
                  I currently work here
                </label>

                <Field label="Highlights — one per line">
                  <TextArea
                    rows={4}
                    value={newExp.bullet_points.join('\n')}
                    onChange={(e) => setNewExp({ ...newExp, bullet_points: e.target.value.split('\n') })}
                    placeholder={'Cut p95 latency 35% by rewriting the ingest pipeline\nLed a team of 4 across two quarters'}
                  />
                </Field>

                <Field label="Technologies — comma separated">
                  <TextInput
                    type="text"
                    placeholder="Python, Postgres, Kubernetes"
                    value={newExp.technologies.join(', ')}
                    onChange={(e) =>
                      setNewExp({
                        ...newExp,
                        technologies: e.target.value
                          .split(',')
                          .map((item) => item.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </Field>

                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setNewExpOpen(false);
                      setEditingExpId(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveExperience}
                    disabled={!newExp.company.trim() || !newExp.role.trim()}
                  >
                    {editingExpId ? 'Update experience' : 'Save experience'}
                  </Button>
                </div>
              </div>
            )}

            {context.experiences.length === 0 ? (
              <EmptyState
                title="No roles recorded yet"
                hint="Import an existing resume or add your first role manually."
                action={
                  <Button size="sm" variant="outline" onClick={() => setNewExpOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Add experience
                  </Button>
                }
              />
            ) : (
              <div className="space-y-3">
                {context.experiences.map((exp) => {
                  const dateRange = [exp.start_date, exp.is_current ? 'Present' : exp.end_date]
                    .filter(Boolean)
                    .join(' – ');

                  return (
                    <article key={exp.id} className="entry-card group">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-slate-900">{exp.role}</h3>
                          <p className="mt-0.5 text-[13px] text-slate-600">
                            {[exp.company, exp.location].filter(Boolean).join(' · ')}
                          </p>
                          {dateRange && (
                            <p className="mt-1 text-[11px] tabular-nums text-slate-400">{dateRange}</p>
                          )}
                        </div>
                        <RowActions>
                          <RefineButton onClick={() => openAiRefineForExp(exp)} />
                          <button
                            type="button"
                            onClick={() => handleEditExperience(exp)}
                            className="rounded px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          >
                            Edit
                          </button>
                          <IconButton
                            tone="danger"
                            onClick={() => handleDeleteExperience(exp.id)}
                            aria-label={`Delete ${exp.role}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        </RowActions>
                      </div>

                      {exp.bullet_points && exp.bullet_points.length > 0 && (
                        <ul className="mt-3 space-y-1.5">
                          {exp.bullet_points.filter(Boolean).map((bullet, index) => (
                            <li key={index} className="flex gap-2 text-[13px] leading-relaxed text-slate-700">
                              <span className="bullet-dot" />
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {exp.technologies && exp.technologies.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {exp.technologies.map((tech) => (
                            <span key={tech} className="chip">
                              {tech}
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel
            title="Education"
            icon={GraduationCap}
            count={context.educations.length}
            actions={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingEduId(null);
                  setNewEdu(emptyEducation);
                  setNewEduOpen((open) => !open);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            }
          >
            {newEduOpen && (
              <div className="inline-form mb-4 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Institution">
                    <TextInput
                      type="text"
                      autoFocus
                      placeholder="University of Waterloo"
                      value={newEdu.institution}
                      onChange={(e) => setNewEdu({ ...newEdu, institution: e.target.value })}
                    />
                  </Field>
                  <Field label="Degree">
                    <TextInput
                      type="text"
                      placeholder="B.S. in Computer Science"
                      value={newEdu.degree}
                      onChange={(e) => setNewEdu({ ...newEdu, degree: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Field of study">
                    <TextInput
                      type="text"
                      placeholder="Computer Science"
                      value={newEdu.field_of_study || ''}
                      onChange={(e) => setNewEdu({ ...newEdu, field_of_study: e.target.value })}
                    />
                  </Field>
                  <Field label="Dates">
                    <TextInput
                      type="text"
                      placeholder="2018 – 2022"
                      value={newEdu.end_date || ''}
                      onChange={(e) => setNewEdu({ ...newEdu, end_date: e.target.value })}
                    />
                  </Field>
                  <Field label="GPA (optional)">
                    <TextInput
                      type="text"
                      placeholder="3.9/4.0"
                      value={newEdu.gpa || ''}
                      onChange={(e) => setNewEdu({ ...newEdu, gpa: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Highlights / Coursework — one per line">
                  <TextArea
                    rows={3}
                    value={newEdu.highlights.join('\n')}
                    onChange={(e) => setNewEdu({ ...newEdu, highlights: e.target.value.split('\n') })}
                    placeholder={"Dean's Honors List\nRelevant Coursework: Distributed Systems, Compilers, Operating Systems"}
                  />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setNewEduOpen(false);
                      setEditingEduId(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveEducation}
                    disabled={!newEdu.institution.trim() || !newEdu.degree.trim()}
                  >
                    {editingEduId ? 'Update education' : 'Save education'}
                  </Button>
                </div>
              </div>
            )}

            {context.educations.length === 0 ? (
              <EmptyState
                title="No education entries"
                hint="Degrees, bootcamps, and coursework all belong here."
              />
            ) : (
              <div className="space-y-3">
                {context.educations.map((edu) => (
                  <div key={edu.id} className="entry-card group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-[13px] font-semibold text-slate-900">
                          {[edu.degree, edu.field_of_study].filter(Boolean).join(', ')}
                        </h3>
                        <p className="mt-0.5 text-[13px] text-slate-600">{edu.institution}</p>
                        <p className="mt-1 text-[11px] tabular-nums text-slate-400">
                          {[
                            [edu.start_date, edu.end_date].filter(Boolean).join(' – '),
                            edu.gpa ? `GPA ${edu.gpa}` : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <RowActions>
                        <RefineButton onClick={() => openAiRefineForEducation(edu)} />
                        <button
                          type="button"
                          onClick={() => handleEditEducation(edu)}
                          className="rounded px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                          Edit
                        </button>
                        <IconButton
                          tone="danger"
                          onClick={() => handleDeleteEducation(edu.id)}
                          aria-label={`Delete ${edu.degree}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                      </RowActions>
                    </div>

                    {edu.highlights && edu.highlights.length > 0 && (
                      <ul className="mt-2.5 space-y-1.5">
                        {edu.highlights.filter(Boolean).map((highlight, index) => (
                          <li key={index} className="flex gap-2 text-xs leading-relaxed text-slate-600">
                            <span className="bullet-dot" />
                            <span>{highlight}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* AI Refine Chat Modal */}
      {refineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 sm:p-6">
          <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <Wand2 className="h-5 w-5 text-slate-400" />
                  <span>AI section studio</span>
                  <span className="chip font-medium">{activeModel}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Editing <span className="font-semibold text-slate-700">{refineTargetLabel}</span> · you can ask AI or edit the working draft directly
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={refining}
                  onClick={() => runRefineInstruction(quickPresetsByKind[refineTargetKind][0])}
                >
                  {refining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  Quick AI Enhance
                </Button>
                <button
                  onClick={() => setRefineModalOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Close AI section chat"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
              {/* Left: editable draft + diff */}
              <div className="flex min-h-0 flex-col border-b border-slate-200 lg:border-b-0 lg:border-r">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                  <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-0.5">
                    <button
                      onClick={() => setRefinePanel('draft')}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                        refinePanel === 'draft' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <ListChecks className="h-3.5 w-3.5" />
                      Working draft (editable)
                    </button>
                    <button
                      onClick={() => setRefinePanel('diff')}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                        refinePanel === 'diff' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <GitCompare className="h-3.5 w-3.5" />
                      Diff vs saved
                      {refineChangeCount > 0 && (
                        <span className="rounded-full bg-slate-900 px-1.5 text-[10px] font-bold text-white dark:bg-white dark:text-slate-900">
                          {refineChangeCount}
                        </span>
                      )}
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setRefineDraftContent(refineOriginalContent);
                      setRefineProposedTech([...refineOriginalTech]);
                      setRefineMessages([]);
                      setRefineExplanation('');
                    }}
                    className="flex items-center gap-1 text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-900"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reset draft
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
                  {refinePanel === 'draft' ? (
                    <>
                      {refineTargetKind === 'summary' ? (
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-slate-600">
                            Summary text (editable)
                          </label>
                          <textarea
                            rows={6}
                            value={String(refineDraftContent || '')}
                            onChange={(e) => setRefineDraftContent(e.target.value)}
                            className="field-textarea text-sm leading-relaxed"
                            placeholder="Write or refine your professional summary..."
                          />
                        </div>
                      ) : refineTargetKind === 'experience' ||
                        refineTargetKind === 'project' ||
                        refineTargetKind === 'education' ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-600">
                              Bullet points ({Array.isArray(refineDraftContent) ? refineDraftContent.length : 0})
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setRefineDraftContent([
                                  ...(Array.isArray(refineDraftContent) ? (refineDraftContent as string[]) : []),
                                  '',
                                ])
                              }
                              className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200"
                            >
                              <Plus className="h-3 w-3" /> Add bullet
                            </button>
                          </div>
                          {(!Array.isArray(refineDraftContent) || refineDraftContent.length === 0) ? (
                            <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
                              No bullets yet. Click &ldquo;Quick AI Enhance&rdquo; or add a bullet manually.
                            </p>
                          ) : (
                            <ul className="space-y-2">
                              {(refineDraftContent as string[]).map((item, idx) => (
                                <li
                                  key={idx}
                                  className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2"
                                >
                                  <span className="mt-1.5 text-[11px] font-semibold text-slate-400 w-4 text-center">
                                    {idx + 1}
                                  </span>
                                  <textarea
                                    rows={2}
                                    value={item}
                                    onChange={(e) => {
                                      const next = [...(refineDraftContent as string[])];
                                      next[idx] = e.target.value;
                                      setRefineDraftContent(next);
                                    }}
                                    className="flex-1 resize-y rounded border border-transparent px-1.5 py-1 text-xs leading-relaxed text-slate-800 focus:border-slate-300 focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = (refineDraftContent as string[]).filter((_, i) => i !== idx);
                                      setRefineDraftContent(next);
                                    }}
                                    className="mt-1 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                    aria-label={`Remove bullet ${idx + 1}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}

                          {(refineTargetKind === 'experience' || refineTargetKind === 'project') && (
                            <div className="border-t border-slate-200 pt-3 space-y-1.5">
                              <label className="text-xs font-medium text-slate-600">
                                Technologies for this {refineTargetKind} (comma separated)
                              </label>
                              <TextInput
                                type="text"
                                value={refineProposedTech.join(', ')}
                                onChange={(e) =>
                                  setRefineProposedTech(
                                    e.target.value
                                      .split(',')
                                      .map((t) => t.trim())
                                      .filter(Boolean),
                                  )
                                }
                                placeholder="Python, TypeScript, PostgreSQL, Docker..."
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        <ul className="space-y-2 text-sm text-slate-700">
                          {contentItems(refineDraftContent).length === 0 ? (
                            <li className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
                              No entries yet. Ask the AI to draft some.
                            </li>
                          ) : (
                            contentItems(refineDraftContent).map((item, idx) => (
                              <li
                                key={`${item}-${idx}`}
                                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[11px] font-semibold text-slate-400">{idx + 1}</span>
                                  <span className="truncate">{item}</span>
                                </div>
                                {Array.isArray(refineDraftContent) && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRefineDraftContent(
                                        (refineDraftContent as unknown[]).filter((_, i) => i !== idx),
                                      )
                                    }
                                    className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                    aria-label="Remove item"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </li>
                            ))
                          )}
                        </ul>
                      )}
                    </>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                        <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">+{refineDiff.added} added</span>
                        <span className="rounded-md bg-rose-50 px-2 py-1 text-rose-700">−{refineDiff.removed} removed</span>
                        <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">{refineDiff.changed} reworded</span>
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">{refineDiff.unchanged} unchanged</span>
                      </div>

                      {techChanged && (
                        <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-950">
                          <p className="font-semibold text-indigo-800">Technologies updated:</p>
                          <p className="mt-0.5">{refineProposedTech.join(', ') || 'None'}</p>
                        </div>
                      )}

                      {refineChangeCount === 0 ? (
                        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
                          The draft still matches your saved content.
                        </p>
                      ) : (
                        <ul className="space-y-2 text-sm leading-relaxed">
                          {refineDiff.entries.map((entry, idx) => {
                            if (entry.kind === 'unchanged') {
                              return (
                                <li
                                  key={`unchanged-${idx}`}
                                  className="flex gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-500"
                                >
                                  <span className="font-mono text-xs text-slate-300">=</span>
                                  <span>{entry.value}</span>
                                </li>
                              );
                            }

                            if (entry.kind === 'added') {
                              return (
                                <li
                                  key={`added-${idx}`}
                                  className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900"
                                >
                                  <span className="font-mono text-xs font-bold text-emerald-600">+</span>
                                  <span>{entry.value}</span>
                                </li>
                              );
                            }

                            if (entry.kind === 'removed') {
                              return (
                                <li
                                  key={`removed-${idx}`}
                                  className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900"
                                >
                                  <span className="font-mono text-xs font-bold text-rose-600">−</span>
                                  <span className="line-through decoration-rose-400">{entry.value}</span>
                                </li>
                              );
                            }

                            return (
                              <li
                                key={`changed-${idx}`}
                                className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2"
                              >
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                                  Reworded
                                </p>
                                <p className="text-amber-950">
                                  {entry.words?.map((part, partIdx) => (
                                    <span
                                      key={`${part.kind}-${partIdx}`}
                                      className={
                                        part.kind === 'added'
                                          ? 'rounded-xs bg-emerald-200/80 text-emerald-900'
                                          : part.kind === 'removed'
                                            ? 'rounded-xs bg-rose-200/70 text-rose-900 line-through decoration-rose-400'
                                            : ''
                                      }
                                    >
                                      {part.value}
                                    </span>
                                  ))}
                                </p>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: conversation */}
              <div className="flex min-h-0 flex-col">
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
                  {refineMessages.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-500 space-y-2">
                      <p className="font-semibold text-slate-700">AI Context-Aware Editor</p>
                      <p className="leading-relaxed">
                        The AI has full context of your profile, skills, and role metadata. Click a preset below to run immediately, or type custom instructions (e.g., &ldquo;Highlight patient care outcomes and leadership&rdquo; or &ldquo;Make these bullets more concise&rdquo;).
                      </p>
                    </div>
                  ) : (
                    refineMessages.map((message, index) => (
                      <div
                        key={`${message.role}-${index}`}
                        className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                          message.role === 'user'
                            ? 'ml-auto bg-slate-900 text-white'
                            : 'mr-auto border border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        {message.content}
                      </div>
                    ))
                  )}

                  {refineExplanation && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                      <span className="font-semibold text-slate-800">Why: </span>
                      {refineExplanation}
                    </div>
                  )}

                  {refineError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">
                      {refineError}
                    </div>
                  )}
                </div>

                <div className="space-y-2 border-t border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap gap-1.5">
                    {quickPresetsByKind[refineTargetKind].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        disabled={refining}
                        onClick={() => runRefineInstruction(chip)}
                        className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-left text-[11px] text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
                      >
                        ✦ {chip}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={3}
                    value={refinePrompt}
                    onChange={(e) => setRefinePrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleRunAiRefine();
                      }
                    }}
                    className="field-input resize-none"
                    placeholder="Ask AI to rewrite, condense, or add a specific achievement..."
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Ctrl/⌘ + Enter to send</span>
                    <Button
                      size="sm"
                      onClick={handleRunAiRefine}
                      disabled={refining || !refinePrompt.trim()}
                    >
                      {refining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send instruction
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 bg-white px-6 py-4">
              {refineConfirmOpen ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-600">
                    Replace the saved content for <strong>{refineTargetLabel}</strong> with this draft?
                    {refineChangeCount > 0 && (
                      <span className="ml-1 text-slate-400">
                        ({refineDiff.added} added, {refineDiff.removed} removed, {refineDiff.changed} reworded)
                      </span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setRefineConfirmOpen(false)}>
                      Keep editing
                    </Button>
                    <Button size="sm" onClick={handleApplyRefine} disabled={savingRefine}>
                      {savingRefine && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Confirm and save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    {refineChangeCount > 0
                      ? `${refineChangeCount} pending change${refineChangeCount === 1 ? '' : 's'} not yet saved.`
                      : 'No pending changes.'}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setRefineModalOpen(false)}>
                      Discard
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setRefinePanel('diff');
                        setRefineConfirmOpen(true);
                      }}
                      disabled={refineChangeCount === 0}
                    >
                      Review & apply
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reset All Data Modal */}
      {resetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !resetting) setResetOpen(false);
          }}
        >
          <div
            className="panel w-full max-w-lg overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-data-title"
          >
            <div className="panel-head">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <h3 id="delete-data-title" className="text-sm font-semibold text-slate-900">
                  Delete profile data
                </h3>
              </div>
              <IconButton
                onClick={() => setResetOpen(false)}
                disabled={resetting}
                aria-label="Close delete data dialog"
              >
                <X className="h-4 w-4" />
              </IconButton>
            </div>

            <div className="space-y-5 p-4 sm:p-5">
              <p className="text-[13px] leading-relaxed text-slate-600">
                This permanently removes your career profile. Choose whether related application
                and AI configuration data should be removed as well.
              </p>

              <div className="rounded border border-slate-200 dark:border-slate-800">
                <div className="border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
                  <p className="text-xs font-medium text-slate-700">Always deleted</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    Personal details, summary, experience, education, skills, projects, and
                    certifications.
                  </p>
                </div>

                <label className="delete-option">
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-slate-700">
                      Applications and generated documents
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                      Delete tracked roles, tailored documents, and compiled files.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={resetApplications}
                    onChange={(event) => setResetApplications(event.target.checked)}
                    className="delete-checkbox"
                  />
                </label>

                <label className="delete-option border-t border-slate-200 dark:border-slate-800">
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-slate-700">
                      AI settings
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                      Restore the default provider, endpoint, model, and instructions.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={resetAiSettings}
                    onChange={(event) => setResetAiSettings(event.target.checked)}
                    className="delete-checkbox"
                  />
                </label>
              </div>

              <Field label="Type DELETE to confirm">
                <TextInput
                  type="text"
                  value={resetConfirmText}
                  onChange={(event) => setResetConfirmText(event.target.value)}
                  placeholder="DELETE"
                  autoComplete="off"
                  autoFocus
                  className="font-mono"
                />
              </Field>

              {resetError && (
                <div
                  className="flex items-start gap-2 rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
                  role="alert"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{resetError}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-5 dark:border-slate-800">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setResetOpen(false)}
                disabled={resetting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={handleResetAllData}
                disabled={resetting || resetConfirmText.trim().toUpperCase() !== 'DELETE'}
                className="disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:opacity-100 dark:disabled:border-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
              >
                {resetting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                {resetting ? 'Deleting…' : 'Delete selected data'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
