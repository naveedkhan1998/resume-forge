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

