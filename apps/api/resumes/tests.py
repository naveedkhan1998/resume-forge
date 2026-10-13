import io
import json
import shutil
import unittest
import zipfile
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase

from pypdf import PdfReader

from .models import (
    Certification,
    Education,
    Experience,
    JobApplication,
    Profile,
    Project,
    Skill,
    TailoredDocument,
)
from .services.latex_templates import (
    LatexGenerator,
    escape_latex,
    normalize_url,
    validate_latex_document,
)
from .services.latex_compiler import LatexCompiler
from .services.ollama_service import OllamaService
from .services.pdf_markdown import DocumentMarkdownConverter
from .services.resume_parser import ResumeParser
from .services.section_editor import SectionEditor
from .services.tailor_service import TailorService


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


class ResumeParserPersistenceTests(TestCase):
    def test_save_truncates_oversized_llm_fields_to_database_limits(self):
        user = User.objects.create_user(username="parser-test")
        oversized = "x" * 400
        parsed = {
            "profile": {
                "full_name": oversized,
                "headline": oversized,
                "email": f"{'x' * 390}@example.com",
                "phone": oversized,
                "location": oversized,
            },
            "experiences": [{
                "company": oversized,
                "role": oversized,
                "location": oversized,
                "start_date": oversized,
                "end_date": oversized,
            }],
            "educations": [{
                "institution": oversized,
                "degree": oversized,
                "field_of_study": oversized,
                "start_date": oversized,
                "end_date": oversized,
                "gpa": oversized,
            }],
            "skills": [{
                "category": oversized,
                "name": oversized,
                "proficiency": oversized,
            }],
            "projects": [{
                "title": oversized,
                "subtitle": oversized,
                "role": oversized,
                "start_date": oversized,
                "end_date": oversized,
            }],
            "certifications": [{
                "name": oversized,
                "issuer": oversized,
                "issue_date": oversized,
            }],
        }

        ResumeParser.save_to_database(user, parsed)

        profile = Profile.objects.get(user=user)
        self.assertEqual(len(profile.full_name), 255)
        self.assertEqual(len(profile.headline), 255)
        self.assertEqual(len(profile.email), 254)
        self.assertEqual(len(profile.phone), 50)
        self.assertEqual(len(profile.location), 255)
        self.assertEqual(len(Experience.objects.get(user=user).start_date), 50)
        self.assertEqual(len(Education.objects.get(user=user).gpa), 50)
        self.assertEqual(len(Skill.objects.get(user=user).name), 100)
        self.assertEqual(len(Project.objects.get(user=user).subtitle), 255)
        self.assertEqual(len(Certification.objects.get(user=user).issue_date), 50)


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


class ResetDataEndpointTests(TestCase):
    def _seed(self) -> User:
        user, _ = User.objects.get_or_create(username="demo_user")
        Profile.objects.update_or_create(
            user=user,
            defaults={"full_name": "Jane Doe", "summary": "Seeded", "raw_resume_text": "raw"},
        )
        Experience.objects.create(user=user, company="Acme", role="Engineer")
        Education.objects.create(user=user, institution="State", degree="B.S.")
        Skill.objects.create(user=user, category="Languages", name="Python")
        Project.objects.create(user=user, title="Cache")
        Certification.objects.create(user=user, name="AWS SAA")
        application = JobApplication.objects.create(
            user=user, company_name="Stripe", job_title="Engineer"
        )
        TailoredDocument.objects.create(application=application, latex_source="source")
        return user

    def _post_reset(self, payload: dict):
        return self.client.post(
            "/api/master/reset",
            data=json.dumps(payload),
            content_type="application/json",
        )

    def test_reset_requires_explicit_confirmation(self):
        user = self._seed()

        response = self._post_reset({"confirm": "yes"})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(user.experiences.count(), 1)
        self.assertEqual(user.profile.full_name, "Jane Doe")

    def test_reset_clears_profile_and_career_data(self):
        user = self._seed()

        response = self._post_reset({"confirm": "DELETE"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(user.experiences.count(), 0)
        self.assertEqual(user.educations.count(), 0)
        self.assertEqual(user.skills.count(), 0)
        self.assertEqual(user.projects.count(), 0)
        self.assertEqual(user.certifications.count(), 0)
        self.assertEqual(user.applications.count(), 0)
        self.assertEqual(TailoredDocument.objects.count(), 0)

        profile = Profile.objects.get(user=user)
        self.assertEqual(profile.full_name, "")
        self.assertEqual(profile.summary, "")
        self.assertEqual(profile.raw_resume_text, "")

    def test_reset_can_preserve_job_applications(self):
        user = self._seed()

        response = self._post_reset({"confirm": "DELETE", "delete_applications": False})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(user.experiences.count(), 0)
        self.assertEqual(user.applications.count(), 1)
        self.assertEqual(TailoredDocument.objects.count(), 1)


class DocumentMarkdownConverterTests(SimpleTestCase):
    def test_text_to_markdown_extracts_headings_and_bullets(self):
        raw = (
            "Jane Doe\n"
            "Software Engineer\n\n"
            "EXPERIENCE\n"
            "Tech Corp - Senior Engineer\n"
            "• Spearheaded migration of auth service\n"
            "• Reduced latency by 45%\n\n"
            "EDUCATION\n"
            "University of Illinois\n"
            "B.S. Computer Science\n"
        )
        md = DocumentMarkdownConverter.text_to_markdown(raw)
        self.assertIn("## Experience", md)
        self.assertIn("- Spearheaded migration of auth service", md)
        self.assertIn("- Reduced latency by 45%", md)
        self.assertIn("## Education", md)

    def test_column_gutter_detection_separates_sidebar_and_content(self):
        words = []
        words.append({"text": "John", "x0": 200, "x1": 250, "top": 20, "bottom": 35, "size": 18, "fontname": "Bold"})
        words.append({"text": "Doe", "x0": 260, "x1": 310, "top": 20, "bottom": 35, "size": 18, "fontname": "Bold"})
        for i in range(5):
            top = 60 + i * 20
            words.append({"text": f"Skill{i}", "x0": 30, "x1": 120, "top": top, "bottom": top + 12, "size": 10, "fontname": "Regular"})
        for i in range(5):
            top = 60 + i * 20
            words.append({"text": f"ExperienceDetail{i}", "x0": 250, "x1": 500, "top": top, "bottom": top + 12, "size": 10, "fontname": "Regular"})

        columns = DocumentMarkdownConverter._detect_page_columns(words, page_width=600.0, page_height=800.0, median_size=10.0)
        self.assertGreaterEqual(len(columns), 2)
        left_found = any(any("Skill" in w["text"] for w in col) for col in columns)
        right_found = any(any("ExperienceDetail" in w["text"] for w in col) for col in columns)
        self.assertTrue(left_found)
        self.assertTrue(right_found)


class LatexGenerationEnhancedTests(SimpleTestCase):
    def test_resume_without_headline_does_not_emit_empty_linebreak(self):
        profile = {
            "full_name": "Jane Doe",
            "headline": "",
            "email": "jane@example.com",
            "phone": "123-456-7890",
            "location": "Chicago, IL",
        }
        latex = LatexGenerator.generate_resume(profile=profile, experiences=[], educations=[], skills=[])
        self.assertNotIn(r"\small \\ \vspace{2pt}", latex)
        self.assertTrue(validate_latex_document(latex))

    def test_resume_renders_certifications_section(self):
        profile = {"full_name": "Jane Doe"}
        certs = [
            {
                "name": "AWS Solutions Architect - Associate",
                "issuer": "Amazon Web Services",
                "issue_date": "2023",
                "credential_url": "https://aws.amazon.com/verify/123",
            },
            {
                "name": "Certified Kubernetes Administrator",
                "issuer": "CNCF",
                "issue_date": "2024",
            },
        ]
        latex = LatexGenerator.generate_resume(profile=profile, certifications=certs)
        self.assertIn(r"\section{Certifications}", latex)
        self.assertIn("AWS Solutions Architect - Associate", latex)
        self.assertIn("Amazon Web Services", latex)
        self.assertIn("Certified Kubernetes Administrator", latex)
        self.assertIn(r"\href{https://aws.amazon.com/verify/123}{AWS Solutions Architect - Associate}", latex)
        self.assertTrue(validate_latex_document(latex))

    def test_resume_renders_education_gpa_and_highlights(self):
        profile = {"full_name": "Jane Doe"}
        edus = [
            {
                "institution": "University of Illinois",
                "degree": "B.S.",
                "field_of_study": "Computer Science",
                "start_date": "2018",
                "end_date": "2022",
                "gpa": "3.92/4.0",
                "highlights": ["Dean's List (all semesters)", "Senior Capstone 1st Place"],
            }
        ]
        latex = LatexGenerator.generate_resume(profile=profile, educations=edus)
        self.assertIn(r"GPA: 3.92/4.0", latex)
        self.assertIn(r"Dean's List (all semesters)", latex)
        self.assertIn(r"Senior Capstone 1st Place", latex)
        self.assertTrue(validate_latex_document(latex))

    def test_resume_renders_project_subtitle_and_role(self):
        profile = {"full_name": "Jane Doe"}
        projs = [
            {
                "title": "Distributed KV Store",
                "subtitle": "Raft Consensus Key-Value Database",
                "role": "Creator & Maintainer",
                "start_date": "2023",
                "end_date": "2024",
                "technologies": ["Go", "gRPC", "Docker"],
                "bullet_points": ["Achieved 10,000 ops/sec with Raft leader election under 150ms."],
            }
        ]
        latex = LatexGenerator.generate_resume(profile=profile, projects=projs)
        self.assertIn(r"\textbf{Distributed KV Store}", latex)
        self.assertIn("Raft Consensus Key-Value Database", latex)
        self.assertIn(r"Creator \& Maintainer", latex)
        self.assertIn("Go, gRPC, Docker", latex)
        self.assertTrue(validate_latex_document(latex))


class TailorServiceMergeTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tailor_test_user")
        self.profile = Profile.objects.create(
            user=self.user,
            full_name="Alex Mercer",
            headline="Full Stack Engineer",
            email="alex@example.com",
            phone="555-0100",
            location="Remote",
        )
        self.exp1 = Experience.objects.create(
            user=self.user,
            company="Alpha Corp",
            role="Senior Software Engineer",
            start_date="2022",
            end_date="Present",
            is_current=True,
            bullet_points=["Built microservices architecture.", "Led team of 4 engineers."],
            technologies=["Python", "Go"],
            order=0,
        )
        self.exp2 = Experience.objects.create(
            user=self.user,
            company="Beta Systems",
            role="Software Engineer",
            start_date="2020",
            end_date="2022",
            bullet_points=["Maintained PostgreSQL database.", "Optimized search queries."],
            technologies=["SQL", "Django"],
            order=1,
        )
        self.cert = Certification.objects.create(
            user=self.user,
            name="AWS Certified Developer",
            issuer="Amazon Web Services",
            issue_date="2023",
        )
        self.app = JobApplication.objects.create(
            user=self.user,
            company_name="Acme AI",
            job_title="Senior Python Backend Engineer",
            raw_description="Looking for an experienced engineer to scale distributed Python systems.",
        )

    def test_tailor_preserves_master_experiences_when_model_omits_them(self):
        mock_tailored_response = {
            "match_score": 88,
            "extracted_keywords": ["Python", "Microservices"],
            "tailoring_rationale": "Emphasized microservices experience.",
            "tailored_profile": {"headline": "Senior Distributed Systems Engineer"},
            "tailored_experiences": [
                {
                    "company": "Alpha Corp",
                    "role": "Senior Software Engineer",
                    "bullet_points": ["Engineered high-throughput microservices architecture with Python."],
                    "technologies": ["Python", "FastAPI"],
                }
            ],
            "tailored_projects": [],
            "tailored_skills": [{"category": "Languages", "skills": ["Python", "Go"]}],
            "cover_letter_body": "I am excited to apply for Senior Python Backend Engineer at Acme AI.",
        }

        with patch.object(OllamaService, "chat_json_sync", return_value=mock_tailored_response):
            TailorService.tailor_for_job(self.user, self.app)

        resume_doc = TailoredDocument.objects.get(application=self.app, doc_type="resume")
        self.assertIn("Alpha Corp", resume_doc.latex_source)
        self.assertIn("Engineered high-throughput microservices architecture with Python.", resume_doc.latex_source)
        self.assertIn("Beta Systems", resume_doc.latex_source)
        self.assertIn("Maintained PostgreSQL database.", resume_doc.latex_source)
        self.assertIn("AWS Certified Developer", resume_doc.latex_source)

    def test_tailor_preserves_master_bullets_when_model_truncates(self):
        mock_tailored_response = {
            "match_score": 85,
            "extracted_keywords": ["Python"],
            "tailoring_rationale": "Targeted Python.",
            "tailored_profile": {},
            "tailored_experiences": [
                {
                    "company": "Alpha Corp",
                    "role": "Senior Software Engineer",
                    "bullet_points": ["Tailored bullet for Python."],
                }
            ],
            "tailored_projects": [],
            "tailored_skills": [],
            "cover_letter_body": "Letter body.",
        }

        with patch.object(OllamaService, "chat_json_sync", return_value=mock_tailored_response):
            TailorService.tailor_for_job(self.user, self.app)

        resume_doc = TailoredDocument.objects.get(application=self.app, doc_type="resume")
        self.assertIn("Tailored bullet for Python.", resume_doc.latex_source)
        self.assertIn("Built microservices architecture.", resume_doc.latex_source)
        self.assertIn("Led team of 4 engineers.", resume_doc.latex_source)


class OverleafExportEndpointTests(TestCase):
    def setUp(self):
        self.user, _ = User.objects.get_or_create(username="overleaf_user")
        self.client.force_login(self.user)
        self.app = JobApplication.objects.create(
            user=self.user,
            company_name="Acme Corp",
            job_title="Lead Architect",
        )
        self.doc = TailoredDocument.objects.create(
            application=self.app,
            doc_type="resume",
            latex_source=r"\documentclass{resumeforge}\begin{document}Hello World\end{document}",
        )

    def test_download_resumeforge_cls_endpoint(self):
        resp = self.client.get("/api/latex/resumeforge.cls")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp["Content-Disposition"], 'attachment; filename="resumeforge.cls"')
        self.assertIn("ProvidesClass{resumeforge}", resp.content.decode("utf-8"))

    def test_get_cls_content_json_endpoint(self):
        resp = self.client.get("/api/latex/cls-content")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("content", data)
        self.assertIn("ProvidesClass{resumeforge}", data["content"])

    def test_export_overleaf_zip_contains_main_tex_and_cls(self):
        resp = self.client.get(f"/api/documents/{self.doc.id}/export-zip")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp["Content-Type"], "application/zip")
        self.assertIn("Acme_Corp_resume_overleaf.zip", resp["Content-Disposition"])

        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            namelist = zf.namelist()
            self.assertIn("main.tex", namelist)
            self.assertIn("resumeforge.cls", namelist)
            self.assertEqual(zf.read("main.tex").decode("utf-8"), self.doc.latex_source)
            self.assertIn("ProvidesClass{resumeforge}", zf.read("resumeforge.cls").decode("utf-8"))

    def test_export_custom_overleaf_zip(self):
        payload = {
            "latex_source": r"\documentclass{resumeforge}\begin{document}Custom Overleaf\end{document}",
            "company_name": "Google",
            "doc_type": "cover_letter",
        }
        resp = self.client.post("/api/documents/export-zip-custom", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp["Content-Type"], "application/zip")
        self.assertIn("Google_cover_letter_overleaf.zip", resp["Content-Disposition"])

        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            namelist = zf.namelist()
            self.assertIn("main.tex", namelist)
            self.assertIn("resumeforge.cls", namelist)
            self.assertIn("Custom Overleaf", zf.read("main.tex").decode("utf-8"))


class SectionReviewAndDeduplicationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="reviewer_user", email="rev@test.com", password="pwd")
        self.app = JobApplication.objects.create(
            user=self.user,
            company_name="Vretta",
            job_title="Software Developer",
            raw_description="Build distributed systems on AWS and Kubernetes.",
        )
        self.doc = TailoredDocument.objects.create(
            application=self.app,
            doc_type="resume",
            latex_source=(
                r"\documentclass{resumeforge}"
                r"\begin{document}"
                r"\section{Experience}"
                r"\resumeSubheading{Software Developer}{2026 -- Present}{Vretta}{Toronto}"
                r"\resumeItemListStart"
                r"\resumeItem{Maintain AWS-hosted Kubernetes staging environments, using Terraform.}"
                r"\resumeItem{Maintained AWS-hosted Kubernetes staging environments, using Terraform to manage dashboards.}"
                r"\resumeItem{Migrated legacy CI/CD infrastructure to next-gen runners with Docker autoscalers, slashing costs 80\%.}"
                r"\resumeItem{Migrated legacy CI/CD infrastructure to next-gen runners with Docker autoscalers, slashing costs 80\% while standardizing release configurations.}"
                r"\resumeItemListEnd"
                r"\end{document}"
            ),
        )

    def test_deduplicate_bullet_points_drops_subsets_and_keeps_richer(self):
        bullets = [
            "Maintain AWS-hosted Kubernetes staging environments, using Terraform.",
            "Maintained AWS-hosted Kubernetes staging environments, using Terraform to manage dashboards.",
            "Migrated legacy CI/CD infrastructure to next-gen runners with Docker autoscalers, slashing costs 80%.",
            "Migrated legacy CI/CD infrastructure to next-gen runners with Docker autoscalers, slashing costs 80% while standardizing release configurations.",
        ]
        deduped = TailorService.deduplicate_bullet_points(bullets)
        self.assertEqual(len(deduped), 2)
        self.assertTrue(any("manage dashboards" in b for b in deduped))
        self.assertTrue(any("standardizing release configurations" in b for b in deduped))

    def test_merge_tailored_and_master_bullets(self):
        tailored = [
            "Maintained AWS-hosted Kubernetes staging environments with Terraform dashboards.",
        ]
        master = [
            "Maintain AWS-hosted Kubernetes staging environments.",
            "Led team of 4 engineers.",
        ]
        merged = TailorService.merge_tailored_and_master_bullets(tailored, master)
        self.assertEqual(len(merged), 2)
        self.assertIn("Maintained AWS-hosted Kubernetes staging environments with Terraform dashboards.", merged)
        self.assertIn("Led team of 4 engineers.", merged)

    def test_extract_latex_resume_items_handles_nested_braces(self):
        block = r"""
        \resumeItem{Engineered \textbf{\href{https://example.com}{Nested Link}} with 80\% savings.}
        \resumeItem{Second bullet item}
        """
        items = TailorService.extract_latex_resume_items(block)
        self.assertEqual(len(items), 2)
        self.assertIn(r"\textbf{\href{https://example.com}{Nested Link}}", items[0])
        self.assertEqual(items[1], "Second bullet item")

    def test_sanitize_latex_bullet_escapes_unescaped_specials(self):
        raw = "Saved 80% with 20\\% profit & reduced load on api_server #1 for $500"
        sanitized = TailorService.sanitize_latex_bullet(raw)
        self.assertIn(r"80\%", sanitized)
        self.assertIn(r"20\%", sanitized)
        self.assertIn(r"\&", sanitized)
        self.assertIn(r"api\_server", sanitized)
        self.assertIn(r"\#1", sanitized)
        self.assertIn(r"\$500", sanitized)

    @patch.object(OllamaService, "chat_json_sync")
    def test_review_bullets_with_llm_success(self, mock_chat_json):
        mock_chat_json.return_value = {
            "bullets": [
                "Maintained AWS EKS staging environments using Terraform.",
                "Migrated CI/CD infrastructure to next-gen runners, reducing costs by 80%.",
            ]
        }
        ollama = OllamaService()
        bullets = [
            "Maintain AWS-hosted Kubernetes staging environments.",
            "Maintained AWS-hosted Kubernetes staging environments with Terraform.",
            "Migrated CI/CD infrastructure.",
        ]
        reviewed = TailorService.review_bullets_with_llm(ollama, "model", "Role at Co", bullets)
        self.assertEqual(len(reviewed), 2)
        self.assertEqual(reviewed[0], "Maintained AWS EKS staging environments using Terraform.")

    @patch.object(OllamaService, "chat_json_sync", side_effect=RuntimeError("Ollama timeout"))
    def test_review_bullets_with_llm_fallback_on_error(self, mock_chat_json):
        ollama = OllamaService()
        bullets = [
            "Maintain AWS-hosted Kubernetes staging environments.",
            "Maintained AWS-hosted Kubernetes staging environments with Terraform.",
        ]
        reviewed = TailorService.review_bullets_with_llm(ollama, "model", "Role at Co", bullets)
        self.assertEqual(len(reviewed), 1)
        self.assertIn("with Terraform", reviewed[0])

    @patch.object(OllamaService, "chat_json_sync")
    def test_review_latex_document_updates_item_blocks(self, mock_chat_json):
        mock_chat_json.return_value = {
            "bullets": [
                "Maintained AWS EKS staging environments with Terraform.",
                "Migrated CI/CD to next-gen runners, slashing costs by 80%.",
            ]
        }
        reviewed_latex = TailorService.review_latex_document(self.doc.latex_source, model_name="qwen3.5:9b")
        self.assertIn(r"\resumeItem{Maintained AWS EKS staging environments with Terraform.}", reviewed_latex)
        self.assertIn(r"\resumeItem{Migrated CI/CD to next-gen runners, slashing costs by 80\%.}", reviewed_latex)
        # Verify 2 items instead of 4
        items = TailorService.extract_latex_resume_items(reviewed_latex)
        self.assertEqual(len(items), 2)

    @patch.object(OllamaService, "chat_json_sync")
    def test_review_document_sections_api_endpoint(self, mock_chat_json):
        mock_chat_json.return_value = {
            "bullets": [
                "Polished bullet 1",
                "Polished bullet 2",
            ]
        }
        self.client.force_login(self.user)
        resp = self.client.post(
            f"/api/documents/{self.doc.id}/review-sections",
            data=json.dumps({"latex_source": self.doc.latex_source}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "success")
        self.assertIn(r"\resumeItem{Polished bullet 1}", data["latex_source"])
        self.doc.refresh_from_db()
        self.assertIn(r"\resumeItem{Polished bullet 1}", self.doc.latex_source)

    @patch.object(OllamaService, "chat_json_sync")
    def test_review_custom_latex_api_endpoint(self, mock_chat_json):
        mock_chat_json.return_value = {
            "bullets": ["Ad-hoc reviewed bullet"]
        }
        raw_tex = (
            r"\documentclass{resumeforge}\begin{document}"
            r"\resumeItemListStart\resumeItem{Managed AWS cloud services}\resumeItem{Implemented Redis caching for low latency}\resumeItemListEnd"
            r"\end{document}"
        )
        resp = self.client.post(
            "/api/documents/review-latex",
            data=json.dumps({"latex_source": raw_tex}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "success")
        self.assertIn(r"\resumeItem{Ad-hoc reviewed bullet}", data["latex_source"])


class MultiProviderAIServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="provider_user", email="prov@test.com", password="pwd")

    def test_remote_ollama_includes_auth_header(self):
        service = OllamaService(
            base_url="https://remote-ollama.example.com",
            api_key="secret-ollama-token",
            provider="ollama",
        )
        headers = service._get_headers()
        self.assertEqual(headers["Authorization"], "Bearer secret-ollama-token")
        self.assertEqual(headers["Content-Type"], "application/json")

    def test_openrouter_headers_include_referer_and_title(self):
        service = OllamaService(
            base_url="https://openrouter.ai/api/v1",
            api_key="sk-or-test-key",
            provider="openrouter",
        )
        headers = service._get_headers()
        self.assertEqual(headers["Authorization"], "Bearer sk-or-test-key")
        self.assertEqual(headers["HTTP-Referer"], "https://resumeforge.dev")
        self.assertEqual(headers["X-Title"], "ResumeForge")

    @patch("httpx.Client.get")
    def test_openrouter_health_check_success(self, mock_get):
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {
            "data": [
                {"id": "meta-llama/llama-3.3-70b-instruct"},
                {"id": "qwen/qwen-2.5-72b-instruct"},
            ]
        }
        service = OllamaService(
            base_url="https://openrouter.ai/api/v1",
            api_key="sk-or-test-key",
            provider="openrouter",
        )
        res = service.check_health_sync()
        self.assertTrue(res["connected"])
        self.assertEqual(res["provider"], "openrouter")
        self.assertIn("meta-llama/llama-3.3-70b-instruct", res["models"])

    @patch("httpx.Client.post")
    def test_openrouter_chat_sync_success(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": '{"score": 90}',
                    }
                }
            ]
        }
        service = OllamaService(
            base_url="https://openrouter.ai/api/v1",
            api_key="sk-or-test-key",
            provider="openrouter",
        )
        msg = service.chat_sync(
            model="meta-llama/llama-3.3-70b-instruct",
            messages=[{"role": "user", "content": "hi"}],
            format_json=True,
        )
        self.assertEqual(msg["content"], '{"score": 90}')
        # Verify request payload
        called_kwargs = mock_post.call_args[1]
        self.assertEqual(called_kwargs["json"]["response_format"], {"type": "json_object"})
        self.assertEqual(called_kwargs["headers"]["Authorization"], "Bearer sk-or-test-key")

    def test_update_and_get_ai_settings_endpoint(self):
        self.client.force_login(self.user)
        payload = {
            "provider": "openrouter",
            "openrouter_endpoint": "https://openrouter.ai/api/v1",
            "api_key": "sk-or-test-key-123",
            "model_name": "meta-llama/llama-3.3-70b-instruct",
            "embedding_model": "nomic-embed-text",
            "temperature": 0.25,
            "custom_instructions": "Focus on high-scale systems.",
        }
        resp = self.client.post("/api/ai/settings", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(resp.status_code, 200)

        get_resp = self.client.get("/api/ai/settings")
        self.assertEqual(get_resp.status_code, 200)
        data = get_resp.json()
        self.assertEqual(data["provider"], "openrouter")
        self.assertEqual(data["openrouter_endpoint"], "https://openrouter.ai/api/v1")
        self.assertEqual(data["api_key"], "sk-or-test-key-123")
        self.assertEqual(data["model_name"], "meta-llama/llama-3.3-70b-instruct")

    @patch("httpx.Client.get")
    def test_ai_health_endpoint_with_openrouter_query_params(self, mock_get):
        self.client.force_login(self.user)
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {
            "data": [{"id": "anthropic/claude-3.5-sonnet"}]
        }
        resp = self.client.get(
            "/api/ai/health?provider=openrouter&endpoint=https://openrouter.ai/api/v1&api_key=sk-or-abc"
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["connected"])
        self.assertEqual(data["provider"], "openrouter")
        self.assertIn("anthropic/claude-3.5-sonnet", data["models"])


class LatexUnicodeAndSemanticSanitizationTests(TestCase):
    def test_unicode_hyphen_and_space_normalization(self):
        from resumes.services.latex_templates import normalize_unicode_and_latex_text

        raw = "high\u2011throughput and low\u2011latency systems with sub\u201160\u202fms latency."
        cleaned = normalize_unicode_and_latex_text(raw)
        self.assertEqual(cleaned, "high-throughput and low-latency systems with sub-60 ms latency.")

    def test_semantic_inverted_latency_correction(self):
        from resumes.services.latex_templates import normalize_unicode_and_latex_text

        raw = "cutting a multi-day manual process to minutes, boosting overall system latency."
        cleaned = normalize_unicode_and_latex_text(raw)
        self.assertIn("reducing overall pipeline latency", cleaned)
        self.assertNotIn("boosting", cleaned)

    def test_semantic_mttd_microsecond_correction(self):
        from resumes.services.latex_templates import normalize_unicode_and_latex_text

        raw = "lowered mean-time-to-detect to sub-60 µs for production anomalies."
        cleaned = normalize_unicode_and_latex_text(raw)
        self.assertIn("mean-time-to-detect to sub-60s", cleaned)
        self.assertNotIn("µs", cleaned)

    def test_semantic_trading_latency_direction_correction(self):
        from resumes.services.latex_templates import normalize_unicode_and_latex_text

        raw = "achieving sub-80 ms p99 order-to-signal latency across Alpaca and Saxo Bank APIs."
        cleaned = normalize_unicode_and_latex_text(raw)
        self.assertIn("signal-to-order latency", cleaned)
        self.assertNotIn("order-to-signal", cleaned)

    def test_misattributed_cdk_under_gcp_correction(self):
        from resumes.services.latex_templates import normalize_unicode_and_latex_text

        raw = "Cloud Platforms: AWS (EKS, Lambda, CloudWatch), GCP (GKE, CDK)"
        cleaned = normalize_unicode_and_latex_text(raw)
        self.assertIn("AWS (EKS, Lambda, CloudWatch, CDK)", cleaned)
        self.assertIn("GCP (GKE)", cleaned)
        self.assertNotIn("GCP (GKE, CDK)", cleaned)

    def test_escape_latex_comparison_operators(self):
        from resumes.services.latex_templates import escape_latex

        raw = "Scaled throughput from 20 to >1,000 ops/min with <50ms p99 latency & 80% cost savings."
        escaped = escape_latex(raw)
        self.assertIn(r"$>$1,000 ops/min", escaped)
        self.assertIn(r"$<$50ms", escaped)
        self.assertIn(r"80\%", escaped)
        self.assertIn(r"\&", escaped)

    def test_resumeforge_cls_contains_ifpdftex_unicode_mappings(self):
        from resumes.services.latex_templates import RESUMEFORGE_CLASS

        self.assertIn(r"\ifPDFTeX", RESUMEFORGE_CLASS)
        self.assertIn(r"\DeclareUnicodeCharacter{2011}{-}", RESUMEFORGE_CLASS)
        self.assertIn(r"\DeclareUnicodeCharacter{202F}{\,}", RESUMEFORGE_CLASS)
        self.assertIn(r"\RequirePackage{textcomp}", RESUMEFORGE_CLASS)

    def test_compiler_does_not_drop_hyphens_with_unicode_source(self):
        from resumes.services.latex_compiler import LatexCompiler
        import pypdf, io

        source = (
            r"\documentclass{resumeforge}" "\n"
            r"\begin{document}" "\n"
            r"\section{Experience}" "\n"
            r"\resumeSubHeadingListStart" "\n"
            r"\resumeSubheading{Software Developer}{2026 -- Present}{Vretta}{Toronto, ON}" "\n"
            r"\resumeItemListStart" "\n"
            r"  \resumeItem{Testing high" + "\u2011" + r"throughput and low" + "\u2011" + r"latency systems with $>$1,000 ops/min.}" "\n"
            r"\resumeItemListEnd" "\n"
            r"\resumeSubHeadingListEnd" "\n"
            r"\end{document}"
        )
        pdf = LatexCompiler.compile_pdf(source)
        reader = pypdf.PdfReader(io.BytesIO(pdf))
        extracted = reader.pages[0].extract_text()
        self.assertIn("high-throughput", extracted)
        self.assertIn("low-latency", extracted)
        self.assertNotIn("highthroughput", extracted)
        self.assertNotIn("lowlatency", extracted)

    def test_experience_duration_correction(self):
        from resumes.services.latex_templates import normalize_unicode_and_latex_text

        raw = "Seasoned software engineer with 2+ years designing and scaling distributed systems."
        # When expected_years is 4, it corrects undersold duration
        cleaned = normalize_unicode_and_latex_text(raw, expected_years=4)
        self.assertIn("4+ years designing and scaling", cleaned)
        self.assertNotIn("2+ years", cleaned)

        # When expected_years is None and no document dates exist, NEVER hardcode or alter
        raw_exp = "Software engineer with 2.5+ years of experience building APIs."
        cleaned_exp = normalize_unicode_and_latex_text(raw_exp, expected_years=None)
        self.assertEqual(cleaned_exp, raw_exp)

        # Inside a complete document, dates are dynamically extracted from Experience section
        doc_tex = (
            r"\documentclass{resumeforge}\begin{document}" "\n"
            r"\section{Professional Summary}" "\n"
            r"\small{Engineer with 2+ years designing and scaling services.}" "\n"
            r"\section{Experience}" "\n"
            r"\resumeSubHeadingListStart" "\n"
            r"\resumeSubheading{Software Engineer}{Jun 2022 -- Present}{Vretta}{Toronto}" "\n"
            r"\resumeSubHeadingListEnd" "\n"
            r"\end{document}"
        )
        cleaned_doc = normalize_unicode_and_latex_text(doc_tex)
        self.assertIn("4+ years designing and scaling", cleaned_doc)

    def test_math_io_delimiter_removal(self):
        from resumes.services.latex_templates import normalize_unicode_and_latex_text

        raw = "Scaled throughput by integrating async $I/O$, PostgreSQL query tuning."
        cleaned = normalize_unicode_and_latex_text(raw)
        self.assertIn("integrating asynchronous I/O, PostgreSQL", cleaned)
        self.assertNotIn("$I/O$", cleaned)
        self.assertNotIn("$", cleaned)

        raw_escaped = r"Used async \$I/O\$ and standard \$I/O\$ operations."
        cleaned_escaped = normalize_unicode_and_latex_text(raw_escaped)
        self.assertIn("asynchronous I/O", cleaned_escaped)
        self.assertIn("standard I/O operations", cleaned_escaped)

    def test_al_glyph_correction(self):
        from resumes.services.latex_templates import normalize_unicode_and_latex_text

        raw = "Building high-throughput fintech and Al-ready services with Al infrastructure."
        cleaned = normalize_unicode_and_latex_text(raw)
        self.assertIn("AI-ready services", cleaned)
        self.assertIn("AI infrastructure", cleaned)
        self.assertNotIn("Al-ready", cleaned)

        raw2 = "Expertise in fintech and Al."
        cleaned2 = normalize_unicode_and_latex_text(raw2)
        self.assertIn("fintech and AI", cleaned2)

    def test_skills_block_consolidates_to_five_lines(self):
        from resumes.services.latex_templates import normalize_unicode_and_latex_text

        raw_doc = r"""\documentclass{resumeforge}
\begin{document}
\section{Technical Skills}
\begin{itemize}[leftmargin=0.15in, label={}]
\small{\item{
\textbf{Programming Languages}{: Python, C++, Go} \\ 
\textbf{Cloud-Native \& Containerization}{: Docker, Kubernetes (EKS/GKE)} \\ 
\textbf{Infrastructure as Code}{: Terraform, AWS CDK} \\ 
\textbf{CI/CD}{: GitLab CI/CD, GitHub Actions} \\ 
\textbf{Observability}{: Prometheus, Grafana, Loki, Tempo, Sentry} \\ 
\textbf{Databases \& Caching}{: PostgreSQL, Redis. Redis Pub/Sub} \\ 
\textbf{Frameworks \& Libraries}{: Django (WSGI/ASGI), FastAPI, Celery, React, Next.js, Svelte, TypeScript} \\ 
\textbf{Tools \& Version Control}{: Git} \\ 
\textbf{Testing}{: Pytest} \\ 
\textbf{APIs \& Messaging}{: RESTful APIs, WebSockets, Ingestion Pipelines} \\ 
\textbf{DevOps \& Cloud}{: Docker, Kubernetes (EKS/GKE), Terraform, GitLab CI/CD, GitHub Actions, AWS CDK, Nginx}
}}
\end{itemize}
\end{document}"""

        cleaned = normalize_unicode_and_latex_text(raw_doc)
        # Should now have exactly the 5 canonical headers
        self.assertIn(r"\textbf{Programming Languages}", cleaned)
        self.assertIn(r"\textbf{Frameworks \& Backend}", cleaned)
        self.assertIn(r"\textbf{Cloud \& DevOps}", cleaned)
        self.assertIn(r"\textbf{Databases \& Caching}", cleaned)
        self.assertIn(r"\textbf{Observability \& Tools}", cleaned)

        # Should not have duplicate single-item lines or duplicate DevOps block
        self.assertNotIn(r"\textbf{Tools \& Version Control}", cleaned)
        self.assertNotIn(r"\textbf{Testing}", cleaned)
        self.assertNotIn(r"\textbf{DevOps \& Cloud}", cleaned)
        self.assertNotIn(r"\textbf{Cloud-Native \& Containerization}", cleaned)

        # Typo fixed
        self.assertIn("PostgreSQL, Redis, Redis Pub/Sub", cleaned)
        self.assertNotIn("Redis. Redis", cleaned)

        # Count occurrences of Docker and Terraform: should appear only once
        self.assertEqual(cleaned.count("Docker"), 1)
        self.assertEqual(cleaned.count("Terraform"), 1)

    def test_math_delimiters_in_prose_cleaned(self):
        from resumes.services.latex_templates import normalize_unicode_and_latex_text

        raw1 = r"cutting build times from 3 min to $<40$ s."
        self.assertEqual(normalize_unicode_and_latex_text(raw1), "cutting build times from 3 min to sub-40s.")

        raw2 = r"GitHub Actions $CI/CD$ to GKE clusters."
        self.assertEqual(normalize_unicode_and_latex_text(raw2), "GitHub Actions CI/CD to GKE clusters.")

        raw3 = r"through asynchronous $1/O$ and PostgreSQL query tuning."
        self.assertEqual(normalize_unicode_and_latex_text(raw3), "through asynchronous I/O and PostgreSQL query tuning.")

    def test_al_glyph_in_platforms_and_deployment(self):
        from resumes.services.latex_templates import normalize_unicode_and_latex_text

        raw = "services for Al platforms while simplifying Al deployment with modern Al-ready tools."
        cleaned = normalize_unicode_and_latex_text(raw)
        self.assertEqual(cleaned, "services for AI platforms while simplifying AI deployment with modern AI-ready tools.")

    def test_typos_asyne_and_fastapi(self):
        from resumes.services.latex_templates import normalize_unicode_and_latex_text

        raw = "Added Redis caching and asyne task batching with Fast API backend."
        cleaned = normalize_unicode_and_latex_text(raw)
        self.assertEqual(cleaned, "Added Redis caching and async task batching with FastAPI backend.")

    def test_project_headings_right_align_links(self):
        from resumes.services.latex_templates import normalize_unicode_and_latex_text

        raw = (
            r"\resumeProjectHeading{\textbf{Alpaca Main} \enspace\textbar\enspace "
            r"\emph{Django and Celery-based real-time trading toolkit} \enspace\textbar\enspace "
            r"\emph{Django, Celery, Docker, Kubernetes, Prometheus, Grafana} \enspace\textbar\enspace "
            r"\href{https://github.com/naveedkhan1998/alpaca-main}{Code} / \href{https://alpaca.mnaveedk.com}{Live}}{}"
        )
        cleaned = normalize_unicode_and_latex_text(raw)
        expected = (
            r"\resumeProjectHeading{\textbf{Alpaca Main} \enspace\textbar\enspace "
            r"\emph{Django, Celery, Docker, Kubernetes, Prometheus, Grafana}}"
            r"{\href{https://github.com/naveedkhan1998/alpaca-main}{Code} / \href{https://alpaca.mnaveedk.com}{Live}}"
        )
        self.assertEqual(cleaned, expected)

    def test_cloud_devops_line_streamlining(self):
        from resumes.services.latex_templates import streamline_cloud_devops_items

        items = ["Docker", "Kubernetes", "AWS", "GCP", "Terraform", "GitLab CI/CD", "GitHub Actions", "AWS CDK", "Nginx", "Kubernetes (EKS/GKE)"]
        streamlined = streamline_cloud_devops_items(items)
        self.assertEqual(
            streamlined,
            ["Docker", "Kubernetes (EKS, GKE)", "Terraform", "AWS CDK", "GitLab CI/CD", "GitHub Actions", "Nginx"],
        )

    def test_education_subheadings_cleaning(self):
        from resumes.services.latex_templates import clean_education_subheadings

        raw = (
            r"\section{Education}" "\n"
            r"\resumeSubHeadingListStart" "\n"
            r"\resumeSubheading{Western University | 2023 2024}{}{Master of Engineering in Software Engineering}{|}" "\n"
            r"\resumeSubHeadingListEnd"
        )
        cleaned = clean_education_subheadings(raw)
        self.assertIn(r"\resumeSubheading{Western University}{2023 -- 2024}{Master of Engineering in Software Engineering}{}", cleaned)
        self.assertNotIn("|", cleaned)

    def test_calculate_experience_metrics_for_multi_role_career(self):
        from resumes.services.experience_calculator import calculate_experience_metrics

        exps = [
            {"company": "Vretta", "start_date": "Jan 2026", "end_date": "", "is_current": True},
            {"company": "Cypienta", "start_date": "Jan 2025", "end_date": "Jun 2025", "is_current": False},
            {"company": "RiskTec", "start_date": "Apr 2024", "end_date": "Dec 2024", "is_current": False},
            {"company": "GenioBITS", "start_date": "Jun 2022", "end_date": "Mar 2023", "is_current": False},
        ]
        metrics = calculate_experience_metrics(exps)
        self.assertEqual(metrics["display_years"], 4)
        self.assertEqual(metrics["display_str"], "4+ years")
        self.assertIn("Jun 2022 to Present", metrics["date_range_str"])

    def test_calculate_experience_metrics_junior_and_senior(self):
        from resumes.services.experience_calculator import calculate_experience_metrics

        # Junior developer (1 year)
        junior = [{"company": "Co A", "start_date": "Jan 2025", "end_date": "", "is_current": True}]
        j_metrics = calculate_experience_metrics(junior)
        self.assertEqual(j_metrics["display_years"], 1)
        self.assertEqual(j_metrics["display_str"], "1+ year")

        # Senior developer (8 years)
        senior = [{"company": "Co B", "start_date": "May 2018", "end_date": "Present", "is_current": True}]
        s_metrics = calculate_experience_metrics(senior)
        self.assertEqual(s_metrics["display_years"], 8)
        self.assertEqual(s_metrics["display_str"], "8+ years")

        # Empty experiences
        empty_metrics = calculate_experience_metrics([])
        self.assertEqual(empty_metrics["display_years"], 0)
        self.assertEqual(empty_metrics["display_str"], "early-career")

    def test_calculate_experience_metrics_ignores_education_dates(self):
        from resumes.services.experience_calculator import calculate_experience_metrics_from_latex

        latex_doc = r"""\documentclass{resumeforge}
\begin{document}
\section{Experience}
\resumeSubHeadingListStart
\resumeSubheading{Software Developer}{Jan 2026 -- Present}{Vretta}{Toronto, ON}
\resumeSubheading{Backend Engineer}{Jun 2022 -- Mar 2023}{GenioBITS}{Remote}
\resumeSubHeadingListEnd
\section{Education}
\resumeSubHeadingListStart
\resumeSubheading{University of Waterloo}{2017 -- 2021}{Bachelor of Science}{}
\resumeSubHeadingListEnd
\end{document}"""

        metrics = calculate_experience_metrics_from_latex(latex_doc)
        # Should be 4 years based on June 2022 to Present, NOT 9 years based on 2017 education!
        self.assertEqual(metrics["display_years"], 4)
        self.assertEqual(metrics["display_str"], "4+ years")

    def test_normalize_experience_duration_no_hardcoding(self):
        from resumes.services.experience_calculator import normalize_experience_duration_text

        text = "Software engineer with 2+ years designing distributed systems."

        # If expected_years is None, DO NOT alter
        self.assertEqual(normalize_experience_duration_text(text, None), text)

        # If expected_years is 2, DO NOT alter (matches)
        self.assertEqual(normalize_experience_duration_text(text, 2), text)

        # If expected_years is 6, alter 2+ to 6+
        self.assertIn("6+ years designing", normalize_experience_duration_text(text, 6))

    def test_dynamic_prompt_builder_injects_calculated_tenure(self):
        from resumes.services.tailor_service import build_tailor_system_prompt, build_review_system_prompt

        metrics_4y = {"display_years": 4, "display_str": "4+ years", "date_range_str": "Jun 2022 to Present"}
        tailor_prompt_4y = build_tailor_system_prompt(metrics_4y)
        self.assertIn("Candidate has 4+ years of professional engineering experience (Jun 2022 to Present)", tailor_prompt_4y)
        self.assertNotIn("across GenioBITS", tailor_prompt_4y)

        metrics_8y = {"display_years": 8, "display_str": "8+ years", "date_range_str": "May 2018 to Present"}
        review_prompt_8y = build_review_system_prompt(metrics_8y)
        self.assertIn("Candidate has 8+ years of professional engineering experience (May 2018 to Present)", review_prompt_8y)





