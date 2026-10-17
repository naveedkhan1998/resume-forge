import React, { useRef, useState } from 'react';
import { parseLatexDocument, ParsedDocument } from '../utils/latexParser';
import { downloadLatexPdf } from '../utils/latexPdfExport';
import { Download, Printer, Copy, Check, Eye, Loader2, FolderArchive, FileCode, Wand2 } from 'lucide-react';
import { api } from '../services/api';
import { RESUMEFORGE_CLASS } from '../utils/latexClass';
import { Button } from './ui/button';

interface LatexDocumentPreviewProps {
  latexSource: string;
  docType: 'resume' | 'cover_letter';
  companyName: string;
  documentId?: number;
  onReviewSections?: () => void;
  reviewingSections?: boolean;
}

export const LatexDocumentPreview: React.FC<LatexDocumentPreviewProps> = ({
  latexSource,
  docType,
  companyName,
  documentId,
  onReviewSections,
  reviewingSections = false,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const doc: ParsedDocument = parseLatexDocument(latexSource);

  const handleDownloadPdf = () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const filename = `${companyName || 'Candidate'}_${docType}.pdf`.replace(/\s+/g, '_');
      downloadLatexPdf(latexSource, filename);
    } catch (err) {
      console.error('Client-side PDF generation failed:', err);
      setDownloadError(err instanceof Error ? err.message : 'PDF generation failed.');
    } finally {
      setDownloading(false);
    }
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
    setDownloadingZip(true);
    setDownloadError(null);
    try {
      const filename = `${companyName || 'Candidate'}_${docType}_overleaf.zip`.replace(/\s+/g, '_');
      let blob: Blob;
      if (documentId) {
        blob = await api.downloadDocumentZip(documentId);
      } else {
        blob = await api.downloadCustomOverleafZip(latexSource, companyName, docType);
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export Overleaf ZIP:', err);
      setDownloadError(err instanceof Error ? err.message : 'Failed to export Overleaf zip.');
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleNativePrint = () => {
    window.print();
  };

  const handleCopyText = () => {
    if (printRef.current) {
      navigator.clipboard.writeText(printRef.current.innerText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-3">
      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="hidden items-center gap-2 px-1 text-xs font-medium text-slate-600 dark:text-slate-400 sm:flex">
          <Eye className="h-3.5 w-3.5 text-slate-400" />
          <span>{docType === 'resume' ? 'Resume preview' : 'Cover letter preview'}</span>
        </div>

        <div className="flex w-full flex-wrap items-center justify-between gap-1.5 sm:w-auto sm:justify-end">
          <div className="flex flex-wrap items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCopyText}
              title="Copy plain text"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy text'}</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={handleNativePrint}
              className="hidden sm:inline-flex"
              title="Print or Save via Browser Print Dialog"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={handleDownloadCls}
              className="hidden md:inline-flex"
              title="Download resumeforge.cls (LaTeX document class for Overleaf & local compilation)"
            >
              <FileCode className="h-3.5 w-3.5" />
              <span>.cls</span>
            </Button>

            {onReviewSections && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onReviewSections}
                disabled={reviewingSections}
                title="Review sections with AI to remove duplicate bullets and polish phrasing"
              >
                {reviewingSections ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                <span>{reviewingSections ? 'Reviewing…' : 'Review'}</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadOverleafZip}
              disabled={downloadingZip}
              title="Download complete Overleaf project (.zip containing main.tex & resumeforge.cls)"
            >
              {downloadingZip ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderArchive className="h-3.5 w-3.5" />}
              <span>Overleaf</span>
            </Button>

            <Button
              size="sm"
              onClick={handleDownloadPdf}
              disabled={downloading}
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              <span>PDF</span>
            </Button>
          </div>
        </div>
      </div>

      {downloadError && (
        <div
          className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200"
          role="alert"
        >
          {downloadError}
        </div>
      )}

      {/* Responsive Paper Container */}
      <div className="flex justify-center overflow-x-auto rounded-lg border border-slate-200 bg-slate-100/90 p-2 sm:p-5 dark:border-slate-800 dark:bg-slate-950">
        <div
          ref={printRef}
          id="resume-printable-document"
          className="resume-paper w-full max-w-[800px] rounded-xs bg-white p-4 sm:p-10 md:p-12 text-[12px] sm:text-[13px] leading-normal text-slate-900 shadow-lg sm:min-h-[980px] space-y-3.5 sm:space-y-4 font-serif"
          style={{
            fontFamily: '"Computer Modern", "Latin Modern Roman", "Times New Roman", Times, serif',
          }}
        >
          {/* Header */}
          <div className="space-y-1 pb-1.5 text-center">
            <h1 className="text-lg sm:text-2xl font-bold uppercase tracking-tight text-slate-900">
              {doc.name || 'Candidate Name'}
            </h1>
            {doc.headline && (
              <p className="text-[11px] sm:text-xs font-medium italic text-slate-700">
                {doc.headline}
              </p>
            )}
            {doc.contactItems.length > 0 && (
              <div className="flex flex-wrap justify-center gap-x-2 gap-y-0.5 font-sans text-[10.5px] sm:text-[11px] tracking-wide text-slate-600">
                {doc.contactItems.map((item, index) => (
                  <React.Fragment key={`${item.label}-${index}`}>
                    {index > 0 && <span aria-hidden="true">•</span>}
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-700 underline decoration-indigo-300 underline-offset-2"
                      >
                        {item.label}
                      </a>
                    ) : (
                      <span>{item.label}</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          {/* Cover Letter Body (if applicable) */}
          {doc.docType === 'cover_letter' && (
            <div className="space-y-3.5 pt-3 font-sans text-xs leading-relaxed text-slate-800">
              <div className="space-y-1">
                {doc.date && <p><strong>Date:</strong> {doc.date}</p>}
                {doc.company && <p><strong>Company:</strong> {doc.company}</p>}
                {doc.position && <p><strong>Position:</strong> {doc.position}</p>}
              </div>

              <p className="pt-1">Dear Hiring Manager,</p>

              {doc.paragraphs && doc.paragraphs.map((p, idx) => (
                <p key={idx} className="leading-relaxed">
                  {p}
                </p>
              ))}

              <div className="space-y-3 pt-3">
                <p>Sincerely,</p>
                <p className="font-bold">{doc.name}</p>
              </div>
            </div>
          )}

          {/* Resume Sections */}
          {doc.docType === 'resume' && (
            <div className="space-y-3.5 font-sans text-xs">
              {doc.sections.map((sec, secIdx) => (
                <section key={secIdx} className="space-y-2">
                  {/* Section Title with horizontal rule */}
                  <div className="border-b border-slate-900 pb-0.5">
                    <h2 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-900">
                      {sec.title}
                    </h2>
                  </div>

                  {/* Section Items */}
                  <div className="space-y-2.5">
                    {sec.items.map((item, itemIdx) => {
                      if (item.type === 'subheading') {
                        return (
                          <div key={itemIdx} className="space-y-0.5">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs font-bold text-slate-900">
                              <span>{item.title}</span>
                              <span className="text-[10.5px] sm:text-[11px] font-normal text-slate-600">{item.date}</span>
                            </div>
                            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[11px] italic text-slate-700">
                              <span>{item.subtitle}</span>
                              <span className="not-italic text-slate-500">{item.location}</span>
                            </div>
                          </div>
                        );
                      }

                      if (item.type === 'project') {
                        return (
                          <div key={itemIdx} className="space-y-0.5">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                              <span className="font-bold text-slate-900">
                                {item.title}
                                {item.subtitle && <span className="font-normal italic text-slate-600"> | {item.subtitle}</span>}
                                {item.links && item.links.length > 0 && (
                                  <span className="ml-2 inline-flex gap-1.5 font-normal not-italic">
                                    {item.links.map((link, linkIndex) => (
                                      link.url && (
                                        <React.Fragment key={`${link.url}-${linkIndex}`}>
                                          {linkIndex > 0 && <span className="text-slate-400">/</span>}
                                          <a href={link.url} target="_blank" rel="noreferrer" className="text-indigo-700 underline">
                                            {link.label}
                                          </a>
                                        </React.Fragment>
                                      )
                                    ))}
                                  </span>
                                )}
                              </span>
                              <span className="text-[10.5px] sm:text-[11px] text-slate-600">{item.date}</span>
                            </div>
                          </div>
                        );
                      }

                      if (item.type === 'bullet') {
                        return (
                          <ul key={itemIdx} className="list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-slate-800">
                            {(item.content || '').split('\n').filter(Boolean).map((bullet, bulletIndex) => (
                              <li key={bulletIndex}>{bullet}</li>
                            ))}
                          </ul>
                        );
                      }

                      if (item.type === 'skill_group') {
                        return (
                          <div key={itemIdx} className="text-[11px] leading-snug text-slate-800">
                            <strong className="text-slate-900">{item.title}:</strong> {item.content}
                          </div>
                        );
                      }

                      if (item.type === 'paragraph') {
                        return (
                          <p key={itemIdx} className="text-[11px] leading-relaxed text-slate-700">
                            {item.content}
                          </p>
                        );
                      }

                      return null;
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
