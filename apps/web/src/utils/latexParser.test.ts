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
});
