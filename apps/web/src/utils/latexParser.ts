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
  links?: ParsedLink[];
}

export interface ParsedResumeSection {
  title: string;
  items: ParsedResumeItem[];
}

export interface ParsedDocument {
  docType: 'resume' | 'cover_letter';
  name: string;
  headline?: string;
  contactItems: ParsedLink[];
  sections: ParsedResumeSection[];
  // Cover letter specific
  date?: string;
  company?: string;
  position?: string;
  paragraphs?: string[];
}

export interface ParsedLink {
  label: string;
  url?: string;
}

function cleanLatexUrl(url: string): string {
  return url
    .replace(/\\([%#&_{}])/g, '$1')
    .replace(/\\string\^/g, '^')
    .replace(/\\string~/g, '~')
    .trim();
}

function extractLinks(text: string): ParsedLink[] {
  return extractCommandArguments(text, '\\href', 2).map(([url, label]) => ({
    url: cleanLatexUrl(url),
    label: cleanLatex(label),
  }));
}

interface CommandOccurrence {
  args: string[];
  index: number;
}

function extractCommandOccurrences(source: string, command: string, count: number): CommandOccurrence[] {
  const results: CommandOccurrence[] = [];
  let cursor = 0;
  while ((cursor = source.indexOf(command, cursor)) >= 0) {
    const commandIndex = cursor;
    let position = cursor + command.length;
    const args: string[] = [];
    while (args.length < count) {
      while (/\s/.test(source[position] || '')) position += 1;
      if (source[position] !== '{') break;
      let depth = 1;
      const start = ++position;
      while (position < source.length && depth > 0) {
        if (source[position] === '{' && source[position - 1] !== '\\') depth += 1;
        if (source[position] === '}' && source[position - 1] !== '\\') depth -= 1;
        position += 1;
      }
      if (depth !== 0) break;
      args.push(source.slice(start, position - 1));
    }
    if (args.length === count) results.push({ args, index: commandIndex });
    cursor = Math.max(position, cursor + command.length);
  }
  return results;
}

function extractCommandArguments(source: string, command: string, count: number): string[][] {
  return extractCommandOccurrences(source, command, count).map(({ args }) => args);
}

// Clean LaTeX escaping & formatting commands into readable text
export function cleanLatex(text: string): string {
  if (!text) return '';
  return text
    .replace(/\\href\{((?:\\.|[^{}])*)\}\{((?:\\.|[^{}])*)\}/g, '$2')
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
    .replace(/\\textbackslash\{\}/g, '\\')
    .replace(/\\enspace/g, ' ')
    .replace(/\\(?:small|normalsize|raggedright|textnormal)\b/g, '')
    .replace(/\\textbar/g, '|')
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
      const links = extractLinks(contactLine);
      const rawParts = contactLine
        .replace(/\\href\{((?:\\.|[^{}])*)\}\{((?:\\.|[^{}])*)\}/g, '')
        .split(/\$\|\$|\||\\textbar/)
        .map((part) => cleanLatex(part))
        .filter(Boolean)
        .map((label) => ({ label }));
      doc.contactItems = [...rawParts, ...links];
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

    const orderedCommands = [
      ...extractCommandOccurrences(sectionBody, '\\resumeSubheading', 4).map((occurrence) => ({
        ...occurrence,
        command: 'subheading' as const,
      })),
      ...extractCommandOccurrences(sectionBody, '\\resumeProjectHeading', 2).map((occurrence) => ({
        ...occurrence,
        command: 'project' as const,
      })),
      ...extractCommandOccurrences(sectionBody, '\\resumeItem', 1).map((occurrence) => ({
        ...occurrence,
        command: 'bullet' as const,
      })),
    ].sort((left, right) => left.index - right.index);

    for (const { args, command } of orderedCommands) {
      if (command === 'subheading') {
        section.items.push({
          type: 'subheading',
          title: cleanLatex(args[0]),
          date: cleanLatex(args[1]),
          subtitle: cleanLatex(args[2]),
          location: cleanLatex(args[3]),
        });
      } else if (command === 'project') {
        const headingParts = args[0].split(/\$\|\$|\||\\textbar/);
        section.items.push({
          type: 'project',
          title: cleanLatex(headingParts[0] || ''),
          subtitle: cleanLatex(headingParts[1] || ''),
          date: cleanLatex(args[1]),
          links: extractLinks(args[0]),
        });
      } else {
        section.items.push({
          type: 'bullet',
          content: cleanLatex(args[0]),
        });
      }
    }

    // Skills: \textbf{Category}: Skill1, Skill2 or \textbf{Category}{: Skill1, Skill2}
    const skillRegex = /\\textbf\{([^}]+)\}(?::|\{:|\{:\}|\s*:)\s*([^\n\\]+)/g;
    let skillMatch;
    while ((skillMatch = skillRegex.exec(sectionBody)) !== null) {
      const rawCat = cleanLatex(skillMatch[1]);
      const rawContent = cleanLatex(skillMatch[2]).replace(/^\{:\}\s*/, '').replace(/\}\s*$/, '').trim();
      if (rawCat && rawContent) {
        section.items.push({
          type: 'skill_group',
          title: rawCat,
          content: rawContent,
        });
      }
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

    const groupedItems: ParsedResumeItem[] = [];
    for (const item of section.items) {
      const previous = groupedItems[groupedItems.length - 1];
      if (item.type === 'bullet' && previous?.type === 'bullet') {
        previous.content = `${previous.content || ''}\n${item.content || ''}`;
      } else {
        groupedItems.push(item);
      }
    }
    section.items = groupedItems;
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

  const centerMatch = source.match(/\\begin\{center\}([\s\S]*?)\\end\{center\}/i);
  if (centerMatch) {
    doc.contactItems = extractLinks(centerMatch[1]);
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
