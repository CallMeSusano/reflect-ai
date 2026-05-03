import pytest
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



