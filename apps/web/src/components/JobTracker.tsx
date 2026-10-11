import React, { useState, useEffect } from 'react';
import { JobApplication, TailoredDocument } from '../types';
import { api } from '../services/api';
import {
  Briefcase,
  Plus,
  Sparkles,
  ExternalLink,
  Trash2,
  FileCode,
  Copy,
  Download,
  Check,
  ChevronRight,
  Loader2,
  Save,
  CheckCircle2,
  TrendingUp,
  Eye,
} from 'lucide-react';
import { LatexDocumentPreview } from './LatexDocumentPreview';

interface JobTrackerProps {
  activeModel: string;
}

export const JobTracker: React.FC<JobTrackerProps> = ({ activeModel }) => {
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobApplication | null>(null);
  const [loading, setLoading] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedDoc, setSavedDoc] = useState(false);

  // New Job Modal
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [newJob, setNewJob] = useState({
    company_name: '',
    job_title: '',
    job_url: '',
    raw_description: '',
    notes: '',
  });

  // Active doc tab: 'resume' | 'cover_letter'
  const [activeDocType, setActiveDocType] = useState<'resume' | 'cover_letter'>('resume');
  const [editableLatex, setEditableLatex] = useState('');
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');

  const loadJobs = async () => {
    setLoading(true);
    try {
      const data = await api.getJobs();
      setJobs(data);
      if (selectedJob) {
        const updated = await api.getJobDetail(selectedJob.id);
        setSelectedJob(updated);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const handleSelectJob = async (job: JobApplication) => {
    try {
      const detail = await api.getJobDetail(job.id);
      setSelectedJob(detail);
      const initialDoc = detail.documents?.find((d) => d.doc_type === activeDocType);
      setEditableLatex(initialDoc ? initialDoc.latex_source : '');
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (selectedJob && selectedJob.documents) {
      const doc = selectedJob.documents.find((d) => d.doc_type === activeDocType);
      setEditableLatex(doc ? doc.latex_source : '');
    }
  }, [activeDocType, selectedJob]);

  const handleCreateJob = async () => {
    if (!newJob.company_name || !newJob.job_title || !newJob.raw_description) return;
    try {
      const res = await api.createJob(newJob);
      setNewJobOpen(false);
      setNewJob({ company_name: '', job_title: '', job_url: '', raw_description: '', notes: '' });
      await loadJobs();
      if (res.id) {
        const detail = await api.getJobDetail(res.id);
        setSelectedJob(detail);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTailorJob = async () => {
    if (!selectedJob) return;
    setTailoring(true);
    try {
      await api.tailorJob(selectedJob.id);
      const detail = await api.getJobDetail(selectedJob.id);
      setSelectedJob(detail);
      const doc = detail.documents?.find((d) => d.doc_type === activeDocType);
      setEditableLatex(doc ? doc.latex_source : '');
      await loadJobs();
    } catch (err) {
      console.error(err);
      alert('Tailoring failed. Make sure Ollama is running and has master context.');
    } finally {
      setTailoring(false);
    }
  };

  const handleSaveLatex = async () => {
    if (!selectedJob || !selectedJob.documents) return;
    const doc = selectedJob.documents.find((d) => d.doc_type === activeDocType);
    if (!doc) return;
    try {
      await api.updateDocumentLatex(doc.id, editableLatex);
      setSavedDoc(true);
      setTimeout(() => setSavedDoc(false), 2000);
      const detail = await api.getJobDetail(selectedJob.id);
      setSelectedJob(detail);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyLatex = () => {
    navigator.clipboard.writeText(editableLatex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTex = () => {
    if (!selectedJob) return;
    const blob = new Blob([editableLatex], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedJob.company_name}_${activeDocType}.tex`.replace(/\s+/g, '_');
    link.click();
    URL.revokeObjectURL(url);
  };

  const activeDoc = selectedJob?.documents?.find((d) => d.doc_type === activeDocType);

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Job Applications & Tailoring Studio</h1>
          <p className="text-sm text-slate-500 mt-1">
            Track applications, generate ATS-targeted LaTeX resumes and CVs tailored with <strong>{activeModel}</strong>.
          </p>
        </div>
        <button
          onClick={() => setNewJobOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-xl shadow-xs transition-all shrink-0"
        >
          <Plus className="w-4 h-4" /> Add Application
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Job Applications List */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
            <h3 className="font-semibold text-slate-900 text-sm mb-3 px-1 flex items-center justify-between">
              <span>Tracked Roles ({jobs.length})</span>
            </h3>

            {loading ? (
              <div className="py-8 text-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-500 mb-2" />
                <p className="text-xs">Loading applications...</p>
              </div>
            ) : jobs.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs px-2">
                No applications yet. Click "Add Application" to paste a job description.
              </div>
            ) : (
              <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                {jobs.map((j) => (
                  <div
                    key={j.id}
                    onClick={() => handleSelectJob(j)}
                    className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                      selectedJob?.id === j.id
                        ? 'border-indigo-600 bg-indigo-50/40 shadow-xs ring-1 ring-indigo-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm leading-snug">{j.job_title}</h4>
                        <p className="text-xs text-slate-600 font-medium">{j.company_name}</p>
                      </div>
                      {j.match_score !== null && j.match_score !== undefined && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 shrink-0">
                          {Math.round(j.match_score)}%
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-3 text-[11px] text-slate-400">
                      <span className="capitalize px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                        {j.status}
                      </span>
                      <span>{j.documents_count || 0} Docs attached</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Tailoring Studio & LaTeX Editor */}
        <div className="lg:col-span-8">
          {selectedJob ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
              {/* Job Header & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-900">{selectedJob.job_title}</h2>
                    {selectedJob.match_score !== null && selectedJob.match_score !== undefined && (
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                        <TrendingUp className="w-3.5 h-3.5" />
                        {Math.round(selectedJob.match_score)}% Match
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 font-medium mt-0.5">
                    {selectedJob.company_name}
                    {selectedJob.job_url && (
                      <a
                        href={selectedJob.job_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 ml-2 text-indigo-600 hover:underline text-xs"
                      >
                        <ExternalLink className="w-3 h-3" /> Job Posting
                      </a>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTailorJob}
                    disabled={tailoring}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all"
                  >
                    {tailoring ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Tailoring with AI...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Tailor with AI ({activeModel})
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* AI Tailoring Rationale (if generated) */}
              {activeDoc?.tailoring_rationale && (
                <div className="p-4 rounded-xl bg-violet-50/70 border border-violet-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-violet-900 font-bold text-xs">
                    <Sparkles className="w-4 h-4 text-violet-600" />
                    AI Selection & Strategy Rationale:
                  </div>
                  <p className="text-xs text-violet-950 leading-relaxed">
                    {activeDoc.tailoring_rationale}
                  </p>
                </div>
              )}

              {/* Document Tabs & Editor */}
              {selectedJob.documents && selectedJob.documents.length > 0 ? (
                <div className="space-y-4">
                  {/* Tabs: Document Type & View Mode */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    {/* Document Selector */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setActiveDocType('resume')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          activeDocType === 'resume'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <FileCode className="w-3.5 h-3.5" /> Tailored Resume
                      </button>
                      <button
                        onClick={() => setActiveDocType('cover_letter')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          activeDocType === 'cover_letter'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <FileCode className="w-3.5 h-3.5" /> Cover Letter
                      </button>
                    </div>

                    {/* View Mode Toggle: Visual Preview vs LaTeX Code */}
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200/80">
                      <button
                        onClick={() => setViewMode('preview')}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                          viewMode === 'preview'
                            ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" /> Live Preview & PDF
                      </button>
                      <button
                        onClick={() => setViewMode('code')}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                          viewMode === 'code'
                            ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <FileCode className="w-3.5 h-3.5" /> LaTeX Source (.tex)
                      </button>
                    </div>
                  </div>

                  {/* Body: Preview Mode vs Code Mode */}
                  {viewMode === 'preview' ? (
                    <LatexDocumentPreview
                      latexSource={editableLatex}
                      docType={activeDocType}
                      companyName={selectedJob.company_name}
                    />
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-medium">
                          Directly edit the LaTeX source code. Changes will reflect in live preview upon saving.
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleCopyLatex}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            title="Copy to Clipboard"
                          >
                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied ? 'Copied' : 'Copy'}
                          </button>
                          <button
                            onClick={handleDownloadTex}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            title="Download .tex"
                          >
                            <Download className="w-3.5 h-3.5" /> .tex
                          </button>
                          <button
                            onClick={handleSaveLatex}
                            className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-2xs transition-colors"
                          >
                            {savedDoc ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
                            {savedDoc ? 'Saved' : 'Save'}
                          </button>
                        </div>
                      </div>

                      <div className="relative">
                        <textarea
                          rows={24}
                          value={editableLatex}
                          onChange={(e) => setEditableLatex(e.target.value)}
                          className="w-full font-mono text-xs p-4 rounded-xl bg-slate-900 text-slate-100 border border-slate-800 leading-relaxed focus:outline-indigo-500 shadow-inner"
                          placeholder="% LaTeX source code..."
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-12 text-center rounded-2xl bg-slate-50 border border-dashed border-slate-200 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900">No Tailored Document Yet</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Click <strong>"Tailor with AI"</strong> above. Ollama will compare this job description against your master context, pick the most relevant bullet points, and generate custom LaTeX code.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-16 text-center text-slate-400">
              <Briefcase className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-600">Select an application from the left</p>
              <p className="text-xs text-slate-400 mt-1">Or add a new job to start tailoring your resume.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Job Modal */}
      {newJobOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="font-bold text-slate-900 text-base">New Job Application</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Company Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Stripe"
                  value={newJob.company_name}
                  onChange={(e) => setNewJob({ ...newJob, company_name: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Job Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Backend Engineer"
                  value={newJob.job_title}
                  onChange={(e) => setNewJob({ ...newJob, job_title: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Job URL</label>
              <input
                type="text"
                placeholder="https://boards.greenhouse.io/..."
                value={newJob.job_url}
                onChange={(e) => setNewJob({ ...newJob, job_url: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Job Description *</label>
              <textarea
                rows={6}
                placeholder="Paste the full job description, requirements, and responsibilities here..."
                value={newJob.raw_description}
                onChange={(e) => setNewJob({ ...newJob, raw_description: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setNewJobOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateJob}
                className="px-4 py-2 text-xs bg-indigo-600 text-white rounded-lg font-medium shadow-xs"
              >
                Create Application
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
