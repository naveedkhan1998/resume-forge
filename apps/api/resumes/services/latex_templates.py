import re
from typing import Dict, List, Any

def escape_latex(text: Any) -> str:
    """Escapes special characters for safe LaTeX compilation."""
    if text is None:
        return ""
    text = str(text)
    specials = {
        '&': r'\&',
        '%': r'\%',
        '$': r'\$',
        '#': r'\#',
        '_': r'\_',
        '{': r'\{',
        '}': r'\}',
        '~': r'\textasciitilde{}',
        '^': r'\textasciicircum{}',
    }
    # Avoid double escaping
    regex = re.compile('|'.join(re.escape(key) for key in specials.keys()))
    return regex.sub(lambda match: specials[match.group()], text)

RESUME_LATEX_TEMPLATE = r"""%-------------------------
% Resume in LaTeX
% ATS-Friendly & Professional
%------------------------

\documentclass[letterpaper,11pt]{article}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}

\pagestyle{fancy}
\fancyhf{} % clear all header and footer fields
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

% Adjust margins
\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\urlstyle{same}

\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

% Sections formatting
\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

% Custom commands
\newcommand{\resumeItem}[1]{
  \item\small{
    {#1 \vspace{-2pt}}
  }
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeProjectHeading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \small#1 & #2 \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubItem}[1]{\resumeItem{#1}\vspace{-4pt}}

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}

%-------------------------------------------
%%%%%%  RESUME STARTS HERE  %%%%%%%%%%%%%%%%%%%%%%%%%%%%

\begin{document}

%----------HEADING----------
\begin{center}
    \textbf{\Huge \scshape <<FULL_NAME>>} \\ \vspace{2pt}
    \small <<HEADLINE>> \\ \vspace{2pt}
    \small <<CONTACT_INFO>>
\end{center}

<<SUMMARY_SECTION>>

%-----------EXPERIENCE-----------
<<EXPERIENCE_SECTION>>

%-----------PROJECTS-----------
<<PROJECTS_SECTION>>

%-----------EDUCATION-----------
<<EDUCATION_SECTION>>

%-----------TECHNICAL SKILLS-----------
<<SKILLS_SECTION>>

\end{document}
"""

COVER_LETTER_LATEX_TEMPLATE = r"""\documentclass[letterpaper,11pt]{article}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}

\pagestyle{fancy}
\fancyhf{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\urlstyle{same}

\begin{document}

\begin{center}
    \textbf{\Huge \scshape <<FULL_NAME>>} \\ \vspace{2pt}
    \small <<CONTACT_INFO>>
\end{center}

\vspace{12pt}
\noindent \textbf{Date:} <<DATE>> \\
\textbf{Company:} <<COMPANY_NAME>> \\
\textbf{Position:} <<JOB_TITLE>>

\vspace{14pt}
\noindent Dear Hiring Manager,

\vspace{10pt}
<<LETTER_BODY>>

\vspace{16pt}
\noindent Sincerely,\\
\textbf{<<FULL_NAME>>}

\end{document}
"""

class LatexGenerator:
    @classmethod
    def generate_resume(
        cls,
        profile: Dict[str, Any],
        experiences: List[Dict[str, Any]],
        educations: List[Dict[str, Any]],
        skills: List[Dict[str, Any]],
        projects: List[Dict[str, Any]],
    ) -> str:
        """Render complete LaTeX source string for a resume."""
        full_name = escape_latex(profile.get("full_name") or "Your Name")
        headline = escape_latex(profile.get("headline") or "")
        
        # Build contact info line
        contacts = []
        if profile.get("phone"):
            contacts.append(escape_latex(profile["phone"]))
        if profile.get("email"):
            email = escape_latex(profile['email'])
            contacts.append(r"\href{mailto:" + email + "}{" + email + "}")
        if profile.get("location"):
            contacts.append(escape_latex(profile["location"]))
        if profile.get("linkedin_url"):
            contacts.append(r"\href{" + escape_latex(profile['linkedin_url']) + "}{LinkedIn}")
        if profile.get("github_url"):
            contacts.append(r"\href{" + escape_latex(profile['github_url']) + "}{GitHub}")
        if profile.get("website_url"):
            contacts.append(r"\href{" + escape_latex(profile['website_url']) + "}{Portfolio}")
        contact_line = " $|$ ".join(contacts)

        # Summary section
        summary_section = ""
        if profile.get("summary"):
            summary_section = (
                r"\section{Professional Summary}" + "\n" +
                r"\small{" + escape_latex(profile["summary"]) + r"}" + "\n"
            )

        # Experience section
        exp_section = ""
        if experiences:
            exp_lines = [r"\section{Experience}", r"\resumeSubHeadingListStart"]
            for exp in experiences:
                role = escape_latex(exp.get("role", ""))
                company = escape_latex(exp.get("company", ""))
                loc = escape_latex(exp.get("location", ""))
                date_range = escape_latex(f"{exp.get('start_date', '')} -- {exp.get('end_date', 'Present' if exp.get('is_current') else '')}")
                exp_lines.append(f"\\resumeSubheading{{{role}}}{{{date_range}}}{{{company}}}{{{loc}}}")
                bullets = exp.get("bullet_points", [])
                if bullets:
                    exp_lines.append(r"\resumeItemListStart")
                    for b in bullets:
                        if b.strip():
                            exp_lines.append(f"  \\resumeItem{{{escape_latex(b)}}}")
                    exp_lines.append(r"\resumeItemListEnd")
            exp_lines.append(r"\resumeSubHeadingListEnd")
            exp_section = "\n".join(exp_lines)

        # Projects section
        proj_section = ""
        if projects:
            proj_lines = [r"\section{Projects}", r"\resumeSubHeadingListStart"]
            for proj in projects:
                title = escape_latex(proj.get("title", ""))
                techs = ", ".join([escape_latex(t) for t in proj.get("technologies", [])])
                tech_str = f" $|$ \\emph{{{techs}}}" if techs else ""
                heading = f"\\textbf{{{title}}}{tech_str}"
                date_str = escape_latex(f"{proj.get('start_date', '')} -- {proj.get('end_date', '')}").strip(" -")
                proj_lines.append(f"\\resumeProjectHeading{{{heading}}}{{{date_str}}}")
                bullets = proj.get("bullet_points", [])
                if bullets:
                    proj_lines.append(r"\resumeItemListStart")
                    for b in bullets:
                        if b.strip():
                            proj_lines.append(f"  \\resumeItem{{{escape_latex(b)}}}")
                    proj_lines.append(r"\resumeItemListEnd")
            proj_lines.append(r"\resumeSubHeadingListEnd")
            proj_section = "\n".join(proj_lines)

        # Education section
        edu_section = ""
        if educations:
            edu_lines = [r"\section{Education}", r"\resumeSubHeadingListStart"]
            for edu in educations:
                inst = escape_latex(edu.get("institution", ""))
                degree = escape_latex(edu.get("degree", ""))
                field = escape_latex(edu.get("field_of_study", ""))
                sub = f"{degree} in {field}" if field else degree
                date_str = escape_latex(f"{edu.get('start_date', '')} -- {edu.get('end_date', '')}").strip(" -")
                edu_lines.append(f"\\resumeSubheading{{{inst}}}{{{date_str}}}{{{sub}}}{{}}")
            edu_lines.append(r"\resumeSubHeadingListEnd")
            edu_section = "\n".join(edu_lines)

        # Skills section
        skills_section = ""
        if skills:
            # Group skills by category
            categories: Dict[str, List[str]] = {}
            for sk in skills:
                cat = sk.get("category", "Technical Skills")
                categories.setdefault(cat, []).append(escape_latex(sk.get("name", "")))

            skill_lines = [r"\section{Technical Skills}", r"\begin{itemize}[leftmargin=0.15in, label={}]", r"\small{\item{"]
            cat_strings = []
            for cat, items in categories.items():
                cat_strings.append(f"\\textbf{{{escape_latex(cat)}}}: " + ", ".join(items))
            skill_lines.append(" \\\\ \n".join(cat_strings))
            skill_lines.append(r"}}")
            skill_lines.append(r"\end{itemize}")
            skills_section = "\n".join(skill_lines)

        result = (
            RESUME_LATEX_TEMPLATE
            .replace("<<FULL_NAME>>", full_name)
            .replace("<<HEADLINE>>", headline)
            .replace("<<CONTACT_INFO>>", contact_line)
            .replace("<<SUMMARY_SECTION>>", summary_section)
            .replace("<<EXPERIENCE_SECTION>>", exp_section)
            .replace("<<PROJECTS_SECTION>>", proj_section)
            .replace("<<EDUCATION_SECTION>>", edu_section)
            .replace("<<SKILLS_SECTION>>", skills_section)
        )
        return result

    @classmethod
    def generate_cover_letter(
        cls,
        profile: Dict[str, Any],
        company_name: str,
        job_title: str,
        letter_body: str,
        date_str: str = "October 2026"
    ) -> str:
        """Render complete LaTeX source string for a cover letter."""
        full_name = escape_latex(profile.get("full_name") or "Your Name")
        contacts = []
        if profile.get("phone"):
            contacts.append(escape_latex(profile["phone"]))
        if profile.get("email"):
            email = escape_latex(profile['email'])
            contacts.append(r"\href{mailto:" + email + "}{" + email + "}")
        if profile.get("location"):
            contacts.append(escape_latex(profile["location"]))
        contact_line = " $|$ ".join(contacts)

        # Format letter paragraphs
        paragraphs = [p.strip() for p in letter_body.split("\n\n") if p.strip()]
        formatted_body = "\n\n\\vspace{8pt}\n".join([escape_latex(p) for p in paragraphs])

        return (
            COVER_LETTER_LATEX_TEMPLATE
            .replace("<<FULL_NAME>>", full_name)
            .replace("<<CONTACT_INFO>>", contact_line)
            .replace("<<DATE>>", escape_latex(date_str))
            .replace("<<COMPANY_NAME>>", escape_latex(company_name))
            .replace("<<JOB_TITLE>>", escape_latex(job_title))
            .replace("<<LETTER_BODY>>", formatted_body)
        )
