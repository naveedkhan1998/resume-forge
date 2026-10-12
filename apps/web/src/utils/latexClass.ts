/**
 * ResumeForge shared LaTeX document class (resumeforge.cls).
 * Required by LaTeX documents that use \documentclass{resumeforge}.
 * Bundled when exporting to Overleaf or downloading the class file.
 */
export const RESUMEFORGE_CLASS = `% ResumeForge shared resume/cover-letter styling.
\\NeedsTeXFormat{LaTeX2e}
\\ProvidesClass{resumeforge}[2026/10/11 ResumeForge document class]
\\LoadClass[letterpaper,10pt]{article}

\\RequirePackage[T1]{fontenc}
\\RequirePackage[english]{babel}
\\RequirePackage[margin=0.55in,top=0.45in,bottom=0.45in]{geometry}
\\RequirePackage{enumitem}
\\RequirePackage{fancyhdr}
\\RequirePackage{hyperref}
\\RequirePackage{tabularx}
\\RequirePackage{titlesec}
\\RequirePackage{xcolor}

\\hypersetup{hidelinks}
\\urlstyle{same}
\\pagestyle{fancy}
\\fancyhf{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}
\\setlength{\\tabcolsep}{0pt}
\\setlength{\\parindent}{0pt}
\\raggedright
\\raggedbottom
\\setlist[itemize]{topsep=2pt,itemsep=1pt,parsep=0pt,partopsep=0pt}
\\titleformat{\\section}{\\vspace{2pt}\\scshape\\raggedright\\large}{}{0em}{}[\\color{black}\\titlerule\\vspace{2pt}]
\\titlespacing*{\\section}{0pt}{5pt}{3pt}

\\newcommand{\\resumeItem}[1]{\\item\\small{#1}}
\\newcommand{\\resumeSubheading}[4]{%
  \\item
  \\begin{tabular*}{\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    \\textbf{#1} & #2 \\\\
    \\textit{\\small #3} & \\textit{\\small #4} \\\\
  \\end{tabular*}\\vspace{1pt}}
\\newcommand{\\resumeProjectHeading}[2]{%
  \\item
  \\begin{tabular*}{\\textwidth}{l@{\\extracolsep{\\fill}}r}
    \\small #1 & #2 \\\\
  \\end{tabular*}\\vspace{1pt}}
\\newcommand{\\resumeSubItem}[1]{\\resumeItem{#1}}
\\renewcommand\\labelitemii{$\\vcenter{\\hbox{\\tiny$\\bullet$}}$}
\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0pt,label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}[leftmargin=14pt]}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}}
\\endinput
`;
