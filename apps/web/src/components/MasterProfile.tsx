import React, { useState, useEffect } from 'react';
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
import {
  User,
  Briefcase,
  GraduationCap,
  Wrench,
  FolderGit2,
  Sparkles,
  Plus,
  Trash2,
  Check,
  Edit2,
  X,
  MessageSquare,
  Loader2,
  Award,
  Send,
  RotateCcw,
  AlertTriangle,
  ListChecks,
  GitCompare,
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
  const [refineOriginalContent, setRefineOriginalContent] = useState<unknown>(null);
  const [refineDraftContent, setRefineDraftContent] = useState<unknown>(null);
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

  // New Experience Modal state
  const [newExpOpen, setNewExpOpen] = useState(false);
  const [newExp, setNewExp] = useState<Experience>({
    company: '',
    role: '',
    location: '',
    start_date: '',
    end_date: '',
    is_current: false,
    bullet_points: [''],
    technologies: [],
  });

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

  const handleAddExperience = async () => {
    if (!newExp.company || !newExp.role) return;
    try {
      const cleanBullets = newExp.bullet_points.filter((b) => b.trim().length > 0);
      await api.createExperience({ ...newExp, bullet_points: cleanBullets });
      setNewExpOpen(false);
      setNewExp({
        company: '',
        role: '',
        location: '',
        start_date: '',
        end_date: '',
        is_current: false,
        bullet_points: [''],
        technologies: [],
      });
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteExperience = async (id?: number) => {
    if (!id) return;
    if (confirm('Delete this experience?')) {
      await api.deleteExperience(id);
      onRefresh();
    }
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
  ) => {
    setRefineTargetKind(kind);
    setRefineSectionType(sectionType);
    setRefineTargetId(targetId);
    setRefineTargetLabel(label);
    setRefineOriginalContent(content);
    setRefineDraftContent(content);
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
      'Make these bullets more concise and impact-oriented without inventing metrics.',
    );
  };

  const openAiRefineForProject = (proj: Project) => {
    openRefineChat(
      'project',
      'project',
      proj.id || null,
      proj.title,
      proj.bullet_points || [],
      'Emphasize the project scope, technical decisions, and demonstrated impact.',
    );
  };

  const openAiRefineForEducation = (edu: Education) => {
    openRefineChat(
      'education',
      'education',
      edu.id || null,
      `${edu.degree} at ${edu.institution}`,
      edu.highlights || [],
      'Tighten these academic highlights into recruiter-friendly phrasing.',
    );
  };

  const openAiRefineForSummary = () => {
    openRefineChat(
      'summary',
      'summary',
      null,
      'Professional summary',
      profile.summary || '',
      'Make this summary specific, concise, and supported by my existing claims.',
    );
  };

  const openAiRefineForSkills = () => {
    openRefineChat(
      'skills',
      'skills',
      null,
      'Skills inventory',
      context.skills.map(({ category, name, proficiency }) => ({ category, name, proficiency: proficiency || '' })),
      'Reorganize these skills into clear categories and remove duplicates.',
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
      'Clean up this certification list. Do not add credentials I have not provided.',
    );
  };

  const handleRunAiRefine = async () => {
    if (!refinePrompt.trim()) return;
    const instruction = refinePrompt.trim();
    setRefineError(null);
    setRefining(true);
    try {
      const res = await api.refineSection(
        refineSectionType,
        refineDraftContent,
        instruction,
        refineMessages,
      );
      setRefineDraftContent(res.proposed_content);
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
          bullet_points: refineDraftContent as string[],
        });
      } else if (refineTargetKind === 'project' && refineTargetId) {
        const project = context.projects.find((item) => item.id === refineTargetId);
        if (!project) throw new Error('Project no longer exists.');
        await api.updateProject(refineTargetId, {
          ...project,
          bullet_points: refineDraftContent as string[],
        });
      } else if (refineTargetKind === 'education' && refineTargetId) {
        const education = context.educations.find((item) => item.id === refineTargetId);
        if (!education) throw new Error('Education entry no longer exists.');
        await api.updateEducation(refineTargetId, {
          ...education,
          highlights: refineDraftContent as string[],
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
  const refineChangeCount = refineDiff.added + refineDiff.removed + refineDiff.changed;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Master Career Context</h1>
          <p className="text-sm text-slate-500 mt-1">
            Your exhaustive source-of-truth career history. Edit manually or iterate each section with chat prompts using <strong>{activeModel}</strong>.
          </p>
        </div>
        <button
          onClick={() => {
            setResetConfirmText('');
            setResetError(null);
            setResetApplications(true);
            setResetAiSettings(false);
            setResetOpen(true);
          }}
          className="flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-700 shadow-xs transition-colors hover:bg-rose-50"
        >
          <Trash2 className="h-4 w-4" />
          Reset profile & delete all data
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Personal Info & Summary */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
            <div className="flex items-center gap-2 mb-4 text-slate-900 font-semibold">
              <User className="w-5 h-5 text-indigo-600" />
              <span>Contact & Personal Info</span>
            </div>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={profile.full_name}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-indigo-500"
                  placeholder="e.g. John Doe"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Headline / Title</label>
                <input
                  type="text"
                  value={profile.headline}
                  onChange={(e) => setProfile({ ...profile, headline: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-indigo-500"
                  placeholder="e.g. Senior Full-Stack Engineer"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Location</label>
                <input
                  type="text"
                  value={profile.location}
                  onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-indigo-500"
                  placeholder="San Francisco, CA"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">LinkedIn URL</label>
                <input
                  type="text"
                  value={profile.linkedin_url}
                  onChange={(e) => setProfile({ ...profile, linkedin_url: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-indigo-500"
                  placeholder="linkedin.com/in/username"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">GitHub URL</label>
                <input
                  type="text"
                  value={profile.github_url}
                  onChange={(e) => setProfile({ ...profile, github_url: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-indigo-500"
                  placeholder="github.com/username"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700">Professional Summary</label>
                  <button
                    type="button"
                    onClick={openAiRefineForSummary}
                    className="flex items-center gap-1 text-[10px] font-semibold text-violet-700 hover:text-violet-900"
                  >
                    <Sparkles className="h-3 w-3" /> AI Refine
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={profile.summary}
                  onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-indigo-500"
                  placeholder="Master career summary and philosophy..."
                />
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                className="w-full flex items-center justify-center gap-2 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-all"
              >
                {savingProfile ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : profileSaved ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" /> Saved!
                  </>
                ) : (
                  'Save Profile'
                )}
              </button>
            </form>
          </div>

          {/* Skills Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-slate-900 font-semibold">
                <Wrench className="w-5 h-5 text-indigo-600" />
                <span>Skills Inventory ({context.skills.length})</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={openAiRefineForSkills}
                  className="flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700 hover:bg-violet-100"
                >
                  <Sparkles className="h-3 w-3" /> AI Refine
                </button>
                <button
                  onClick={() => setNewSkillOpen(true)}
                  className="p-1 hover:bg-slate-100 rounded-lg text-indigo-600 transition-colors"
                  title="Add Skill"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            {newSkillOpen && (
              <div className="p-3 mb-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <input
                  type="text"
                  placeholder="Skill name (e.g. Python, Docker)"
                  value={newSkill.name}
                  onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs rounded border border-slate-300"
                />
                <input
                  type="text"
                  placeholder="Category (e.g. Languages, Cloud)"
                  value={newSkill.category}
                  onChange={(e) => setNewSkill({ ...newSkill, category: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs rounded border border-slate-300"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setNewSkillOpen(false)}
                    className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddSkill}
                    className="px-3 py-1 text-xs bg-indigo-600 text-white rounded font-medium"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 max-h-80 overflow-y-auto">
              {context.skills.length === 0 ? (
                <p className="text-xs text-slate-400">No skills added yet.</p>
              ) : (
                context.skills.map((s) => (
                  <span
                    key={s.id}
                    className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200 transition-colors"
                  >
                    {s.name}
                    <button
                      onClick={() => handleDeleteSkill(s.id)}
                      className="text-slate-400 hover:text-rose-600 opacity-60 group-hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Award className="h-5 w-5 text-indigo-600" />
                <span>Certifications ({context.certifications?.length || 0})</span>
              </div>
              <button
                onClick={openAiRefineForCertifications}
                className="flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700 hover:bg-violet-100"
              >
                <Sparkles className="h-3 w-3" /> AI Refine
              </button>
            </div>
            <div className="space-y-2">
              {!context.certifications?.length ? (
                <p className="text-xs text-slate-400">No certifications yet. Use AI Refine and provide the credential details in chat.</p>
              ) : (
                context.certifications.map((certification) => (
                  <div key={certification.id || `${certification.name}-${certification.issuer}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-900">{certification.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {[certification.issuer, certification.issue_date].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Work Experience & Education & Projects */}
        <div className="lg:col-span-2 space-y-8">
          {/* Work Experience */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 text-slate-900 font-semibold text-lg">
                <Briefcase className="w-5 h-5 text-indigo-600" />
                <span>Work Experience ({context.experiences.length})</span>
              </div>
              <button
                onClick={() => setNewExpOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg transition-colors border border-indigo-200"
              >
                <Plus className="w-4 h-4" /> Add Experience
              </button>
            </div>

            {/* Add Experience Modal / Inline Form */}
            {newExpOpen && (
              <div className="mb-6 p-5 rounded-xl bg-indigo-50/40 border border-indigo-100 space-y-4">
                <h3 className="text-sm font-semibold text-slate-900">Add Work Experience</h3>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Company *"
                    value={newExp.company}
                    onChange={(e) => setNewExp({ ...newExp, company: e.target.value })}
                    className="px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                  />
                  <input
                    type="text"
                    placeholder="Role / Title *"
                    value={newExp.role}
                    onChange={(e) => setNewExp({ ...newExp, role: e.target.value })}
                    className="px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <input
                    type="text"
                    placeholder="Location"
                    value={newExp.location}
                    onChange={(e) => setNewExp({ ...newExp, location: e.target.value })}
                    className="px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                  />
                  <input
                    type="text"
                    placeholder="Start Date (e.g. Jan 2022)"
                    value={newExp.start_date}
                    onChange={(e) => setNewExp({ ...newExp, start_date: e.target.value })}
                    className="px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                  />
                  <input
                    type="text"
                    placeholder="End Date (e.g. Present)"
                    value={newExp.end_date}
                    onChange={(e) => setNewExp({ ...newExp, end_date: e.target.value })}
                    className="px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Bullet Points (one per line)
                  </label>
                  <textarea
                    rows={4}
                    value={newExp.bullet_points.join('\n')}
                    onChange={(e) =>
                      setNewExp({
                        ...newExp,
                        bullet_points: e.target.value.split('\n'),
                      })
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                    placeholder="Developed distributed pipeline...&#10;Reduced latency by 35%..."
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setNewExpOpen(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddExperience}
                    className="px-4 py-1.5 text-xs bg-indigo-600 text-white rounded-lg font-medium"
                  >
                    Save Experience
                  </button>
                </div>
              </div>
            )}

            {/* Experience Cards */}
            <div className="space-y-4">
              {context.experiences.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">
                  No work experience entries yet. Upload a resume or add manually.
                </div>
              ) : (
                context.experiences.map((exp) => (
                  <div
                    key={exp.id}
                    className="p-5 rounded-xl border border-slate-200/80 hover:border-slate-300 bg-slate-50/30 transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-slate-900 text-base">{exp.role}</h4>
                        <p className="text-xs text-slate-600 font-medium">
                          {exp.company} {exp.location && `• ${exp.location}`}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {exp.start_date} – {exp.is_current ? 'Present' : exp.end_date || 'Present'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* AI Refine button */}
                        <button
                          onClick={() => openAiRefineForExp(exp)}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 rounded-lg transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          AI Refine
                        </button>
                        <button
                          onClick={() => handleDeleteExperience(exp.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Bullet Points */}
                    {exp.bullet_points && exp.bullet_points.length > 0 && (
                      <ul className="space-y-1.5 pl-4 list-disc text-xs text-slate-700 marker:text-indigo-400">
                        {exp.bullet_points.map((b, i) => (
                          <li key={i} className="leading-relaxed">
                            {b}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Education & Projects Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Education Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
              <div className="flex items-center gap-2 text-slate-900 font-semibold mb-4">
                <GraduationCap className="w-5 h-5 text-indigo-600" />
                <span>Education ({context.educations.length})</span>
              </div>
              <div className="space-y-3">
                {context.educations.length === 0 ? (
                  <p className="text-xs text-slate-400">No education entries.</p>
                ) : (
                  context.educations.map((edu) => (
                    <div key={edu.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-xs text-slate-900">{edu.degree}</p>
                          <p className="text-[11px] text-slate-600">{edu.institution}</p>
                          <p className="text-[10px] text-slate-400">
                            {edu.start_date} – {edu.end_date}
                          </p>
                        </div>
                        <button
                          onClick={() => openAiRefineForEducation(edu)}
                          className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 rounded-lg transition-colors"
                        >
                          <Sparkles className="w-3 h-3" /> AI Refine
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Projects Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
              <div className="flex items-center gap-2 text-slate-900 font-semibold mb-4">
                <FolderGit2 className="w-5 h-5 text-indigo-600" />
                <span>Projects ({context.projects.length})</span>
              </div>
              <div className="space-y-3">
                {context.projects.length === 0 ? (
                  <p className="text-xs text-slate-400">No projects added.</p>
                ) : (
                  context.projects.map((proj) => (
                    <div key={proj.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-xs text-slate-900">{proj.title}</p>
                          {proj.subtitle && <p className="text-[11px] text-slate-600">{proj.subtitle}</p>}
                          {proj.bullet_points && proj.bullet_points.length > 0 && (
                            <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                              {proj.bullet_points[0]}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => openAiRefineForProject(proj)}
                          className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 rounded-lg transition-colors"
                        >
                          <Sparkles className="w-3 h-3" /> AI Refine
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
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
                  <Sparkles className="h-5 w-5 text-violet-600" />
                  <span>AI Section Chat</span>
                  <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                    {activeModel}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Editing <span className="font-semibold text-slate-700">{refineTargetLabel}</span> · nothing is saved until you confirm
                </p>
              </div>
              <button
                onClick={() => setRefineModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close AI section chat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
              {/* Left: draft + diff */}
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
                      Working draft
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
                        <span className="rounded-full bg-violet-600 px-1.5 text-[10px] font-bold text-white">
                          {refineChangeCount}
                        </span>
                      )}
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setRefineDraftContent(refineOriginalContent);
                      setRefineMessages([]);
                      setRefineExplanation('');
                    }}
                    className="flex items-center gap-1 text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-900"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reset draft
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  {refinePanel === 'draft' ? (
                    <ul className="space-y-2 text-sm text-slate-700">
                      {contentItems(refineDraftContent).length === 0 ? (
                        <li className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
                          No entries yet. Ask the AI to draft some.
                        </li>
                      ) : (
                        contentItems(refineDraftContent).map((item, idx) => (
                          <li
                            key={`${item}-${idx}`}
                            className="flex gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 leading-relaxed"
                          >
                            <span className="mt-0.5 text-[11px] font-semibold text-slate-400">{idx + 1}</span>
                            <span>{item}</span>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                        <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">+{refineDiff.added} added</span>
                        <span className="rounded-md bg-rose-50 px-2 py-1 text-rose-700">−{refineDiff.removed} removed</span>
                        <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">{refineDiff.changed} reworded</span>
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">{refineDiff.unchanged} unchanged</span>
                      </div>

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
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-500">
                      <p className="font-semibold text-slate-700">Start a conversation</p>
                      <p className="mt-1 leading-relaxed">
                        Ask the AI to add, remove, reorder, or rewrite entries. Every reply updates the working draft, and
                        the <strong>Diff vs saved</strong> tab shows exactly what will change.
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
                    <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] text-violet-800">
                      <span className="font-semibold">Why: </span>
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
                    {['Remove weak bullets', 'Make it concise', 'Add this new fact:', 'Reorder by impact'].map((chip) => (
                      <button
                        key={chip}
                        onClick={() => setRefinePrompt(chip)}
                        className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-700 transition-colors hover:bg-slate-200"
                      >
                        {chip}
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
                    className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-violet-500"
                    placeholder="Remove the second bullet, add this fact, or revise the current draft..."
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Ctrl/⌘ + Enter to send</span>
                    <button
                      onClick={handleRunAiRefine}
                      disabled={refining || !refinePrompt.trim()}
                      className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-medium text-white shadow-xs transition-all hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {refining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send message
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 bg-white px-6 py-4">
              {refineConfirmOpen ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-emerald-900">
                    Replace the saved content for <strong>{refineTargetLabel}</strong> with this draft?
                    {refineChangeCount > 0 && (
                      <span className="ml-1 text-emerald-700">
                        ({refineDiff.added} added, {refineDiff.removed} removed, {refineDiff.changed} reworded)
                      </span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRefineConfirmOpen(false)}
                      className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      Keep editing
                    </button>
                    <button
                      onClick={handleApplyRefine}
                      disabled={savingRefine}
                      className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {savingRefine && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Confirm and save
                    </button>
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
                    <button
                      onClick={() => setRefineModalOpen(false)}
                      className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      Discard
                    </button>
                    <button
                      onClick={() => {
                        setRefinePanel('diff');
                        setRefineConfirmOpen(true);
                      }}
                      disabled={refineChangeCount === 0}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Review & apply
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reset All Data Modal */}
      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-rose-50 p-2">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Reset profile and delete all data</h3>
                <p className="mt-1 text-xs text-slate-500">
                  This permanently deletes your contact details, summary, work experience, education, skills, projects,
                  and certifications. It cannot be undone.
                </p>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label className="flex items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={resetApplications}
                  onChange={(e) => setResetApplications(e.target.checked)}
                  className="mt-0.5 accent-rose-600"
                />
                <span>
                  Also delete job applications and generated resumes
                  <span className="block text-[11px] text-slate-500">Removes tracked jobs, tailored documents, and compiled PDFs.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={resetAiSettings}
                  onChange={(e) => setResetAiSettings(e.target.checked)}
                  className="mt-0.5 accent-rose-600"
                />
                <span>
                  Also reset AI settings
                  <span className="block text-[11px] text-slate-500">Restores default AI provider, endpoint, model, and custom instructions.</span>
                </span>
              </label>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Type <span className="font-mono font-bold text-rose-600">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-rose-500"
                placeholder="DELETE"
                autoComplete="off"
              />
            </div>

            {resetError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">
                {resetError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setResetOpen(false)}
                className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleResetAllData}
                disabled={resetting || resetConfirmText.trim().toUpperCase() !== 'DELETE'}
                className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Delete everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
