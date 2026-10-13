import React, { useState, useEffect } from 'react';
import { JobApplication, TailoredDocument } from '../types';
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
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <SectionHeader
        title="Job applications"
        description={
          <>
            Track each opportunity from saved role to offer, with tailored documents beside the source context.
          </>
        }
        actions={
          <Button onClick={() => setNewJobOpen(true)}>
            <Plus className="h-4 w-4" /> Add application
          </Button>
        }
      />

      {jobs.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {pipelineMetrics.map(({ label, value, icon: MetricIcon }) => (
            <div key={label} className="stat-tile">
              <div className="flex items-center gap-1.5 text-slate-400">
                <MetricIcon className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">{label}</span>
              </div>
              <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-slate-950 dark:text-white">
                {value}
              </p>
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
        <div className="space-y-3 lg:col-span-4">
          <Panel
            title="Pipeline"
            icon={Briefcase}
            count={jobs.length}
            className="lg:sticky lg:top-20"
            bodyClassName="p-0 sm:p-0"
          >
            <div className="space-y-3 border-b border-slate-200 p-3 dark:border-slate-800">
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
                    className={`shrink-0 rounded px-2 py-1 text-[11px] font-medium capitalize transition-colors ${
                      statusFilter === status
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800'
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
                <p className="text-[13px] font-medium text-slate-600">No matching applications</p>
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
              <div className="max-h-[calc(100vh-280px)] overflow-y-auto p-2">
                {visibleJobs.map((job) => {
                  const isSelected = selectedJob?.id === job.id;
                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => handleSelectJob(job)}
                      className={`group mb-1 w-full rounded p-3 text-left transition-colors last:mb-0 ${
                        isSelected
                          ? 'bg-slate-100 dark:bg-slate-800'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-slate-900">
                            {job.job_title}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-500">{job.company_name}</p>
                        </div>
                        {job.match_score !== null && job.match_score !== undefined && (
                          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-500">
                            {Math.round(job.match_score)}%
                          </span>
                        )}
                      </div>
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <span className={`application-status application-status-${job.status}`}>
                          {job.status}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {job.documents_count || 0} {(job.documents_count || 0) === 1 ? 'document' : 'documents'}
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
        <div className="lg:col-span-8">
          {selectedJob ? (
            <div className="panel overflow-hidden">
              {/* Job Header & Actions */}
              <div className="flex flex-col gap-4 border-b border-slate-200 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5 dark:border-slate-800">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                      {selectedJob.job_title}
                    </h2>
                    {selectedJob.match_score !== null && selectedJob.match_score !== undefined && (
                      <span className="chip font-semibold tabular-nums">
                        {Math.round(selectedJob.match_score)}% match
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] text-slate-500">
                    {selectedJob.company_name}
                    {selectedJob.job_url && (
                      <a
                        href={selectedJob.job_url}
                        target="_blank"
                        rel="noreferrer"
                        className="entry-link ml-2"
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
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Tailoring…
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4" />
                        Tailor documents
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

              <div className="space-y-5 p-4 sm:p-5">
                {tailoring && (
                  <div className="flex items-start gap-3 rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-slate-500" />
                    <div>
                      <p className="text-[13px] font-medium text-slate-800">Tailoring documents with {activeModel}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Comparing the role requirements with your profile evidence. Keep this page open.
                      </p>
                    </div>
                  </div>
                )}

                {(selectedJob.raw_description || selectedJob.notes) && (
                  <details className="group rounded border border-slate-200 dark:border-slate-800">
                    <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-xs font-medium text-slate-700">
                      <span className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-slate-400" />
                        Role context
                      </span>
                      <span className="text-[11px] text-slate-400 group-open:hidden">Show</span>
                      <span className="hidden text-[11px] text-slate-400 group-open:inline">Hide</span>
                    </summary>
                    <div className="space-y-4 border-t border-slate-200 px-3 py-3 dark:border-slate-800">
                      {selectedJob.notes && (
                        <div>
                          <p className="group-label mb-1.5">Notes</p>
                          <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                            {selectedJob.notes}
                          </p>
                        </div>
                      )}
                      {selectedJob.raw_description && (
                        <div>
                          <p className="group-label mb-1.5">Job description</p>
                          <p className="max-h-72 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                            {selectedJob.raw_description}
                          </p>
                        </div>
                      )}
                    </div>
                  </details>
                )}

                {selectedJob.extracted_keywords && selectedJob.extracted_keywords.length > 0 && (
                  <div>
                    <p className="group-label mb-2">Role keywords</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedJob.extracted_keywords.slice(0, 12).map((keyword) => (
                        <span key={keyword} className="chip">{keyword}</span>
                      ))}
                    </div>
                  </div>
                )}

                {activeDoc?.tailoring_rationale && (
                  <div className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <Wand2 className="h-3.5 w-3.5 text-slate-400" />
                      Tailoring rationale
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                      {activeDoc.tailoring_rationale}
                    </p>
                  </div>
                )}

              {/* Document Tabs & Editor */}
              {selectedJob.documents && selectedJob.documents.length > 0 ? (
                <div className="space-y-4">
                  {/* Tabs: Document Type & View Mode */}
                  <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center dark:border-slate-800">
                    {/* Document Selector */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setActiveDocType('resume')}
                        className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                          activeDocType === 'resume'
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800'
                        }`}
                      >
                        Resume
                      </button>
                      <button
                        onClick={() => setActiveDocType('cover_letter')}
                        className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                          activeDocType === 'cover_letter'
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800'
                        }`}
                      >
                        Cover letter
                      </button>
                    </div>

                    <div className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-900">
                        <button
                          onClick={() => setViewMode('preview')}
                          className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                            viewMode === 'preview'
                              ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800'
                              : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          <Eye className="h-3.5 w-3.5" /> Preview
                        </button>
                        <button
                          onClick={() => setViewMode('code')}
                          className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                            viewMode === 'code'
                              ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800'
                              : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          <FileCode className="h-3.5 w-3.5" /> Source
                        </button>
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
                      <div className="flex flex-col justify-between gap-2 rounded border border-slate-200 bg-slate-50 p-2 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900">
                        {/* File Switcher Tabs */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setCodeFileTab('tex')}
                            className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                              codeFileTab === 'tex'
                                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800'
                                : 'text-slate-500 hover:text-slate-900'
                            }`}
                          >
                            <FileCode className="h-3.5 w-3.5" />
                            <span className="max-w-48 truncate">
                              {selectedJob.company_name ? `${selectedJob.company_name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${activeDocType}.tex` : 'main.tex'}
                            </span>
                          </button>

                          <button
                            onClick={() => setCodeFileTab('cls')}
                            className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                              codeFileTab === 'cls'
                                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800'
                                : 'text-slate-500 hover:text-slate-900'
                            }`}
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
                            className={showOverleafGuide ? 'bg-slate-200 text-slate-900 dark:bg-slate-700' : ''}
                            title="Overleaf import instructions"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>
                      </div>

                      {/* Overleaf Quick Guide Banner */}
                      {showOverleafGuide && (
                        <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900">
                          <div className="flex items-center justify-between font-semibold text-slate-900">
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
                            <li>Click <strong>Overleaf (.zip)</strong> above to download the ready-to-use project archive.</li>
                            <li>Go to <a href="https://www.overleaf.com/project" target="_blank" rel="noreferrer" className="entry-link">overleaf.com/project</a> and click <strong>New Project</strong> &rarr; <strong>Upload Project</strong>.</li>
                            <li>Upload the downloaded <code className="chip font-mono">.zip</code> file.</li>
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
                            className="w-full rounded border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100 focus:border-slate-600 focus:outline-none"
                            placeholder="% LaTeX source code..."
                          />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between px-1 text-xs text-slate-500">
                            <span>Document class file defining formatting, layout geometry, and macros.</span>
                            <span className="font-mono text-[11px] text-slate-400">resumeforge.cls &bull; LaTeX2e</span>
                          </div>
                          <pre className="max-h-[550px] select-text overflow-y-auto rounded border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200">
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

      {/* Add Job Modal */}
      {newJobOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <form
            onSubmit={handleCreateJob}
            className="panel max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto"
          >
            <div className="panel-head">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Add application</h3>
                <p className="mt-0.5 text-xs text-slate-500">Capture the source role before tailoring.</p>
              </div>
              <IconButton
                type="button"
                onClick={() => {
                  setNewJobOpen(false);
                  setCreateJobError(null);
                }}
                aria-label="Close add application dialog"
              >
                <X className="h-4 w-4" />
              </IconButton>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              {createJobError && (
                <div className="flex items-center gap-2 rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{createJobError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Company">
                  <TextInput
                    type="text"
                    required
                    autoFocus
                    placeholder="Stripe"
                    value={newJob.company_name}
                    onChange={(e) => setNewJob({ ...newJob, company_name: e.target.value })}
                  />
                </Field>
                <Field label="Job title">
                  <TextInput
                    type="text"
                    required
                    placeholder="Backend Engineer"
                    value={newJob.job_title}
                    onChange={(e) => setNewJob({ ...newJob, job_title: e.target.value })}
                  />
                </Field>
              </div>

              <Field label="Job posting URL">
                <TextInput
                  type="text"
                  placeholder="https://jobs.example.com/role"
                  value={newJob.job_url}
                  onChange={(e) => setNewJob({ ...newJob, job_url: e.target.value })}
                />
              </Field>

              <Field
                label="Job description"
                hint="Paste the full role description. Tailoring uses this as its source of truth."
              >
                <TextArea
                  rows={8}
                  placeholder="Responsibilities, requirements, and preferred qualifications…"
                  value={newJob.raw_description}
                  onChange={(e) => setNewJob({ ...newJob, raw_description: e.target.value })}
                />
              </Field>

              <Field label="Notes" hint="Private reminders such as recruiter details, salary range, or follow-up dates.">
                <TextArea
                  rows={3}
                  placeholder="Recruiter, referral, follow-up…"
                  value={newJob.notes}
                  onChange={(e) => setNewJob({ ...newJob, notes: e.target.value })}
                />
              </Field>

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setNewJobOpen(false);
                    setCreateJobError(null);
                  }}
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
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
