import datetime
import logging
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union
from django.contrib.auth.models import User

logger = logging.getLogger(__name__)

MONTH_MAP = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}


def parse_flexible_date(
    date_str: Any,
    is_end: bool = False,
    is_current: bool = False,
) -> Optional[datetime.date]:
    """Parse various resume date string formats into a standard datetime.date."""
    if is_current:
        return datetime.date.today()
    if not date_str:
        return datetime.date.today() if is_end else None

    s = str(date_str).strip().lower()
    if s in {"present", "current", "now"}:
        return datetime.date.today()

    # Match YYYY-MM or YYYY-MM-DD
    m = re.search(r"(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?", s)
    if m:
        year = int(m.group(1))
        month = min(12, max(1, int(m.group(2))))
        return datetime.date(year, month, 1)

    # Match MM/YYYY or M/YYYY
    m = re.search(r"(\d{1,2})[-/.](\d{4})", s)
    if m:
        month = min(12, max(1, int(m.group(1))))
        year = int(m.group(2))
        return datetime.date(year, month, 1)

    # Match Month Name + YYYY (e.g. 'Jun 2022', 'June 2022')
    m = re.search(r"([a-z]+)[,\s.-]+(\d{4})", s)
    if m and m.group(1) in MONTH_MAP:
        month = MONTH_MAP[m.group(1)]
        year = int(m.group(2))
        return datetime.date(year, month, 1)

    # Match Year only (e.g. '2022')
    m = re.search(r"\b(\d{4})\b", s)
    if m:
        year = int(m.group(1))
        month = 12 if is_end else 1
        return datetime.date(year, month, 1)

    return None


def calculate_experience_metrics(experiences: Sequence[Any]) -> Dict[str, Any]:
    """Calculate professional tenure metrics dynamically from a collection of experiences.
    
    Accepts Experience model instances, querysets, or serialized dicts.
    Returns calculated earliest start, latest end, career span in years,
    display string (e.g. '4+ years'), and date range.
    """
    intervals: List[Tuple[datetime.date, datetime.date]] = []

    for exp in experiences:
        if isinstance(exp, dict):
            s_val = exp.get("start_date")
            e_val = exp.get("end_date")
            cur = bool(exp.get("is_current"))
        else:
            s_val = getattr(exp, "start_date", None)
            e_val = getattr(exp, "end_date", None)
            cur = bool(getattr(exp, "is_current", False))

        start = parse_flexible_date(s_val, is_end=False, is_current=False)
        end = parse_flexible_date(e_val, is_end=True, is_current=cur)

        if start and end:
            if start <= end:
                intervals.append((start, end))
            else:
                intervals.append((end, start))

    if not intervals:
        return {
            "earliest_start": None,
            "latest_end": None,
            "span_years": 0.0,
            "display_years": 0,
            "display_str": "early-career",
            "date_range_str": "",
        }

    earliest = min(s for s, e in intervals)
    latest = max(e for s, e in intervals)
    span_years = round((latest - earliest).days / 365.25, 2)
    display_years = int(span_years)

    earliest_str = earliest.strftime("%b %Y")
    today = datetime.date.today()
    latest_str = "Present" if latest >= today - datetime.timedelta(days=45) else latest.strftime("%b %Y")
    date_range_str = f"{earliest_str} to {latest_str}"

    if display_years >= 2:
        display_str = f"{display_years}+ years"
    elif display_years == 1:
        display_str = "1+ year"
    elif span_years >= 0.5:
        display_str = "< 1 year"
    else:
        display_str = "early-career"

    return {
        "earliest_start": earliest,
        "latest_end": latest,
        "span_years": span_years,
        "display_years": display_years,
        "display_str": display_str,
        "date_range_str": date_range_str,
    }


def calculate_experience_metrics_from_latex(latex_source: str) -> Dict[str, Any]:
    """Extract experience date ranges directly from the Experience section of a LaTeX document."""
    if not latex_source or r"\section{Experience}" not in latex_source:
        return calculate_experience_metrics([])

    # Restrict to Experience section to avoid confusing education dates with professional experience
    exp_match = re.search(
        r"\\section\{Experience\}(.*?)(?=\\section\{|\\end\{document\})",
        latex_source,
        re.DOTALL
    )
    if not exp_match:
        return calculate_experience_metrics([])

    exp_body = exp_match.group(1)
    # Match \resumeSubheading{Role}{Date Range}{Company}{Location}
    matches = re.findall(r"\\resumeSubheading\{[^{}]*\}\{([^{}]*)\}", exp_body)

    mock_experiences = []
    for date_range_str in matches:
        parts = re.split(r"--|–|-|to", date_range_str)
        if len(parts) >= 2:
            s_str = parts[0].strip()
            e_str = parts[1].strip()
            is_cur = e_str.lower() in {"present", "current", "now"}
            mock_experiences.append({
                "start_date": s_str,
                "end_date": e_str,
                "is_current": is_cur,
            })
        elif len(parts) == 1 and parts[0].strip():
            mock_experiences.append({
                "start_date": parts[0].strip(),
                "end_date": "",
                "is_current": True,
            })

    return calculate_experience_metrics(mock_experiences)


def calculate_user_experience_metrics(user: User) -> Dict[str, Any]:
    """Calculate experience metrics for a Django User instance based on their saved Experience records."""
    if not user or not user.is_authenticated:
        return calculate_experience_metrics([])
    return calculate_experience_metrics(list(user.experiences.all()))


def normalize_experience_duration_text(text: str, expected_years: Optional[int]) -> str:
    """Dynamically adjust undersold duration in text (e.g. summary) to match calculated experience.
    
    If expected_years is None or < 1, the text is returned unmodified (no hardcoding).
    If expected_years is 4 and the model wrote '2+ years' or '1 year of experience', it corrects to '4+ years'.
    If the stated years are >= expected_years, they are preserved.
    """
    if not text or not expected_years or expected_years < 1:
        return text

    def repl(m: re.Match) -> str:
        full_match = m.group(0)
        raw_val = m.group(1)
        has_plus = bool(m.group(2))
        suffix = m.group(3)
        after_text = text[m.end():m.end() + 30].lower()
        before_text = text[max(0, m.start() - 25):m.start()].lower()

        # Never alter age expressions like "5 years old" or "5 year old"
        if re.match(r"^\s*(?:-\s*)?old\b", after_text):
            return full_match

        # If singular "year" without "+" (e.g., "1 year retention", "3 year study"), only alter if followed by "of ... experience" or preceded by "with / have / bringing / over"
        if suffix.lower() == "year" and not has_plus:
            if not re.match(r"^\s+of\b", after_text) and not re.search(r"\b(?:with|have|has|bringing|brings|over)\s+$", before_text):
                return full_match

        try:
            val = float(raw_val)
            if val < expected_years:
                plural_suffix = "years" if expected_years > 1 and suffix.lower() == "year" else suffix
                return f"{expected_years}+ {plural_suffix}"
            return full_match
        except ValueError:
            return full_match

    pattern = re.compile(r"\b(\d+(?:\.\d+)?)(\+)?\s*(years?)\b", re.IGNORECASE)
    return pattern.sub(repl, text)


def get_experience_prompt_guidelines(metrics: Dict[str, Any]) -> str:
    """Generate dynamic LLM prompt rules based on calculated experience tenure."""
    display_years = metrics.get("display_years", 0)
    display_str = metrics.get("display_str", "early-career")
    date_range_str = metrics.get("date_range_str", "")

    if display_years >= 1 and date_range_str:
        return (
            f"Candidate has {display_str} of professional experience ({date_range_str}). "
            f"Accurately state '{display_str}'; NEVER state fewer years or undersell the candidate's seniority."
        )
    return (
        f"Accurately reflect the candidate's career tenure ({display_str}) based strictly on their work history; "
        f"do not invent or fabricate years of experience."
    )
