import re
from typing import Dict, List, Any, Optional
from urllib.parse import quote, urlsplit, urlunsplit


def escape_latex(text: Any) -> str:
    """Escapes special characters for safe LaTeX compilation."""
    if text is None:
        return ""
    text = str(text)
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    text = text.replace('\n', ' ')
    specials = {
        '\\': r'\textbackslash{}',
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
    return "".join(specials.get(char, char) for char in text)


def normalize_url(value: Any) -> str:
    """Return a safe, absolute URL while preserving meaningful query and fragment data."""
    if value is None:
        return ""
    url = str(value).strip()
    if not url:
        return ""
    url = url.replace("\\", "/")
    explicit_scheme = re.match(r"^([A-Za-z][A-Za-z0-9+.-]*):", url)
    if explicit_scheme and explicit_scheme.group(1).lower() not in {"http", "https", "mailto", "tel"}:
        raise ValueError(f"Unsupported hyperlink scheme: {explicit_scheme.group(1)}")
    if "@" in url and not url.lower().startswith(("http://", "https://", "mailto:")):
        url = f"mailto:{url}"
    elif "://" not in url and not url.lower().startswith(("mailto:", "tel:")):
        url = f"https://{url}"

    parts = urlsplit(url)
    if parts.scheme.lower() not in {"http", "https", "mailto", "tel"}:
        raise ValueError(f"Unsupported hyperlink scheme: {parts.scheme or 'missing'}")
    if parts.scheme.lower() in {"http", "https"} and not parts.netloc:
        raise ValueError("HTTP hyperlinks must include a host.")

    return urlunsplit((
        parts.scheme.lower(),
        parts.netloc,
        quote(parts.path, safe="/:@%+-._~"),
        quote(parts.query, safe="=&?/:@%+,-._~"),
        quote(parts.fragment, safe="=&?/:@%+,-._~"),
    ))


def safe_latex_url(value: Any) -> str:
    r"""Escape a normalized URL for a LaTeX \href argument."""
    url = normalize_url(value)
    replacements = {
        "\\": "/",
        "%": r"\%",
        "#": r"\#",
        "&": r"\&",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "^": r"\string^",
        "~": r"\string~",
    }
    return "".join(replacements.get(char, char) for char in url)


def safe_latex_hyperlink(url: Any, label: Any) -> str:
    """Build a hyperlink without letting user content break LaTeX escaping."""
    href = safe_latex_url(url)
    if not href:
        return escape_latex(label or '')
    return rf"\href{{{href}}}{{{escape_latex(label or 'Link')}}}"


def validate_latex_document(doc: str) -> bool:
    """Validate generated structure before saving or previewing."""
    if not doc or doc.count(r'\begin{document}') != 1 or doc.count(r'\end{document}') != 1:
        return False
    if "<<" in doc or ">>" in doc:
        return False
    environment_stack: List[str] = []
    for match in re.finditer(r"\\(begin|end)\{([^{}]+)\}", doc):
        action, environment = match.groups()
        if action == "begin":
            environment_stack.append(environment)
        elif not environment_stack or environment_stack.pop() != environment:
            return False
    if environment_stack:
        return False

    depth = 0
    index = 0
    while index < len(doc):
        if doc[index] == "%" and (index == 0 or doc[index - 1] != "\\"):
            newline = doc.find("\n", index)
            index = len(doc) if newline < 0 else newline + 1
            continue
        if doc[index] in "{}" and (index == 0 or doc[index - 1] != "\\"):
            depth += 1 if doc[index] == "{" else -1
            if depth < 0:
                return False
        index += 1
    if depth != 0:
        return False

    for href in re.finditer(r"\\href\{((?:\\.|[^{}])*)\}\{", doc):
        raw_url = re.sub(r"\\([%#&_{}])", r"\1", href.group(1))
        raw_url = raw_url.replace(r"\string^", "^").replace(r"\string~", "~")
        if not raw_url or urlsplit(raw_url).scheme.lower() not in {"http", "https", "mailto", "tel"}:
            return False
    return True

RESUMEFORGE_CLASS = r"""% ResumeForge shared resume/cover-letter styling.
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{resumeforge}[2026/10/11 ResumeForge document class]
\LoadClass[letterpaper,10pt]{article}

\RequirePackage[T1]{fontenc}
\RequirePackage[english]{babel}
\RequirePackage[margin=0.55in,top=0.45in,bottom=0.45in]{geometry}
\RequirePackage{enumitem}
\RequirePackage{fancyhdr}
\RequirePackage{hyperref}
\RequirePackage{tabularx}
\RequirePackage{titlesec}
\RequirePackage{xcolor}

\hypersetup{hidelinks}
\urlstyle{same}
\pagestyle{fancy}
\fancyhf{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}
\setlength{\tabcolsep}{0pt}
\setlength{\parindent}{0pt}
\raggedright
\raggedbottom
\setlist[itemize]{topsep=2pt,itemsep=1pt,parsep=0pt,partopsep=0pt}
\titleformat{\section}{\vspace{2pt}\scshape\raggedright\large}{}{0em}{}[\color{black}\titlerule\vspace{2pt}]
\titlespacing*{\section}{0pt}{5pt}{3pt}

\newcommand{\resumeItem}[1]{\item\small{#1}}
\newcommand{\resumeSubheading}[4]{%
  \item
  \begin{tabular*}{\textwidth}[t]{l@{\extracolsep{\fill}}r}
    \textbf{#1} & #2 \\
    \textit{\small #3} & \textit{\small #4} \\
  \end{tabular*}\vspace{1pt}}
\newcommand{\resumeProjectHeading}[2]{%
  \item
  \begin{tabular*}{\textwidth}{l@{\extracolsep{\fill}}r}
    \small #1 & #2 \\
  \end{tabular*}\vspace{1pt}}
\newcommand{\resumeSubItem}[1]{\resumeItem{#1}}
\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}
\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0pt,label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}[leftmargin=14pt]}
\newcommand{\resumeItemListEnd}{\end{itemize}}
\endinput
"""

RESUME_LATEX_TEMPLATE = r"""%-------------------------
% Resume in LaTeX
% ATS-Friendly & Professional
%------------------------

\documentclass{resumeforge}

\begin{document}

%----------HEADING----------
\begin{center}
<<HEADING_BLOCK>>
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

%-----------CERTIFICATIONS-----------
<<CERTIFICATIONS_SECTION>>

\end{document}
"""

COVER_LETTER_LATEX_TEMPLATE = r"""\documentclass{resumeforge}

\begin{document}

\begin{center}
<<HEADING_BLOCK>>
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
    @staticmethod
    def _date_range(start: Any, end: Any, is_current: bool = False) -> str:
        start_text = str(start or "").strip()
        end_text = str(end or ("Present" if is_current else "")).strip()
        if start_text and end_text:
            return escape_latex(f"{start_text} -- {end_text}")
        return escape_latex(start_text or end_text)

    @classmethod
    def generate_resume(
        cls,
        profile: Dict[str, Any],
        experiences: Optional[List[Dict[str, Any]]] = None,
        educations: Optional[List[Dict[str, Any]]] = None,
        skills: Optional[List[Dict[str, Any]]] = None,
        projects: Optional[List[Dict[str, Any]]] = None,
        certifications: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        """Render complete LaTeX source string for a resume."""
        experiences = experiences or []
        educations = educations or []
        skills = skills or []
        projects = projects or []
        certifications = certifications or []
        full_name = escape_latex(profile.get("full_name") or "Your Name")
        headline = escape_latex(profile.get("headline") or "")

        # Build contact info line
        contacts = []
        if profile.get("phone"):
            contacts.append(escape_latex(profile["phone"]))
        if profile.get("email"):
            email = profile['email']
            contacts.append(safe_latex_hyperlink(f"mailto:{email}", email))
        if profile.get("location"):
            contacts.append(escape_latex(profile["location"]))
        if profile.get("linkedin_url"):
            contacts.append(safe_latex_hyperlink(profile['linkedin_url'], 'LinkedIn'))
        if profile.get("github_url"):
            contacts.append(safe_latex_hyperlink(profile['github_url'], 'GitHub'))
        if profile.get("website_url"):
            contacts.append(safe_latex_hyperlink(profile['website_url'], 'Portfolio'))
        contact_line = r" \enspace\textbar\enspace ".join(contacts)

        # Build heading block safely without generating empty \\ lines
        heading_lines = [rf"    \textbf{{\Huge \scshape {full_name}}}"]
        if headline:
            heading_lines.append(rf"    \small {headline}")
        if contact_line:
            heading_lines.append(rf"    \small {contact_line}")
        heading_block = (r" \\ \vspace{2pt}" + "\n").join(heading_lines)

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
                date_range = cls._date_range(
                    exp.get("start_date"),
                    exp.get("end_date"),
                    bool(exp.get("is_current")),
                )
                exp_lines.append(f"\\resumeSubheading{{{role}}}{{{date_range}}}{{{company}}}{{{loc}}}")
                bullets = exp.get("bullet_points", [])
                if bullets:
                    exp_lines.append(r"\resumeItemListStart")
                    for b in bullets:
                        bullet = str(b or "").strip()
                        if bullet:
                            exp_lines.append(f"  \\resumeItem{{{escape_latex(bullet)}}}")
                    exp_lines.append(r"\resumeItemListEnd")
            exp_lines.append(r"\resumeSubHeadingListEnd")
            exp_section = "\n".join(exp_lines)

        # Projects section
        proj_section = ""
        if projects:
            proj_lines = [r"\section{Projects}", r"\resumeSubHeadingListStart"]
            for proj in projects:
                title = escape_latex(proj.get("title", ""))
                subtitle = escape_latex(proj.get("subtitle", ""))
                role = escape_latex(proj.get("role", ""))
                repo_url = proj.get("repo_url")
                live_url = proj.get("live_url")

                title_parts = [f"\\textbf{{{title}}}"]
                if subtitle:
                    title_parts.append(f"\\emph{{{subtitle}}}")
                if role:
                    title_parts.append(role)
                title_markup = r" \enspace\textbar\enspace ".join(title_parts)

                techs = ", ".join(escape_latex(t) for t in proj.get("technologies", []) if str(t).strip())
                tech_str = rf" \enspace\textbar\enspace \emph{{{techs}}}" if techs else ""
                links = []
                if repo_url:
                    links.append(safe_latex_hyperlink(repo_url, "Code"))
                if live_url:
                    links.append(safe_latex_hyperlink(live_url, "Live"))
                link_str = rf" \enspace\textbar\enspace {' / '.join(links)}" if links else ""
                heading = f"{title_markup}{tech_str}{link_str}"
                date_str = cls._date_range(proj.get("start_date"), proj.get("end_date"))
                proj_lines.append(f"\\resumeProjectHeading{{{heading}}}{{{date_str}}}")
                bullets = proj.get("bullet_points", [])
                if bullets:
                    proj_lines.append(r"\resumeItemListStart")
                    for b in bullets:
                        bullet = str(b or "").strip()
                        if bullet:
                            proj_lines.append(f"  \\resumeItem{{{escape_latex(bullet)}}}")
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
                gpa = str(edu.get("gpa") or "").strip()
                if gpa:
                    sub += f" \\enspace\\textbar\\enspace GPA: {escape_latex(gpa)}"
                date_str = cls._date_range(edu.get("start_date"), edu.get("end_date"))
                edu_lines.append(f"\\resumeSubheading{{{inst}}}{{{date_str}}}{{{sub}}}{{}}")
                highlights = edu.get("highlights", [])
                if highlights:
                    edu_lines.append(r"\resumeItemListStart")
                    for h in highlights:
                        highlight_text = str(h or "").strip()
                        if highlight_text:
                            edu_lines.append(f"  \\resumeItem{{{escape_latex(highlight_text)}}}")
                    edu_lines.append(r"\resumeItemListEnd")
            edu_lines.append(r"\resumeSubHeadingListEnd")
            edu_section = "\n".join(edu_lines)

        # Skills section
        skills_section = ""
        if skills:
            categories: Dict[str, List[str]] = {}
            for sk in skills:
                cat = str(sk.get("category") or "Technical Skills").strip()
                name = str(sk.get("name") or "").strip()
                if name:
                    for sub_name in [n.strip() for n in name.split(",") if n.strip()]:
                        categories.setdefault(cat, []).append(escape_latex(sub_name))

            skill_lines = [
                r"\section{Technical Skills}",
                r"\begin{itemize}[leftmargin=0.15in, label={}]",
                r"\small{\item{",
            ]
            cat_strings = []
            for cat, items in categories.items():
                unique_items = list(dict.fromkeys(items))
                cat_strings.append(f"\\textbf{{{escape_latex(cat)}}}{{: " + ", ".join(unique_items) + "}")
            skill_lines.append(" \\\\ \n".join(cat_strings))
            skill_lines.append(r"}}")
            skill_lines.append(r"\end{itemize}")
            skills_section = "\n".join(skill_lines)

        # Certifications section
        cert_section = ""
        if certifications:
            cert_lines = [r"\section{Certifications}", r"\resumeSubHeadingListStart"]
            for cert in certifications:
                name = escape_latex(cert.get("name", ""))
                if not name:
                    continue
                issuer = escape_latex(cert.get("issuer", ""))
                issue_date = escape_latex(cert.get("issue_date", ""))
                url = cert.get("credential_url")
                name_markup = safe_latex_hyperlink(url, name) if url else f"\\textbf{{{name}}}"
                heading = f"{name_markup} \\enspace\\textbar\\enspace \\emph{{{issuer}}}" if issuer else name_markup
                cert_lines.append(f"\\resumeProjectHeading{{{heading}}}{{{issue_date}}}")
            cert_lines.append(r"\resumeSubHeadingListEnd")
            cert_section = "\n".join(cert_lines)

        result = (
            RESUME_LATEX_TEMPLATE
            .replace("<<HEADING_BLOCK>>", heading_block)
            .replace("<<SUMMARY_SECTION>>", summary_section)
            .replace("<<EXPERIENCE_SECTION>>", exp_section)
            .replace("<<PROJECTS_SECTION>>", proj_section)
            .replace("<<EDUCATION_SECTION>>", edu_section)
            .replace("<<SKILLS_SECTION>>", skills_section)
            .replace("<<CERTIFICATIONS_SECTION>>", cert_section)
        )
        if not validate_latex_document(result):
            raise ValueError("Generated resume LaTeX failed structural validation.")
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
            email = profile['email']
            contacts.append(safe_latex_hyperlink(f"mailto:{email}", email))
        if profile.get("location"):
            contacts.append(escape_latex(profile["location"]))
        contact_line = r" \enspace\textbar\enspace ".join(contacts)

        heading_lines = [rf"    \textbf{{\Huge \scshape {full_name}}}"]
        if contact_line:
            heading_lines.append(rf"    \small {contact_line}")
        heading_block = (r" \\ \vspace{2pt}" + "\n").join(heading_lines)

        # Format letter paragraphs
        paragraphs = [p.strip() for p in letter_body.split("\n\n") if p.strip()]
        formatted_body = "\n\n\\vspace{8pt}\n".join([escape_latex(p) for p in paragraphs])

        result = (
            COVER_LETTER_LATEX_TEMPLATE
            .replace("<<HEADING_BLOCK>>", heading_block)
            .replace("<<DATE>>", escape_latex(date_str))
            .replace("<<COMPANY_NAME>>", escape_latex(company_name))
            .replace("<<JOB_TITLE>>", escape_latex(job_title))
            .replace("<<LETTER_BODY>>", formatted_body)
            .replace("<<FULL_NAME>>", full_name)
        )
        if not validate_latex_document(result):
            raise ValueError("Generated cover letter LaTeX failed structural validation.")
        return result
