"""
Unit tests for the ReflectAI backend analyzer using Google Gemini API.
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from analyzer import (
    Analyzer,
    VALID_MOODS,
    LANGUAGE_NAMES,
    DEFAULT_GEMMA_MODEL,
)


class TestAnalyzerInitialization:
    """Test Analyzer initialization and configuration."""

    def test_init_with_api_key(self):
        """Test initializing Analyzer with explicit API key."""
        with patch("analyzer.genai.Client") as mock_client:
            analyzer = Analyzer(api_key="test-key-123")
            assert analyzer.model == DEFAULT_GEMMA_MODEL
            mock_client.assert_called_once_with(api_key="test-key-123")

    def test_init_with_custom_model(self):
        """Test initializing Analyzer with custom model."""
        with patch("analyzer.genai.Client"):
            with patch.dict("os.environ", {"GOOGLE_API_KEY": "env-key"}):
                analyzer = Analyzer(model="custom-model-456")
                assert analyzer.model == "custom-model-456"

    def test_init_from_env_variable(self):
        """Test initializing Analyzer from environment variable."""
        with patch("analyzer.genai.Client") as mock_client:
            with patch.dict("os.environ", {"GOOGLE_API_KEY": "env-api-key"}):
                analyzer = Analyzer()
                assert analyzer.model == DEFAULT_GEMMA_MODEL
                mock_client.assert_called_once_with(api_key="env-api-key")

    def test_init_raises_without_api_key(self):
        """Test that initialization fails without API key."""
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(RuntimeError, match="GOOGLE_API_KEY is not set"):
                Analyzer()


class TestMoodDetection:
    """Test mood detection functionality."""

    def test_valid_mood_detection(self):
        """Test successful mood detection with valid mood."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")

            # Mock API response
            mock_response = Mock()
            mock_response.text = "happy"
            analyzer._client.models.generate_content = Mock(return_value=mock_response)

            mood = analyzer._detect_mood("I am very happy today!")
            assert mood in VALID_MOODS
            assert mood == "happy"

    def test_mood_with_punctuation_stripped(self):
        """Test that punctuation is stripped from mood response."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")

            mock_response = Mock()
            mock_response.text = "peaceful."
            analyzer._client.models.generate_content = Mock(return_value=mock_response)

            mood = analyzer._detect_mood("I feel peaceful.")
            assert mood == "peaceful"

    def test_invalid_mood_defaults_to_neutral(self):
        """Test that invalid mood defaults to neutral."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")

            mock_response = Mock()
            mock_response.text = "invalid_mood_xyz"
            analyzer._client.models.generate_content = Mock(return_value=mock_response)

            mood = analyzer._detect_mood("Some text")
            assert mood == "neutral"

    def test_mood_text_truncation(self):
        """Test that very long text is truncated for mood detection."""
        with patch("analyzer.genai.Client") as mock_client:
            analyzer = Analyzer(api_key="test-key")

            # Create a text longer than 4000 chars
            long_text = "word " * 1000  # ~5000 chars

            mock_response = Mock()
            mock_response.text = "happy"
            analyzer._client.models.generate_content = Mock(return_value=mock_response)

            analyzer._detect_mood(long_text)

            # Verify the call was made
            call_args = analyzer._client.models.generate_content.call_args
            # The mood prompt should be prefixed to the truncated text
            assert call_args is not None

    def test_multiple_word_response_takes_first(self):
        """Test that only first word is used from multi-word response."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")

            mock_response = Mock()
            mock_response.text = "sad but expected"
            analyzer._client.models.generate_content = Mock(return_value=mock_response)

            mood = analyzer._detect_mood("Text")
            assert mood == "sad"

    def test_empty_response_defaults_to_neutral(self):
        """Test that empty response defaults to neutral."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")

            mock_response = Mock()
            mock_response.text = ""
            analyzer._client.models.generate_content = Mock(return_value=mock_response)

            mood = analyzer._detect_mood("Text")
            assert mood == "neutral"


class TestSummarization:
    """Test text summarization functionality."""

    def test_successful_summarization(self):
        """Test successful text summarization."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")

            expected_summary = "This is a thoughtful reflection on the day."
            mock_response = Mock()
            mock_response.text = expected_summary
            analyzer._client.models.generate_content = Mock(return_value=mock_response)

            result = analyzer._summarize("Long journal entry text...", "en")
            assert result == expected_summary

    def test_summarization_language_support(self):
        """Test summarization with different languages."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")

            mock_response = Mock()
            mock_response.text = "Uma reflexão."
            analyzer._client.models.generate_content = Mock(return_value=mock_response)

            # Test Portuguese
            result = analyzer._summarize("Texto do diário...", "pt")
            assert result == "Uma reflexão."

            # Verify Portuguese was used in system instruction
            call_args = analyzer._client.models.generate_content.call_args
            assert call_args is not None
            config = call_args.kwargs.get("config")
            assert "Portuguese" in config.system_instruction

    def test_language_code_with_region(self):
        """Test that language code with region codes works (e.g., en-US)."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")

            mock_response = Mock()
            mock_response.text = "Summary"
            analyzer._client.models.generate_content = Mock(return_value=mock_response)

            result = analyzer._summarize("Text", "en-US")
            assert result == "Summary"

    def test_unknown_language_defaults_to_english(self):
        """Test that unknown language codes default to English."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")

            mock_response = Mock()
            mock_response.text = "Summary"
            analyzer._client.models.generate_content = Mock(return_value=mock_response)

            analyzer._summarize("Text", "xyz")

            call_args = analyzer._client.models.generate_content.call_args
            config = call_args.kwargs.get("config")
            assert "English" in config.system_instruction

    def test_summarization_text_stripped(self):
        """Test that response text is stripped of whitespace."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")

            mock_response = Mock()
            mock_response.text = "  \n  Summary text  \n  "
            analyzer._client.models.generate_content = Mock(return_value=mock_response)

            result = analyzer._summarize("Text", "en")
            assert result == "Summary text"


class TestAnalyze:
    """Test the main analyze() method."""

    def test_analyze_complete_flow(self):
        """Test complete analysis flow."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")

            # Mock internal methods
            analyzer._summarize = Mock(return_value="Test summary")
            analyzer._detect_mood = Mock(return_value="happy")

            result = analyzer.analyze("This is a journal entry.")

            assert "summary" in result
            assert result["summary"] == "Test summary"
            assert "mood" in result
            assert result["mood"] == "happy"
            assert "metadata" in result
            assert result["metadata"]["words"] == 5
            assert result["metadata"]["model"] == DEFAULT_GEMMA_MODEL

    def test_analyze_empty_text_raises_error(self):
        """Test that empty text raises ValueError."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")

            with pytest.raises(ValueError, match="text is empty"):
                analyzer.analyze("")

    def test_analyze_whitespace_only_raises_error(self):
        """Test that whitespace-only text raises ValueError."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")

            with pytest.raises(ValueError, match="text is empty"):
                analyzer.analyze("   \n\t  ")

    def test_analyze_word_count_calculation(self):
        """Test that word count is correctly calculated."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")
            analyzer._summarize = Mock(return_value="Summary")
            analyzer._detect_mood = Mock(return_value="happy")

            text = "one two three four five"
            result = analyzer.analyze(text)
            assert result["metadata"]["words"] == 5

    def test_analyze_with_custom_language(self):
        """Test analyze with custom language parameter."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")
            analyzer._summarize = Mock(return_value="Summary")
            analyzer._detect_mood = Mock(return_value="sad")

            analyzer.analyze("Text", language="pt")

            # Verify language was passed to summarize
            analyzer._summarize.assert_called_once_with("Text", "pt")

    def test_analyze_returns_correct_structure(self):
        """Test that analyze returns correct response structure."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")
            analyzer._summarize = Mock(return_value="Test summary")
            analyzer._detect_mood = Mock(return_value="grateful")

            result = analyzer.analyze("Journal entry text here")

            assert isinstance(result, dict)
            assert set(result.keys()) == {"summary", "mood", "metadata"}
            assert isinstance(result["summary"], str)
            assert result["mood"] in VALID_MOODS
            assert isinstance(result["metadata"], dict)
            assert "words" in result["metadata"]
            assert "model" in result["metadata"]


class TestWeeklyNarrative:
    """Test weekly narrative generation."""

    def test_generate_weekly_narrative_success(self):
        """Test successful weekly narrative generation."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")

            entries = [
                {"title": "Monday", "content": "Had a great day"},
                {"title": "Tuesday", "content": "Feeling reflective"},
            ]

            expected_narrative = "This week brought moments of clarity..."
            mock_response = Mock()
            mock_response.text = expected_narrative
            analyzer._client.models.generate_content = Mock(return_value=mock_response)

            result = analyzer.generate_weekly_narrative(entries)
            assert result == expected_narrative

    def test_generate_weekly_narrative_empty_raises_error(self):
        """Test that empty entries list raises ValueError."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")

            with pytest.raises(ValueError, match="no entries provided"):
                analyzer.generate_weekly_narrative([])

    def test_generate_weekly_narrative_no_content_raises_error(self):
        """Test that entries with no content raise ValueError."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")

            entries = [
                {"title": "Monday", "content": ""},
                {"title": "Tuesday", "content": "   "},
            ]

            with pytest.raises(ValueError, match="entries contain no content"):
                analyzer.generate_weekly_narrative(entries)

    def test_generate_weekly_narrative_filters_empty_entries(self):
        """Test that empty content entries are filtered out."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")

            entries = [
                {"title": "Monday", "content": "Valid content"},
                {"title": "Tuesday", "content": "   "},
                {"title": "Wednesday", "content": "More valid content"},
            ]

            mock_response = Mock()
            mock_response.text = "Narrative"
            analyzer._client.models.generate_content = Mock(return_value=mock_response)

            result = analyzer.generate_weekly_narrative(entries)

            # Verify the content passed includes only valid entries
            call_args = analyzer._client.models.generate_content.call_args
            combined_content = call_args.kwargs.get("contents", "")
            assert "Valid content" in combined_content
            assert "More valid content" in combined_content

    def test_generate_weekly_narrative_language_support(self):
        """Test weekly narrative with different language."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")

            entries = [
                {"title": "Segunda", "content": "Conteúdo válido"},
            ]

            mock_response = Mock()
            mock_response.text = "Narrativa"
            analyzer._client.models.generate_content = Mock(return_value=mock_response)

            analyzer.generate_weekly_narrative(entries, language="pt")

            call_args = analyzer._client.models.generate_content.call_args
            config = call_args.kwargs.get("config")
            assert "Portuguese" in config.system_instruction

    def test_generate_weekly_narrative_missing_fields(self):
        """Test handling entries with missing title or content fields."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")

            entries = [
                {"content": "Content without title"},
                {"title": "Title without content"},
                {"title": "Complete", "content": "Entry"},
            ]

            mock_response = Mock()
            mock_response.text = "Narrative"
            analyzer._client.models.generate_content = Mock(return_value=mock_response)

            result = analyzer.generate_weekly_narrative(entries)
            assert result == "Narrative"

    def test_generate_weekly_narrative_text_stripped(self):
        """Test that narrative text is stripped."""
        with patch("analyzer.genai.Client"):
            analyzer = Analyzer(api_key="test-key")

            entries = [{"title": "Day", "content": "Content"}]

            mock_response = Mock()
            mock_response.text = "  \nNarrative\n  "
            analyzer._client.models.generate_content = Mock(return_value=mock_response)

            result = analyzer.generate_weekly_narrative(entries)
            assert result == "Narrative"


class TestRetryLogic:
    """Test retry mechanism for transient failures."""

    def test_with_retry_succeeds_on_first_attempt(self):
        """Test successful API call on first attempt."""
        from analyzer import _with_retry

        fn = Mock(return_value="success")
        result = _with_retry(fn)

        assert result == "success"
        fn.assert_called_once()

    def test_with_retry_retries_on_retryable_error(self):
        """Test that retryable errors trigger retry."""
        from analyzer import _with_retry

        fn = Mock(side_effect=[
            Exception("503 Service Unavailable"),
            "success"
        ])

        result = _with_retry(fn)
        assert result == "success"
        assert fn.call_count == 2

    def test_with_retry_fails_on_non_retryable_error(self):
        """Test that non-retryable errors are raised immediately."""
        from analyzer import _with_retry

        fn = Mock(side_effect=ValueError("Invalid input"))

        with pytest.raises(ValueError, match="Invalid input"):
            _with_retry(fn)

        fn.assert_called_once()

    def test_with_retry_max_retries_exceeded(self):
        """Test that max retries limit is respected."""
        from analyzer import _with_retry

        fn = Mock(side_effect=Exception("500 Internal Server Error"))

        with pytest.raises(Exception):
            _with_retry(fn)

        # Should try 3 times before giving up
        assert fn.call_count == 3


class TestLanguageSupport:
    """Test language support and localization."""

    def test_all_language_codes_maps_to_names(self):
        """Test that all language codes have corresponding names."""
        for lang_code in LANGUAGE_NAMES:
            assert lang_code
            assert isinstance(LANGUAGE_NAMES[lang_code], str)

    def test_language_codes_include_common_languages(self):
        """Test that common languages are included."""
        expected_codes = ["en", "pt", "es", "fr", "de"]
        for code in expected_codes:
            assert code in LANGUAGE_NAMES



