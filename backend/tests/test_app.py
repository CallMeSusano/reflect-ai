"""
Unit tests for the ReflectAI FastAPI application.
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch, MagicMock
from io import BytesIO
import sys
import os


@pytest.fixture
def app_client():
    """Create a test client for the FastAPI app with mocked Analyzer."""
    from app import app, _analyzer
    client = TestClient(app)

    # Patch the global analyzer instance
    with patch.object(_analyzer, "analyze", new_callable=Mock) as mock_analyze:
        with patch.object(_analyzer, "generate_weekly_narrative", new_callable=Mock) as mock_weekly:
            # Store the mocks on a mock object for easier access in tests
            mock_analyzer = Mock()
            mock_analyzer.analyze = mock_analyze
            mock_analyzer.generate_weekly_narrative = mock_weekly
            mock_analyzer.model = _analyzer.model
            yield client, mock_analyzer


class TestHealthEndpoint:
    """Test the health check endpoint."""

    def test_health_returns_ok_status(self, app_client):
        """Test that health endpoint returns OK status."""
        test_client, _ = app_client
        response = test_client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["ready"] is True


class TestAnalyzeTextEndpoint:
    """Test the /analyze-text endpoint."""

    def test_analyze_text_success(self, app_client):
        """Test successful text analysis."""
        test_client, mock_analyzer = app_client

        # Mock analyzer response
        expected_response = {
            "summary": "Test summary",
            "mood": "happy",
            "metadata": {"words": 5, "model": "gemma-4-26b-a4b-it"}
        }
        mock_analyzer.analyze.return_value = expected_response

        response = test_client.post(
            "/analyze-text",
            json={"text": "This is a test entry"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["summary"] == "Test summary"
        assert data["mood"] == "happy"
        assert data["metadata"]["words"] == 5

    def test_analyze_text_with_language(self, app_client):
        """Test text analysis with custom language."""
        test_client, mock_analyzer = app_client

        expected_response = {
            "summary": "Teste de resumo",
            "mood": "sad",
            "metadata": {"words": 4, "model": "gemma-4-26b-a4b-it"}
        }
        mock_analyzer.analyze.return_value = expected_response

        response = test_client.post(
            "/analyze-text",
            json={"text": "Este é um teste", "language": "pt"}
        )

        assert response.status_code == 200
        # Verify language was passed to analyzer
        mock_analyzer.analyze.assert_called_once_with("Este é um teste", language="pt")

    def test_analyze_text_empty_text_returns_400(self, app_client):
        """Test that empty text returns 400 Bad Request."""
        test_client, mock_analyzer = app_client

        response = test_client.post(
            "/analyze-text",
            json={"text": ""}
        )

        assert response.status_code == 400
        data = response.json()
        assert "text is required" in data["detail"]

    def test_analyze_text_whitespace_only_returns_400(self, app_client):
        """Test that whitespace-only text returns 400 Bad Request."""
        test_client, mock_analyzer = app_client

        response = test_client.post(
            "/analyze-text",
            json={"text": "   \n\t  "}
        )

        assert response.status_code == 400

    def test_analyze_text_no_text_field_returns_400(self, app_client):
        """Test that missing text field returns 400."""
        test_client, mock_analyzer = app_client

        response = test_client.post(
            "/analyze-text",
            json={}
        )

        assert response.status_code in (400, 422)  # Validation error

    def test_analyze_text_analyzer_value_error(self, app_client):
        """Test that ValueError from analyzer returns 400."""
        test_client, mock_analyzer = app_client

        mock_analyzer.analyze.side_effect = ValueError("Invalid input")

        response = test_client.post(
            "/analyze-text",
            json={"text": "Some text"}
        )

        assert response.status_code == 400
        assert "Invalid input" in response.json()["detail"]

    def test_analyze_text_analyzer_generic_error(self, app_client):
        """Test that generic exception from analyzer returns 502."""
        test_client, mock_analyzer = app_client

        mock_analyzer.analyze.side_effect = Exception("API error")

        response = test_client.post(
            "/analyze-text",
            json={"text": "Some text"}
        )

        assert response.status_code == 502
        assert "analysis failed" in response.json()["detail"]

    def test_analyze_text_default_language(self, app_client):
        """Test that default language is used when not specified."""
        test_client, mock_analyzer = app_client

        mock_analyzer.analyze.return_value = {
            "summary": "Summary",
            "mood": "neutral",
            "metadata": {"words": 1, "model": "test"}
        }

        response = test_client.post(
            "/analyze-text",
            json={"text": "Test"}
        )

        assert response.status_code == 200
        # Default language "en" should be used
        mock_analyzer.analyze.assert_called_once_with("Test", language="en")


class TestAnalyzeFileEndpoint:
    """Test the /analyze-file endpoint."""

    def test_analyze_file_txt_success(self, app_client):
        """Test successful file analysis with .txt file."""
        test_client, mock_analyzer = app_client

        expected_response = {
            "summary": "File summary",
            "mood": "peaceful",
            "metadata": {"words": 10, "model": "gemma-4-26b-a4b-it"}
        }
        mock_analyzer.analyze.return_value = expected_response

        file_content = b"This is file content"
        response = test_client.post(
            "/analyze-file",
            files={"file": ("test.txt", BytesIO(file_content), "text/plain")}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["summary"] == "File summary"
        assert data["mood"] == "peaceful"

    def test_analyze_file_non_txt_returns_400(self, app_client):
        """Test that non-.txt files return 400."""
        test_client, mock_analyzer = app_client

        file_content = b"Test content"
        response = test_client.post(
            "/analyze-file",
            files={"file": ("test.pdf", BytesIO(file_content), "application/pdf")}
        )

        assert response.status_code == 400
        assert "only .txt files are supported" in response.json()["detail"]

    def test_analyze_file_invalid_utf8_returns_400(self, app_client):
        """Test that files with invalid UTF-8 return 400."""
        test_client, mock_analyzer = app_client

        # Invalid UTF-8 byte sequence
        file_content = b"\x80\x81\x82\x83"
        response = test_client.post(
            "/analyze-file",
            files={"file": ("test.txt", BytesIO(file_content), "text/plain")}
        )

        assert response.status_code == 400
        assert "unable to decode file as utf-8 text" in response.json()["detail"]

    def test_analyze_file_empty_file_returns_400(self, app_client):
        """Test that empty files return 400."""
        test_client, mock_analyzer = app_client

        file_content = b""
        response = test_client.post(
            "/analyze-file",
            files={"file": ("test.txt", BytesIO(file_content), "text/plain")}
        )

        assert response.status_code == 400
        assert "file is empty" in response.json()["detail"]

    def test_analyze_file_whitespace_only_returns_400(self, app_client):
        """Test that whitespace-only files return 400."""
        test_client, mock_analyzer = app_client

        file_content = b"   \n\t  "
        response = test_client.post(
            "/analyze-file",
            files={"file": ("test.txt", BytesIO(file_content), "text/plain")}
        )

        assert response.status_code == 400
        assert "file is empty" in response.json()["detail"]

    def test_analyze_file_analyzer_value_error(self, app_client):
        """Test that ValueError from analyzer returns 400."""
        test_client, mock_analyzer = app_client

        mock_analyzer.analyze.side_effect = ValueError("Content error")

        file_content = b"Test content"
        response = test_client.post(
            "/analyze-file",
            files={"file": ("test.txt", BytesIO(file_content), "text/plain")}
        )

        assert response.status_code == 400
        assert "Content error" in response.json()["detail"]

    def test_analyze_file_analyzer_generic_error(self, app_client):
        """Test that generic exception from analyzer returns 502."""
        test_client, mock_analyzer = app_client

        mock_analyzer.analyze.side_effect = Exception("Backend error")

        file_content = b"Test content"
        response = test_client.post(
            "/analyze-file",
            files={"file": ("test.txt", BytesIO(file_content), "text/plain")}
        )

        assert response.status_code == 502
        assert "analysis failed" in response.json()["detail"]

    def test_analyze_file_default_language(self, app_client):
        """Test that default language is passed to analyzer."""
        test_client, mock_analyzer = app_client

        mock_analyzer.analyze.return_value = {
            "summary": "Summary",
            "mood": "happy",
            "metadata": {"words": 5, "model": "test"}
        }

        file_content = b"Test content here"
        response = test_client.post(
            "/analyze-file",
            files={"file": ("test.txt", BytesIO(file_content), "text/plain")}
        )

        assert response.status_code == 200
        # Analyzer should be called with default language "en"
        mock_analyzer.analyze.assert_called_once()


class TestAnalyzeWeeklyEndpoint:
    """Test the /analyze-weekly endpoint."""

    def test_analyze_weekly_success(self, app_client):
        """Test successful weekly narrative generation."""
        test_client, mock_analyzer = app_client

        expected_narrative = "This week brought important realizations..."
        mock_analyzer.generate_weekly_narrative.return_value = expected_narrative

        entries = [
            {"title": "Monday", "content": "Had a productive day"},
            {"title": "Tuesday", "content": "Felt reflective"},
            {"title": "Wednesday", "content": "Made progress"},
        ]

        response = test_client.post(
            "/analyze-weekly",
            json={"entries": entries}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["narrative"] == expected_narrative
        assert data["metadata"]["num_entries"] == 3
        assert "model" in data["metadata"]

    def test_analyze_weekly_with_language(self, app_client):
        """Test weekly narrative with custom language."""
        test_client, mock_analyzer = app_client

        mock_analyzer.generate_weekly_narrative.return_value = "Narrativa semanal"

        entries = [
            {"title": "Segunda", "content": "Conteúdo"},
        ]

        response = test_client.post(
            "/analyze-weekly",
            json={"entries": entries, "language": "pt"}
        )

        assert response.status_code == 200
        # Verify language was passed
        mock_analyzer.generate_weekly_narrative.assert_called_once()
        call_args = mock_analyzer.generate_weekly_narrative.call_args
        assert call_args.kwargs.get("language") == "pt"

    def test_analyze_weekly_empty_entries_returns_400(self, app_client):
        """Test that empty entries list returns 400."""
        test_client, mock_analyzer = app_client

        response = test_client.post(
            "/analyze-weekly",
            json={"entries": []}
        )

        assert response.status_code == 400
        assert "entries are required" in response.json()["detail"]

    def test_analyze_weekly_no_entries_field_returns_400(self, app_client):
        """Test that missing entries field returns 422."""
        test_client, mock_analyzer = app_client

        response = test_client.post(
            "/analyze-weekly",
            json={}
        )

        assert response.status_code == 422

    def test_analyze_weekly_analyzer_value_error(self, app_client):
        """Test that ValueError from analyzer returns 400."""
        test_client, mock_analyzer = app_client

        mock_analyzer.generate_weekly_narrative.side_effect = ValueError("No valid entries")

        entries = [{"title": "Day", "content": ""}]
        response = test_client.post(
            "/analyze-weekly",
            json={"entries": entries}
        )

        assert response.status_code == 400
        assert "No valid entries" in response.json()["detail"]

    def test_analyze_weekly_analyzer_generic_error(self, app_client):
        """Test that generic exception from analyzer returns 502."""
        test_client, mock_analyzer = app_client

        mock_analyzer.generate_weekly_narrative.side_effect = Exception("API timeout")

        entries = [{"title": "Day", "content": "Content"}]
        response = test_client.post(
            "/analyze-weekly",
            json={"entries": entries}
        )

        assert response.status_code == 502
        assert "analysis failed" in response.json()["detail"]

    def test_analyze_weekly_default_language(self, app_client):
        """Test that default language is used when not specified."""
        test_client, mock_analyzer = app_client

        mock_analyzer.generate_weekly_narrative.return_value = "Narrative"

        entries = [{"title": "Day", "content": "Content"}]
        response = test_client.post(
            "/analyze-weekly",
            json={"entries": entries}
        )

        assert response.status_code == 200
        # Default language "en" should be used
        call_args = mock_analyzer.generate_weekly_narrative.call_args
        assert call_args.kwargs.get("language") == "en"

    def test_analyze_weekly_multiple_entries(self, app_client):
        """Test weekly narrative with multiple entries."""
        test_client, mock_analyzer = app_client

        mock_analyzer.generate_weekly_narrative.return_value = "Week narrative"

        entries = [
            {"title": f"Day {i}", "content": f"Content {i}"} for i in range(7)
        ]

        response = test_client.post(
            "/analyze-weekly",
            json={"entries": entries}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["metadata"]["num_entries"] == 7

    def test_analyze_weekly_metadata_includes_model(self, app_client):
        """Test that metadata includes the used model."""
        test_client, mock_analyzer = app_client

        mock_analyzer.generate_weekly_narrative.return_value = "Narrative"
        mock_analyzer.model = "gemma-4-26b-a4b-it"

        entries = [{"title": "Day", "content": "Content"}]
        response = test_client.post(
            "/analyze-weekly",
            json={"entries": entries}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["metadata"]["model"] == "gemma-4-26b-a4b-it"


class TestResponseModels:
    """Test that responses match the defined Pydantic models."""

    def test_analyze_text_response_structure(self, app_client):
        """Test that analyze-text response follows AnalyzeResponse model."""
        test_client, mock_analyzer = app_client

        mock_analyzer.analyze.return_value = {
            "summary": "Summary text",
            "mood": "happy",
            "metadata": {
                "words": 100,
                "model": "gemma-4-26b-a4b-it"
            }
        }

        response = test_client.post(
            "/analyze-text",
            json={"text": "Journal entry text"}
        )

        assert response.status_code == 200
        data = response.json()
        # Check required fields
        assert "summary" in data
        assert "mood" in data
        assert "metadata" in data

    def test_analyze_weekly_response_structure(self, app_client):
        """Test that analyze-weekly response follows WeeklyNarrativeResponse model."""
        test_client, mock_analyzer = app_client

        mock_analyzer.model = "test-model"
        mock_analyzer.generate_weekly_narrative.return_value = "Week narrative"

        entries = [{"title": "Day", "content": "Content"}]
        response = test_client.post(
            "/analyze-weekly",
            json={"entries": entries}
        )

        assert response.status_code == 200
        data = response.json()
        # Check required fields
        assert "narrative" in data
        assert "metadata" in data
        assert isinstance(data["narrative"], str)
        assert isinstance(data["metadata"], dict)


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_analyze_text_with_very_long_text(self, app_client):
        """Test analyzing very long text."""
        test_client, mock_analyzer = app_client

        mock_analyzer.analyze.return_value = {
            "summary": "Long text summary",
            "mood": "thoughtful",
            "metadata": {"words": 10000, "model": "test"}
        }

        long_text = " ".join(["word"] * 10000)
        response = test_client.post(
            "/analyze-text",
            json={"text": long_text}
        )

        assert response.status_code == 200

    def test_analyze_text_with_special_characters(self, app_client):
        """Test analyzing text with special characters."""
        test_client, mock_analyzer = app_client

        mock_analyzer.analyze.return_value = {
            "summary": "Special chars summary",
            "mood": "happy",
            "metadata": {"words": 5, "model": "test"}
        }

        special_text = "Café ☕ with émojis 🎉 and symbols: @#$%"
        response = test_client.post(
            "/analyze-text",
            json={"text": special_text}
        )

        assert response.status_code == 200

    def test_analyze_text_with_multiple_languages(self, app_client):
        """Test analyzing text with mixed languages."""
        test_client, mock_analyzer = app_client

        mock_analyzer.analyze.return_value = {
            "summary": "Mixed language summary",
            "mood": "neutral",
            "metadata": {"words": 6, "model": "test"}
        }

        mixed_text = "Hello world Olá mundo Hola mundo"
        response = test_client.post(
            "/analyze-text",
            json={"text": mixed_text}
        )

        assert response.status_code == 200






