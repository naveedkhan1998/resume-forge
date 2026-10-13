import json
import logging
import re
from typing import Any, Dict, List, Optional, Sequence

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)


class OllamaService:
    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        provider: str = "ollama",
        timeout: Optional[float] = None
    ):
        self.provider = (provider or "ollama").lower().strip()
        self.api_key = (api_key or "").strip()
        if self.provider == "openrouter":
            self.base_url = (base_url or "https://openrouter.ai/api/v1").rstrip('/')
        else:
            self.base_url = (base_url or getattr(settings, 'OLLAMA_BASE_URL', 'http://localhost:11434')).rstrip('/')
        self.timeout = timeout or getattr(settings, 'OLLAMA_TIMEOUT', 600.0)

    @classmethod
    def from_user(cls, user: Any, override_model: Optional[str] = None) -> "OllamaService":
        """Instantiate service configured from user AI settings."""
        ai_settings = getattr(user, 'ai_settings', None)
        if not ai_settings:
            return cls()
        provider = getattr(ai_settings, 'provider', 'ollama') or 'ollama'
        if provider == 'openrouter':
            return cls(
                base_url=ai_settings.openrouter_endpoint or 'https://openrouter.ai/api/v1',
                api_key=ai_settings.api_key,
                provider='openrouter',
            )
        return cls(
            base_url=ai_settings.ollama_endpoint or 'http://localhost:11434',
            api_key=ai_settings.api_key,
            provider='ollama',
        )

    def _get_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.provider == "openrouter":
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            headers["HTTP-Referer"] = "https://resumeforge.dev"
            headers["X-Title"] = "ResumeForge"
        elif self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def check_health(self) -> Dict[str, Any]:
        """Check if LLM provider server is reachable."""
        headers = self._get_headers()
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                if self.provider == "openrouter":
                    if not self.api_key:
                        return {"status": "error", "connected": False, "provider": "openrouter", "error": "OpenRouter requires an API key."}
                    res = await client.get(f"{self.base_url}/models", headers=headers)
                    if res.status_code == 200:
                        data = res.json()
                        models = [m.get("id") for m in data.get("data", []) if isinstance(m, dict) and m.get("id")]
                        return {"status": "ok", "connected": True, "provider": "openrouter", "models": models[:60]}
                    detail = res.text[:200]
                    return {"status": "error", "connected": False, "provider": "openrouter", "error": f"OpenRouter HTTP {res.status_code}: {detail}"}
                else:
                    res = await client.get(f"{self.base_url}/api/tags", headers=headers)
                    if res.status_code == 200:
                        data = res.json()
                        models = [m.get('name') for m in data.get('models', []) if m.get('name')]
                        return {"status": "ok", "connected": True, "provider": "ollama", "models": models}
                    return {"status": "error", "connected": False, "provider": "ollama", "error": f"Ollama HTTP {res.status_code}: {res.text[:200]}"}
        except Exception as e:
            provider_name = "OpenRouter" if self.provider == "openrouter" else "Ollama"
            return {"status": "error", "connected": False, "provider": self.provider, "error": f"Could not connect to {provider_name}: {str(e)}"}

    def check_health_sync(self) -> Dict[str, Any]:
        """Synchronous health check."""
        headers = self._get_headers()
        try:
            with httpx.Client(timeout=8.0) as client:
                if self.provider == "openrouter":
                    if not self.api_key:
                        return {"status": "error", "connected": False, "provider": "openrouter", "error": "OpenRouter requires an API key."}
                    res = client.get(f"{self.base_url}/models", headers=headers)
                    if res.status_code == 200:
                        data = res.json()
                        models = [m.get("id") for m in data.get("data", []) if isinstance(m, dict) and m.get("id")]
                        return {"status": "ok", "connected": True, "provider": "openrouter", "models": models[:60]}
                    detail = res.text[:200]
                    return {"status": "error", "connected": False, "provider": "openrouter", "error": f"OpenRouter HTTP {res.status_code}: {detail}"}
                else:
                    res = client.get(f"{self.base_url}/api/tags", headers=headers)
                    if res.status_code == 200:
                        data = res.json()
                        models = [m.get('name') for m in data.get('models', []) if m.get('name')]
                        return {"status": "ok", "connected": True, "provider": "ollama", "models": models}
                    return {"status": "error", "connected": False, "provider": "ollama", "error": f"Ollama HTTP {res.status_code}: {res.text[:200]}"}
        except Exception as e:
            provider_name = "OpenRouter" if self.provider == "openrouter" else "Ollama"
            return {"status": "error", "connected": False, "provider": self.provider, "error": f"Could not connect to {provider_name}: {str(e)}"}

    async def chat(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        format_json: bool = False,
        stream: bool = False
    ) -> Dict[str, Any]:
        """Send chat completion request to Ollama or OpenRouter."""
        headers = self._get_headers()
        client_timeout = httpx.Timeout(self.timeout, connect=30.0)

        if self.provider == "openrouter":
            payload: Dict[str, Any] = {
                "model": model,
                "messages": messages,
                "temperature": max(0.0, min(1.0, temperature)),
                "stream": stream,
            }
            if format_json:
                payload["response_format"] = {"type": "json_object"}

            async with httpx.AsyncClient(timeout=client_timeout) as client:
                res = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
                res.raise_for_status()
                data = res.json()
                choices = data.get("choices", [])
                return choices[0].get("message", {}) if choices else {}
        else:
            payload: Dict[str, Any] = {
                "model": model,
                "messages": messages,
                "stream": stream,
                "options": {
                    "temperature": max(0.0, min(1.0, temperature))
                }
            }
            if format_json:
                payload["format"] = "json"

            async with httpx.AsyncClient(timeout=client_timeout) as client:
                res = await client.post(f"{self.base_url}/api/chat", headers=headers, json=payload)
                res.raise_for_status()
                data = res.json()
                return data.get("message", {})

    def chat_sync(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        format_json: bool = False,
    ) -> Dict[str, Any]:
        """Synchronous chat completion request to Ollama or OpenRouter."""
        if not model.strip():
            raise ValueError("A model name is required.")
        if not messages:
            raise ValueError("At least one chat message is required.")

        headers = self._get_headers()
        client_timeout = httpx.Timeout(self.timeout, connect=30.0)

        if self.provider == "openrouter":
            if not self.api_key:
                raise ValueError("An OpenRouter API key is required.")

            payload: Dict[str, Any] = {
                "model": model,
                "messages": messages,
                "temperature": max(0.0, min(1.0, temperature)),
            }
            if format_json:
                payload["response_format"] = {"type": "json_object"}

            try:
                with httpx.Client(timeout=client_timeout) as client:
                    res = client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
                    res.raise_for_status()
                    data = res.json()
            except httpx.ConnectError as exc:
                raise RuntimeError(
                    f"Could not connect to OpenRouter at {self.base_url}."
                ) from exc
            except httpx.TimeoutException as exc:
                raise RuntimeError(
                    f"OpenRouter timed out after {self.timeout:g} seconds while running {model}."
                ) from exc
            except httpx.HTTPStatusError as exc:
                detail = exc.response.text[:300].strip()
                raise RuntimeError(
                    f"OpenRouter returned HTTP {exc.response.status_code}{f': {detail}' if detail else ''}"
                ) from exc

            choices = data.get("choices", [])
            if not choices or not isinstance(choices[0], dict):
                raise RuntimeError(f"OpenRouter model {model} returned no choices: {data}")
            message = choices[0].get("message")
            if not isinstance(message, dict) or not str(message.get("content", "")).strip():
                raise RuntimeError(f"OpenRouter model {model} returned an empty response.")
            return message
        else:
            payload: Dict[str, Any] = {
                "model": model,
                "messages": messages,
                "stream": False,
                "think": False,
                "keep_alive": "15m",
                "options": {
                    "temperature": max(0.0, min(1.0, temperature)),
                    "num_ctx": 8192,
                },
            }
            if format_json:
                payload["format"] = "json"

            try:
                with httpx.Client(timeout=client_timeout) as client:
                    res = client.post(f"{self.base_url}/api/chat", headers=headers, json=payload)
                    res.raise_for_status()
                    data = res.json()
            except httpx.ConnectError as exc:
                raise RuntimeError(
                    f"Could not connect to Ollama at {self.base_url}. Start Ollama and verify the configured endpoint."
                ) from exc
            except httpx.TimeoutException as exc:
                raise RuntimeError(
                    f"Ollama timed out after {self.timeout:g} seconds while running {model}."
                ) from exc
            except httpx.HTTPStatusError as exc:
                detail = exc.response.text[:300].strip()
                raise RuntimeError(
                    f"Ollama returned HTTP {exc.response.status_code}{f': {detail}' if detail else ''}"
                ) from exc

            message = data.get("message")
            if not isinstance(message, dict) or not str(message.get("content", "")).strip():
                raise RuntimeError(f"Ollama model {model} returned an empty response.")
            return message

    @staticmethod
    def _decode_json(content: str) -> Dict[str, Any]:
        cleaned = content.strip()
        fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", cleaned, re.DOTALL | re.IGNORECASE)
        if fenced:
            cleaned = fenced.group(1).strip()

        try:
            result = json.loads(cleaned)
        except json.JSONDecodeError:
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start < 0 or end <= start:
                raise
            result = json.loads(cleaned[start:end + 1])

        if not isinstance(result, dict):
            raise ValueError("Ollama JSON response must be an object.")
        return result

    def chat_json_sync(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.2,
        required_keys: Sequence[str] = (),
    ) -> Dict[str, Any]:
        """Request JSON and make one focused repair attempt for small local models."""
        try:
            response = self.chat_sync(
                model=model,
                messages=messages,
                temperature=temperature,
                format_json=True,
            )
        except RuntimeError as exc:
            if "empty response" not in str(exc):
                raise
            response = self.chat_sync(
                model=model,
                messages=[
                    *messages,
                    {
                        "role": "user",
                        "content": "Return the requested complete JSON object now. Do not include commentary.",
                    },
                ],
                temperature=0.0,
                format_json=True,
            )
        content = str(response["content"])

        try:
            result = self._decode_json(content)
        except (json.JSONDecodeError, ValueError) as first_error:
            repair_messages = [
                {
                    "role": "system",
                    "content": (
                        "Repair the supplied output into one valid JSON object. Preserve its data, "
                        "add no commentary, and return JSON only."
                    ),
                },
                {"role": "user", "content": content[:12000]},
            ]
            repaired = self.chat_sync(
                model=model,
                messages=repair_messages,
                temperature=0.0,
                format_json=True,
            )
            try:
                result = self._decode_json(str(repaired["content"]))
            except (json.JSONDecodeError, ValueError) as repair_error:
                raise ValueError(
                    f"Ollama returned invalid JSON after one repair attempt: {repair_error}"
                ) from first_error

        missing = [key for key in required_keys if key not in result]
        if missing:
            raise ValueError(
                f"Ollama response is missing required fields: {', '.join(missing)}"
            )
        return result

    def get_embedding(self, model: str, text: str) -> Optional[List[float]]:
        """Get vector embedding for a text."""
        headers = self._get_headers()
        try:
            with httpx.Client(timeout=30.0) as client:
                if self.provider == "openrouter":
                    res = client.post(f"{self.base_url}/embeddings", headers=headers, json={
                        "model": model or "text-embedding-3-small",
                        "input": text
                    })
                    if res.status_code == 200:
                        data = res.json().get("data", [])
                        if data and isinstance(data[0], dict):
                            return data[0].get("embedding")
                else:
                    res = client.post(f"{self.base_url}/api/embeddings", headers=headers, json={
                        "model": model,
                        "prompt": text
                    })
                    if res.status_code == 200:
                        return res.json().get("embedding")
        except Exception as e:
            logger.warning(f"Failed to generate embedding: {e}")
        return None


LLMService = OllamaService
