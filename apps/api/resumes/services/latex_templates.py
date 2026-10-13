import re
from typing import Dict, List, Any, Optional
from urllib.parse import quote, urlsplit, urlunsplit
from .experience_calculator import (
    calculate_experience_metrics,
    calculate_experience_metrics_from_latex,
    normalize_experience_duration_text,
)


def normalize_unicode_and_latex_text(text: Any, expected_years: Optional[int] = None) -> str:
    """
    Normalizes hidden Unicode characters, whitespace quirks, and common domain/technical errors.
    Prevents PDF compilers from eating hyphens or misinterpreting spacing.
    Dynamically aligns experience duration based on calculated work history if available.
    """
    if text is None:
        return ""
    text = str(text)

    # 1. Unicode hyphens, dashes, and minuses -> standard ASCII hyphen
    # U+2010-U+2014 (hyphens and dashes), U+2212 (minus sign)
    for u in ("\u2010", "\u2011", "\u2012", "\u2013", "\u2014", "\u2212"):
        text = text.replace(u, "-")

    # 2. Narrow, non-breaking, thin, and invisible spaces -> standard ASCII space
    # U+00A0 (no-break space), U+202F (narrow no-break space), U+2009 (thin space), U+200A (hair space)
    for u in ("\u00a0", "\u202f", "\u2009", "\u200a"):
        text = text.replace(u, " ")

    # Zero-width spaces, joiners, BOM
    for u in ("\u200b", "\u200c", "\u200d", "\ufeff"):
        text = text.replace(u, "")

    # 3. Micro sign / Greek mu (µs in sub-60 µs)
    text = text.replace("\u00b5", "u").replace("\u03bc", "u")

    # 4. Domain-specific semantic corrections:
    # 4a. Inverted Latency Claim (boosting latency -> reducing overall pipeline latency)
    text = re.sub(
        r"\b(?:boosting|boosted|increasing|increased)\s+(?:(?:overall|system|pipeline|API|query|end-to-end)\s+)*latency\b",
        "reducing overall pipeline latency",
        text,
        flags=re.IGNORECASE,
    )

    # 4b. Garbled Cloud MTTD Metric (Cloud anomaly alert triggers operate in seconds, not microseconds)
    text = re.sub(
        r"(?:mean-time-to-detect|MTTD|detection\s+time)\s+(?:to\s+)?sub-?([0-9]+)\s*(?:us|µs|μs)\b",
        r"mean-time-to-detect to sub-\1s",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"\b(sub-?[0-9]+)\s*(?:us|µs|μs)\b(?=.*(?:anomal|alert|incident|production|cloudwatch|prometheus|mttd|datadog|telemetry))",
        r"\1s",
        text,
        flags=re.IGNORECASE,
    )

    # 4c. Inverted Trading Latency Direction (signal-to-order latency, not order-to-signal)
    text = re.sub(
        r"\border-to-signal(?:\s+latency)?\b",
        "signal-to-order latency",
        text,
        flags=re.IGNORECASE,
    )

    # 4d. Misattributed Cloud Technology: AWS CDK placed under GCP
    if re.search(r"GCP\s*\([^)]*\bCDK\b[^)]*\)", text):
        text = re.sub(r"(GCP\s*\([^)]*),\s*CDK([^)]*\))", r"\1\2", text)
        text = re.sub(r"(GCP\s*\([^)]*)\bCDK,\s*([^)]*\))", r"\1\2", text)
        text = re.sub(r"(GCP\s*\([^)]*)\bCDK([^)]*\))", r"\1\2", text)
        aws_m = re.search(r"AWS\s*\([^)]*\)", text)
        if aws_m and "CDK" not in aws_m.group(0):
            text = re.sub(r"AWS\s*\(([^)]*)\)", r"AWS (\1, CDK)", text)

    # 4e. Dynamic Experience Duration Normalization (calculated from candidate history / document)
    if expected_years is None and r"\section{Experience}" in text:
        calc_metrics = calculate_experience_metrics_from_latex(text)
        if calc_metrics and calc_metrics.get("display_years"):
            expected_years = calc_metrics["display_years"]

    if expected_years and expected_years >= 1:
        text = normalize_experience_duration_text(text, expected_years)

    # 4f. LaTeX Math Delimiters in I/O, CI/CD, and metrics
    text = text.replace(r"$>$", r"\textgreater{}").replace(r"$<$", r"\textless{}")
    text = re.sub(r"(\s|^)(?:\$|\\\$)?<\s*(?:\$|\\\$)?\s*([0-9]+)\s*(?:\$|\\\$)?\s*s\b", r"\1sub-\2s", text, flags=re.IGNORECASE)
    text = re.sub(r"(?:\$|\\\$)\s*C[I1l]/CD\s*(?:\$|\\\$)?(?=\b|\W|$)", "CI/CD", text)
    text = re.sub(r"\bCI/CD(?:\$|\\\$)", "CI/CD", text)
    text = re.sub(r"(?:\$|\\\$)\s*[1Iil]/O\s*(?:\$|\\\$)", "I/O", text)
    text = re.sub(r"\basync(?:hronous)?\s+(?:\$|\\\$)?\s*[1Iil]/O(?:\$|\\\$)?(?=\b|\W|$)", "asynchronous I/O", text, flags=re.IGNORECASE)
    text = re.sub(r"(?:\$|\\\$)\s*[1Iil]/O(?:\$|\\\$)?(?=\b|\W|$)", "I/O", text)

    # 4g. 'Al' (A + lowercase l) glyph confusion for 'AI' (A + capital I)
    text = re.sub(r"\b[Aa]l-(ready|powered|driven|native|first|focused|enabled|centric)\b", r"AI-\1", text)
    text = re.sub(r"\b(Generative\s+|Gen)Al\b", r"\g<1>AI", text, flags=re.IGNORECASE)
    text = re.sub(r"\bAl/ML\b", "AI/ML", text)
    text = re.sub(r"(?<!\bet\s)(?<!\bet\.\s)\bAl\b", "AI", text)

    # 4h. Common Typos: asyne -> async, Fast API -> FastAPI
    text = re.sub(r"\basyne\b", "async", text, flags=re.IGNORECASE)
    text = re.sub(r"\bFast\s+API\b", "FastAPI", text)

    # 4i. Education layout standardization: fix stray pipes, floating bars, displaced dates
    if r"\section{Education}" in text:
        text = clean_education_subheadings(text)

    # 4j. Project heading links truncation prevention: right-align links and prevent overflow
    if r"\resumeProjectHeading" in text:
        text = fix_raw_latex_project_headings(text)

    # 4k. Consolidate raw LaTeX Technical Skills block if present in document
    if r"\section{Technical Skills}" in text:
        text = consolidate_raw_latex_skills(text)

    text = re.sub(
        r"\n%-----------CERTIFICATIONS-----------\s*(?=\\end\{document\})",
        "\n",
        text,
    )

    return text


def clean_education_subheadings(text: str) -> str:
    """Standardizes Education sub-headings: dates on the right, degree below, no stray pipe characters."""
    if r"\section{Education}" not in text:
        return text

    pattern = re.compile(
        r"(\\section\{Education\}.*?)(?=\\section\{|\\end\{document\}|$)",
        re.DOTALL
    )

    def repl_section(m):
        edu_sec = m.group(1)
        sub_pattern = re.compile(
            r"\\resumeSubheading\{([^{}]*)\}\{([^{}]*)\}\{([^{}]*)\}\{([^{}]*)\}"
        )
        def repl_sub(sm):
            a1, a2, a3, a4 = sm.group(1), sm.group(2), sm.group(3), sm.group(4)
            # Remove any stray pipe characters from a4
            a4_clean = re.sub(r"^\s*(?:\\enspace)?\\textbar(?:\\enspace)?\s*$", "", a4.strip())
            a4_clean = re.sub(r"^\s*\|\s*$", "", a4_clean).strip()

            # If a1 has institution | date, split them:
            if ("|" in a1 or r"\textbar" in a1) and not a2.strip():
                parts = re.split(r"\s*(?:\\enspace)?\\textbar(?:\\enspace)?\s*|\s*\|\s*", a1)
                if len(parts) >= 2:
                    a1 = parts[0].strip()
                    a2 = parts[1].strip()

            # Standardize date range with double dash: e.g. "2023 2024" or "2023 - 2024" -> "2023 -- 2024"
            a2 = re.sub(r"\b(\d{4})\s+(\d{4})\b", r"\1 -- \2", a2)
            a2 = re.sub(r"\b(\d{4})\s*-\s*(\d{4})\b", r"\1 -- \2", a2)

            # Clean trailing/leading pipes from a3
            a3_clean = re.sub(r"\s*(?:\\enspace)?\\textbar(?:\\enspace)?\s*$", "", a3.strip())
            a3_clean = re.sub(r"^\s*(?:\\enspace)?\\textbar(?:\\enspace)?\s*", "", a3_clean)

            return f"\\resumeSubheading{{{a1.strip()}}}{{{a2.strip()}}}{{{a3_clean.strip()}}}{{{a4_clean}}}"

        return sub_pattern.sub(repl_sub, edu_sec)

    return pattern.sub(repl_section, text)


def fix_raw_latex_project_headings(text: str) -> str:
    """Fixes project headings in raw LaTeX to right-align links and prevent margin truncation."""
    def repl(m):
        full_content = m.group(1)
        href_idx = full_content.find(r"\href")
        if href_idx > 0:
            left_part = full_content[:href_idx].rstrip()
            left_part = re.sub(r"\s*\\enspace\\textbar\\enspace\s*$", "", left_part).strip()
            links_part = full_content[href_idx:].strip()

            parts = re.split(r"\s*\\enspace\\textbar\\enspace\s*", left_part)
            if len(parts) >= 3 and parts[1].startswith(r"\emph{") and parts[2].startswith(r"\emph{"):
                left_part = f"{parts[0]} \\enspace\\textbar\\enspace {parts[2]}"

            return f"\\resumeProjectHeading{{{left_part}}}{{{links_part}}}"
        return m.group(0)

    return re.sub(r"\\resumeProjectHeading\{([^\n]+)\}\{\}", repl, text)


def streamline_cloud_devops_items(items: List[str]) -> List[str]:
    """Streamlines Cloud & DevOps skills: eliminates duplicate Kubernetes and redundant generic clouds."""
    seen = set()
    raw_list = []
    has_k8s = any("kubernetes" in x.lower() or "eks" in x.lower() or "gke" in x.lower() for x in items)
    has_aws_specific = any("cdk" in x.lower() for x in items)

    for item in items:
        norm = item.strip()
        low = norm.lower()

        if "kubernetes" in low or "eks" in low or "gke" in low:
            if "k8s_added" not in seen:
                raw_list.append("Kubernetes (EKS, GKE)")
                seen.add("k8s_added")
                seen.add("kubernetes")
                seen.add("kubernetes (eks/gke)")
                seen.add("kubernetes (eks, gke)")
            continue

        if low in {"aws", "gcp"} and (has_k8s or has_aws_specific):
            continue

        if low not in seen:
            seen.add(low)
            raw_list.append(norm)

    order_priority = {
        "docker": 1,
        "kubernetes (eks, gke)": 2,
        "terraform": 3,
        "aws cdk": 4,
        "gitlab ci/cd": 5,
        "github actions": 6,
        "nginx": 7,
    }
    return sorted(raw_list, key=lambda x: order_priority.get(x.lower(), 99))


CANONICAL_SKILL_CATEGORIES = [
    "Programming Languages",
    "Frameworks & Backend",
    "Cloud & DevOps",
    "Databases & Caching",
    "Observability & Tools",
]


def classify_skill_item(cat_hint: str, name: str) -> str:
    n_low = name.lower()
    c_low = cat_hint.lower()

    if n_low in {"python", "c++", "go", "typescript", "javascript", "sql", "rust", "java", "bash", "c"} or "language" in c_low:
        return "Programming Languages"
    if any(db in n_low for db in ["postgres", "redis", "database", "mongo", "dynamo", "elastic", "cassandra", "kafka", "mysql"]):
        return "Databases & Caching"
    if any(cd in n_low for cd in ["docker", "kubernetes", "eks", "gke", "terraform", "cdk", "gitlab", "github actions", "nginx", "helm", "aws", "gcp", "azure", "ci/cd", "container"]):
        return "Cloud & DevOps"
    if any(obs in n_low for obs in ["prometheus", "grafana", "loki", "tempo", "sentry", "git", "pytest", "datadog", "cloudwatch", "testing", "jest"]):
        return "Observability & Tools"
    if "devops" in c_low or "cloud" in c_low:
        return "Cloud & DevOps"
    if "observab" in c_low or "tool" in c_low or "test" in c_low:
        return "Observability & Tools"
    return "Frameworks & Backend"


def consolidate_raw_latex_skills(text: str) -> str:
    pattern = re.compile(
        r"(\\section\{Technical Skills\}\s*\\begin\{itemize\}(?:\[[^\]]*\])?\s*\\small\{\\item\{)(.*?)(\}\}\s*\\end\{itemize\})",
        re.DOTALL
    )
    def replacer(m):
        prefix = m.group(1)
        inner = m.group(2)
        suffix = m.group(3)

        matches = re.findall(r"\\textbf\{([^}]+)\}\{:\s*([^}]+)\}", inner)
        if not matches:
            return m.group(0)

        categorized: Dict[str, List[str]] = {cat: [] for cat in CANONICAL_SKILL_CATEGORIES}
        seen: Set[str] = set()

        for cat_title, items_str in matches:
            # Clean potential period typo e.g. "Redis. Redis Pub/Sub"
            items_str = re.sub(r"\.\s+", ", ", items_str)
            parts = [p.strip().rstrip(".") for p in re.split(r"[,;]+", items_str) if p.strip()]
            for p in parts:
                p_norm = p.strip()
                if p_norm.lower() in {"fast api", "fastapi"}:
                    p_norm = "FastAPI"
                p_id = p_norm.lower()
                if p_id in seen:
                    continue
                seen.add(p_id)
                target = classify_skill_item(cat_title, p_norm)
                categorized[target].append(p_norm)

        # Streamline Cloud & DevOps line (eliminate duplicate Kubernetes and redundant generic clouds)
        categorized["Cloud & DevOps"] = streamline_cloud_devops_items(categorized["Cloud & DevOps"])

        cat_strings = []
        for cat in CANONICAL_SKILL_CATEGORIES:
            items = categorized[cat]
            if items:
                cat_tex = cat.replace("&", r"\&")
                cat_strings.append(f"\\textbf{{{cat_tex}}}{{: " + ", ".join(items) + "}")

        new_inner = " \\\\ \n".join(cat_strings)
        return f"{prefix}\n{new_inner}\n{suffix}"

    return pattern.sub(replacer, text)


def consolidate_skills_to_latex(skills: List[Dict[str, Any]]) -> str:
    """Consolidates skills list into exactly 5 compact, non-duplicate LaTeX lines."""
    if not skills:
        return ""

    categorized: Dict[str, List[str]] = {cat: [] for cat in CANONICAL_SKILL_CATEGORIES}
    seen_ids: Set[str] = set()

    for sk in skills:
        cat_hint = str(sk.get("category") or "").strip()
        name_str = str(sk.get("name") or "").strip().rstrip(".")
        if not name_str:
            continue
        name_str = re.sub(r"\.\s+", ", ", name_str)
        sub_items = [s.strip().rstrip(".") for s in re.split(r"[,;]+", name_str) if s.strip()]
        for sub in sub_items:
            sub_norm = sub.strip()
            if sub_norm.lower() in {"fast api", "fastapi"}:
                sub_norm = "FastAPI"
            sub_id = sub_norm.lower()
            if sub_id in seen_ids:
                continue
            seen_ids.add(sub_id)
            target_cat = classify_skill_item(cat_hint, sub_norm)
            categorized[target_cat].append(escape_latex(sub_norm))

    # Streamline Cloud & DevOps line
    categorized["Cloud & DevOps"] = streamline_cloud_devops_items(categorized["Cloud & DevOps"])

    cat_strings = []
    for cat in CANONICAL_SKILL_CATEGORIES:
        items = categorized[cat]
        if items:
            cat_tex = escape_latex(cat)
            cat_strings.append(f"\\textbf{{{cat_tex}}}{{: " + ", ".join(items) + "}")

    if not cat_strings:
        return ""

    skill_lines = [
        r"\section{Technical Skills}",
        r"\begin{itemize}[leftmargin=0.15in, label={}]",
        r"\small{\item{",
        " \\\\ \n".join(cat_strings),
        r"}}",
        r"\end{itemize}",
    ]
    return "\n".join(skill_lines)


def escape_latex(text: Any) -> str:
    """Escapes special characters for safe LaTeX compilation."""
    if text is None:
        return ""
    text = normalize_unicode_and_latex_text(text)
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
        '>': r'\textgreater{}',
        '<': r'\textless{}',
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
\RequirePackage{textcomp}
\RequirePackage{iftex}
\ifPDFTeX
  \RequirePackage[utf8]{inputenc}
  \DeclareUnicodeCharacter{2011}{-}
  \DeclareUnicodeCharacter{2010}{-}
  \DeclareUnicodeCharacter{2012}{-}
  \DeclareUnicodeCharacter{2013}{--}
  \DeclareUnicodeCharacter{2014}{---}
  \DeclareUnicodeCharacter{2212}{-}
  \DeclareUnicodeCharacter{202F}{\,}
  \DeclareUnicodeCharacter{00A0}{~}
  \DeclareUnicodeCharacter{00B5}{\textmu}
  \DeclareUnicodeCharacter{03BC}{\textmu}
\fi
\RequirePackage[margin=0.55in,top=0.45in,bottom=0.45in]{geometry}
\RequirePackage{enumitem}
\RequirePackage{fancyhdr}
\RequirePackage{hyperref}
\RequirePackage{tabularx}
\RequirePackage{array}
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
  \begin{tabularx}{\textwidth}{>{\raggedright\arraybackslash}X >{\raggedleft\arraybackslash}p{0.24\textwidth}}
    \small #1 & \small #2 \\
  \end{tabularx}\vspace{1pt}}
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

<<EXPERIENCE_SECTION>>

<<PROJECTS_SECTION>>

<<EDUCATION_SECTION>>

<<SKILLS_SECTION>>

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

        # Calculate dynamic experience metrics from work history
        exp_metrics = calculate_experience_metrics(experiences)
        expected_years = exp_metrics.get("display_years")

        # Summary section
        summary_section = ""
        if profile.get("summary"):
            summary_raw = normalize_experience_duration_text(profile["summary"], expected_years)
            summary_section = (
                r"\section{Professional Summary}" + "\n" +
                r"\small{" + escape_latex(summary_raw) + r"}" + "\n"
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

                # Right side: links and dates
                links = []
                if repo_url:
                    links.append(safe_latex_hyperlink(repo_url, "Code"))
                if live_url:
                    links.append(safe_latex_hyperlink(live_url, "Live"))
                link_str = " / ".join(links)
                date_str = cls._date_range(proj.get("start_date"), proj.get("end_date"))
                if link_str and date_str:
                    right_str = f"{link_str} \\enspace\\textbar\\enspace {date_str}"
                else:
                    right_str = link_str or date_str

                # Left side: title, subtitle, role, and technologies
                techs = ", ".join(escape_latex(t) for t in proj.get("technologies", []) if str(t).strip())
                title_parts = [f"\\textbf{{{title}}}"]
                if subtitle:
                    title_parts.append(rf"\emph{{{subtitle}}}")
                if role:
                    title_parts.append(role)
                if techs:
                    title_parts.append(rf"\emph{{{techs}}}")
                left_str = r" \enspace\textbar\enspace ".join(title_parts)

                proj_lines.append(f"\\resumeProjectHeading{{{left_str}}}{{{right_str}}}")
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

        # Skills section (consolidated into 5 compact canonical lines without duplication)
        skills_section = consolidate_skills_to_latex(skills)

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

        section_values = {
            "<<SUMMARY_SECTION>>": summary_section,
            "<<EXPERIENCE_SECTION>>": (
                "%-----------EXPERIENCE-----------\n" + exp_section if exp_section else ""
            ),
            "<<PROJECTS_SECTION>>": (
                "%-----------PROJECTS-----------\n" + proj_section if proj_section else ""
            ),
            "<<EDUCATION_SECTION>>": (
                "%-----------EDUCATION-----------\n" + edu_section if edu_section else ""
            ),
            "<<SKILLS_SECTION>>": (
                "%-----------TECHNICAL SKILLS-----------\n" + skills_section if skills_section else ""
            ),
            "<<CERTIFICATIONS_SECTION>>": (
                "%-----------CERTIFICATIONS-----------\n" + cert_section if cert_section else ""
            ),
        }
        result = RESUME_LATEX_TEMPLATE.replace("<<HEADING_BLOCK>>", heading_block)
        for placeholder, section_value in section_values.items():
            result = result.replace(placeholder, section_value)
        result = normalize_unicode_and_latex_text(result, expected_years=expected_years)
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
