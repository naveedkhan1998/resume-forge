import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Check,
  CheckCircle2,
  Code,
  Copy,
  FileText,
  FolderGit2,
  GitBranch,
  Globe2,
  GraduationCap,
  Link as LinkIcon,
  Loader2,
  Mail,
  MapPin,
  Phone,
  UploadCloud,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import { ResumeUploadResult } from '../types';
import { SectionHeader } from './ui/section-header';
import { Button } from './ui/button';
import { IconButton, Panel } from './ui/panel';

interface ResumeUploadProps {
  onUploadSuccess: () => void;
}

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'txt'];

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const ResumeUpload: React.FC<ResumeUploadProps> = ({ onUploadSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResumeUploadResult | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'markdown'>('overview');
  const [copied, setCopied] = useState(false);

  const selectFile = (nextFile?: File) => {
    if (!nextFile) return;

    const extension = nextFile.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setFile(null);
      setResult(null);
      setError('Choose a PDF, DOCX, or TXT file.');
      return;
    }

    if (nextFile.size > MAX_FILE_SIZE) {
      setFile(null);
      setResult(null);
      setError('This file is larger than the 15 MB upload limit.');
      return;
    }

    setFile(nextFile);
    setError(null);
    setResult(null);
    setActiveTab('overview');
  };

  const clearFile = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setActiveTab('overview');
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await api.uploadResume(file));
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Could not upload and parse this resume.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopyMarkdown = async () => {
    if (!result?.markdown_text) return;
    try {
      await navigator.clipboard.writeText(result.markdown_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (copyError) {
      setError(
        copyError instanceof Error
          ? copyError.message
          : 'Could not copy the extracted Markdown.',
      );
    }
  };

  const summary = result?.parsed_summary;
  const profile = summary?.profile;
  const metrics: Array<{ label: string; value: number; icon: LucideIcon }> = result
    ? [
        { label: 'Experience', value: summary?.experiences_count || 0, icon: Briefcase },
        { label: 'Education', value: summary?.educations_count || 0, icon: GraduationCap },
        { label: 'Skills', value: summary?.skills_count || 0, icon: Wrench },
        { label: 'Projects', value: summary?.projects_count || 0, icon: FolderGit2 },
        { label: 'Credentials', value: summary?.certifications_count || 0, icon: CheckCircle2 },
      ]
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <SectionHeader
        title="Import resume"
        description="Turn an existing PDF, DOCX, or text résumé into editable profile data."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Panel
          title="Resume file"
          icon={FileText}
          className="lg:col-span-3"
          bodyClassName="p-4 sm:p-5"
        >
          <label
            htmlFor="resume-upload"
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (event.currentTarget === event.target) setDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              if (!loading) selectFile(event.dataTransfer.files[0]);
            }}
            className={`upload-dropzone ${
              dragActive ? 'upload-dropzone-active' : ''
            } ${loading ? 'cursor-wait opacity-70' : 'cursor-pointer'}`}
          >
            <span className="upload-dropzone-icon">
              {file ? <FileText className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
            </span>
            <span className="mt-3 text-[13px] font-semibold text-slate-800">
              {dragActive ? 'Drop the file to select it' : 'Drop a resume here, or choose a file'}
            </span>
            <span className="mt-1 text-xs text-slate-500">PDF, DOCX, or TXT · up to 15 MB</span>
            <input
              id="resume-upload"
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={(event) => {
                selectFile(event.target.files?.[0]);
                event.target.value = '';
              }}
              disabled={loading}
            />
          </label>

          {file && (
            <div className="mt-3 flex items-center gap-3 rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                <FileText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-slate-800">{file.name}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{formatFileSize(file.size)}</p>
              </div>
              {!loading && (
                <IconButton type="button" onClick={clearFile} aria-label="Remove selected file">
                  <X className="h-4 w-4" />
                </IconButton>
              )}
            </div>
          )}

          {error && (
            <div
              className="mt-3 flex items-start gap-3 rounded border border-rose-200 bg-rose-50 p-3 text-rose-700"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium">Import could not be completed</p>
                <p className="mt-0.5 text-xs leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="mt-4 flex items-start gap-3 rounded border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-slate-500" />
              <div>
                <p className="text-[13px] font-medium text-slate-800">Reading and structuring your resume</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Extracting text, identifying sections, and writing the parsed records to your profile.
                </p>
              </div>
            </div>
          ) : file ? (
            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={handleUpload} disabled={!file || Boolean(result)}>
                {result ? (
                  <>
                    <Check className="h-4 w-4" /> Imported
                  </>
                ) : (
                  <>
                    Import resume <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          ) : null}
        </Panel>

        <Panel
          title="What gets imported"
          icon={UserRound}
          className="lg:col-span-2"
        >
          <ol className="space-y-4">
            {[
              ['Contact details', 'Name, headline, location, links, and summary.'],
              ['Career history', 'Experience, education, projects, and certifications.'],
              ['Skills', 'Named skills grouped into editable categories.'],
            ].map(([title, description], index) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-200 text-[10px] font-semibold text-slate-500 dark:border-slate-700">
                  {index + 1}
                </span>
                <div>
                  <p className="text-xs font-medium text-slate-700">{title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{description}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
            <p className="text-[11px] leading-relaxed text-slate-500">
              Review the parsed profile after import. You can edit or remove every imported entry.
            </p>
          </div>
        </Panel>
      </div>

      {result && (
        <Panel
          title="Import result"
          icon={CheckCircle2}
          actions={
            <Button size="sm" onClick={onUploadSuccess}>
              Review profile <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          }
          bodyClassName="p-0"
        >
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-[13px] font-medium text-slate-800">Resume imported successfully</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  The extracted records are now available in your career profile.
                </p>
              </div>
            </div>

            <div className="flex w-fit items-center gap-1 rounded border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`result-tab ${activeTab === 'overview' ? 'result-tab-active' : ''}`}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('markdown')}
                className={`result-tab ${activeTab === 'markdown' ? 'result-tab-active' : ''}`}
              >
                <Code className="h-3.5 w-3.5" /> Markdown
              </button>
            </div>
          </div>

          {activeTab === 'overview' ? (
            <div className="space-y-5 p-4 sm:p-5">
              <div className="rounded border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      {summary?.name || profile?.full_name || 'Parsed candidate'}
                    </h3>
                    {profile?.headline && (
                      <p className="mt-1 text-[13px] text-slate-500">{profile.headline}</p>
                    )}
                  </div>
                  {profile?.location && (
                    <span className="entry-link">
                      <MapPin className="h-3 w-3" /> {profile.location}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                  {profile?.email && (
                    <ContactItem icon={Mail} label={profile.email} />
                  )}
                  {profile?.phone && (
                    <ContactItem icon={Phone} label={profile.phone} />
                  )}
                  {profile?.linkedin_url && (
                    <ContactItem icon={LinkIcon} label={profile.linkedin_url} />
                  )}
                  {profile?.github_url && (
                    <ContactItem icon={GitBranch} label={profile.github_url} />
                  )}
                  {profile?.website_url && (
                    <ContactItem icon={Globe2} label={profile.website_url} />
                  )}
                  {!profile?.email &&
                    !profile?.phone &&
                    !profile?.linkedin_url &&
                    !profile?.github_url &&
                    !profile?.website_url && (
                      <p className="text-xs text-slate-400">No contact details were detected.</p>
                    )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {metrics.map(({ label, value, icon: MetricIcon }) => (
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
            </div>
          ) : (
            <div className="space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-slate-700">Extracted Markdown</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {result.markdown_text
                      ? `${result.markdown_text.split('\n').length} lines · ${result.markdown_text.length.toLocaleString()} characters`
                      : 'No Markdown was returned.'}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopyMarkdown}
                  disabled={!result.markdown_text}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy Markdown'}
                </Button>
              </div>
              <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200">
                {result.markdown_text || 'No Markdown extracted.'}
              </pre>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
};

const ContactItem: React.FC<{
  icon: LucideIcon;
  label: string;
}> = ({ icon: Icon, label }) => (
  <span className="inline-flex max-w-full items-center gap-1.5 text-xs text-slate-500">
    <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
    <span className="truncate">{label}</span>
  </span>
);
