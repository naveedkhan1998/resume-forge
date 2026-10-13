"""High-fidelity layout-aware PDF, DOCX, and TXT to Markdown converter.

Preserves:
- Document structure & reading order (detects multi-column & sidebar layouts without interleaving)
- Heading hierarchy (# Title, ## Section, ### Subheading)
- Typography (bold **text**, italic *text*)
- Bullet lists (- item)
- Embedded hyperlinks ([label](url))
- Clean contact details and metadata
"""

import io
import re
from typing import Any, Dict, List, Optional, Tuple
import pdfplumber
import docx


BULLET_CHARS_REGEX = re.compile(r"^[\u2022\u25cf\u25cb\u25e6·\-\*►▪▸]\s*")
SECTION_HEADER_KEYWORDS = {
    "experience", "work experience", "employment", "professional experience",
    "education", "academic background", "skills", "technical skills",
    "projects", "personal projects", "certifications", "licenses", "certificates",
    "summary", "professional summary", "profile", "about me", "objective",
    "awards", "honors", "publications", "languages", "volunteer", "interests"
}


class DocumentMarkdownConverter:
    """Converts PDF, DOCX, or text files into clean, properly styled Markdown."""

    @classmethod
    def convert_file(cls, file_obj: Any, filename: str) -> str:
        """Main entry point: convert file object to styled Markdown."""
        ext = filename.lower().split(".")[-1] if "." in filename else ""
        content_bytes = file_obj.read() if hasattr(file_obj, "read") else file_obj
        if hasattr(file_obj, "seek"):
            try:
                file_obj.seek(0)
            except Exception:
                pass

        if isinstance(content_bytes, str):
            content_bytes = content_bytes.encode("utf-8")

        if ext == "pdf":
            return cls.pdf_to_markdown(content_bytes)
        elif ext in ("docx", "doc"):
            return cls.docx_to_markdown(content_bytes)
        else:
            return cls.text_to_markdown(content_bytes.decode("utf-8", errors="ignore"))

    # -------------------------------------------------------------------------
    # PDF to Markdown
    # -------------------------------------------------------------------------

    @classmethod
    def pdf_to_markdown(cls, pdf_bytes: bytes) -> str:
        """Extract layout-aware, properly styled Markdown from PDF bytes."""
        try:
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                pages_md: List[str] = []
                for page_idx, page in enumerate(pdf.pages):
                    page_md = cls._convert_pdf_page(page, page_idx)
                    if page_md.strip():
                        pages_md.append(page_md.strip())
                if pages_md:
                    return "\n\n---\n\n".join(pages_md)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("pdfplumber markdown extraction failed: %s", exc)

        # Fallback to pypdf if pdfplumber fails
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        fallback_text = "\n".join(p.extract_text() or "" for p in reader.pages)
        return cls.text_to_markdown(fallback_text)

    @classmethod
    def _convert_pdf_page(cls, page: pdfplumber.page.Page, page_index: int) -> str:
        words = page.extract_words(extra_attrs=["fontname", "size"])
        if not words:
            return ""

        # Filter out tiny watermark or artifact words
        words = [w for w in words if float(w.get("size", 0)) >= 4.0 and w.get("text", "").strip()]
        if not words:
            return ""

        sizes = sorted(float(w["size"]) for w in words)
        median_size = sizes[len(sizes) // 2] if sizes else 10.0
        max_size = max(sizes) if sizes else 10.0

        hyperlinks = page.hyperlinks or []
        page_width = float(page.width)

        # Detect column regions to prevent left/right column interleaving
        column_blocks = cls._detect_page_columns(words, page_width, page.height, median_size)

        page_output_lines: List[str] = []

        for block_words in column_blocks:
            lines = cls._group_words_into_lines(block_words)
            for line in lines:
                md_line = cls._format_line_markdown(line, median_size, max_size, hyperlinks)
                if md_line is not None:
                    page_output_lines.append(md_line)

        # Post-process: clean redundant blank lines and fix broken hyphenations
        return cls._postprocess_markdown(page_output_lines)

    @classmethod
    def _detect_page_columns(
        cls,
        words: List[Dict[str, Any]],
        page_width: float,
        page_height: float,
        median_size: float
    ) -> List[List[Dict[str, Any]]]:
        """Detect multi-column / sidebar layouts and partition words into column blocks."""
        # Check words in the body region (below top header 50pt, above bottom 35pt)
        body_words = [
            w for w in words
            if float(w["top"]) > 50.0 and float(w["bottom"]) < (page_height - 35.0)
        ]
        if len(body_words) < 6:
            return [words]

        # Scan for candidate vertical gutters (empty vertical gaps) between 20% and 60% page width
        best_split: Optional[float] = None
        max_gutter = 0.0

        step = 4
        start_x = int(page_width * 0.20)
        end_x = int(page_width * 0.60)

        for candidate_x in range(start_x, end_x, step):
            cand = float(candidate_x)
            left_words = [w for w in body_words if float(w["x1"]) <= cand]
            right_words = [w for w in body_words if float(w["x0"]) >= cand]
            crossing = [w for w in body_words if float(w["x0"]) < cand and float(w["x1"]) > cand]

            # Require no crossing words and content on both sides
            if not crossing and len(left_words) >= 3 and len(right_words) >= 3:
                gutter_left = max(float(w["x1"]) for w in left_words)
                gutter_right = min(float(w["x0"]) for w in right_words)
                gutter_w = gutter_right - gutter_left
                if gutter_w >= 10.0 and gutter_w > max_gutter:
                    max_gutter = gutter_w
                    best_split = (gutter_left + gutter_right) / 2.0

        if not best_split:
            return [words]

        # Partition into: Header (full width above gutter), Left Column, Right Column, Footer
        # Find where the multi-column layout starts vertically
        left_body = [w for w in body_words if float(w["x1"]) <= best_split]
        right_body = [w for w in body_words if float(w["x0"]) >= best_split]
        split_top_y = min(
            min((float(w["top"]) for w in left_body), default=70.0),
            min((float(w["top"]) for w in right_body), default=70.0)
        )

        header_words: List[Dict[str, Any]] = []
        left_col: List[Dict[str, Any]] = []
        right_col: List[Dict[str, Any]] = []
        footer_words: List[Dict[str, Any]] = []

        for w in words:
            w_bottom = float(w["bottom"])
            w_x0 = float(w["x0"])
            w_x1 = float(w["x1"])

            if w_bottom <= split_top_y:
                header_words.append(w)
            elif w_x1 <= best_split:
                left_col.append(w)
            elif w_x0 >= best_split:
                right_col.append(w)
            else:
                # Spans across gutter below header
                footer_words.append(w)

        blocks: List[List[Dict[str, Any]]] = []
        if header_words:
            blocks.append(header_words)

        # Decide column reading order: usually left sidebar first, then main body;
        # or main body first if left is narrow. Left first preserves logical sections (Skills, Education).
        if left_col:
            blocks.append(left_col)
        if right_col:
            blocks.append(right_col)
        if footer_words:
            blocks.append(footer_words)

        return blocks

    @classmethod
    def _group_words_into_lines(cls, words: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
        """Group words into distinct horizontal lines using vertical overlap clustering."""
        if not words:
            return []

        # Sort roughly by vertical position first
        sorted_by_top = sorted(words, key=lambda w: (float(w["top"]), float(w["x0"])))

        lines: List[List[Dict[str, Any]]] = []
        current_line: List[Dict[str, Any]] = []
        line_top = 0.0
        line_bottom = 0.0

        for w in sorted_by_top:
            w_top = float(w["top"])
            w_bottom = float(w["bottom"])
            w_height = max(1.0, w_bottom - w_top)

            if not current_line:
                current_line = [w]
                line_top = w_top
                line_bottom = w_bottom
                continue

            # Check if this word belongs on the same line:
            # Overlap threshold: either centers are within 3.5pt or vertical overlap > 40% of height
            overlap = min(line_bottom, w_bottom) - max(line_top, w_top)
            same_line = (overlap > 0.35 * w_height) or (abs(w_top - line_top) < 3.2)

            if same_line:
                current_line.append(w)
                line_top = min(line_top, w_top)
                line_bottom = max(line_bottom, w_bottom)
            else:
                # Sort line horizontally from left to right
                current_line.sort(key=lambda x: float(x["x0"]))
                lines.append(current_line)
                current_line = [w]
                line_top = w_top
                line_bottom = w_bottom

        if current_line:
            current_line.sort(key=lambda x: float(x["x0"]))
            lines.append(current_line)

        return lines

    @classmethod
    def _format_line_markdown(
        cls,
        line: List[Dict[str, Any]],
        median_size: float,
        max_size: float,
        hyperlinks: List[Dict[str, Any]]
    ) -> Optional[str]:
        """Format a single line of words into styled Markdown."""
        if not line:
            return None

        line_sizes = [float(w["size"]) for w in line]
        avg_size = sum(line_sizes) / len(line_sizes)
        plain_text = " ".join(w.get("text", "") for w in line).strip()
        if not plain_text:
            return None

        # Check if line is a bullet item
        first_word = line[0].get("text", "")
        is_bullet = bool(BULLET_CHARS_REGEX.match(first_word) or BULLET_CHARS_REGEX.match(plain_text))

        # Check if line is a major section heading
        clean_heading_cand = re.sub(r"[^A-Za-z\s]", "", plain_text).strip().lower()
        is_known_section = clean_heading_cand in SECTION_HEADER_KEYWORDS
        is_all_caps = (
            len(plain_text) >= 3
            and plain_text.isupper()
            and len(plain_text.split()) <= 5
            and not any(char.isdigit() for char in plain_text)
        )
        is_h1 = (avg_size >= median_size * 1.45) or (avg_size >= max_size * 0.9 and max_size > median_size * 1.3)
        is_h2 = (avg_size >= median_size * 1.15) or is_known_section or (is_all_caps and avg_size >= median_size)

        styled_words: List[str] = []
        words_to_process = line[1:] if is_bullet and BULLET_CHARS_REGEX.match(first_word) else line

        for w in words_to_process:
            txt = w.get("text", "")
            if not txt.strip():
                continue

            font = (w.get("fontname") or "").lower()
            is_bold = "bold" in font or "bx" in font or "bld" in font or "black" in font or "heavy" in font
            is_italic = "italic" in font or "oblique" in font or "slanted" in font

            # Match hyperlinks
            matched_uri = None
            w_top = float(w["top"])
            w_x0 = float(w["x0"])
            w_x1 = float(w["x1"])
            for h in hyperlinks:
                h_top = float(h.get("top", 0))
                h_x0 = float(h.get("x0", 0))
                h_x1 = float(h.get("x1", 0))
                if abs(w_top - h_top) < 6.0 and w_x0 >= (h_x0 - 2.5) and w_x1 <= (h_x1 + 2.5):
                    matched_uri = h.get("uri")
                    break

            word_md = txt
            if is_bold and not is_h1 and not is_h2:
                word_md = f"**{word_md}**"
            elif is_italic:
                word_md = f"*{word_md}*"

            if matched_uri and txt.strip():
                word_md = f"[{word_md}]({matched_uri})"

            styled_words.append(word_md)

        if not styled_words:
            return None

        joined = " ".join(styled_words)
        # Collapse adjacent bold tokens e.g. **Foo** **Bar** -> **Foo Bar**
        joined = re.sub(r"\*\*\s+\*\*", " ", joined)
        joined = re.sub(r"\*\s+\*", " ", joined)

        if is_h1:
            clean_title = re.sub(r"[\*#_]", "", joined).strip()
            return f"\n# {clean_title}\n"
        elif is_h2:
            clean_title = re.sub(r"[\*#_]", "", joined).strip()
            # Title case known section names for readability
            return f"\n## {clean_title}\n"
        elif is_bullet:
            bullet_body = BULLET_CHARS_REGEX.sub("", joined).strip()
            return f"- {bullet_body}"
        else:
            return joined

    @classmethod
    def _postprocess_markdown(cls, lines: List[str]) -> str:
        """Clean line breaks, merge wrapped words, and format headers cleanly."""
        cleaned: List[str] = []
        for line in lines:
            line_str = line.strip()
            if not line_str:
                if cleaned and cleaned[-1] != "":
                    cleaned.append("")
                continue

            # Remove trailing hyphenation from wrapped words
            if cleaned and cleaned[-1].endswith("-") and not cleaned[-1].startswith("- ") and not cleaned[-1].startswith("#"):
                prev = cleaned[-1][:-1]
                cleaned[-1] = f"{prev}{line_str}"
            else:
                cleaned.append(line_str)

        text = "\n".join(cleaned)
        # Normalize Unicode hyphens and spaces from extracted PDF/DOCX text
        for u in ("\u2010", "\u2011", "\u2012", "\u2212"):
            text = text.replace(u, "-")
        for u in ("\u00a0", "\u202f", "\u2009", "\u200a"):
            text = text.replace(u, " ")
        for u in ("\u200b", "\u200c", "\u200d", "\ufeff"):
            text = text.replace(u, "")
        # Ensure single blank line around headers
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    # -------------------------------------------------------------------------
    # DOCX to Markdown
    # -------------------------------------------------------------------------

    @classmethod
    def docx_to_markdown(cls, docx_bytes: bytes) -> str:
        """Convert DOCX file to formatted Markdown."""
        doc = docx.Document(io.BytesIO(docx_bytes))
        md_lines: List[str] = []

        for p in doc.paragraphs:
            text = p.text.strip()
            if not text:
                continue

            style_name = (p.style.name or "").lower() if p.style else ""
            is_bullet = "bullet" in style_name or "list" in style_name

            # Format runs with bold, italics
            run_parts: List[str] = []
            for r in p.runs:
                r_text = r.text
                if not r_text:
                    continue
                if r.bold:
                    r_text = f"**{r_text}**"
                if r.italic:
                    r_text = f"*{r_text}*"
                run_parts.append(r_text)

            p_md = "".join(run_parts).strip()
            p_md = re.sub(r"\*\*\s+\*\*", " ", p_md)
            p_md = re.sub(r"\*\s+\*", " ", p_md)

            if "heading 1" in style_name or "title" in style_name:
                md_lines.append(f"\n# {p_md}\n")
            elif "heading 2" in style_name or "heading 3" in style_name:
                md_lines.append(f"\n## {p_md}\n")
            elif is_bullet:
                bullet_body = BULLET_CHARS_REGEX.sub("", p_md).strip()
                md_lines.append(f"- {bullet_body}")
            else:
                # Check for all-caps section header
                if text.isupper() and len(text.split()) <= 4 and text.lower() in SECTION_HEADER_KEYWORDS:
                    md_lines.append(f"\n## {text}\n")
                else:
                    md_lines.append(p_md)

        # Also extract tables
        for table in doc.tables:
            for row in table.rows:
                cells = [c.text.strip() for c in row.cells if c.text.strip()]
                if cells:
                    md_lines.append(" | ".join(cells))

        return cls._postprocess_markdown(md_lines)

    # -------------------------------------------------------------------------
    # Plain Text to Markdown
    # -------------------------------------------------------------------------

    @classmethod
    def text_to_markdown(cls, raw_text: str) -> str:
        """Convert plain text into clean, section-demarcated Markdown."""
        lines = [l.strip() for l in raw_text.splitlines()]
        md_lines: List[str] = []

        for line in lines:
            if not line:
                if md_lines and md_lines[-1] != "":
                    md_lines.append("")
                continue

            clean_cand = re.sub(r"[^A-Za-z\s]", "", line).strip().lower()
            is_section = clean_cand in SECTION_HEADER_KEYWORDS
            is_all_caps = line.isupper() and len(line.split()) <= 4 and len(line) >= 3

            if is_section or (is_all_caps and clean_cand in SECTION_HEADER_KEYWORDS):
                md_lines.append(f"\n## {line.title()}\n")
            elif BULLET_CHARS_REGEX.match(line):
                body = BULLET_CHARS_REGEX.sub("", line).strip()
                md_lines.append(f"- {body}")
            else:
                md_lines.append(line)

        return cls._postprocess_markdown(md_lines)
