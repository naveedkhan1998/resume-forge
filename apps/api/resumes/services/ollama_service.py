import json
import logging
import re
from typing import Any, Dict, List, Optional, Sequence

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)


class OllamaService:
    DEFAULT_GATEWAY_URL = "https://gateway.pydantic.dev/v1"

    LOCAL_OLLAMA_PRESETS: List[Dict[str, str]] = [
        {
            "label": "Standard Localhost",
            "url": "http://localhost:11434",
            "hint": "Direct host execution (native Python + local Ollama)",
        },
        {
            "label": "IPv4 Loopback",
            "url": "http://127.0.0.1:11434",
            "hint": "Bypasses IPv6 ::1 resolution issues on localhost",
        },
        {
            "label": "Docker Host Internal",
            "url": "http://host.docker.internal:11434",
            "hint": "Backend in Docker container connecting to host Ollama",
        },
        {
            "label": "Linux Docker Bridge",
            "url": "http://172.17.0.1:11434",
            "hint": "Linux Docker default bridge network to host machine",
        },
        {
            "label": "Docker Compose Service",
            "url": "http://ollama:11434",
            "hint": "Ollama running as a sibling container in docker-compose",
        },
    ]

    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        provider: str = "ollama",
        timeout: Optional[float] = None,
        allow_system_fallback: bool = False,
        _is_system_fallback: bool = False,
    ):
        raw_provider = (provider or "ollama").lower().strip()
        if raw_provider == "gateway":
            raw_provider = "pydantic_gateway"
        self.provider = raw_provider
        self.api_key = (api_key or "").strip()
        if self._is_gateway_provider(self.provider):
            self.base_url = self._normalize_gateway_url(base_url or self.DEFAULT_GATEWAY_URL)
        else:
            self.base_url = (base_url or getattr(settings, 'OLLAMA_BASE_URL', 'http://localhost:11434')).rstrip('/')
        self.timeout = timeout or getattr(settings, 'OLLAMA_TIMEOUT', 600.0)
        self.allow_system_fallback = allow_system_fallback
        self._is_system_fallback = _is_system_fallback

    @staticmethod
    def _is_gateway_provider(provider: str) -> bool:
        return (provider or "").lower().strip() in {"pydantic_gateway", "gateway", "openrouter"}

    @classmethod
    def _normalize_gateway_url(cls, url: str) -> str:
        cleaned = (url or cls.DEFAULT_GATEWAY_URL).strip().rstrip("/")
        for suffix in ("/chat/completions", "/models", "/embeddings"):
            if cleaned.endswith(suffix):
                cleaned = cleaned[: -len(suffix)].rstrip("/")
        return cleaned or cls.DEFAULT_GATEWAY_URL

    @classmethod
    def is_system_fallback_configured(cls) -> bool:
        """Return True if a server-level fallback LLM is configured in environment settings."""
        sys_key = str(getattr(settings, "SYSTEM_LLM_API_KEY", "") or "").strip()
        sys_url = str(getattr(settings, "SYSTEM_LLM_BASE_URL", "") or "").strip()
        sys_provider = str(getattr(settings, "SYSTEM_LLM_PROVIDER", "pydantic_gateway") or "pydantic_gateway").strip().lower()
        if sys_provider == "ollama":
            # Only treat system Ollama as a fallback if explicitly given a key or non-default fallback URL
            return bool(sys_key)
        return bool(sys_key and sys_url)

    @classmethod
    def _build_system_fallback_service(cls, timeout: Optional[float] = None) -> Optional["OllamaService"]:
        """Construct an internal OllamaService from hidden environment variables (never exposed to API)."""
        if not cls.is_system_fallback_configured():
            return None
        sys_provider = str(getattr(settings, "SYSTEM_LLM_PROVIDER", "pydantic_gateway") or "pydantic_gateway").strip().lower()
        sys_url = str(getattr(settings, "SYSTEM_LLM_BASE_URL", cls.DEFAULT_GATEWAY_URL) or cls.DEFAULT_GATEWAY_URL).strip()
        sys_key = str(getattr(settings, "SYSTEM_LLM_API_KEY", "") or "").strip()
        return cls(
            base_url=sys_url,
            api_key=sys_key,
            provider=sys_provider,
            timeout=timeout,
            allow_system_fallback=False,
            _is_system_fallback=True,
        )

    @classmethod
    def get_system_fallback_model(cls, fallback_default: str = "qwen3.5:9b") -> str:
        sys_model = str(getattr(settings, "SYSTEM_LLM_MODEL", "") or "").strip()
        return sys_model or fallback_default

    @classmethod
    def from_user(cls, user: Any, override_model: Optional[str] = None) -> "OllamaService":
        """Instantiate service configured from user AI settings, with hidden system-level env fallback."""
        ai_settings = getattr(user, 'ai_settings', None)
        if not ai_settings:
            if cls.is_system_fallback_configured():
                fallback_svc = cls._build_system_fallback_service()
                if fallback_svc is not None:
                    return fallback_svc
            return cls(allow_system_fallback=True)

        provider = (getattr(ai_settings, 'provider', 'ollama') or 'ollama').lower().strip()
        user_key = (getattr(ai_settings, 'api_key', '') or '').strip()

        if cls._is_gateway_provider(provider):
            gateway_url = getattr(ai_settings, 'pydantic_gateway_endpoint', None) or getattr(ai_settings, 'openrouter_endpoint', '') or cls.DEFAULT_GATEWAY_URL
            # If the user chose gateway mode without their own API key and system fallback exists, use system fallback directly
            if not user_key and cls.is_system_fallback_configured():
                fallback_svc = cls._build_system_fallback_service()
                if fallback_svc is not None:
                    return fallback_svc
            return cls(
                base_url=gateway_url,
                api_key=user_key,
                provider=provider,
                allow_system_fallback=True,
            )

        return cls(
            base_url=ai_settings.ollama_endpoint or 'http://localhost:11434',
            api_key=user_key,
            provider='ollama',
            allow_system_fallback=True,
        )

    def _get_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._is_gateway_provider(self.provider):
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
                headers["X-API-Key"] = self.api_key
            if self.provider == "openrouter":
                headers["HTTP-Referer"] = "https://resumeforge.dev"
                headers["X-Title"] = "ResumeForge"
        elif self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _provider_display_name(self) -> str:
        if self._is_system_fallback:
            return "System Fallback LLM"
        if self.provider in {"pydantic_gateway", "gateway"}:
            return "Pydantic AI Gateway"
        if self.provider == "openrouter":
            return "OpenRouter"
        return "Ollama"

    @classmethod
    def probe_local_ollama_presets_sync(cls, current_url: Optional[str] = None) -> Dict[str, Any]:
        """Probe common local Ollama endpoints (localhost, 127.0.0.1, host.docker.internal, docker bridge)."""
        results: List[Dict[str, Any]] = []
        working_url: Optional[str] = None
        working_models: List[str] = []

        seen_urls = set()
        candidates = list(cls.LOCAL_OLLAMA_PRESETS)
        if current_url:
            norm_current = current_url.strip().rstrip("/")
            if norm_current and not any(p["url"].rstrip("/") == norm_current for p in candidates):
                candidates.insert(0, {
                    "label": "Custom Endpoint",
                    "url": norm_current,
                    "hint": "User-configured endpoint",
                })

        with httpx.Client(timeout=1.5) as client:
            for preset in candidates:
                url = preset["url"].rstrip("/")
                if url in seen_urls:
                    continue
                seen_urls.add(url)
                try:
                    res = client.get(f"{url}/api/tags")
                    if res.status_code == 200:
                        data = res.json()
                        models = [m.get("name") for m in data.get("models", []) if isinstance(m, dict) and m.get("name")]
                        results.append({
                            "label": preset["label"],
                            "url": url,
                            "hint": preset.get("hint", ""),
                            "connected": True,
                            "models": models,
                        })
                        if not working_url:
                            working_url = url
                            working_models = models
                    else:
                        results.append({
                            "label": preset["label"],
                            "url": url,
                            "hint": preset.get("hint", ""),
                            "connected": False,
                            "error": f"HTTP {res.status_code}",
                        })
                except Exception as exc:
                    results.append({
                        "label": preset["label"],
                        "url": url,
                        "hint": preset.get("hint", ""),
                        "connected": False,
                        "error": str(exc),
                    })

        return {
            "presets": results,
            "recommended_endpoint": working_url,
            "models": working_models,
        }

    async def check_health(self) -> Dict[str, Any]:
        """Check if LLM provider server is reachable."""
        headers = self._get_headers()
        provider_label = self._provider_display_name()
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                if self._is_gateway_provider(self.provider):
                    if not self.api_key:
                        return {
                            "status": "error",
                            "connected": False,
                            "provider": self.provider,
                            "system_fallback_available": self.is_system_fallback_configured(),
                            "error": f"{provider_label} requires an API key.",
                        }
                    res = await client.get(f"{self.base_url}/models", headers=headers)
                    if res.status_code == 200:
                        data = res.json()
                        raw_list = data.get("data", data.get("models", [])) if isinstance(data, dict) else []
                        models = [
                            (m.get("id") or m.get("name"))
                            for m in raw_list
                            if isinstance(m, dict) and (m.get("id") or m.get("name"))
                        ]
                        return {
                            "status": "ok",
                            "connected": True,
                            "provider": self.provider,
                            "system_fallback_available": self.is_system_fallback_configured(),
                            "models": models[:60],
                        }
                    if res.status_code in {404, 405} and self.provider in {"pydantic_gateway", "gateway"}:
                        # Pydantic AI Gateway proxy routes often do not expose GET /models
                        return {
                            "status": "ok",
                            "connected": True,
                            "provider": self.provider,
                            "system_fallback_available": self.is_system_fallback_configured(),
                            "models": [],
                            "message": "Gateway endpoint is reachable (model listing handled by upstream route).",
                        }
                    detail = res.text[:200]
                    return {
                        "status": "error",
                        "connected": False,
                        "provider": self.provider,
                        "system_fallback_available": self.is_system_fallback_configured(),
                        "error": f"{provider_label} HTTP {res.status_code}: {detail}",
                    }
                else:
                    res = await client.get(f"{self.base_url}/api/tags", headers=headers)
                    if res.status_code == 200:
                        data = res.json()
                        models = [m.get('name') for m in data.get('models', []) if m.get('name')]
                        return {
                            "status": "ok",
                            "connected": True,
                            "provider": "ollama",
                            "system_fallback_available": self.is_system_fallback_configured(),
                            "models": models,
                        }
                    return {
                        "status": "error",
                        "connected": False,
                        "provider": "ollama",
                        "system_fallback_available": self.is_system_fallback_configured(),
                        "error": f"Ollama HTTP {res.status_code}: {res.text[:200]}",
                    }
        except Exception as e:
            return {
                "status": "error",
                "connected": False,
                "provider": self.provider,
                "system_fallback_available": self.is_system_fallback_configured(),
                "error": f"Could not connect to {provider_label}: {str(e)}",
            }

    def check_health_sync(self, probe_presets: bool = False) -> Dict[str, Any]:
        """Synchronous health check with optional local Ollama preset probing."""
        headers = self._get_headers()
        provider_label = self._provider_display_name()
        try:
            with httpx.Client(timeout=8.0) as client:
                if self._is_gateway_provider(self.provider):
                    if not self.api_key:
                        return {
                            "status": "error",
                            "connected": False,
                            "provider": self.provider,
                            "system_fallback_available": self.is_system_fallback_configured(),
                            "error": f"{provider_label} requires an API key.",
                        }
                    res = client.get(f"{self.base_url}/models", headers=headers)
                    if res.status_code == 200:
                        data = res.json()
                        raw_list = data.get("data", data.get("models", [])) if isinstance(data, dict) else []
                        models = [
                            (m.get("id") or m.get("name"))
                            for m in raw_list
                            if isinstance(m, dict) and (m.get("id") or m.get("name"))
                        ]
                        return {
                            "status": "ok",
                            "connected": True,
                            "provider": self.provider,
                            "system_fallback_available": self.is_system_fallback_configured(),
                            "models": models[:60],
                        }
                    if res.status_code in {404, 405} and self.provider in {"pydantic_gateway", "gateway"}:
                        return {
                            "status": "ok",
                            "connected": True,
                            "provider": self.provider,
                            "system_fallback_available": self.is_system_fallback_configured(),
                            "models": [],
                            "message": "Gateway endpoint is reachable (specify your upstream model name below).",
                        }
                    detail = res.text[:200]
                    return {
                        "status": "error",
                        "connected": False,
                        "provider": self.provider,
                        "system_fallback_available": self.is_system_fallback_configured(),
                        "error": f"{provider_label} HTTP {res.status_code}: {detail}",
                    }
                else:
                    res = client.get(f"{self.base_url}/api/tags", headers=headers)
                    if res.status_code == 200:
                        data = res.json()
                        models = [m.get('name') for m in data.get('models', []) if m.get('name')]
                        result: Dict[str, Any] = {
                            "status": "ok",
                            "connected": True,
                            "provider": "ollama",
                            "endpoint": self.base_url,
                            "system_fallback_available": self.is_system_fallback_configured(),
                            "models": models,
                        }
                        if probe_presets:
                            probe = self.probe_local_ollama_presets_sync(self.base_url)
                            result["presets"] = probe["presets"]
                            result["recommended_endpoint"] = probe["recommended_endpoint"] or self.base_url
                        return result
                    err_resp: Dict[str, Any] = {
                        "status": "error",
                        "connected": False,
                        "provider": "ollama",
                        "endpoint": self.base_url,
                        "system_fallback_available": self.is_system_fallback_configured(),
                        "error": f"Ollama HTTP {res.status_code}: {res.text[:200]}",
                    }
                    if probe_presets:
                        probe = self.probe_local_ollama_presets_sync(self.base_url)
                        err_resp["presets"] = probe["presets"]
                        err_resp["recommended_endpoint"] = probe["recommended_endpoint"]
                    return err_resp
        except Exception as e:
            err_resp = {
                "status": "error",
                "connected": False,
                "provider": self.provider,
                "endpoint": self.base_url if not self._is_system_fallback else None,
                "system_fallback_available": self.is_system_fallback_configured(),
                "error": f"Could not connect to {provider_label}: {str(e)}",
            }
            if probe_presets and not self._is_gateway_provider(self.provider):
                probe = self.probe_local_ollama_presets_sync(self.base_url)
                err_resp["presets"] = probe["presets"]
                err_resp["recommended_endpoint"] = probe["recommended_endpoint"]
            return err_resp

    async def chat(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        format_json: bool = False,
        stream: bool = False
    ) -> Dict[str, Any]:
        """Send chat completion request to Ollama or Pydantic AI Gateway."""
        headers = self._get_headers()
        client_timeout = httpx.Timeout(self.timeout, connect=30.0)

        if self._is_gateway_provider(self.provider):
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
            payload = {
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

    def _try_system_fallback_chat_sync(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float,
        format_json: bool,
        primary_error: Exception,
    ) -> Dict[str, Any]:
        """Attempt chat completion using the hidden system-level environment variable fallback."""
        if not self.allow_system_fallback or self._is_system_fallback:
            raise primary_error
        fallback_service = self._build_system_fallback_service(timeout=self.timeout)
        if fallback_service is None:
            raise primary_error
        fallback_model = self.get_system_fallback_model(fallback_default=model)
        logger.info("User LLM unavailable; routing request through system-level fallback provider.")
        return fallback_service.chat_sync(
            model=fallback_model,
            messages=messages,
            temperature=temperature,
            format_json=format_json,
        )

    def chat_sync(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        format_json: bool = False,
    ) -> Dict[str, Any]:
        """Synchronous chat completion request to Ollama or Pydantic AI Gateway with hidden system fallback."""
        if not model.strip():
            raise ValueError("A model name is required.")
        if not messages:
            raise ValueError("At least one chat message is required.")

        effective_model = self.get_system_fallback_model(model) if self._is_system_fallback else model
        headers = self._get_headers()
        client_timeout = httpx.Timeout(self.timeout, connect=30.0)
        provider_label = self._provider_display_name()
        endpoint_display = "configured system endpoint" if self._is_system_fallback else self.base_url

        if self._is_gateway_provider(self.provider):
            if not self.api_key:
                missing_key_err = ValueError(f"A {provider_label} API key is required.")
                return self._try_system_fallback_chat_sync(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    format_json=format_json,
                    primary_error=missing_key_err,
                )

            payload: Dict[str, Any] = {
                "model": effective_model,
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
                conn_err = RuntimeError(f"Could not connect to {provider_label} at {endpoint_display}.")
                return self._try_system_fallback_chat_sync(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    format_json=format_json,
                    primary_error=conn_err,
                )
            except httpx.TimeoutException as exc:
                raise RuntimeError(
                    f"{provider_label} timed out after {self.timeout:g} seconds while running {effective_model}."
                ) from exc
            except httpx.HTTPStatusError as exc:
                detail = exc.response.text[:300].strip()
                raise RuntimeError(
                    f"{provider_label} returned HTTP {exc.response.status_code}{f': {detail}' if detail else ''}"
                ) from exc

            choices = data.get("choices", [])
            if not choices or not isinstance(choices[0], dict):
                raise RuntimeError(f"{provider_label} model {effective_model} returned no choices: {data}")
            message = choices[0].get("message")
            if not isinstance(message, dict) or not str(message.get("content", "")).strip():
                raise RuntimeError(f"{provider_label} model {effective_model} returned an empty response.")
            return message
        else:
            payload = {
                "model": effective_model,
                "messages": messages,
                "stream": False,
                "think": False,
                "keep_alive": "15m",
                "options": {
                    "temperature": max(0.0, min(1.0, temperature)),
                    "num_ctx": 16384,
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
                conn_err = RuntimeError(
                    f"Could not connect to Ollama at {endpoint_display}. Start Ollama or check your connection preset in Settings."
                )
                return self._try_system_fallback_chat_sync(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    format_json=format_json,
                    primary_error=conn_err,
                )
            except httpx.TimeoutException as exc:
                raise RuntimeError(
                    f"Ollama timed out after {self.timeout:g} seconds while running {effective_model}."
                ) from exc
            except httpx.HTTPStatusError as exc:
                detail = exc.response.text[:300].strip()
                raise RuntimeError(
                    f"Ollama returned HTTP {exc.response.status_code}{f': {detail}' if detail else ''}"
                ) from exc

            message = data.get("message")
            if not isinstance(message, dict) or not str(message.get("content", "")).strip():
                raise RuntimeError(f"Ollama model {effective_model} returned an empty response.")
            return message

    @staticmethod
    def _strip_reasoning_tokens(text: str) -> str:
        """Remove <think>...</think> blocks emitted by reasoning models."""
        cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE)
        if "<think>" in cleaned.lower() and "</think>" not in cleaned.lower():
            # If an unclosed <think> precedes a JSON object, keep from the last '{' block or after <think>
            idx = cleaned.lower().rfind("</think>")
            if idx != -1:
                cleaned = cleaned[idx + 8:]
        return cleaned.strip()

    @staticmethod
    def _try_parse_json_dict(raw: str) -> Dict[str, Any]:
        """Parse JSON string with fallback cleanup for trailing commas."""
        try:
            result = json.loads(raw)
        except json.JSONDecodeError:
            fixed = re.sub(r",\s*([}\]])", r"\1", raw)
            result = json.loads(fixed)
        if not isinstance(result, dict):
            raise ValueError("Ollama JSON response must be an object.")
        return result

    @classmethod
    def _decode_json(cls, content: str) -> Dict[str, Any]:
        cleaned = cls._strip_reasoning_tokens(content.strip())
        fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", cleaned, re.DOTALL | re.IGNORECASE)
        if fenced:
            cleaned = fenced.group(1).strip()

        try:
            return cls._try_parse_json_dict(cleaned)
        except (json.JSONDecodeError, ValueError) as initial_err:
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start < 0 or end <= start:
                if isinstance(initial_err, ValueError):
                    raise
                raise initial_err
            return cls._try_parse_json_dict(cleaned[start:end + 1])

    def chat_json_sync(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.2,
        required_keys: Sequence[str] = (),
        schema_hint: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Request JSON and make a focused schema-aware repair attempt for local/cloud models."""
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

        required_clause = (
            f" Required top-level keys: {', '.join(required_keys)}."
            if required_keys
            else ""
        )
        schema_clause = f"\nExpected schema:\n{schema_hint}" if schema_hint else ""

        try:
            result = self._decode_json(content)
        except (json.JSONDecodeError, ValueError) as first_error:
            repair_messages = [
                {
                    "role": "system",
                    "content": (
                        "Repair the supplied output into one valid JSON object. Preserve its data, "
                        f"add no commentary, and return JSON only.{required_clause}{schema_clause}"
                    ),
                },
                {"role": "user", "content": content[:14000]},
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
        if missing and schema_hint:
            repair_missing_messages = [
                *messages,
                {"role": "assistant", "content": json.dumps(result, ensure_ascii=False)},
                {
                    "role": "user",
                    "content": (
                        f"Your JSON response is missing required top-level fields: {', '.join(missing)}. "
                        f"Return the complete JSON object including all required keys ({', '.join(required_keys)})."
                    ),
                },
            ]
            try:
                repaired_missing = self.chat_sync(
                    model=model,
                    messages=repair_missing_messages,
                    temperature=0.0,
                    format_json=True,
                )
                result = self._decode_json(str(repaired_missing["content"]))
            except Exception:
                pass
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
                if self._is_gateway_provider(self.provider):
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
