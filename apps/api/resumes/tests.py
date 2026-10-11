import io
import shutil
import unittest
from unittest.mock import patch

from django.test import SimpleTestCase
from pypdf import PdfReader

from .services.latex_templates import (
    LatexGenerator,
    escape_latex,
    normalize_url,
    validate_latex_document,
)
from .services.latex_compiler import LatexCompiler
from .services.ollama_service import OllamaService
from .services.resume_parser import ResumeParser
from .services.section_editor import SectionEditor


class OllamaServiceJsonTests(SimpleTestCase):
    def test_decode_json_accepts_fenced_output(self):
        result = OllamaService._decode_json('```json\n{"status": "ok"}\n```')

        self.assertEqual(result, {"status": "ok"})

    def test_decode_json_extracts_object_from_commentary(self):
        result = OllamaService._decode_json('Here is the result: {"score": 82} Done.')

        self.assertEqual(result, {"score": 82})

    def test_chat_json_repairs_invalid_first_response(self):
        service = OllamaService()
        responses = [
            {"content": '{"score": 82'},
            {"content": '{"score": 82}'},
        ]

        with patch.object(service, "chat_sync", side_effect=responses) as chat:
            result = service.chat_json_sync(
                model="small-model",
                messages=[{"role": "user", "content": "score this"}],
                required_keys=("score",),
            )

        self.assertEqual(result["score"], 82)
        self.assertEqual(chat.call_count, 2)

    def test_chat_json_retries_an_empty_model_response(self):
        service = OllamaService()

        with patch.object(
            service,
            "chat_sync",
            side_effect=[RuntimeError("Ollama model small-model returned an empty response."), {"content": '{"score": 82}'}],
        ) as chat:
            result = service.chat_json_sync(
                model="small-model",
                messages=[{"role": "user", "content": "score this"}],
                required_keys=("score",),
            )

        self.assertEqual(result["score"], 82)
        self.assertEqual(chat.call_count, 2)

    def test_chat_json_rejects_missing_required_fields(self):
        service = OllamaService()

        with patch.object(service, "chat_sync", return_value={"content": '{"score": 82}'}):
            with self.assertRaisesRegex(ValueError, "missing required fields: rationale"):
                service.chat_json_sync(
                    model="small-model",
                    messages=[{"role": "user", "content": "score this"}],
                    required_keys=("score", "rationale"),
                )


class ResumeParserNormalizationTests(SimpleTestCase):
    def test_normalizes_nested_sections_and_deduplicates_records(self):
        parsed = {
            "profile": {"full_name": " Ada Lovelace "},
            "experiences": [
                {
                    "company": "Analytical Engines",
                    "role": "Programmer",
                    "is_current": "Present",
                    "bullet_points": [" Wrote algorithms ", "Wrote algorithms"],
                },
                {
                    "company": "Analytical Engines",
                    "role": "Programmer",
                    "is_current": "Present",
                },
            ],
            "educations": [],
            "skills": ["Python", {"category": "Languages", "name": " Python "}],
            "projects": [],
            "certifications": [],
        }

        result = ResumeParser.normalize_parsed_data(parsed)

        self.assertEqual(result["profile"]["full_name"], "Ada Lovelace")
        self.assertEqual(len(result["experiences"]), 1)
        self.assertTrue(result["experiences"][0]["is_current"])
        self.assertEqual(result["experiences"][0]["bullet_points"], ["Wrote algorithms"])
        self.assertEqual(result["skills"][0]["name"], "Python")
        self.assertEqual(result["profile"]["summary"], "")

    def test_flattens_freelance_client_projects_into_labeled_experience_bullets(self):
        parsed = {
            "profile": {},
            "experiences": [{
                "company": "Self-employed",
                "role": "Freelance Software Engineer",
                "bullet_points": ["Managed client delivery."],
                "technologies": ["Python"],
                "client_projects": [{
                    "client": "Acme",
                    "project": "Billing platform",
                    "bullet_points": ["Reduced invoice processing time by 30%."],
                    "technologies": ["Django", "PostgreSQL"],
                }],
            }],
            "educations": [],
            "skills": [],
            "projects": [],
            "certifications": [],
        }

        result = ResumeParser.normalize_parsed_data(parsed)
        experience = result["experiences"][0]

        self.assertEqual(
            experience["bullet_points"],
            [
                "Managed client delivery.",
                "Acme — Billing platform: Reduced invoice processing time by 30%.",
            ],
        )
        self.assertEqual(experience["technologies"], ["Python", "Django", "PostgreSQL"])
        self.assertNotIn("client_projects", experience)


class LatexGenerationTests(SimpleTestCase):
    def test_escape_latex_handles_backslashes_and_special_symbols(self):
        escaped = escape_latex(r"C:\Users\Jane\Projects & Dev #1")

        self.assertIn(r"\textbackslash{}", escaped)
        self.assertIn(r"\&", escaped)
        self.assertIn(r"\#", escaped)

    def test_resume_generator_keeps_links_and_sections_valid(self):
        profile = {
            "full_name": "Jane Doe",
            "headline": "Software Engineer",
            "email": "jane.doe@example.com",
            "phone": "(555) 123-4567",
            "location": "New York, NY",
            "linkedin_url": "https://www.linkedin.com/in/jane-doe/?utm_source=resume&tab=profile",
            "github_url": "https://github.com/jane-doe",
            "website_url": "https://jane-doe.dev/#portfolio",
            "summary": "Built distributed systems with C# and Python.",
        }
        resume = LatexGenerator.generate_resume(
            profile=profile,
            experiences=[{
                "role": "Senior Engineer",
                "company": "Example & Co.",
                "location": "Remote",
                "start_date": "2022",
                "end_date": "Present",
                "is_current": True,
                "bullet_points": ["Designed resilient APIs.", "Scaled to 40M requests/day."],
            }],
            educations=[{
                "institution": "University of Technology",
                "degree": "B.S.",
                "field_of_study": "Computer Science",
                "start_date": "2014",
                "end_date": "2018",
            }],
            skills=[{"category": "Languages", "name": "Python"}, {"category": "Languages", "name": "C#"}],
            projects=[{
                "title": "Distributed Cache",
                "subtitle": "",
                "role": "Lead",
                "repo_url": "https://github.com/jane-doe/cache",
                "live_url": "https://cache.example.com/?v=1&debug=true",
                "start_date": "2021",
                "end_date": "2022",
                "bullet_points": ["Built a cache for 5M requests/minute."],
                "technologies": ["Python", "Redis"],
            }],
        )

        self.assertIn(r"\href{https://www.linkedin.com/in/jane-doe/?utm\_source=resume\&tab=profile}{LinkedIn}", resume)
        self.assertIn(r"\href{https://jane-doe.dev/\#portfolio}{Portfolio}", resume)
        self.assertIn(r"\href{https://github.com/jane-doe/cache}{Code}", resume)
        self.assertIn(r"\href{https://cache.example.com/?v=1\&debug=true}{Live}", resume)
        self.assertIn(r"\textbf{Distributed Cache}", resume)
        self.assertIn(r"\section{Experience}", resume)
        self.assertTrue(validate_latex_document(resume))

    def test_url_normalization_rejects_unsafe_schemes(self):
        with self.assertRaisesRegex(ValueError, "Unsupported hyperlink scheme"):
            normalize_url("javascript:alert(1)")

    def test_structural_validation_rejects_unbalanced_braces(self):
        invalid = r"\begin{document}\textbf{Broken\end{document}"

        self.assertFalse(validate_latex_document(invalid))

    def test_compiler_reports_missing_tectonic(self):
        source = r"\documentclass{article}\begin{document}Resume\end{document}"

        with patch("resumes.services.latex_compiler.shutil.which", return_value=None):
            with self.assertRaisesRegex(RuntimeError, "Tectonic is not installed"):
                LatexCompiler.compile_pdf(source)

    @staticmethod
    def _pdf_uris(pdf: bytes) -> set[str]:
        uris: set[str] = set()
        reader = PdfReader(io.BytesIO(pdf))
        for page in reader.pages:
            for annotation_ref in page.get("/Annots", []):
                annotation = annotation_ref.get_object()
                action = annotation.get("/A")
                if action and action.get("/URI"):
                    uris.add(str(action["/URI"]))
        return uris

    @unittest.skipUnless(shutil.which("tectonic"), "Tectonic is required for LaTeX integration testing.")
    def test_generated_resume_compiles_and_preserves_pdf_links(self):
        resume = LatexGenerator.generate_resume(
            profile={
                "full_name": "Jane Doe",
                "headline": "R&D Platform Engineer",
                "email": "jane.doe+jobs@example.com",
                "phone": "+1 (555) 123-4567",
                "location": "New York, NY",
                "linkedin_url": "linkedin.com/in/jane_doe/?utm_source=resume&tab=profile",
                "github_url": "https://github.com/jane-doe",
                "website_url": "https://jane-doe.dev/#selected_work",
                "summary": r"Built C:\platform services with 99.99% availability & clear ownership.",
            },
            experiences=[{
                "role": "Senior Platform Engineer",
                "company": "Example & Co.",
                "location": "Remote",
                "start_date": "2022",
                "end_date": "",
                "is_current": True,
                "bullet_points": [
                    "Reduced p99 latency by 42% across API_v2.",
                    r"Owned R&D tooling under C:\platform\tools.",
                ],
            }],
            educations=[{
                "institution": "University #1",
                "degree": "B.S.",
                "field_of_study": "Computer Science",
                "start_date": "2014",
                "end_date": "2018",
            }],
            skills=[
                {"category": "Languages & Tools", "name": "Python"},
                {"category": "Languages & Tools", "name": "C#"},
            ],
            projects=[{
                "title": "Distributed Cache",
                "repo_url": "https://github.com/jane-doe/cache_service",
                "live_url": "https://cache.example.com/demo?v=1&debug=true#results",
                "start_date": "2021",
                "end_date": "2022",
                "bullet_points": ["Handled 5M requests/minute at 99.9% availability."],
                "technologies": ["Python", "Redis"],
            }],
        )

        pdf = LatexCompiler.compile_pdf(resume, timeout=180)
        self.assertEqual(len(PdfReader(io.BytesIO(pdf)).pages), 1)
        uris = self._pdf_uris(pdf)

        self.assertIn("mailto:jane.doe+jobs@example.com", uris)
        self.assertIn("https://linkedin.com/in/jane_doe/?utm_source=resume&tab=profile", uris)
        self.assertIn("https://jane-doe.dev/#selected_work", uris)
        self.assertIn("https://github.com/jane-doe/cache_service", uris)
        self.assertIn("https://cache.example.com/demo?v=1&debug=true#results", uris)


class SectionEditorTests(SimpleTestCase):
    def test_refinement_includes_history_and_returns_complete_draft(self):
        response = {
            "assistant_message": "Removed the weaker bullet.",
            "proposed_content": ["Built a distributed API serving 2M requests."],
            "explanation": "Removed one bullet and retained the strongest evidence.",
        }

        with patch.object(OllamaService, "chat_json_sync", return_value=response) as chat:
            result = SectionEditor.refine_section(
                section_type="experience",
                current_content=["Built an API.", "Helped the team."],
                instruction="Remove the second bullet.",
                conversation=[
                    {"role": "user", "content": "Focus on backend work."},
                    {"role": "assistant", "content": "I emphasized the backend work."},
                ],
                model_name="small-model",
            )

        self.assertEqual(result["proposed_content"], ["Built a distributed API serving 2M requests."])
        sent_messages = chat.call_args.kwargs["messages"]
        self.assertIn({"role": "user", "content": "Focus on backend work."}, sent_messages)
        self.assertIn({"role": "assistant", "content": "I emphasized the backend work."}, sent_messages)

    def test_refinement_rejects_wrong_content_shape(self):
        response = {
            "assistant_message": "Updated.",
            "proposed_content": "Not a bullet list",
            "explanation": "Changed content.",
        }

        with patch.object(OllamaService, "chat_json_sync", return_value=response):
            with self.assertRaisesRegex(ValueError, "must return a list"):
                SectionEditor.refine_section(
                    section_type="project",
                    current_content=["Original bullet"],
                    instruction="Improve it.",
                )
