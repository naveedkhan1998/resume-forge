import json
from typing import Dict, Any, Optional
from .ollama_service import OllamaService

SECTION_REFINE_PROMPT = """You are an expert resume editor and career coach.
A user wants to improve a specific section of their resume master profile.

Given:
1. Section Type (e.g., 'experience', 'bullet_point', 'summary', 'project')
2. Current Content
3. User Instruction / Chat Request (e.g., "Quantify with metrics", "Use STAR method", "Focus on leadership")

Your task:
- Apply the user's instructions to refine and optimize the content.
- Enhance action verbs, readability, and recruiter impact.
- Explain briefly what changes you made and why.

Respond with strictly valid JSON:
{
  "refined_content": "The updated bullet point, text, or list of bullets",
  "explanation": "Brief explanation of improvements made"
}
"""

class SectionEditor:
    @classmethod
    def refine_section(
        cls,
        section_type: str,
        current_content: Any,
        instruction: str,
        model_name: str = "qwen3.5:9b",
        base_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """Iterate or rewrite a section using AI chat prompt."""
        ollama = OllamaService(base_url=base_url)

        messages = [
            {"role": "system", "content": SECTION_REFINE_PROMPT},
            {
                "role": "user",
                "content": f"Section Type: {section_type}\nCurrent Content:\n{json.dumps(current_content, indent=2)}\n\nUser Instruction: {instruction}"
            }
        ]

        response = ollama.chat_sync(
            model=model_name,
            messages=messages,
            temperature=0.3,
            format_json=True
        )

        content = response.get("content", "{}")
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()

        try:
            return json.loads(content)
        except Exception:
            return {
                "refined_content": content,
                "explanation": "AI generated output"
            }
