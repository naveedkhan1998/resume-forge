import { describe, expect, it } from 'vitest';

import { parseLatexDocument } from './latexParser';

describe('parseLatexDocument', () => {
  it('keeps each experience and project next to its own bullets', () => {
    const source = String.raw`
\documentclass{resumeforge}
\begin{document}
\begin{center}
  \textbf{\Huge \scshape Jane Doe} \\ \vspace{2pt}
  \small Platform Engineer \\ \vspace{2pt}
  \small jane@example.com
\end{center}
\section{Experience}
\resumeSubHeadingListStart
\resumeSubheading{Senior Engineer}{2024 -- Present}{First Company}{Remote}
\resumeItemListStart
\resumeItem{First company bullet one.}
\resumeItem{First company bullet two.}
\resumeItemListEnd
\resumeSubheading{Engineer}{2022 -- 2024}{Second Company}{New York, NY}
\resumeItemListStart
\resumeItem{Second company bullet.}
\resumeItemListEnd
\resumeSubHeadingListEnd
\section{Projects}
\resumeSubHeadingListStart
\resumeProjectHeading{\textbf{First Project} \enspace\textbar\enspace \emph{Python}}{2024}
\resumeItemListStart
\resumeItem{First project bullet.}
\resumeItemListEnd
\resumeProjectHeading{\textbf{Second Project} \enspace\textbar\enspace \emph{Go}}{2023}
\resumeItemListStart
\resumeItem{Second project bullet.}
\resumeItemListEnd
\resumeSubHeadingListEnd
\end{document}`;

    const document = parseLatexDocument(source);
    const experience = document.sections.find(({ title }) => title === 'Experience');
    const projects = document.sections.find(({ title }) => title === 'Projects');

    expect(experience?.items).toEqual([
      expect.objectContaining({ type: 'subheading', title: 'Senior Engineer', subtitle: 'First Company' }),
      expect.objectContaining({
        type: 'bullet',
        content: 'First company bullet one.\nFirst company bullet two.',
      }),
      expect.objectContaining({ type: 'subheading', title: 'Engineer', subtitle: 'Second Company' }),
      expect.objectContaining({ type: 'bullet', content: 'Second company bullet.' }),
    ]);
    expect(projects?.items).toEqual([
      expect.objectContaining({ type: 'project', title: 'First Project', subtitle: 'Python' }),
      expect.objectContaining({ type: 'bullet', content: 'First project bullet.' }),
      expect.objectContaining({ type: 'project', title: 'Second Project', subtitle: 'Go' }),
      expect.objectContaining({ type: 'bullet', content: 'Second project bullet.' }),
    ]);
  });

  it('parses technical skills and certifications properly', () => {
    const source = String.raw`
\documentclass{resumeforge}
\begin{document}
\section{Technical Skills}
\begin{itemize}[leftmargin=0.15in, label={}]
  \small{\item{
    \textbf{Languages}{: Python, TypeScript, Go} \\
    \textbf{Frameworks}: React, FastAPI, Django
  }}
\end{itemize}
\section{Certifications}
\resumeSubHeadingListStart
\resumeProjectHeading{\textbf{AWS Solutions Architect} \enspace\textbar\enspace \emph{Amazon}}{2023}
\resumeSubHeadingListEnd
\end{document}`;

    const document = parseLatexDocument(source);
    const skills = document.sections.find(({ title }) => title === 'Technical Skills');
    const certs = document.sections.find(({ title }) => title === 'Certifications');

    expect(skills?.items).toEqual([
      expect.objectContaining({ type: 'skill_group', title: 'Languages', content: 'Python, TypeScript, Go' }),
      expect.objectContaining({ type: 'skill_group', title: 'Frameworks', content: 'React, FastAPI, Django' }),
    ]);
    expect(certs?.items).toEqual([
      expect.objectContaining({ type: 'project', title: 'AWS Solutions Architect', subtitle: 'Amazon' }),
    ]);
  });

  it('renders generated resume content without leaking LaTeX formatting', () => {
    const source = String.raw`
\begin{document}
\begin{center}
  \textbf{\Huge \scshape Jane Doe} \\ \vspace{2pt}
  \small Platform Engineer \\ \vspace{2pt}
  \small 555-0100 \enspace\textbar\enspace
  \href{mailto:jane@example.com}{jane@example.com} \enspace\textbar\enspace
  Toronto, ON \enspace\textbar\enspace
  \href{https://example.com}{Portfolio}
\end{center}
\section{Professional Summary}
\small{Engineer building reliable systems.}
%-----------EXPERIENCE-----------
\section{Experience}
\resumeSubHeadingListStart
\resumeSubheading{Engineer}{2022 -- Present}{Example Corp}{Remote}
\resumeItemListStart
\resumeItem{Scaled throughput from 20 to $>$1,000 requests/minute.}
\resumeItemListEnd
\resumeSubHeadingListEnd
%-----------PROJECTS-----------
\section{Projects}
\resumeSubHeadingListStart
\resumeProjectHeading{\textbf{Trading Platform} \enspace\textbar\enspace
\emph{Real-time trading toolkit} \enspace\textbar\enspace Lead Engineer
\enspace\textbar\enspace \emph{Python, Django, Celery}}{
\href{https://github.com/example/trading}{Code} / \href{https://example.com/trading}{Live}}
\resumeSubHeadingListEnd
\end{document}`;

    const document = parseLatexDocument(source);
    const summary = document.sections.find(({ title }) => title === 'Professional Summary');
    const experience = document.sections.find(({ title }) => title === 'Experience');
    const projects = document.sections.find(({ title }) => title === 'Projects');

    expect(document.contactItems).toEqual([
      { label: '555-0100' },
      { label: 'jane@example.com', url: 'mailto:jane@example.com' },
      { label: 'Toronto, ON' },
      { label: 'Portfolio', url: 'https://example.com' },
    ]);
    expect(summary?.items).toEqual([
      expect.objectContaining({ type: 'paragraph', content: 'Engineer building reliable systems.' }),
    ]);
    expect(experience?.items).toContainEqual(
      expect.objectContaining({
        type: 'bullet',
        content: 'Scaled throughput from 20 to >1,000 requests/minute.',
      }),
    );
    expect(projects?.items).toEqual([
      expect.objectContaining({
        type: 'project',
        title: 'Trading Platform',
        subtitle: 'Real-time trading toolkit | Lead Engineer | Python, Django, Celery',
        date: '',
        links: [
          { label: 'Code', url: 'https://github.com/example/trading' },
          { label: 'Live', url: 'https://example.com/trading' },
        ],
      }),
    ]);
  });

  it('generates a selectable vector PDF directly on the client in milliseconds', () => {
    const source = String.raw`
\documentclass{resumeforge}
\begin{document}
\begin{center}
  \textbf{\Huge \scshape Dr. Clara Oswald} \\ \vspace{2pt}
  \small Emergency Medicine Physician \\ \vspace{2pt}
  \small 555-0199 \enspace\textbar\enspace \href{mailto:clara@hospital.org}{clara@hospital.org}
\end{center}
\section{Experience}
\resumeSubHeadingListStart
\resumeSubheading{Attending Physician}{2022 -- Present}{Metro General Hospital}{Boston, MA}
\resumeItemListStart
\resumeItem{Directed acute trauma triage across a 45-bed emergency department.}
\resumeItemListEnd
\resumeSubHeadingListEnd
\section{Technical Skills}
\begin{itemize}[leftmargin=0.15in, label={}]
  \small{\item{
    \textbf{Clinical Care}{: Trauma Triage, Airway Management, Point-of-Care Ultrasound}
  }}
\end{itemize}
\end{document}`;

    return import('./latexPdfExport').then(({ generateLatexPdfDocument }) => {
      const pdf = generateLatexPdfDocument(source);
      const output = pdf.output('datauristring');
      expect(output).toContain('data:application/pdf');
      expect(pdf.getNumberOfPages()).toBe(1);
    });
  });
});
