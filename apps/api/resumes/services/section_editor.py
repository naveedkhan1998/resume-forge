import json
from typing import Any, Dict, List, Optional

from .ollama_service import OllamaService


SECTION_REFINE_PROMPT = """You are an expert resume editor in a multi-turn conversation about one section.

Requirements:
- Keep every claim truthful to the candidate context.
- Never invent employers, achievements, technologies, metrics, credentials, or dates.
- Apply explicit requests to add, remove, reorder, or rewrite content.
- Preserve the input data shape: text stays text, bullet lists stay lists of strings, and
  structured skills or certifications stay lists of objects with the same fields.
- If the user requests a fact that is not in the section or conversation, ask for it and leave
  proposed_content unchanged.
- Return the complete proposed section after every turn, not only the changed item.

Return strictly valid JSON:
{
  "assistant_message": "Short conversational response describing the change or asking a question",
  "proposed_content": "Complete updated section in the same data shape as current_content",
  "explanation": "Concise edit summary"
}
"""


class SectionEditor:
    @staticmethod
    def _normalize_proposal(section_type: str, current_content: Any, proposed_content: Any) -> Any:
        if isinstance(current_content, str):
            if not isinstance(proposed_content, str):
                raise ValueError("Ollama must return text for this section.")
            return proposed_content.strip()

        if not isinstance(current_content, list) or not isinstance(proposed_content, list):
            raise ValueError("Ollama must return a list for this section.")

        if section_type in {"experience", "project", "education"}:
            if not all(isinstance(item, str) for item in proposed_content):
                raise ValueError("Ollama must return a list of bullet point strings.")
            return list(dict.fromkeys(item.strip() for item in proposed_content if item.strip()))

        required_fields = {
            "skills": ("category", "name", "proficiency"),
            "certifications": ("name", "issuer", "issue_date", "credential_url"),
        }.get(section_type)
        if not required_fields:
            return proposed_content

        normalized = []
        seen = set()
        for item in proposed_content:
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
    ) -> Dict[str, Any]:
        """Continue a contextual editing conversation and return an unsaved draft."""
        ollama = ollama_service or OllamaService(base_url=base_url)
        history = [
            {"role": message["role"], "content": str(message["content"])[:2000]}
            for message in (conversation or [])[-8:]
            if message.get("role") in {"user", "assistant"}
            and str(message.get("content", "")).strip()
        ]
        messages = [
            {"role": "system", "content": SECTION_REFINE_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Section type: {section_type}\n"
                    f"Current unsaved draft:\n{json.dumps(current_content, ensure_ascii=False)}"
                ),
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
        proposed = cls._normalize_proposal(
            section_type=section_type,
            current_content=current_content,
            proposed_content=result["proposed_content"],
        )
        return {
            "assistant_message": str(result["assistant_message"]).strip(),
            "proposed_content": proposed,
            "explanation": str(result["explanation"]).strip(),
        }
