import { jsPDF } from 'jspdf';
import { parseLatexDocument, ParsedDocument } from './latexParser';

export interface PdfExportOptions {
  filename?: string;
}

/**
 * Normalizes characters that standard PDF Type1 fonts (Times/Helvetica) do not cover
 * into clean ASCII/WinAnsi equivalents so jsPDF never emits garbled glyphs.
 */
function sanitizePdfText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u2010\u2011\u2012\u2013\u2212]/g, '-')
    .replace(/\u2014/g, '--')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u00A0\u202F\u2009]/g, ' ')
    .replace(/\u03BC|\u00B5/g, 'u')
    .replace(/\u2192/g, '->')
    .replace(/\u2265/g, '>=')
    .replace(/\u2264/g, '<=');
}

/**
 * Generates a 100% vector, selectable, ATS-parseable PDF directly on the client
 * from a ResumeForge LaTeX source string in <25ms without any server or html2canvas overhead.
 */
export function generateLatexPdfDocument(latexSource: string): jsPDF {
  const doc: ParsedDocument = parseLatexDocument(latexSource);
  const pdf = new jsPDF({
    unit: 'pt',
    format: 'letter',
    orientation: 'portrait',
    putOnlyUsedFonts: true,
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth(); // 612pt (8.5in)
  const pageHeight = pdf.internal.pageSize.getHeight(); // 792pt (11in)
  const marginX = 39.6; // 0.55in matching resumeforge.cls
  const marginY = 32.4; // 0.45in matching resumeforge.cls
  const contentWidth = pageWidth - marginX * 2;
  const maxY = pageHeight - marginY;

  let y = marginY + 12;

  const ensureSpace = (neededPt: number) => {
    if (y + neededPt > maxY) {
      pdf.addPage();
      y = marginY + 12;
    }
  };

  // ---------------- HEADER ----------------
  const candidateName = sanitizePdfText(doc.name || 'Candidate Name').toUpperCase();
  pdf.setFont('times', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(15, 23, 42);
  pdf.text(candidateName, pageWidth / 2, y, { align: 'center' });
  y += 14;

  if (doc.headline) {
    pdf.setFont('times', 'italic');
    pdf.setFontSize(10);
    pdf.setTextColor(51, 65, 85);
    pdf.text(sanitizePdfText(doc.headline), pageWidth / 2, y, { align: 'center' });
    y += 12;
  }

  if (doc.contactItems.length > 0) {
    pdf.setFont('times', 'normal');
    pdf.setFontSize(9.2);
    const separator = '  |  ';
    const sepWidth = pdf.getTextWidth(separator);
    const itemLabels = doc.contactItems.map((item) => sanitizePdfText(item.label));
    const itemWidths = itemLabels.map((label) => pdf.getTextWidth(label));
    const totalWidth =
      itemWidths.reduce((acc, w) => acc + w, 0) +
      Math.max(0, doc.contactItems.length - 1) * sepWidth;

    if (totalWidth <= contentWidth) {
      let cursorX = (pageWidth - totalWidth) / 2;
      doc.contactItems.forEach((item, idx) => {
        const label = itemLabels[idx];
        const width = itemWidths[idx];
        if (item.url) {
          pdf.setTextColor(29, 78, 216);
          pdf.textWithLink(label, cursorX, y, { url: item.url });
        } else {
          pdf.setTextColor(51, 65, 85);
          pdf.text(label, cursorX, y);
        }
        cursorX += width;
        if (idx < doc.contactItems.length - 1) {
          pdf.setTextColor(148, 163, 184);
          pdf.text(separator, cursorX, y);
          cursorX += sepWidth;
        }
      });
      y += 10;
    } else {
      const joined = itemLabels.join(' | ');
      const wrappedContacts: string[] = pdf.splitTextToSize(joined, contentWidth);
      pdf.setTextColor(51, 65, 85);
      wrappedContacts.forEach((line) => {
        pdf.text(line, pageWidth / 2, y, { align: 'center' });
        y += 11;
      });
    }
  }

  pdf.setTextColor(15, 23, 42);

  // ---------------- COVER LETTER ----------------
  if (doc.docType === 'cover_letter') {
    y += 14;
    pdf.setFontSize(10.5);

    const metaRows: Array<[string, string | undefined]> = [
      ['Date:', doc.date],
      ['Company:', doc.company],
      ['Position:', doc.position],
    ];
    for (const [label, val] of metaRows) {
      if (!val) continue;
      pdf.setFont('times', 'bold');
      pdf.text(label, marginX, y);
      const labelW = pdf.getTextWidth(`${label} `);
      pdf.setFont('times', 'normal');
      pdf.text(sanitizePdfText(val), marginX + labelW, y);
      y += 14;
    }

    y += 8;
    pdf.setFont('times', 'normal');
    pdf.text('Dear Hiring Manager,', marginX, y);
    y += 18;

    for (const paragraph of doc.paragraphs || []) {
      const cleanP = sanitizePdfText(paragraph);
      const lines: string[] = pdf.splitTextToSize(cleanP, contentWidth);
      ensureSpace(lines.length * 14 + 10);
      for (const line of lines) {
        pdf.text(line, marginX, y);
        y += 14;
      }
      y += 8;
    }

    ensureSpace(40);
    y += 8;
    pdf.setFont('times', 'normal');
    pdf.text('Sincerely,', marginX, y);
    y += 16;
    pdf.setFont('times', 'bold');
    pdf.text(sanitizePdfText(doc.name || ''), marginX, y);

    return pdf;
  }

  // ---------------- RESUME SECTIONS ----------------
  for (const section of doc.sections) {
    ensureSpace(28);
    y += 6;

    // Section heading + full-width bottom rule
    pdf.setFont('times', 'bold');
    pdf.setFontSize(10.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text(sanitizePdfText(section.title).toUpperCase(), marginX, y);
    y += 3.5;
    pdf.setDrawColor(15, 23, 42);
    pdf.setLineWidth(0.6);
    pdf.line(marginX, y, pageWidth - marginX, y);
    y += 11;

    for (const item of section.items) {
      if (item.type === 'subheading') {
        ensureSpace(26);
        const title = sanitizePdfText(item.title || '');
        const date = sanitizePdfText(item.date || '');
        const subtitle = sanitizePdfText(item.subtitle || '');
        const location = sanitizePdfText(item.location || '');

        pdf.setFont('times', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(15, 23, 42);
        pdf.text(title, marginX, y);

        if (date) {
          pdf.setFont('times', 'normal');
          pdf.setFontSize(9.5);
          pdf.text(date, pageWidth - marginX, y, { align: 'right' });
        }
        y += 11.5;

        if (subtitle || location) {
          pdf.setFont('times', 'italic');
          pdf.setFontSize(9.5);
          pdf.setTextColor(51, 65, 85);
          if (subtitle) {
            pdf.text(subtitle, marginX, y);
          }
          if (location) {
            pdf.text(location, pageWidth - marginX, y, { align: 'right' });
          }
          y += 11;
        }
        pdf.setTextColor(15, 23, 42);
      } else if (item.type === 'project') {
        ensureSpace(16);
        const title = sanitizePdfText(item.title || '');
        const subtitle = sanitizePdfText(item.subtitle || '');
        const date = sanitizePdfText(item.date || '');
        const links = item.links || [];

        // Measure right-side links/date width first so left-side text wraps without colliding
        pdf.setFont('times', 'normal');
        pdf.setFontSize(9.2);
        let rightWidth = 0;
        if (links.length > 0) {
          const linkText = links.map((l) => sanitizePdfText(l.label)).join(' / ');
          rightWidth = pdf.getTextWidth(linkText) + (date ? pdf.getTextWidth(` | ${date}`) : 0);
        } else if (date) {
          rightWidth = pdf.getTextWidth(date);
        }

        // Render right-aligned links or date
        if (links.length > 0) {
          let linkCursorX = pageWidth - marginX - rightWidth;
          links.forEach((link, idx) => {
            const lbl = sanitizePdfText(link.label);
            const w = pdf.getTextWidth(lbl);
            if (link.url) {
              pdf.setTextColor(29, 78, 216);
              pdf.textWithLink(lbl, linkCursorX, y, { url: link.url });
            } else {
              pdf.setTextColor(51, 65, 85);
              pdf.text(lbl, linkCursorX, y);
            }
            linkCursorX += w;
            if (idx < links.length - 1) {
              pdf.setTextColor(100, 116, 139);
              const slash = ' / ';
              pdf.text(slash, linkCursorX, y);
              linkCursorX += pdf.getTextWidth(slash);
            }
          });
          if (date) {
            pdf.setTextColor(71, 85, 105);
            pdf.text(` | ${date}`, linkCursorX, y);
          }
        } else if (date) {
          pdf.setTextColor(51, 65, 85);
          pdf.text(date, pageWidth - marginX, y, { align: 'right' });
        }

        // Render left-side project title + italic subtitle/tech
        pdf.setTextColor(15, 23, 42);
        pdf.setFont('times', 'bold');
        pdf.setFontSize(9.8);
        pdf.text(title, marginX, y);
        const titleW = pdf.getTextWidth(title);

        if (subtitle) {
          const sep = ' | ';
          pdf.setFont('times', 'normal');
          const sepW = pdf.getTextWidth(sep);
          const availableFirstLine = contentWidth - rightWidth - titleW - sepW - 10;
          pdf.setFont('times', 'italic');
          pdf.setFontSize(9.2);
          pdf.setTextColor(51, 65, 85);

          if (availableFirstLine > 80 && pdf.getTextWidth(subtitle) <= availableFirstLine) {
            pdf.setFont('times', 'normal');
            pdf.text(sep, marginX + titleW, y);
            pdf.setFont('times', 'italic');
            pdf.text(subtitle, marginX + titleW + sepW, y);
            y += 11.5;
          } else {
            y += 11;
            const subLines: string[] = pdf.splitTextToSize(subtitle, contentWidth - 10);
            for (const sLine of subLines) {
              ensureSpace(11);
              pdf.text(sLine, marginX, y);
              y += 11;
            }
          }
        } else {
          y += 11.5;
        }
        pdf.setTextColor(15, 23, 42);
      } else if (item.type === 'bullet') {
        const bullets = (item.content || '')
          .split('\n')
          .map((b) => sanitizePdfText(b.trim()))
          .filter(Boolean);

        pdf.setFont('times', 'normal');
        pdf.setFontSize(9.5);
        pdf.setTextColor(15, 23, 42);
        const bulletIndent = 12;
        const bulletWidth = contentWidth - bulletIndent;

        for (const bullet of bullets) {
          const lines: string[] = pdf.splitTextToSize(bullet, bulletWidth);
          ensureSpace(lines.length * 11.2 + 2);
          pdf.text('\u2022', marginX + 3, y);
          for (const line of lines) {
            pdf.text(line, marginX + bulletIndent, y);
            y += 11.2;
          }
          y += 1.2;
        }
        y += 2;
      } else if (item.type === 'skill_group') {
        const catTitle = `${sanitizePdfText(item.title || '')}: `;
        const skillsContent = sanitizePdfText(item.content || '');

        pdf.setFontSize(9.5);
        pdf.setFont('times', 'bold');
        const catWidth = pdf.getTextWidth(catTitle);

        pdf.setFont('times', 'normal');
        const firstLineAvail = Math.max(100, contentWidth - catWidth);
        const words = skillsContent.split(/\s+/);
        let firstLine = '';
        let wordIdx = 0;

        while (wordIdx < words.length) {
          const candidate = firstLine ? `${firstLine} ${words[wordIdx]}` : words[wordIdx];
          if (pdf.getTextWidth(candidate) <= firstLineAvail || !firstLine) {
            firstLine = candidate;
            wordIdx += 1;
          } else {
            break;
          }
        }

        const remainingText = words.slice(wordIdx).join(' ');
        const remainingLines: string[] = remainingText
          ? pdf.splitTextToSize(remainingText, contentWidth)
          : [];

        ensureSpace((1 + remainingLines.length) * 11.5);
        pdf.setFont('times', 'bold');
        pdf.setTextColor(15, 23, 42);
        pdf.text(catTitle, marginX, y);

        pdf.setFont('times', 'normal');
        pdf.text(firstLine, marginX + catWidth, y);
        y += 11.5;

        for (const rLine of remainingLines) {
          pdf.text(rLine, marginX, y);
          y += 11.5;
        }
      } else if (item.type === 'paragraph') {
        const paragraphText = sanitizePdfText(item.content || '');
        pdf.setFont('times', 'normal');
        pdf.setFontSize(9.5);
        pdf.setTextColor(15, 23, 42);
        const lines: string[] = pdf.splitTextToSize(paragraphText, contentWidth);
        ensureSpace(lines.length * 11.5 + 3);
        for (const line of lines) {
          pdf.text(line, marginX, y);
          y += 11.5;
        }
        y += 2;
      }
    }
  }

  return pdf;
}

export function downloadLatexPdf(latexSource: string, filename: string): void {
  const pdf = generateLatexPdfDocument(latexSource);
  pdf.save(filename);
}
