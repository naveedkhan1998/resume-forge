import React, { useState, useEffect } from 'react';
import { JobApplication } from '../types';
import { api } from '../services/api';
import type { LucideIcon } from 'lucide-react';
import {
  Briefcase,
  Plus,
  Wand2,
  ExternalLink,
  Trash2,
  FileCode,
  Copy,
  Download,
  Check,
  Loader2,
  Save,
  Eye,
  X,
  AlertCircle,
  Package,
  FolderArchive,
  Info,
  Search,
  FileText,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react';
import { LatexDocumentPreview } from './LatexDocumentPreview';
import { RESUMEFORGE_CLASS } from '../utils/latexClass';
import { SectionHeader } from './ui/section-header';
import { Button } from './ui/button';
import { EmptyState, IconButton, Panel } from './ui/panel';
import { Field, TextArea, TextInput } from './ui/field';

interface JobTrackerProps {
  activeModel: string;
}

export const JobTracker: React.FC<JobTrackerProps> = ({ activeModel }) => {
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobApplication | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
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
  const [applicationQuery, setApplicationQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobApplication['status'] | 'all'>('all');

  // New Job Modal
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [newJob, setNewJob] = useState({
    company_name: '',
    job_title: '',
    job_url: '',
    raw_description: '',
    notes: '',
  });
  const [submittingJob, setSubmittingJob] = useState(false);
  const [createJobError, setCreateJobError] = useState<string | null>(null);

  // Active doc tab: 'resume' | 'cover_letter'
  const [activeDocType, setActiveDocType] = useState<'resume' | 'cover_letter'>('resume');
  const [editableLatex, setEditableLatex] = useState('');
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');

  // AI LaTeX Assistant state
  const [aiEditOpen, setAiEditOpen] = useState(false);
  const [aiEditTargetSection, setAiEditTargetSection] = useState<'all' | 'summary' | 'experience' | 'projects' | 'skills'>('all');
  const [aiEditInstruction, setAiEditInstruction] = useState('');
  const [aiEditing, setAiEditing] = useState(false);
  const [aiEditSummary, setAiEditSummary] = useState<string | null>(null);

  useEffect(() => {
    if (!newJobOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submittingJob) {
        setNewJobOpen(false);
        setCreateJobError(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [newJobOpen, submittingJob]);

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
    setAiEditSummary(null);
    setMobileView('detail');
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
        setMobileView('detail');
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
    setAiEditSummary(null);
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

  const handleRunAiEditLatex = async (customInstruction?: string, customSection?: 'all' | 'summary' | 'experience' | 'projects' | 'skills') => {
    if (!selectedJob) return;
    const instruction = (customInstruction ?? aiEditInstruction).trim();
    if (!instruction) return;
    const targetSection = customSection ?? aiEditTargetSection;
    const doc = selectedJob.documents?.find((d) => d.doc_type === activeDocType);

    setAiEditing(true);
    setOperationError(null);
    try {
      let res: {
        status: string;
        latex_source: string;
        changes_summary: string;
        keyword_coverage?: any;
      };
      if (doc) {
        res = await api.aiEditDocumentLatex(doc.id, instruction, {
          latex_source: editableLatex,
          target_section: targetSection,
        });
      } else {
        res = await api.aiEditCustomLatex(editableLatex, instruction, targetSection);
      }
      setEditableLatex(res.latex_source);
      setAiEditSummary(res.changes_summary || 'Updated LaTeX document.');
      if (!customInstruction) {
        setAiEditInstruction('');
      }
      const detail = await api.getJobDetail(selectedJob.id);
      setSelectedJob(detail);
    } catch (err) {
      console.error(err);
      setOperationError(err instanceof Error ? err.message : 'AI LaTeX edit failed.');
    } finally {
      setAiEditing(false);
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
      setMobileView('list');
      if (remaining.length > 0) {
        const detail = await api.getJobDetail(remaining[0].id);
        setSelectedJob(detail);
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
  const visibleJobs = jobs.filter((job) => {
    const query = applicationQuery.trim().toLowerCase();
    const matchesQuery =
      !query ||
      job.job_title.toLowerCase().includes(query) ||
      job.company_name.toLowerCase().includes(query);
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    return matchesQuery && matchesStatus;
  });
  const pipelineMetrics: Array<{ label: string; value: number; icon: LucideIcon }> = [
    { label: 'Active', value: jobs.length - (statusCounts.rejected || 0), icon: Briefcase },
    { label: 'Applied', value: statusCounts.applied || 0, icon: Check },
    { label: 'Interviewing', value: statusCounts.interviewing || 0, icon: Eye },
    { label: 'Offers', value: statusCounts.offer || 0, icon: FileText },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5">
      {/* Header */}
      <SectionHeader
        title="Job applications"
        description="Track each opportunity from saved role to offer, with tailored documents beside the source context."
        actions={
          <Button onClick={() => setNewJobOpen(true)}>
            <Plus className="h-4 w-4" /> Add application
          </Button>
        }
      />

      {jobs.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          {pipelineMetrics.map(({ label, value, icon: MetricIcon }) => (
            <div key={label} className="stat-tile">
              <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
                <MetricIcon className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">{label}</span>
              </div>
              <p className="mt-0.5 sm:mt-1 text-lg sm:text-xl font-semibold tabular-nums tracking-tight text-slate-950 dark:text-white">
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {operationError && (
        <div
          className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <div className="flex-1">
            <p className="font-semibold">Action could not be completed</p>
            <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-300">{operationError}</p>
          </div>
          <button
            onClick={() => setOperationError(null)}
            aria-label="Dismiss error"
            className="text-rose-500 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left Column: Job Applications List (hidden on mobile when viewing job detail) */}
        <div
          className={`space-y-3 lg:col-span-4 ${
            mobileView === 'detail' && selectedJob ? 'hidden lg:block' : 'block'
          }`}
        >
          <Panel
            title="Pipeline"
            icon={Briefcase}
            count={jobs.length}
            className="lg:sticky lg:top-20"
            bodyClassName="p-0 sm:p-0"
          >
            <div className="space-y-2.5 border-b border-slate-200 p-3 dark:border-slate-800">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={applicationQuery}
                  onChange={(event) => setApplicationQuery(event.target.value)}
                  placeholder="Search roles or companies"
                  className="field-input pl-8"
                  aria-label="Search applications"
                />
              </div>
              <div className="flex gap-1 overflow-x-auto pb-0.5">
                {(['all', 'saved', 'applied', 'interviewing', 'offer', 'rejected'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium capitalize transition-colors ${
                      statusFilter === status
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                    }`}
                  >
                    {status}
                    {status !== 'all' && (
                      <span className="ml-1 opacity-70">{statusCounts[status] || 0}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-400">
                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                <p className="text-xs">Loading applications…</p>
              </div>
            ) : jobs.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="No applications yet"
                  hint="Add a role and paste its description to start tailoring."
                  action={
                    <Button size="sm" variant="outline" onClick={() => setNewJobOpen(true)}>
                      <Plus className="h-3.5 w-3.5" /> Add application
                    </Button>
                  }
                />
              </div>
            ) : visibleJobs.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">
                  No matching applications
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setApplicationQuery('');
                    setStatusFilter('all');
                  }}
                  className="quiet-btn mt-2"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="max-h-[60dvh] lg:max-h-[calc(100vh-280px)] overflow-y-auto p-2 space-y-1">
                {visibleJobs.map((job) => {
                  const isSelected = selectedJob?.id === job.id;
                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => handleSelectJob(job)}
                      className={`group w-full rounded-md border p-3 text-left transition-colors ${
                        isSelected
                          ? 'border-slate-300 bg-slate-100/90 dark:border-slate-700 dark:bg-slate-800/90'
                          : 'border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-800 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                            {job.job_title}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                            {job.company_name}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {job.match_score !== null && job.match_score !== undefined && (
                            <span className="text-[11px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                              {Math.round(job.match_score)}%
                            </span>
                          )}
                          <ChevronRight className="h-3.5 w-3.5 text-slate-400 lg:hidden" />
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className={`application-status application-status-${job.status}`}>
                          {job.status}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                          {job.documents_count || 0} {(job.documents_count || 0) === 1 ? 'doc' : 'docs'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        {/* Right Column: Tailoring Studio & LaTeX Editor */}
        <div
          className={`lg:col-span-8 ${
            mobileView === 'list' && jobs.length > 0 ? 'hidden lg:block' : 'block'
          }`}
        >
          {selectedJob ? (
            <div className="panel overflow-hidden">
              {/* Mobile Back-to-Pipeline Bar */}
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-3.5 py-2 lg:hidden dark:border-slate-800 dark:bg-slate-900/50">
                <button
                  type="button"
                  onClick={() => setMobileView('list')}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>All applications ({jobs.length})</span>
                </button>
                <span className={`application-status application-status-${selectedJob.status}`}>
                  {selectedJob.status}
                </span>
              </div>

              {/* Job Header & Actions */}
              <div className="flex flex-col gap-3.5 border-b border-slate-200 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5 dark:border-slate-800">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                      {selectedJob.job_title}
                    </h2>
                    {selectedJob.match_score !== null && selectedJob.match_score !== undefined && (
                      <span className="chip font-semibold tabular-nums">
                        {Math.round(selectedJob.match_score)}% match
                      </span>
                    )}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-slate-500 dark:text-slate-400">
                    <span>{selectedJob.company_name}</span>
                    {selectedJob.job_url && (
                      <a
                        href={selectedJob.job_url}
                        target="_blank"
                        rel="noreferrer"
                        className="entry-link"
                      >
                        <ExternalLink className="h-3 w-3" /> View posting
                      </a>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Application status"
                    value={selectedJob.status}
                    onChange={(event) => handleStatusChange(event.target.value as JobApplication['status'])}
                    className="field-input h-8 w-auto py-0 text-xs font-medium capitalize"
                  >
                    <option value="saved">Saved</option>
                    <option value="applied">Applied</option>
                    <option value="interviewing">Interviewing</option>
                    <option value="offer">Offer</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <Button
                    size="sm"
                    onClick={handleTailorJob}
                    disabled={tailoring}
                  >
                    {tailoring ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Tailoring…</span>
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-3.5 w-3.5" />
                        <span>Tailor documents</span>
                      </>
                    )}
                  </Button>
                  <IconButton
                    tone="danger"
                    onClick={handleDeleteJob}
                    aria-label="Delete application"
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>

              <div className="space-y-4 p-3.5 sm:p-5">
                {tailoring && (
                  <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-slate-500" />
                    <div>
                      <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100">
                        Tailoring documents with {activeModel}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Extracting JD requirements, matching your profile evidence, and generating ATS-clean LaTeX.
                      </p>
                    </div>
                  </div>
                )}

                {(selectedJob.raw_description || selectedJob.notes) && (
                  <details className="group rounded-lg border border-slate-200 dark:border-slate-800">
                    <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                      <span className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-slate-400" />
                        Role context & job description
                      </span>
                      <span className="text-[11px] text-slate-400 group-open:hidden">Show</span>
                      <span className="hidden text-[11px] text-slate-400 group-open:inline">Hide</span>
                    </summary>
                    <div className="space-y-3.5 border-t border-slate-200 px-3 py-3 dark:border-slate-800">
                      {selectedJob.notes && (
                        <div>
                          <p className="group-label mb-1">Notes</p>
                          <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                            {selectedJob.notes}
                          </p>
                        </div>
                      )}
                      {selectedJob.raw_description && (
                        <div>
                          <p className="group-label mb-1">Job description</p>
                          <p className="max-h-60 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                            {selectedJob.raw_description}
                          </p>
                        </div>
                      )}
                    </div>
                  </details>
                )}

                {selectedJob.keyword_coverage ? (
                  <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          JD Keyword Coverage
                        </span>
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300">
                          {selectedJob.keyword_coverage.coverage_pct}% in resume
                        </span>
                      </div>
                      {selectedJob.keyword_coverage.missing_in_resume_but_in_profile.length > 0 && (
                        <button
                          type="button"
                          disabled={aiEditing}
                          onClick={() => {
                            setAiEditOpen(true);
                            handleRunAiEditLatex(
                              `Naturally weave these skills from my profile into the Skills section or relevant Experience/Project bullets: ${selectedJob.keyword_coverage?.missing_in_resume_but_in_profile.join(', ')}`,
                              'all',
                            );
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50"
                        >
                          {aiEditing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                          Weave {selectedJob.keyword_coverage.missing_in_resume_but_in_profile.length} profile skill
                          {selectedJob.keyword_coverage.missing_in_resume_but_in_profile.length === 1 ? '' : 's'}
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {selectedJob.keyword_coverage.matched_keywords.map((kw) => (
                        <span
                          key={`matched-${kw}`}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                          title="Present in tailored resume"
                        >
                          <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                          {kw}
                        </span>
                      ))}
                      {selectedJob.keyword_coverage.missing_in_resume_but_in_profile.map((kw) => (
                        <button
                          key={`profile-missing-${kw}`}
                          type="button"
                          disabled={aiEditing}
                          onClick={() => {
                            setAiEditOpen(true);
                            handleRunAiEditLatex(
                              `Weave "${kw}" (which is in my profile) into the Skills section and relevant experience bullets.`,
                              'all',
                            );
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50"
                          title="In your master profile but missing from this resume — click to weave in"
                        >
                          + {kw} (in profile)
                        </button>
                      ))}
                      {selectedJob.keyword_coverage.missing_keywords.map((kw) => (
                        <span
                          key={`missing-${kw}`}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500"
                          title="Not found in your master profile"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  selectedJob.extracted_keywords &&
                  selectedJob.extracted_keywords.length > 0 && (
                    <div>
                      <p className="group-label mb-1.5">Role keywords</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedJob.extracted_keywords.slice(0, 14).map((keyword) => (
                          <span key={keyword} className="chip">{keyword}</span>
                        ))}
                      </div>
                    </div>
                  )
                )}

                {activeDoc?.tailoring_rationale && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                      <Wand2 className="h-3.5 w-3.5 text-slate-400" />
                      Tailoring rationale
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {activeDoc.tailoring_rationale}
                    </p>
                  </div>
                )}

                {/* Document Tabs & Editor */}
                {selectedJob.documents && selectedJob.documents.length > 0 ? (
                  <div className="space-y-3.5">
                    {/* Tabs: Document Type & View Mode */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
                      {/* Document Selector */}
                      <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100/80 p-0.5 dark:border-slate-800 dark:bg-slate-900">
                        <button
                          onClick={() => setActiveDocType('resume')}
                          className={`result-tab ${activeDocType === 'resume' ? 'result-tab-active' : ''}`}
                        >
                          Resume
                        </button>
                        <button
                          onClick={() => setActiveDocType('cover_letter')}
                          className={`result-tab ${activeDocType === 'cover_letter' ? 'result-tab-active' : ''}`}
                        >
                          Cover letter
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant={aiEditOpen ? 'default' : 'outline'}
                          onClick={() => setAiEditOpen((open) => !open)}
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                          <span>AI Edit LaTeX</span>
                        </Button>

                        <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100/80 p-0.5 dark:border-slate-800 dark:bg-slate-900">
                          <button
                            onClick={() => setViewMode('preview')}
                            className={`result-tab ${viewMode === 'preview' ? 'result-tab-active' : ''}`}
                          >
                            <Eye className="h-3.5 w-3.5" /> Preview
                          </button>
                          <button
                            onClick={() => setViewMode('code')}
                            className={`result-tab ${viewMode === 'code' ? 'result-tab-active' : ''}`}
                          >
                            <FileCode className="h-3.5 w-3.5" /> Source
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* AI LaTeX Assistant Drawer */}
                    {aiEditOpen && (
                      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/90 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Wand2 className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                              AI LaTeX Assistant ({activeModel})
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="mr-1 text-[11px] text-slate-500 dark:text-slate-400">Section:</span>
                            {(['all', 'summary', 'experience', 'projects', 'skills'] as const).map((sec) => (
                              <button
                                key={sec}
                                type="button"
                                onClick={() => setAiEditTargetSection(sec)}
                                className={`rounded px-2 py-0.5 text-[11px] font-medium capitalize transition-colors ${
                                  aiEditTargetSection === sec
                                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                                    : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                                }`}
                              >
                                {sec}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                          {[
                            {
                              label: 'Tighten to fit 1 page',
                              instruction: 'Condense verbose bullets across Experience and Projects so the entire resume fits cleanly on 1 page without losing metrics or JD keywords.',
                              section: 'all' as const,
                            },
                            {
                              label: 'Strengthen impact & metrics',
                              instruction: 'Rewrite bullets with stronger action verbs and foreground measurable outcomes, scope, and domain impact.',
                              section: 'experience' as const,
                            },
                            {
                              label: 'Sharpen summary for JD',
                              instruction: 'Rewrite the Professional Summary to directly align my core experience and strengths with this target role in 2-3 high-impact sentences.',
                              section: 'summary' as const,
                            },
                            {
                              label: 'Order skills by JD priority',
                              instruction: 'Reorder and group the Skills section so the most relevant qualifications and skills for this job appear first in each category.',
                              section: 'skills' as const,
                            },
                          ].map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              disabled={aiEditing}
                              onClick={() => {
                                setAiEditTargetSection(preset.section);
                                handleRunAiEditLatex(preset.instruction, preset.section);
                              }}
                              className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                              ✦ {preset.label}
                            </button>
                          ))}
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            type="text"
                            value={aiEditInstruction}
                            onChange={(e) => setAiEditInstruction(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleRunAiEditLatex();
                              }
                            }}
                            disabled={aiEditing}
                            placeholder={`Ask AI to edit ${aiEditTargetSection === 'all' ? 'the LaTeX document' : `the ${aiEditTargetSection} section`}…`}
                            className="field-input flex-1 text-xs"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleRunAiEditLatex()}
                            disabled={aiEditing || !aiEditInstruction.trim()}
                            className="shrink-0"
                          >
                            {aiEditing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                            <span>{aiEditing ? 'Applying…' : 'Apply AI edit'}</span>
                          </Button>
                        </div>

                        {aiEditSummary && (
                          <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                            <span>
                              <strong>AI updated LaTeX:</strong> {aiEditSummary}
                            </span>
                            <button
                              type="button"
                              onClick={() => setAiEditSummary(null)}
                              className="text-emerald-700 hover:text-emerald-950 dark:text-emerald-300 dark:hover:text-white"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}

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
                        <div className="flex flex-col justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900/70">
                          {/* File Switcher Tabs */}
                          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100/80 p-0.5 dark:border-slate-800 dark:bg-slate-900">
                            <button
                              onClick={() => setCodeFileTab('tex')}
                              className={`result-tab ${codeFileTab === 'tex' ? 'result-tab-active' : ''}`}
                            >
                              <FileCode className="h-3.5 w-3.5" />
                              <span className="max-w-36 sm:max-w-48 truncate">
                                {selectedJob.company_name ? `${selectedJob.company_name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${activeDocType}.tex` : 'main.tex'}
                              </span>
                            </button>

                            <button
                              onClick={() => setCodeFileTab('cls')}
                              className={`result-tab ${codeFileTab === 'cls' ? 'result-tab-active' : ''}`}
                            >
                              <Package className="h-3.5 w-3.5" />
                              <span>resumeforge.cls</span>
                            </button>
                          </div>

                          {/* Export & Action Buttons */}
                          <div className="flex flex-wrap items-center gap-1">
                            {codeFileTab === 'tex' ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={handleReviewSections}
                                  disabled={reviewingSections || !editableLatex}
                                  title="Run section-by-section AI review to eliminate duplicate bullets"
                                >
                                  {reviewingSections ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : reviewedSuccess ? (
                                    <Check className="h-3.5 w-3.5" />
                                  ) : (
                                    <Wand2 className="h-3.5 w-3.5" />
                                  )}
                                  {reviewingSections ? 'Reviewing…' : reviewedSuccess ? 'Reviewed' : 'Review'}
                                </Button>

                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={handleCopyLatex}
                                  title="Copy LaTeX source"
                                >
                                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                  {copied ? 'Copied' : 'Copy'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={handleDownloadTex}
                                  title="Download .tex document"
                                >
                                  <Download className="h-3.5 w-3.5" /> .tex
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={handleSaveLatex}
                                >
                                  {savedDoc ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                                  {savedDoc ? 'Saved' : 'Save'}
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={handleCopyCls}
                                  title="Copy resumeforge.cls content"
                                >
                                  {copiedCls ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                  {copiedCls ? 'Copied' : 'Copy .cls'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={handleDownloadCls}
                                  title="Download resumeforge.cls"
                                >
                                  <Download className="h-3.5 w-3.5" /> .cls
                                </Button>
                              </>
                            )}

                            {/* Overleaf Zip Bundle */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleDownloadOverleafZip}
                              disabled={downloadingZip}
                              title="Download complete ZIP for Overleaf containing main.tex & resumeforge.cls"
                            >
                              {downloadingZip ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderArchive className="h-3.5 w-3.5" />}
                              Overleaf
                            </Button>

                            <IconButton
                              onClick={() => setShowOverleafGuide(!showOverleafGuide)}
                              className={showOverleafGuide ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white' : ''}
                              title="Overleaf import instructions"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </IconButton>
                          </div>
                        </div>

                        {/* Overleaf Quick Guide Banner */}
                        {showOverleafGuide && (
                          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                            <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-slate-100">
                              <span className="flex items-center gap-1.5">
                                <ExternalLink className="h-3.5 w-3.5" />
                                How to open and edit this resume in Overleaf
                              </span>
                              <IconButton onClick={() => setShowOverleafGuide(false)} aria-label="Close guide">
                                <X className="h-3.5 w-3.5" />
                              </IconButton>
                            </div>
                            <p className="leading-relaxed">
                              Because this resume uses the custom <code className="chip font-mono">\documentclass&#123;resumeforge&#125;</code> class, Overleaf needs both your <code className="chip font-mono">main.tex</code> and <code className="chip font-mono">resumeforge.cls</code>.
                            </p>
                            <ol className="list-inside list-decimal space-y-1 pt-1">
                              <li>Click <strong>Overleaf</strong> above to download the ready-to-use project archive.</li>
                              <li>Go to <a href="https://www.overleaf.com/project" target="_blank" rel="noreferrer" className="entry-link">overleaf.com/project</a> and click <strong>New Project</strong> &rarr; <strong>Upload Project</strong>.</li>
                              <li>Upload the downloaded <code className="chip font-mono">.zip</code> file.</li>
                            </ol>
                          </div>
                        )}

                        {/* File Content Area */}
                        {codeFileTab === 'tex' ? (
                          <div className="relative">
                            <textarea
                              rows={20}
                              value={editableLatex}
                              onChange={(e) => setEditableLatex(e.target.value)}
                              className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3.5 sm:p-4 font-mono text-xs leading-relaxed text-slate-100 focus:border-slate-600 focus:outline-none"
                              placeholder="% LaTeX source code..."
                            />
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between px-1 text-xs text-slate-500 dark:text-slate-400">
                              <span>Document class file defining formatting, layout geometry, and macros.</span>
                              <span className="font-mono text-[11px] text-slate-400">resumeforge.cls &bull; LaTeX2e</span>
                            </div>
                            <pre className="max-h-[480px] select-text overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-3.5 sm:p-4 font-mono text-xs leading-relaxed text-slate-200">
                              {RESUMEFORGE_CLASS}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <EmptyState
                    title="No tailored documents yet"
                    hint="Generate a resume and cover letter from this role's description and your career profile."
                    action={
                      <Button size="sm" onClick={handleTailorJob} disabled={tailoring || !selectedJob.raw_description?.trim()}>
                        <Wand2 className="h-3.5 w-3.5" /> Tailor documents
                      </Button>
                    }
                  />
                )}
              </div>
            </div>
          ) : (
            <Panel>
              <EmptyState
                title="Select an application"
                hint="Choose a role from the pipeline, or add a new one to start tailoring."
                action={
                  <Button size="sm" variant="outline" onClick={() => setNewJobOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Add application
                  </Button>
                }
              />
            </Panel>
          )}
        </div>
      </div>

      {/* Compact Add Job Modal */}
      {newJobOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !submittingJob) {
              setNewJobOpen(false);
              setCreateJobError(null);
            }
          }}
        >
          <form
            onSubmit={handleCreateJob}
            className="modal-shell max-w-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-job-modal-title"
          >
            <div className="modal-header">
              <div>
                <h3
                  id="add-job-modal-title"
                  className="text-sm font-semibold text-slate-900 dark:text-slate-100"
                >
                  Add application
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Capture the target role and job description for tailoring.
                </p>
              </div>
              <IconButton
                type="button"
                onClick={() => {
                  setNewJobOpen(false);
                  setCreateJobError(null);
                }}
                disabled={submittingJob}
                aria-label="Close add application dialog"
              >
                <X className="h-4 w-4" />
              </IconButton>
            </div>

            <div className="modal-body space-y-3.5">
              {createJobError && (
                <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>{createJobError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Company">
                  <TextInput
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g., Mayo Clinic, Deloitte, Stripe"
                    value={newJob.company_name}
                    onChange={(e) => setNewJob({ ...newJob, company_name: e.target.value })}
                  />
                </Field>
                <Field label="Job title">
                  <TextInput
                    type="text"
                    required
                    placeholder="e.g., ICU Nurse, Financial Analyst, Product Manager"
                    value={newJob.job_title}
                    onChange={(e) => setNewJob({ ...newJob, job_title: e.target.value })}
                  />
                </Field>
              </div>

              <Field label="Job posting URL (optional)">
                <TextInput
                  type="text"
                  placeholder="https://jobs.example.com/role"
                  value={newJob.job_url}
                  onChange={(e) => setNewJob({ ...newJob, job_url: e.target.value })}
                />
              </Field>

              <Field
                label="Job description"
                hint="Paste the role description used to tailor your resume."
              >
                <TextArea
                  rows={4}
                  className="resize-y"
                  placeholder="Responsibilities, requirements, and preferred qualifications…"
                  value={newJob.raw_description}
                  onChange={(e) => setNewJob({ ...newJob, raw_description: e.target.value })}
                />
              </Field>

              <Field label="Notes (optional)">
                <TextArea
                  rows={2}
                  placeholder="Recruiter, referral, salary range, follow-up…"
                  value={newJob.notes}
                  onChange={(e) => setNewJob({ ...newJob, notes: e.target.value })}
                />
              </Field>
            </div>

            <div className="modal-footer justify-end">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setNewJobOpen(false);
                  setCreateJobError(null);
                }}
                disabled={submittingJob}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submittingJob}>
                {submittingJob ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Creating…
                  </>
                ) : (
                  'Create application'
                )}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
