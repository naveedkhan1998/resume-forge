import React, { useRef, useState } from 'react';
import { parseLatexDocument, ParsedDocument } from '../utils/latexParser';
import html2pdf from 'html2pdf.js';
import { Download, Printer, Copy, Check, Eye, Loader2, FolderArchive, FileCode, Sparkles } from 'lucide-react';
import { api } from '../services/api';
import { RESUMEFORGE_CLASS } from '../utils/latexClass';

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

  const handleDownloadPdf = async () => {
    if (!printRef.current) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const filename = `${companyName || 'Candidate'}_${docType}.pdf`.replace(/\s+/g, '_');
      if (documentId) {
        const blob = await api.downloadDocumentPdf(documentId);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        return;
      }
      const opt = {
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' as const },
        enableLinks: true,
      };

      await html2pdf().set(opt).from(printRef.current).save();
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
    <div className="space-y-4">
      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-100/90 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <Eye className="w-4 h-4 text-indigo-600" />
          <span>Client-Side Live Preview ({docType === 'resume' ? 'ATS Resume' : 'Cover Letter'})</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCopyText}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 rounded-lg border border-slate-200 transition-colors shadow-2xs"
            title="Copy plain text"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy Text'}
          </button>

          <button
            onClick={handleNativePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 rounded-lg border border-slate-200 transition-colors shadow-2xs"
            title="Print or Save via Browser Print Dialog"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / Vector PDF
          </button>

          <button
            onClick={handleDownloadCls}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 rounded-lg border border-slate-200 transition-colors shadow-2xs"
            title="Download resumeforge.cls (LaTeX document class for Overleaf & local compilation)"
          >
            <FileCode className="w-3.5 h-3.5 text-slate-500" />
            .cls
          </button>

          {onReviewSections && (
            <button
              onClick={onReviewSections}
              disabled={reviewingSections}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg border border-indigo-200 transition-colors shadow-2xs disabled:opacity-50"
              title="Review sections with AI to remove duplicate bullets and polish phrasing"
            >
              {reviewingSections ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              )}
              {reviewingSections ? 'Reviewing...' : 'AI Review (Deduplicate)'}
            </button>
          )}

          <button
            onClick={handleDownloadOverleafZip}
            disabled={downloadingZip}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors shadow-2xs disabled:opacity-50"
            title="Download complete Overleaf project (.zip containing main.tex & resumeforge.cls)"
          >
            {downloadingZip ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderArchive className="w-3.5 h-3.5" />}
            Overleaf (.zip)
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-xs"
          >
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {documentId ? 'Download Compiled PDF' : 'Download Preview PDF'}
          </button>
        </div>
      </div>

      {downloadError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700" role="alert">
          {downloadError}
        </div>
      )}

      {/* Realistic 8.5" x 11" Paper Container */}
      <div className="overflow-x-auto p-4 bg-slate-200/60 rounded-2xl flex justify-center border border-slate-300/60 shadow-inner">
        <div
          ref={printRef}
          id="resume-printable-document"
          className="bg-white text-slate-900 shadow-xl rounded-sm p-8 sm:p-12 w-full max-w-[800px] min-h-[1050px] space-y-4 font-serif text-[13px] leading-normal"
          style={{
            fontFamily: '"Computer Modern", "Latin Modern Roman", "Times New Roman", Times, serif',
          }}
        >
          {/* Header */}
          <div className="text-center space-y-1 pb-2">
            <h1 className="text-2xl font-bold tracking-tight uppercase text-slate-900">
              {doc.name || 'Candidate Name'}
            </h1>
            {doc.headline && (
              <p className="text-xs font-medium text-slate-700 italic">
                {doc.headline}
              </p>
            )}
            {doc.contactItems.length > 0 && (
              <div className="flex flex-wrap justify-center gap-x-2 text-[11px] text-slate-600 tracking-wide font-sans">
                {doc.contactItems.map((item, index) => (
                  <React.Fragment key={`${item.label}-${index}`}>
                    {index > 0 && <span aria-hidden="true">•</span>}
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noreferrer" className="text-indigo-700 underline decoration-indigo-300 underline-offset-2">
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
            <div className="space-y-4 pt-4 text-xs leading-relaxed text-slate-800 font-sans">
              <div className="space-y-1">
                {doc.date && <p><strong>Date:</strong> {doc.date}</p>}
                {doc.company && <p><strong>Company:</strong> {doc.company}</p>}
                {doc.position && <p><strong>Position:</strong> {doc.position}</p>}
              </div>

              <p className="pt-2">Dear Hiring Manager,</p>

              {doc.paragraphs && doc.paragraphs.map((p, idx) => (
                <p key={idx} className="leading-relaxed">
                  {p}
                </p>
              ))}

              <div className="pt-4 space-y-4">
                <p>Sincerely,</p>
                <p className="font-bold">{doc.name}</p>
              </div>
            </div>
          )}

          {/* Resume Sections */}
          {doc.docType === 'resume' && (
            <div className="space-y-4 font-sans text-xs">
              {doc.sections.map((sec, secIdx) => (
                <section key={secIdx} className="space-y-2">
                  {/* Section Title with horizontal rule */}
                  <div className="border-b border-slate-900 pb-0.5">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                      {sec.title}
                    </h2>
                  </div>

                  {/* Section Items */}
                  <div className="space-y-3">
                    {sec.items.map((item, itemIdx) => {
                      if (item.type === 'subheading') {
                        return (
                          <div key={itemIdx} className="space-y-0.5">
                            <div className="flex justify-between items-baseline font-bold text-slate-900 text-xs">
                              <span>{item.title}</span>
                              <span className="text-[11px] font-normal text-slate-600">{item.date}</span>
                            </div>
                            <div className="flex justify-between items-baseline italic text-slate-700 text-[11px]">
                              <span>{item.subtitle}</span>
                              <span className="not-italic text-slate-500">{item.location}</span>
                            </div>
                          </div>
                        );
                      }

                      if (item.type === 'project') {
                        return (
                          <div key={itemIdx} className="space-y-0.5">
                            <div className="flex justify-between items-baseline text-xs">
                              <span className="font-bold text-slate-900">
                                {item.title}
                                {item.subtitle && <span className="font-normal italic text-slate-600"> | {item.subtitle}</span>}
                                {item.links && item.links.length > 0 && (
                                  <span className="ml-2 inline-flex gap-1.5 font-normal not-italic">
                                    {item.links.map((link, linkIndex) => (
                                      link.url && (
                                        <a key={`${link.url}-${linkIndex}`} href={link.url} target="_blank" rel="noreferrer" className="text-indigo-700 underline">
                                          {link.label}
                                        </a>
                                      )
                                    ))}
                                  </span>
                                )}
                              </span>
                              <span className="text-[11px] text-slate-600">{item.date}</span>
                            </div>
                          </div>
                        );
                      }

                      if (item.type === 'bullet') {
                        return (
                          <ul key={itemIdx} className="list-disc pl-4 space-y-0.5 text-slate-800 text-[11px] leading-snug">
                            {(item.content || '').split('\n').filter(Boolean).map((bullet, bulletIndex) => (
                              <li key={bulletIndex}>{bullet}</li>
                            ))}
                          </ul>
                        );
                      }

                      if (item.type === 'skill_group') {
                        return (
                          <div key={itemIdx} className="text-[11px] text-slate-800 leading-snug">
                            <strong className="text-slate-900">{item.title}:</strong> {item.content}
                          </div>
                        );
                      }

                      if (item.type === 'paragraph') {
                        return (
                          <p key={itemIdx} className="text-[11px] text-slate-700 leading-relaxed">
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
