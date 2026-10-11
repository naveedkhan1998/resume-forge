/**
 * Client-Side LaTeX Parser
 * Parses ATS resume and cover letter LaTeX code into a structured renderable document.
 */

export interface ParsedResumeItem {
  type: 'subheading' | 'project' | 'bullet' | 'skill_group' | 'paragraph';
  title?: string;
  subtitle?: string;
  date?: string;
  location?: string;
  content?: string;
}

export interface ParsedResumeSection {
  title: string;
  items: ParsedResumeItem[];
}

export interface ParsedDocument {
  docType: 'resume' | 'cover_letter';
  name: string;
  headline?: string;
  contactItems: string[];
  sections: ParsedResumeSection[];
  // Cover letter specific
  date?: string;
  company?: string;
  position?: string;
  paragraphs?: string[];
}

// Clean LaTeX escaping & formatting commands into readable text
export function cleanLatex(text: string): string {
  if (!text) return '';
  return text
    .replace(/\\href\{[^}]*\}\{([^}]*)\}/g, '$1') // Extract text from \href{url}{text}
    .replace(/\\textbf\{([^}]*)\}/g, '$1')
    .replace(/\\textit\{([^}]*)\}/g, '$1')
    .replace(/\\emph\{([^}]*)\}/g, '$1')
    .replace(/\\small\{([^}]*)\}/g, '$1')
    .replace(/\\scshape\s*/g, '')
    .replace(/\\Huge\s*/g, '')
    .replace(/\\large\s*/g, '')
    .replace(/\\&/g, '&')
    .replace(/\\%/g, '%')
    .replace(/\\\$/g, '$')
    .replace(/\\#/g, '#')
    .replace(/\\_/g, '_')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\\textasciitilde\{\}/g, '~')
    .replace(/\\textasciicircum\{\}/g, '^')
    .replace(/--/g, '–')
    .replace(/\\vspace\{[^}]*\}/g, '')
    .replace(/\\\\/g, '\n')
    .replace(/\\noindent/g, '')
    .replace(/\\color\{[^}]*\}/g, '')
    .trim();
}

export function parseLatexDocument(source: string): ParsedDocument {
  const isCoverLetter = source.includes('Dear Hiring Manager') || source.includes('Sincerely');

  if (isCoverLetter) {
    return parseCoverLetter(source);
  }
  return parseResume(source);
}

function parseResume(source: string): ParsedDocument {
  const doc: ParsedDocument = {
    docType: 'resume',
    name: 'Your Name',
    headline: '',
    contactItems: [],
    sections: [],
  };

  // 1. Extract Name: \textbf{\Huge \scshape NAME} or \Huge NAME
  const nameMatch = source.match(/\\textbf\{[^}]*\\Huge[^}]*\\scshape\s*([^}]+)\}/i) ||
                    source.match(/\\Huge[^{]*\{?([^}\\n]+)\}?/i) ||
                    source.match(/\\scshape\s*([A-Z\s]+)/);
  if (nameMatch) {
    doc.name = cleanLatex(nameMatch[1]);
  }

  // 2. Extract Header Contact Line: usually inside \begin{center} ... \end{center}
  const centerMatch = source.match(/\\begin\{center\}([\s\S]*?)\\end\{center\}/i);
  if (centerMatch) {
    const centerContent = centerMatch[1];
    // Look for lines with \href or $|$ or email
    const lines = centerContent.split('\\\\').map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      // Line 1 might be headline
      if (lines.length >= 3 && !lines[1].includes('$|$') && !lines[1].includes('@')) {
        doc.headline = cleanLatex(lines[1]);
      }
      // Contact line
      const contactLine = lines[lines.length - 1];
      const rawParts = contactLine.split(/\$\|\$|\|/).map((p) => cleanLatex(p)).filter(Boolean);
      doc.contactItems = rawParts;
    }
  }

  // 3. Extract Sections: \section{Section Title}
  const sectionRegex = /\\section\{([^}]+)\}([\s\S]*?)(?=(\\section\{|\\end\{document\}|$))/g;
  let match;

  while ((match = sectionRegex.exec(source)) !== null) {
    const rawTitle = match[1];
    const sectionBody = match[2];
    const title = cleanLatex(rawTitle);

    const section: ParsedResumeSection = {
      title,
      items: [],
    };

    // Subheadings: \resumeSubheading{arg1}{arg2}{arg3}{arg4}
    const subheadingRegex = /\\resumeSubheading\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}/g;
    let subMatch;
    while ((subMatch = subheadingRegex.exec(sectionBody)) !== null) {
      section.items.push({
        type: 'subheading',
        title: cleanLatex(subMatch[1]),
        date: cleanLatex(subMatch[2]),
        subtitle: cleanLatex(subMatch[3]),
        location: cleanLatex(subMatch[4]),
      });
    }

    // Projects: \resumeProjectHeading{arg1}{arg2}
    const projectRegex = /\\resumeProjectHeading\{([^}]*)\}\{([^}]*)\}/g;
    let projMatch;
    while ((projMatch = projectRegex.exec(sectionBody)) !== null) {
      const headingParts = projMatch[1].split(/\$\|\$|\|/);
      const title = cleanLatex(headingParts[0] || '');
      const subtitle = cleanLatex(headingParts[1] || '');
      section.items.push({
        type: 'project',
        title,
        subtitle,
        date: cleanLatex(projMatch[2]),
      });
    }

    // Bullet items: \resumeItem{...}
    const itemRegex = /\\resumeItem\{([\s\S]*?)\}(?=\s*(\\resumeItem|\\resumeItemListEnd|\\resumeSubheading|\\resumeProjectHeading|$))/g;
    let itemMatch;
    while ((itemMatch = itemRegex.exec(sectionBody)) !== null) {
      section.items.push({
        type: 'bullet',
        content: cleanLatex(itemMatch[1]),
      });
    }

    // Skills: \textbf{Category}: Skill1, Skill2
    const skillRegex = /\\textbf\{([^}]+)\}:\s*([^\\]+)/g;
    let skillMatch;
    while ((skillMatch = skillRegex.exec(sectionBody)) !== null) {
      section.items.push({
        type: 'skill_group',
        title: cleanLatex(skillMatch[1]),
        content: cleanLatex(skillMatch[2]),
      });
    }

    // Professional Summary or free paragraph
    if (section.items.length === 0) {
      const cleanedBody = cleanLatex(sectionBody);
      if (cleanedBody) {
        section.items.push({
          type: 'paragraph',
          content: cleanedBody,
        });
      }
    }

    doc.sections.push(section);
  }

  return doc;
}

function parseCoverLetter(source: string): ParsedDocument {
  const doc: ParsedDocument = {
    docType: 'cover_letter',
    name: 'Your Name',
    contactItems: [],
    sections: [],
    paragraphs: [],
  };

  const nameMatch = source.match(/\\textbf\{[^}]*\\Huge[^}]*\\scshape\s*([^}]+)\}/i) ||
                    source.match(/\\textbf\{([A-Za-z\s]+)\}/);
  if (nameMatch) {
    doc.name = cleanLatex(nameMatch[1]);
  }

  const dateMatch = source.match(/\\textbf\{Date:\}\s*([^\\]+)/i);
  if (dateMatch) doc.date = cleanLatex(dateMatch[1]);

  const compMatch = source.match(/\\textbf\{Company:\}\s*([^\\]+)/i);
  if (compMatch) doc.company = cleanLatex(compMatch[1]);

  const posMatch = source.match(/\\textbf\{Position:\}\s*([^\\]+)/i);
  if (posMatch) doc.position = cleanLatex(posMatch[1]);

  // Extract letter paragraphs between "Dear Hiring Manager," and "Sincerely"
  const bodyMatch = source.match(/Dear Hiring Manager,([\s\S]*?)(Sincerely|\\end\{document\})/i);
  if (bodyMatch) {
    const rawParagraphs = bodyMatch[1].split(/\n\s*\n|\\vspace\{[^}]*\}/);
    doc.paragraphs = rawParagraphs.map((p) => cleanLatex(p)).filter((p) => p.length > 5);
  }

  return doc;
}
