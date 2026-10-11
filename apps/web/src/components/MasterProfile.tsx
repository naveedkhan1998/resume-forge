import React, { useState, useEffect } from 'react';
import {
  MasterContext,
  Profile,
  Experience,
  Education,
  Skill,
  Project,
} from '../types';
import { api } from '../services/api';
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
} from 'lucide-react';

interface MasterProfileProps {
  context: MasterContext;
  onRefresh: () => void;
  activeModel: string;
}

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
  const [refineTargetExpId, setRefineTargetExpId] = useState<number | null>(null);
  const [refineContent, setRefineContent] = useState<any>(null);
  const [refinePrompt, setRefinePrompt] = useState('');
  const [refining, setRefining] = useState(false);
  const [refineResult, setRefineResult] = useState<any | null>(null);

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

  const openAiRefineForExp = (exp: Experience) => {
    setRefineSectionType('experience');
    setRefineTargetExpId(exp.id || null);
    setRefineContent(exp.bullet_points);
    setRefinePrompt('Quantify bullet points with measurable impact and action verbs.');
    setRefineResult(null);
    setRefineModalOpen(true);
  };

  const handleRunAiRefine = async () => {
    if (!refinePrompt.trim()) return;
    setRefining(true);
    try {
      const res = await api.refineSection(
        refineSectionType,
        refineContent,
        refinePrompt
      );
      setRefineResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setRefining(false);
    }
  };

  const handleApplyRefine = async () => {
    if (!refineResult || !refineTargetExpId) return;
    const exp = context.experiences.find((e) => e.id === refineTargetExpId);
    if (!exp) return;

    let updatedBullets = exp.bullet_points;
    if (Array.isArray(refineResult.refined_content)) {
      updatedBullets = refineResult.refined_content;
    } else if (typeof refineResult.refined_content === 'string') {
      updatedBullets = refineResult.refined_content.split('\n').filter(Boolean);
    }

    await api.updateExperience(refineTargetExpId, {
      ...exp,
      bullet_points: updatedBullets,
    });
    setRefineModalOpen(false);
    onRefresh();
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Master Career Context</h1>
        <p className="text-sm text-slate-500 mt-1">
          Your exhaustive source-of-truth career history. Edit manually or iterate each section with chat prompts using <strong>{activeModel}</strong>.
        </p>
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
                <label className="block text-xs font-medium text-slate-700 mb-1">Professional Summary</label>
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
              <button
                onClick={() => setNewSkillOpen(true)}
                className="p-1 hover:bg-slate-100 rounded-lg text-indigo-600 transition-colors"
                title="Add Skill"
              >
                <Plus className="w-5 h-5" />
              </button>
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
                      <p className="font-semibold text-xs text-slate-900">{edu.degree}</p>
                      <p className="text-[11px] text-slate-600">{edu.institution}</p>
                      <p className="text-[10px] text-slate-400">
                        {edu.start_date} – {edu.end_date}
                      </p>
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
                      <p className="font-semibold text-xs text-slate-900">{proj.title}</p>
                      {proj.subtitle && <p className="text-[11px] text-slate-600">{proj.subtitle}</p>}
                      {proj.bullet_points && proj.bullet_points.length > 0 && (
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                          {proj.bullet_points[0]}
                        </p>
                      )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Sparkles className="w-5 h-5 text-violet-600" />
                <span>AI Section Refinement ({activeModel})</span>
              </div>
              <button
                onClick={() => setRefineModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Chat Instruction for AI
              </label>
              <textarea
                rows={2}
                value={refinePrompt}
                onChange={(e) => setRefinePrompt(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-violet-500"
                placeholder="What should the AI change? E.g., 'Rewrite bullet points with concrete metrics using STAR format'"
              />

              {/* Prompt chips */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[
                  'Add metrics & numbers',
                  'Use STAR format',
                  'Make more concise',
                  'Highlight leadership',
                  'Emphasize systems architecture',
                ].map((chip) => (
                  <button
                    key={chip}
                    onClick={() => setRefinePrompt(chip)}
                    className="px-2 py-0.5 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleRunAiRefine}
                disabled={refining}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-medium text-xs rounded-xl shadow-xs transition-all"
              >
                {refining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Generate Improvement
              </button>
            </div>

            {refineResult && (
              <div className="mt-4 p-4 rounded-xl bg-violet-50/70 border border-violet-200 space-y-3">
                <p className="text-xs font-semibold text-violet-900">
                  AI Suggestion ({refineResult.explanation}):
                </p>
                <div className="text-xs text-slate-800 bg-white p-3 rounded-lg border border-violet-100 max-h-48 overflow-y-auto space-y-1">
                  {Array.isArray(refineResult.refined_content) ? (
                    refineResult.refined_content.map((b: string, idx: number) => (
                      <p key={idx} className="leading-relaxed">
                        • {b}
                      </p>
                    ))
                  ) : (
                    <p>{refineResult.refined_content}</p>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setRefineModalOpen(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleApplyRefine}
                    className="px-4 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium shadow-xs"
                  >
                    Apply to Experience
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
