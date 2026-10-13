import React, { useState } from 'react';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Copy,
  Check,
  Code,
} from 'lucide-react';
import { api } from '../services/api';
import { ResumeUploadResult } from '../types';

interface ResumeUploadProps {
  onUploadSuccess: () => void;
  activeModel: string;
}

export const ResumeUpload: React.FC<ResumeUploadProps> = ({ onUploadSuccess, activeModel }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResumeUploadResult | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'markdown'>('overview');
  const [copied, setCopied] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setResult(null);
      setActiveTab('overview');
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.uploadResume(file);
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to upload and parse resume.');
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
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Upload & Ingest Resume</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-lg mx-auto">
          Upload your existing resume (PDF, DOCX, TXT). Our local model (<strong>{activeModel}</strong>) will extract and organize every detail into your baseline master profile.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-8">
        <label
          htmlFor="resume-upload"
          className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-10 cursor-pointer transition-all ${
            file
              ? 'border-indigo-400 bg-indigo-50/30'
              : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50/50'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4 shadow-inner">
            {file ? <FileText className="w-7 h-7" /> : <UploadCloud className="w-7 h-7" />}
          </div>
          <span className="font-medium text-slate-800 text-base">
            {file ? file.name : 'Click to select or drag and drop your resume file'}
          </span>
          <span className="text-xs text-slate-500 mt-1">Supports PDF, DOCX, or TXT (Max 15MB)</span>
          <input
            id="resume-upload"
            type="file"
            accept=".pdf,.docx,.txt"
            className="hidden"
            onChange={handleFileChange}
            disabled={loading}
          />
        </label>

        {file && !loading && !result && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleUpload}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-xl shadow-sm transition-all"
            >
              Parse with AI ({activeModel})
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {loading && (
          <div className="mt-8 p-6 rounded-xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-800">Processing Resume with AI...</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Extracting plain text, parsing structured JSON schema, and populating master database.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-6 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-rose-800">Parsing Error</p>
              <p className="text-xs text-rose-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {result && (
          <div className="mt-6 p-6 rounded-xl bg-emerald-50/80 border border-emerald-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-base">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                Resume Parsed Successfully!
              </div>
              <div className="flex items-center gap-2">
                <div className="flex bg-emerald-100/70 p-1 rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setActiveTab('overview')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      activeTab === 'overview'
                        ? 'bg-white text-emerald-900 shadow-2xs'
                        : 'text-emerald-700 hover:text-emerald-900'
                    }`}
                  >
                    Overview
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('markdown')}
                    className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                      activeTab === 'markdown'
                        ? 'bg-white text-emerald-900 shadow-2xs'
                        : 'text-emerald-700 hover:text-emerald-900'
                    }`}
                  >
                    <Code className="w-3.5 h-3.5" />
                    Extracted Markdown
                  </button>
                </div>
                <button
                  onClick={onUploadSuccess}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
                >
                  View in Master Context <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {activeTab === 'overview' ? (
              <>
                {/* Candidate Identity & Contact Preview */}
                <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-2xs space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-100 pb-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        {result.parsed_summary?.name || 'Parsed Candidate'}
                      </h3>
                      {result.parsed_summary?.profile?.headline && (
                        <p className="text-xs text-slate-600 font-medium mt-0.5">
                          {result.parsed_summary.profile.headline}
                        </p>
                      )}
                    </div>
                    {result.parsed_summary?.profile?.location && (
                      <span className="text-xs text-slate-500 font-medium">
                        📍 {result.parsed_summary.profile.location}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 pt-1">
                    {result.parsed_summary?.profile?.email && (
                      <span>✉️ {result.parsed_summary.profile.email}</span>
                    )}
                    {result.parsed_summary?.profile?.phone && (
                      <span>📞 {result.parsed_summary.profile.phone}</span>
                    )}
                    {result.parsed_summary?.profile?.linkedin_url && (
                      <span>🔗 {result.parsed_summary.profile.linkedin_url}</span>
                    )}
                    {result.parsed_summary?.profile?.github_url && (
                      <span>🐙 {result.parsed_summary.profile.github_url}</span>
                    )}
                    {result.parsed_summary?.profile?.website_url && (
                      <span>🌐 {result.parsed_summary.profile.website_url}</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                  <div className="p-3 bg-white rounded-lg border border-emerald-100 shadow-2xs">
                    <p className="text-xl font-bold text-slate-900">{result.parsed_summary?.experiences_count || 0}</p>
                    <p className="text-xs text-slate-500">Experiences</p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-emerald-100 shadow-2xs">
                    <p className="text-xl font-bold text-slate-900">{result.parsed_summary?.educations_count || 0}</p>
                    <p className="text-xs text-slate-500">Education</p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-emerald-100 shadow-2xs">
                    <p className="text-xl font-bold text-slate-900">{result.parsed_summary?.skills_count || 0}</p>
                    <p className="text-xs text-slate-500">Skills</p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-emerald-100 shadow-2xs">
                    <p className="text-xl font-bold text-slate-900">{result.parsed_summary?.projects_count || 0}</p>
                    <p className="text-xs text-slate-500">Projects</p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-emerald-100 shadow-2xs">
                    <p className="text-xl font-bold text-slate-900">{result.parsed_summary?.certifications_count || 0}</p>
                    <p className="text-xs text-slate-500">Certifications</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-xl border border-emerald-100 p-4 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700">Layout-Preserving Extracted Markdown</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-medium px-2 py-0.5 rounded-full">
                      {result.markdown_text ? `${result.markdown_text.split('\n').length} lines · ${result.markdown_text.length} chars` : '0 lines'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyMarkdown}
                    className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Markdown</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="max-h-96 overflow-y-auto rounded-lg bg-slate-950 p-4 text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed select-text border border-slate-800">
                  {result.markdown_text || 'No Markdown extracted.'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
