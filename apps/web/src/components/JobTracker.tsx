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
  X,
  AlertCircle,
  Package,
  FolderArchive,
  Info,
} from 'lucide-react';
import { LatexDocumentPreview } from './LatexDocumentPreview';
import { RESUMEFORGE_CLASS } from '../utils/latexClass';
import { SectionHeader } from './ui/section-header';

interface JobTrackerProps {
  activeModel: string;
}

export const JobTracker: React.FC<JobTrackerProps> = ({ activeModel }) => {
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobApplication | null>(null);
  const [loading, setLoading] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedCls, setCopiedCls] = useState(false);
  const [savedDoc, setSavedDoc] = useState(false);
  const [codeFileTab, setCodeFileTab] = useState<'tex' | 'cls'>('tex');
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [showOverleafGuide, setShowOverleafGuide] = useState(false);
  const [reviewingSections, setReviewingSections] = useState(false);
  const [reviewedSuccess, setReviewedSuccess] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);

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
      } else if (data.length > 0) {
        const detail = await api.getJobDetail(data[0].id);
        setSelectedJob(detail);
      }
    } catch (err) {
      console.error(err);
      setOperationError(err instanceof Error ? err.message : 'Could not load applications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const handleSelectJob = async (job: JobApplication) => {
    setOperationError(null);
    try {
      const detail = await api.getJobDetail(job.id);
      setSelectedJob(detail);
      const initialDoc = detail.documents?.find((d) => d.doc_type === activeDocType);
      setEditableLatex(initialDoc ? initialDoc.latex_source : '');
    } catch (err) {
      console.error(err);
      setOperationError(err instanceof Error ? err.message : 'Could not load this application.');
    }
  };

  useEffect(() => {
    if (selectedJob && selectedJob.documents) {
      const doc = selectedJob.documents.find((d) => d.doc_type === activeDocType);
      setEditableLatex(doc ? doc.latex_source : '');
    }
  }, [activeDocType, selectedJob]);

  const [submittingJob, setSubmittingJob] = useState(false);
  const [createJobError, setCreateJobError] = useState<string | null>(null);

  const handleCreateJob = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setCreateJobError(null);
    if (!newJob.company_name.trim()) {
      setCreateJobError('Company Name is required.');
      return;
    }
    if (!newJob.job_title.trim()) {
      setCreateJobError('Job Title is required.');
      return;
    }
    setSubmittingJob(true);
    try {
      const res = await api.createJob({
        company_name: newJob.company_name.trim(),
        job_title: newJob.job_title.trim(),
        job_url: newJob.job_url?.trim() || '',
        raw_description: newJob.raw_description?.trim() || '',
        notes: newJob.notes?.trim() || '',
      });
      setNewJobOpen(false);
      setNewJob({ company_name: '', job_title: '', job_url: '', raw_description: '', notes: '' });
      await loadJobs();
      if (res.id) {
        const detail = await api.getJobDetail(res.id);
        setSelectedJob(detail);
      }
    } catch (err: any) {
      console.error(err);
      setCreateJobError(err.message || 'Failed to create job application.');
    } finally {
      setSubmittingJob(false);
    }
  };

  const handleTailorJob = async () => {
    if (!selectedJob) return;
    if (!selectedJob.raw_description?.trim()) {
      setOperationError('Add a job description before asking the model to tailor a resume.');
      return;
    }
    setOperationError(null);
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
      setOperationError(err instanceof Error ? err.message : 'Tailoring failed.');
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
      setOperationError(err instanceof Error ? err.message : 'Could not save the document.');
    }
  };

  const handleStatusChange = async (status: JobApplication['status']) => {
    if (!selectedJob) return;
    const previous = selectedJob;
    setOperationError(null);
    setSelectedJob({ ...selectedJob, status });
    try {
      await api.updateJob(selectedJob.id, { status });
      setJobs((current) => current.map((job) => job.id === selectedJob.id ? { ...job, status } : job));
    } catch (err) {
      setSelectedJob(previous);
      setOperationError(err instanceof Error ? err.message : 'Could not update application status.');
    }
  };

  const handleDeleteJob = async () => {
    if (!selectedJob || !confirm(`Delete ${selectedJob.job_title} at ${selectedJob.company_name}?`)) return;
    setOperationError(null);
    try {
      await api.deleteJob(selectedJob.id);
      const remaining = jobs.filter((job) => job.id !== selectedJob.id);
      setJobs(remaining);
      setSelectedJob(null);
      if (remaining.length > 0) {
        await handleSelectJob(remaining[0]);
      }
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : 'Could not delete this application.');
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

  const handleCopyCls = () => {
    navigator.clipboard.writeText(RESUMEFORGE_CLASS);
    setCopiedCls(true);
    setTimeout(() => setCopiedCls(false), 2000);
  };

  const handleDownloadCls = () => {
    const blob = new Blob([RESUMEFORGE_CLASS], { type: 'text/x-tex;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'resumeforge.cls';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadOverleafZip = async () => {
    if (!selectedJob) return;
    setDownloadingZip(true);
    setOperationError(null);
    try {
      const filename = `${selectedJob.company_name}_${activeDocType}_overleaf.zip`.replace(/\s+/g, '_');
      const doc = selectedJob.documents?.find((d) => d.doc_type === activeDocType);
      let blob: Blob;
      if (doc && editableLatex === doc.latex_source) {
        blob = await api.downloadDocumentZip(doc.id);
      } else {
        blob = await api.downloadCustomOverleafZip(editableLatex, selectedJob.company_name, activeDocType);
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setOperationError(err instanceof Error ? err.message : 'Failed to export Overleaf ZIP package.');
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleReviewSections = async () => {
    if (!selectedJob) return;
    const doc = selectedJob.documents?.find((d) => d.doc_type === activeDocType);
    setReviewingSections(true);
    setOperationError(null);
    try {
      let res: { status: string; latex_source: string };
      if (doc) {
        res = await api.reviewDocumentSections(doc.id, editableLatex);
      } else {
        res = await api.reviewCustomLatex(editableLatex);
      }
      setEditableLatex(res.latex_source);
      setReviewedSuccess(true);
      setTimeout(() => setReviewedSuccess(false), 3000);
      const detail = await api.getJobDetail(selectedJob.id);
      setSelectedJob(detail);
    } catch (err) {
      console.error(err);
      setOperationError(err instanceof Error ? err.message : 'Section review failed.');
    } finally {
      setReviewingSections(false);
    }
  };

  const activeDoc = selectedJob?.documents?.find((d) => d.doc_type === activeDocType);
  const statusCounts = jobs.reduce<Record<string, number>>((counts, job) => {
    counts[job.status] = (counts[job.status] || 0) + 1;
    return counts;
  }, {});

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <SectionHeader
        title="Job applications"
        description={
          <>
            Keep roles, notes, tailored resumes, and cover letters together. Use <strong>{activeModel}</strong> when you are ready to tailor a document.
          </>
        }
        actions={
          <button
            onClick={() => setNewJobOpen(true)}
            className="flex shrink-0 items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            <Plus className="w-4 h-4" /> Add Application
          </button>
        }
      />

      {jobs.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Active pipeline', jobs.length - (statusCounts.rejected || 0), 'text-indigo-700'],
            ['Applied', statusCounts.applied || 0, 'text-sky-700'],
            ['Interviewing', statusCounts.interviewing || 0, 'text-amber-700'],
            ['Offers', statusCounts.offer || 0, 'text-emerald-700'],
          ].map(([label, value, color]) => (
            <div key={String(label)} className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {operationError && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Action could not be completed</p>
            <p className="mt-0.5 text-xs text-rose-700">{operationError}</p>
          </div>
          <button onClick={() => setOperationError(null)} aria-label="Dismiss error"><X className="h-4 w-4" /></button>
        </div>
      )}

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
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
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

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Application status"
                    value={selectedJob.status}
                    onChange={(event) => handleStatusChange(event.target.value as JobApplication['status'])}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold capitalize text-slate-700"
                  >
                    <option value="saved">Saved</option>
                    <option value="applied">Applied</option>
                    <option value="interviewing">Interviewing</option>
                    <option value="offer">Offer</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <button
                    onClick={handleTailorJob}
                    disabled={tailoring}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all disabled:from-slate-400 disabled:to-slate-400"
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
                  <button
                    onClick={handleDeleteJob}
                    className="rounded-xl border border-slate-200 p-2 text-slate-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Delete application"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {tailoring && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Your AI model is analyzing requirements and tailoring evidence
                  </div>
                  <p className="mt-1 pl-6 text-xs text-indigo-700">Analyzing job description against your master profile. Keep this page open while your model processes.</p>
                </div>
              )}

              {selectedJob.extracted_keywords && selectedJob.extracted_keywords.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-500">Detected role keywords</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedJob.extracted_keywords.slice(0, 12).map((keyword) => (
                      <span key={keyword} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">{keyword}</span>
                    ))}
                  </div>
                </div>
              )}

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

                    <div className="flex items-center gap-2">
                      {/* AI Review Action Button */}
                      <button
                        onClick={handleReviewSections}
                        disabled={reviewingSections || !editableLatex}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-2xs transition-all disabled:opacity-50"
                        title="Run AI review across sections using small model to eliminate duplicate bullets and polish phrasing"
                      >
                        {reviewingSections ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                        ) : reviewedSuccess ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        )}
                        {reviewingSections ? 'Reviewing...' : reviewedSuccess ? 'Deduplicated!' : 'AI Review (Deduplicate)'}
                      </button>

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
                  </div>

                  {/* Body: Preview Mode vs Code Mode */}
                  {viewMode === 'preview' ? (
                    <LatexDocumentPreview
                      latexSource={editableLatex}
                      docType={activeDocType}
                      companyName={selectedJob.company_name}
                      documentId={editableLatex === activeDoc?.latex_source ? activeDoc?.id : undefined}
                      onReviewSections={handleReviewSections}
                      reviewingSections={reviewingSections}
                    />
                  ) : (
                    <div className="space-y-3">
                      {/* Sub-toolbar: File tabs & Export actions */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-100/80 p-2 rounded-xl border border-slate-200">
                        {/* File Switcher Tabs */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setCodeFileTab('tex')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                              codeFileTab === 'tex'
                                ? 'bg-white text-indigo-700 shadow-2xs border border-slate-200/80'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                            }`}
                          >
                            <FileCode className="w-3.5 h-3.5 text-indigo-600" />
                            <span>{selectedJob.company_name ? `${selectedJob.company_name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${activeDocType}.tex` : 'main.tex'}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium">Editable</span>
                          </button>

                          <button
                            onClick={() => setCodeFileTab('cls')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                              codeFileTab === 'cls'
                                ? 'bg-white text-emerald-800 shadow-2xs border border-slate-200/80'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                            }`}
                          >
                            <Package className="w-3.5 h-3.5 text-emerald-600" />
                            <span>resumeforge.cls</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">Class File</span>
                          </button>
                        </div>

                        {/* Export & Action Buttons */}
                        <div className="flex flex-wrap items-center gap-2">
                          {codeFileTab === 'tex' ? (
                            <>
                              <button
                                onClick={handleReviewSections}
                                disabled={reviewingSections || !editableLatex}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors shadow-2xs disabled:opacity-50"
                                title="Run section-by-section AI review to eliminate duplicate bullets"
                              >
                                {reviewingSections ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                                ) : reviewedSuccess ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                )}
                                {reviewingSections ? 'Reviewing...' : reviewedSuccess ? 'Deduplicated!' : 'AI Review (Deduplicate)'}
                              </button>

                              <button
                                onClick={handleCopyLatex}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors shadow-2xs"
                                title="Copy LaTeX source"
                              >
                                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                {copied ? 'Copied' : 'Copy'}
                              </button>
                              <button
                                onClick={handleDownloadTex}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors shadow-2xs"
                                title="Download .tex document"
                              >
                                <Download className="w-3.5 h-3.5" /> .tex
                              </button>
                              <button
                                onClick={handleSaveLatex}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-2xs transition-colors"
                              >
                                {savedDoc ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
                                {savedDoc ? 'Saved' : 'Save'}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={handleCopyCls}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors shadow-2xs"
                                title="Copy resumeforge.cls content"
                              >
                                {copiedCls ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                {copiedCls ? 'Copied' : 'Copy .cls'}
                              </button>
                              <button
                                onClick={handleDownloadCls}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors shadow-2xs"
                                title="Download resumeforge.cls"
                              >
                                <Download className="w-3.5 h-3.5" /> .cls
                              </button>
                            </>
                          )}

                          {/* Overleaf Zip Bundle */}
                          <button
                            onClick={handleDownloadOverleafZip}
                            disabled={downloadingZip}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg shadow-2xs transition-colors"
                            title="Download complete ZIP for Overleaf containing main.tex & resumeforge.cls"
                          >
                            {downloadingZip ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderArchive className="w-3.5 h-3.5" />}
                            Overleaf (.zip)
                          </button>

                          <button
                            onClick={() => setShowOverleafGuide(!showOverleafGuide)}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              showOverleafGuide ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800'
                            }`}
                            title="Overleaf import instructions"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Overleaf Quick Guide Banner */}
                      {showOverleafGuide && (
                        <div className="p-4 rounded-xl bg-indigo-50/80 border border-indigo-200 text-xs text-indigo-900 space-y-2">
                          <div className="flex items-center justify-between font-bold text-indigo-950">
                            <span className="flex items-center gap-1.5">
                              <ExternalLink className="w-3.5 h-3.5" />
                              How to open and edit this resume in Overleaf
                            </span>
                            <button
                              onClick={() => setShowOverleafGuide(false)}
                              className="text-indigo-400 hover:text-indigo-700"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className="text-slate-700 leading-relaxed">
                            Because this resume uses the custom <code className="px-1.5 py-0.5 bg-indigo-100 rounded text-indigo-800 font-mono text-[11px]">\documentclass&#123;resumeforge&#125;</code> class, Overleaf needs both your <code className="px-1.5 py-0.5 bg-indigo-100 rounded text-indigo-800 font-mono text-[11px]">main.tex</code> and <code className="px-1.5 py-0.5 bg-indigo-100 rounded text-indigo-800 font-mono text-[11px]">resumeforge.cls</code>.
                          </p>
                          <ol className="list-decimal list-inside space-y-1 text-slate-700 pt-1 font-medium">
                            <li>Click <strong>Overleaf (.zip)</strong> above to download the ready-to-use project archive.</li>
                            <li>Go to <a href="https://www.overleaf.com/project" target="_blank" rel="noreferrer" className="text-indigo-600 underline font-semibold hover:text-indigo-800">overleaf.com/project</a> and click <strong>New Project</strong> &rarr; <strong>Upload Project</strong>.</li>
                            <li>Drag and drop the downloaded <code className="px-1 py-0.5 bg-indigo-100 rounded text-indigo-800 font-mono text-[11px]">.zip</code> file. Overleaf will open and compile it immediately!</li>
                          </ol>
                        </div>
                      )}

                      {/* File Content Area */}
                      {codeFileTab === 'tex' ? (
                        <div className="relative">
                          <textarea
                            rows={24}
                            value={editableLatex}
                            onChange={(e) => setEditableLatex(e.target.value)}
                            className="w-full font-mono text-xs p-4 rounded-xl bg-slate-900 text-slate-100 border border-slate-800 leading-relaxed focus:outline-indigo-500 shadow-inner"
                            placeholder="% LaTeX source code..."
                          />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between px-1 text-xs text-slate-500">
                            <span>Document class file defining formatting, layout geometry, and macros.</span>
                            <span className="font-mono text-[11px] text-slate-400">resumeforge.cls &bull; LaTeX2e</span>
                          </div>
                          <pre className="max-h-[550px] overflow-y-auto p-4 rounded-xl bg-slate-900 text-slate-200 border border-slate-800 font-mono text-xs leading-relaxed select-text shadow-inner">
                            {RESUMEFORGE_CLASS}
                          </pre>
                        </div>
                      )}
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
                    Click <strong>"Tailor with AI"</strong> above. Your configured AI model will compare this job description against your master context, pick the most relevant bullet points, and generate custom LaTeX code.
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
          <form
            onSubmit={handleCreateJob}
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">New Job Application</h3>
              <button
                type="button"
                onClick={() => {
                  setNewJobOpen(false);
                  setCreateJobError(null);
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createJobError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{createJobError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Company Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Stripe"
                  value={newJob.company_name}
                  onChange={(e) => setNewJob({ ...newJob, company_name: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Job Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Backend Engineer"
                  value={newJob.job_title}
                  onChange={(e) => setNewJob({ ...newJob, job_title: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Job URL (Optional)</label>
              <input
                type="text"
                placeholder="https://jobs.lever.co/..."
                value={newJob.job_url}
                onChange={(e) => setNewJob({ ...newJob, job_url: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Job Description</label>
              <textarea
                rows={6}
                placeholder="Paste the full job description, requirements, and responsibilities here..."
                value={newJob.raw_description}
                onChange={(e) => setNewJob({ ...newJob, raw_description: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-indigo-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                You can paste this now or add it later before running AI tailoring.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setNewJobOpen(false);
                  setCreateJobError(null);
                }}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingJob}
                className="flex items-center gap-1.5 px-4 py-2 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-semibold shadow-xs transition-all cursor-pointer"
              >
                {submittingJob ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Application'
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
