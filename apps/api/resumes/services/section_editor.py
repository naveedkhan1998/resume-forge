import json
from typing import Any, Dict, List, Optional

from .ollama_service import OllamaService
from .latex_templates import normalize_unicode_and_latex_text


SECTION_REFINE_PROMPT = """You are an expert resume copyeditor and career coach in a multi-turn conversation about one resume section, helping candidates across any profession (healthcare, arts, business, education, finance, trades, science, design, or engineering).

Requirements:
- Keep every claim 100% truthful to the candidate context and current section data.
- Never invent employers, achievements, metrics, credentials, or dates.
- Apply explicit requests to add, remove, reorder, or rewrite content.
- Use strong active past-tense action verbs appropriate to the candidate's field (e.g., Led, Delivered, Treated, Coordinated, Designed, Curated, Improved, Managed, Researched, Built) and highlight concrete scope and measurable impact.
- When editing a 'summary' or 'skills' section, you may draw upon verified facts from the provided candidate profile context (experiences, projects, skills, certifications).
- Preserve the input data shape for proposed_content:
  * If current_content is a string (e.g. summary), proposed_content MUST be a string.
  * If current_content is a list of strings (e.g. experience/project bullets or education highlights), proposed_content MUST be a list of strings.
  * If current_content is a list of skill objects, proposed_content MUST be a list of objects with {"category": "...", "name": "...", "proficiency": "..."} using categories suited to the candidate's profession.
  * If current_content is a list of certification objects, proposed_content MUST be a list of objects with {"name": "...", "issuer": "...", "issue_date": "...", "credential_url": "..."}.
- For 'experience' or 'project' sections, also include "proposed_technologies" as a list of concise tool, method, instrument, medium, or technology strings relevant to the updated bullets.
- If the user requests a specific metric or fact that is not in the section, candidate context, or conversation, ask for it and leave proposed_content unchanged.
- Return the complete proposed section after every turn, not only the changed item.

Return strictly valid JSON:
{
  "assistant_message": "Short conversational response describing the improvement or asking a question",
  "proposed_content": "Complete updated section in the exact same data shape as current_content",
  "proposed_technologies": ["Optional list of tools, methods, media, or technologies for experience/project sections"],
  "explanation": "Concise edit summary explaining why these changes improve the section"
}
"""


class SectionEditor:
    @staticmethod
    def _normalize_proposal(section_type: str, current_content: Any, proposed_content: Any) -> Any:
        if isinstance(current_content, str):
            if isinstance(proposed_content, list) and all(isinstance(x, str) for x in proposed_content):
                proposed_content = " ".join(x.strip() for x in proposed_content if x.strip())
            if not isinstance(proposed_content, str):
                raise ValueError("Ollama must return text for this section.")
            return normalize_unicode_and_latex_text(proposed_content.strip())

        if isinstance(current_content, list) and isinstance(proposed_content, dict):
            # Unwrap if model wrapped list inside {"bullet_points": [...]} or {"skills": [...]}
            for candidate_key in ("bullet_points", "bullets", "highlights", "skills", "certifications", "items"):
                if isinstance(proposed_content.get(candidate_key), list):
                    proposed_content = proposed_content[candidate_key]
                    break

        if not isinstance(current_content, list) or not isinstance(proposed_content, list):
            raise ValueError("Ollama must return a list for this section.")

        if section_type in {"experience", "project", "education"}:
            if not all(isinstance(item, str) for item in proposed_content):
                raise ValueError("Ollama must return a list of bullet point strings.")
            return list(
                dict.fromkeys(
                    normalize_unicode_and_latex_text(item.strip())
                    for item in proposed_content
                    if item.strip()
                )
            )

        required_fields = {
            "skills": ("category", "name", "proficiency"),
            "certifications": ("name", "issuer", "issue_date", "credential_url"),
        }.get(section_type)
        if not required_fields:
            return proposed_content

        # Expand grouped skills if model returned {"category": "Languages", "skills": ["Python", "Go"]}
        expanded_items: List[Any] = []
        if section_type == "skills":
            for item in proposed_content:
                if isinstance(item, dict) and not item.get("name") and isinstance(item.get("skills") or item.get("items"), list):
                    cat = str(item.get("category") or "Core Skills").strip()
                    prof = str(item.get("proficiency") or "").strip()
                    for sub in (item.get("skills") or item.get("items") or []):
                        if isinstance(sub, str) and sub.strip():
                            expanded_items.append({"category": cat, "name": sub.strip(), "proficiency": prof})
                else:
                    expanded_items.append(item)
        else:
            expanded_items = proposed_content

        normalized = []
        seen = set()
        for item in expanded_items:
            if not isinstance(item, dict):
                raise ValueError(f"Ollama must return objects for the {section_type} section.")
            record = {field: str(item.get(field, "") or "").strip() for field in required_fields}
            identity = tuple(record[field].casefold() for field in required_fields[:2])
            required_value = record["name"]
            if required_value and identity not in seen:
                seen.add(identity)
                normalized.append(record)
        return normalized

    @classmethod
    def refine_section(
        cls,
        section_type: str,
        current_content: Any,
        instruction: str,
        conversation: Optional[List[Dict[str, str]]] = None,
        model_name: str = "qwen3.5:9b",
        base_url: Optional[str] = None,
        ollama_service: Optional[OllamaService] = None,
        section_context: Optional[Dict[str, Any]] = None,
        candidate_context: Optional[Dict[str, Any]] = None,
        custom_instructions: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Continue a contextual editing conversation and return an unsaved draft."""
        ollama = ollama_service or OllamaService(base_url=base_url)
        history = [
            {"role": message["role"], "content": str(message["content"])[:2000]}
            for message in (conversation or [])[-8:]
            if message.get("role") in {"user", "assistant"}
            and str(message.get("content", "")).strip()
        ]

        context_lines = [f"Section type: {section_type}"]
        if section_context:
            context_lines.append(
                f"Section item metadata:\n{json.dumps(section_context, ensure_ascii=False)}"
            )
        if candidate_context:
            context_lines.append(
                f"Candidate background context (verified facts):\n{json.dumps(candidate_context, ensure_ascii=False)[:6000]}"
            )
        if custom_instructions and custom_instructions.strip():
            context_lines.append(
                f"Candidate style preferences:\n{custom_instructions.strip()[:1000]}"
            )
        context_lines.append(
            f"Current unsaved draft:\n{json.dumps(current_content, ensure_ascii=False)}"
        )

        messages = [
            {"role": "system", "content": SECTION_REFINE_PROMPT},
            {
                "role": "user",
                "content": "\n\n".join(context_lines),
            },
            *history,
            {
                "role": "user",
                "content": (
                    f"New instruction: {instruction.strip()}\n"
                    "Return the complete proposed section, even if only one item changed."
                ),
            },
        ]
        result = ollama.chat_json_sync(
            model=model_name,
            messages=messages,
            temperature=0.2,
            required_keys=("assistant_message", "proposed_content", "explanation"),
        )
        raw_proposed = result["proposed_content"]
        extracted_techs: Optional[List[str]] = None
        if isinstance(raw_proposed, dict) and isinstance(raw_proposed.get("technologies"), list):
            extracted_techs = [
                normalize_unicode_and_latex_text(str(t).strip())
                for t in raw_proposed["technologies"]
                if str(t).strip()
            ]
        if isinstance(result.get("proposed_technologies"), list):
            extracted_techs = [
                normalize_unicode_and_latex_text(str(t).strip())
                for t in result["proposed_technologies"]
                if str(t).strip()
            ]

        proposed = cls._normalize_proposal(
            section_type=section_type,
            current_content=current_content,
            proposed_content=raw_proposed,
        )
        response_payload: Dict[str, Any] = {
            "assistant_message": str(result["assistant_message"]).strip(),
            "proposed_content": proposed,
            "explanation": str(result["explanation"]).strip(),
        }
        if extracted_techs is not None and section_type in {"experience", "project"}:
            response_payload["proposed_technologies"] = list(dict.fromkeys(extracted_techs))
        return response_payload
