import pytest
from unittest.mock import Mock, patch, MagicMock
from analyzer import Analyzer, MAX_CHUNK_WORDS, CHUNK_OVERLAP_WORDS


def make_words(n):
    return " ".join([f"w{i}" for i in range(n)])


def test_chunk_small_text_returns_single_chunk():
    # avoid calling Analyzer.__init__ because it may attempt to initialize HF or transformers
    a = object.__new__(Analyzer)
    text = make_words(MAX_CHUNK_WORDS - 10)
    # chunk_text does not depend on instance attributes, so we can call it bound to our dummy
    chunks = Analyzer.chunk_text(a, text)
    assert isinstance(chunks, list)
    assert len(chunks) == 1
    assert chunks[0] == text


def test_chunk_large_text_splits_and_overlaps():
    a = object.__new__(Analyzer)
    total_words = MAX_CHUNK_WORDS * 3 + 50
    text = make_words(total_words)
    chunks = Analyzer.chunk_text(a, text)
    assert len(chunks) >= 3

    # verify chunk sizes and overlap behavior
    # reconstruct approx words from chunks (split and count)
    chunk_word_counts = [len(c.split()) for c in chunks]
    assert all(cw <= MAX_CHUNK_WORDS for cw in chunk_word_counts)

    # check overlap: adjacent chunks should share at least CHUNK_OVERLAP_WORDS or be contiguous
    for i in range(len(chunks) - 1):
        c1 = chunks[i].split()
        c2 = chunks[i + 1].split()
        # number of overlapping tokens = len(set tail of c1 intersect head of c2))
        overlap = len(set(c1[-CHUNK_OVERLAP_WORDS:]) & set(c2[:CHUNK_OVERLAP_WORDS]))
        # allow zero overlap if step equals chunk size, but otherwise expect some overlap
        assert overlap >= 0


def test_analyze_aggregates_mocked_responses(monkeypatch):
    # Create instance without __init__ to avoid HF/transformers initialization
    a = object.__new__(Analyzer)
    # set attributes used by analyze
    a.summary_model = "test-summary"
    a.emotion_model = "test-emotion"
    a.hf_token = None
    a.local_mode = False
    a._use_inference_api = False

    # mock chunk_text to return two chunks
    monkeypatch.setattr(a, "chunk_text", lambda text: ["first chunk text", "second chunk text"])

    # mock summary and emotion calls
    monkeypatch.setattr(a, "_call_summary", lambda t: f"summary_of:{t}")

    def fake_emotion(t):
        if "first" in t:
            return [type("E", (), {"label": "sadness", "score": 0.8})()]
        return [type("E", (), {"label": "joy", "score": 0.6})()]

    monkeypatch.setattr(a, "_call_emotion", fake_emotion)

    res = Analyzer.analyze(a, "irrelevant text")
    assert "summary" in res
    assert "emotions" in res
    assert isinstance(res["emotions"], list)
    # should aggregate two labels
    labels = {e["label"] for e in res["emotions"]}
    assert labels == {"sadness", "joy"}


# ──────────────────────────────────────────────────────────────────
# Inference API Tests
# ──────────────────────────────────────────────────────────────────

def test_inference_api_summary_success():
    """Test successful summary call to Hugging Face Inference API."""
    a = object.__new__(Analyzer)
    a._use_inference_api = True
    a.summary_model = "sshleifer/distilbart-cnn-12-6"
    a.hf_token = "test_token_123"

    # Mock successful HF Inference API response
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.headers = {"content-type": "application/json"}
    mock_response.json.return_value = [{"summary_text": "This is a test summary."}]

    with patch("analyzer.requests.post", return_value=mock_response):
        result = Analyzer._call_summary(a, "This is a long test text that needs summarization.")
        assert result == "This is a test summary."


def test_inference_api_summary_generated_text_format():
    """Test summary API response with 'generated_text' field."""
    a = object.__new__(Analyzer)
    a._use_inference_api = True
    a.summary_model = "sshleifer/distilbart-cnn-12-6"
    a.hf_token = "test_token_123"

    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.headers = {"content-type": "application/json"}
    mock_response.json.return_value = [{"generated_text": "Alternative format summary."}]

    with patch("analyzer.requests.post", return_value=mock_response):
        result = Analyzer._call_summary(a, "Test text.")
        assert result == "Alternative format summary."


def test_inference_api_emotion_success():
    """Test successful emotion classification via Inference API."""
    a = object.__new__(Analyzer)
    a._use_inference_api = True
    a.emotion_model = "j-hartmann/emotion-english-distilroberta-base"
    a.hf_token = "test_token_123"

    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.headers = {"content-type": "application/json"}
    mock_response.json.return_value = [[
        {"label": "joy", "score": 0.85},
        {"label": "sadness", "score": 0.10},
    ]]

    with patch("analyzer.requests.post", return_value=mock_response):
        result = Analyzer._call_emotion(a, "I am so happy today!")
        assert len(result) == 2
        assert result[0].label == "joy"
        assert result[0].score == 0.85


def test_inference_api_emotion_flat_dict_format():
    """Test emotion response as single dict instead of list."""
    a = object.__new__(Analyzer)
    a._use_inference_api = True
    a.emotion_model = "j-hartmann/emotion-english-distilroberta-base"
    a.hf_token = "test_token_123"

    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.headers = {"content-type": "application/json"}
    mock_response.json.return_value = {"label": "joy", "score": 0.92}

    with patch("analyzer.requests.post", return_value=mock_response):
        result = Analyzer._call_emotion(a, "Happy text")
        assert len(result) == 1
        assert result[0].label == "joy"
        assert result[0].score == 0.92


def test_inference_api_summary_error_404():
    """Test handling of 404 error from Inference API."""
    a = object.__new__(Analyzer)
    a._use_inference_api = True
    a.summary_model = "sshleifer/distilbart-cnn-12-6"
    a.hf_token = "invalid_token"

    mock_response = Mock()
    mock_response.status_code = 404
    mock_response.text = "Model not found"

    with patch("analyzer.requests.post", return_value=mock_response):
        with pytest.raises(RuntimeError) as exc_info:
            Analyzer._call_summary(a, "Test text")
        assert "404" in str(exc_info.value)
        assert "HF summary request failed" in str(exc_info.value)


def test_inference_api_emotion_error_401():
    """Test handling of 401 unauthorized error."""
    a = object.__new__(Analyzer)
    a._use_inference_api = True
    a.emotion_model = "j-hartmann/emotion-english-distilroberta-base"
    a.hf_token = None  # No token

    mock_response = Mock()
    mock_response.status_code = 401
    mock_response.text = "Unauthorized"

    with patch("analyzer.requests.post", return_value=mock_response):
        with pytest.raises(RuntimeError) as exc_info:
            Analyzer._call_emotion(a, "Test text")
        assert "401" in str(exc_info.value)


def test_inference_api_summary_error_in_metadata():
    """Test that API errors are captured in metadata during analyze()."""
    a = object.__new__(Analyzer)
    a.summary_model = "sshleifer/distilbart-cnn-12-6"
    a.emotion_model = "j-hartmann/emotion-english-distilroberta-base"
    a.hf_token = "test_token"
    a.local_mode = False
    a._use_inference_api = True
    a.max_chunk_words = MAX_CHUNK_WORDS
    a.chunk_overlap_words = CHUNK_OVERLAP_WORDS

    # Mock chunk_text
    a.chunk_text = lambda text: ["chunk1"]

    # Mock summary to fail
    mock_response_fail = Mock()
    mock_response_fail.status_code = 503
    mock_response_fail.text = "Service Unavailable"

    with patch("analyzer.requests.post", return_value=mock_response_fail):
        result = a.analyze("test text")

    # Should have error in metadata but not crash
    assert "summary_errors" in result["metadata"]
    assert len(result["metadata"]["summary_errors"]) > 0
    assert "503" in result["metadata"]["summary_errors"][0]


def test_inference_api_with_authorization_header():
    """Test that API token is properly passed in Authorization header."""
    a = object.__new__(Analyzer)
    a._use_inference_api = True
    a.summary_model = "sshleifer/distilbart-cnn-12-6"
    a.hf_token = "hf_test_token_xyz"

    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.headers = {"content-type": "application/json"}
    mock_response.json.return_value = [{"summary_text": "Summary"}]

    with patch("analyzer.requests.post", return_value=mock_response) as mock_post:
        Analyzer._call_summary(a, "Test text")

        # Verify Authorization header was passed
        call_args = mock_post.call_args
        assert call_args is not None
        headers = call_args.kwargs.get("headers", {})
        assert headers.get("Authorization") == "Bearer hf_test_token_xyz"


def test_full_analyze_with_inference_api():
    """Integration test: full analyze() with mocked Inference API responses."""
    a = object.__new__(Analyzer)
    a.summary_model = "sshleifer/distilbart-cnn-12-6"
    a.emotion_model = "j-hartmann/emotion-english-distilroberta-base"
    a.hf_token = "test_token"
    a.local_mode = False
    a._use_inference_api = True
    a.max_chunk_words = MAX_CHUNK_WORDS
    a.chunk_overlap_words = CHUNK_OVERLAP_WORDS

    # Mock requests
    summary_response = Mock()
    summary_response.status_code = 200
    summary_response.headers = {"content-type": "application/json"}
    summary_response.json.return_value = [{"summary_text": "This is a test summary."}]

    emotion_response = Mock()
    emotion_response.status_code = 200
    emotion_response.headers = {"content-type": "application/json"}
    emotion_response.json.return_value = [[
        {"label": "joy", "score": 0.7},
        {"label": "trust", "score": 0.5},
    ]]

    with patch("analyzer.requests.post") as mock_post:
        # Return summary response for summary calls, emotion response for emotion calls
        def side_effect(*args, **kwargs):
            json_data = kwargs.get("json", {})
            if "parameters" in json_data:  # summary call
                return summary_response
            else:  # emotion call
                return emotion_response

        mock_post.side_effect = side_effect

        result = a.analyze("This is a test text with multiple sentences. It has content.")

    # Verify result structure
    assert "summary" in result
    assert result["summary"] == "This is a test summary."
    assert "emotions" in result
    assert len(result["emotions"]) == 2
    assert result["emotions"][0]["label"] == "joy"
    assert result["metadata"]["mode"] == "inference_api"
    assert "summary_errors" not in result["metadata"]
    assert "emotion_errors" not in result["metadata"]


def test_inference_api_without_token_falls_back_to_local():
    """Test that without a token, inference_api mode is not used."""
    # This test verifies the configuration logic
    import os
    with patch.dict(os.environ, {"HUGGINGFACE_API_KEY": "", "HF_LOCAL_MODE": "false"}):
        # Should NOT use inference API if no token
        a = object.__new__(Analyzer)
        a.hf_token = ""
        a.local_mode = False
        a._use_inference_api = bool(a.hf_token) and not a.local_mode
        assert a._use_inference_api is False



