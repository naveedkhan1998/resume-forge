import httpx
from typing import List, Dict, Any, Optional
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

class OllamaService:
    def __init__(self, base_url: Optional[str] = None, timeout: Optional[float] = None):
        self.base_url = (base_url or getattr(settings, 'OLLAMA_BASE_URL', 'http://localhost:11434')).rstrip('/')
        self.timeout = timeout or getattr(settings, 'OLLAMA_TIMEOUT', 600.0)

    async def check_health(self) -> Dict[str, Any]:
        """Check if Ollama server is reachable."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    data = res.json()
                    models = [m.get('name') for m in data.get('models', [])]
                    return {"status": "ok", "connected": True, "models": models}
                return {"status": "error", "connected": False, "error": f"Status code {res.status_code}"}
        except Exception as e:
            return {"status": "error", "connected": False, "error": str(e)}

    def check_health_sync(self) -> Dict[str, Any]:
        """Synchronous health check."""
        try:
            with httpx.Client(timeout=5.0) as client:
                res = client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    data = res.json()
                    models = [m.get('name') for m in data.get('models', [])]
                    return {"status": "ok", "connected": True, "models": models}
                return {"status": "error", "connected": False, "error": f"Status code {res.status_code}"}
        except Exception as e:
            return {"status": "error", "connected": False, "error": str(e)}

    async def chat(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        format_json: bool = False,
        stream: bool = False
    ) -> Dict[str, Any]:
        """Send chat completion request to Ollama."""
        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": stream,
            "options": {
                "temperature": temperature
            }
        }
        if format_json:
            payload["format"] = "json"

        client_timeout = httpx.Timeout(self.timeout, connect=30.0)
        async with httpx.AsyncClient(timeout=client_timeout) as client:
            res = await client.post(f"{self.base_url}/api/chat", json=payload)
            res.raise_for_status()
            data = res.json()
            return data.get("message", {})

    def chat_sync(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        format_json: bool = False
    ) -> Dict[str, Any]:
        """Synchronous chat completion request to Ollama."""
        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temperature
            }
        }
        if format_json:
            payload["format"] = "json"

        client_timeout = httpx.Timeout(self.timeout, connect=30.0)
        with httpx.Client(timeout=client_timeout) as client:
            res = client.post(f"{self.base_url}/api/chat", json=payload)
            res.raise_for_status()
            data = res.json()
            return data.get("message", {})

    def get_embedding(self, model: str, text: str) -> Optional[List[float]]:
        """Get vector embedding for a text."""
        try:
            with httpx.Client(timeout=30.0) as client:
                res = client.post(f"{self.base_url}/api/embeddings", json={
                    "model": model,
                    "prompt": text
                })
                if res.status_code == 200:
                    return res.json().get("embedding")
        except Exception as e:
            logger.warning(f"Failed to generate embedding: {e}")
        return None
