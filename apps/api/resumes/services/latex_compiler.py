import shutil
import subprocess
import tempfile
from pathlib import Path

from .latex_templates import validate_latex_document


class LatexCompiler:
    @staticmethod
    def compile_pdf(latex_source: str, timeout: int = 90) -> bytes:
        if not validate_latex_document(latex_source):
            raise ValueError("LaTeX source failed structural validation.")

        tectonic = shutil.which("tectonic")
        if not tectonic:
            raise RuntimeError(
                "Tectonic is not installed. Run the API through the provided Docker image to enable compiled PDFs."
            )

        with tempfile.TemporaryDirectory(prefix="resumeforge-latex-") as temp_dir:
            workdir = Path(temp_dir)
            tex_path = workdir / "document.tex"
            tex_path.write_text(latex_source, encoding="utf-8")
            try:
                result = subprocess.run(
                    [
                        tectonic,
                        "--untrusted",
                        "--chatter",
                        "minimal",
                        "--outdir",
                        str(workdir),
                        str(tex_path),
                    ],
                    cwd=workdir,
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    check=False,
                )
            except subprocess.TimeoutExpired as exc:
                raise RuntimeError(f"LaTeX compilation timed out after {timeout} seconds.") from exc

            pdf_path = workdir / "document.pdf"
            if result.returncode != 0 or not pdf_path.exists():
                details = (result.stderr or result.stdout or "Unknown Tectonic error").strip()
                raise ValueError(f"LaTeX compilation failed: {details[-1200:]}")
            return pdf_path.read_bytes()
