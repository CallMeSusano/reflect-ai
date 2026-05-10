import os
import math
from typing import List, Dict, Optional
from dataclasses import dataclass

import requests

# We avoid relying on the higher-level `huggingface_hub` client in inference
# mode because different versions expose incompatible APIs (InferenceApi vs
# InferenceClient). Instead, when an API key is present we call the stable
# HTTP Inference API endpoints directly. The `huggingface_hub` import is still
# optional for other usage, but not required for the HTTP calls below.
try:
    from huggingface_hub import InferenceApi
    _HAS_HF_HUB = True
except Exception:
    InferenceApi = None
    _HAS_HF_HUB = False

# local pipeline imports guarded to avoid heavy imports if not used
try:
    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer, pipeline
    _HAS_TRANSFORMERS = True
except Exception:
    torch = None
    AutoModelForSeq2SeqLM = None
    AutoTokenizer = None
    _HAS_TRANSFORMERS = False


DEFAULT_SUMMARY_MODEL = "sshleifer/distilbart-cnn-12-6"
DEFAULT_EMOTION_MODEL = "j-hartmann/emotion-english-distilroberta-base"
MAX_CHUNK_WORDS = int(os.getenv("MAX_CHUNK_WORDS", "800"))
CHUNK_OVERLAP_WORDS = int(os.getenv("CHUNK_OVERLAP_WORDS", "100"))


@dataclass
class Emotion:
    label: str
    score: float


class Analyzer:
    """Analyzer that can use either the Hugging Face Inference API or a local transformers pipeline.

    For MVP we use a simple word-based chunking strategy. This is easier and avoids tokenizer-specific
    code; for production use the tokenizer of the chosen model.
    """

    def __init__(self,
                 summary_model: Optional[str] = None,
                 emotion_model: Optional[str] = None,
                 hf_token: Optional[str] = None,
                 local_mode: Optional[bool] = None):
        self.summary_model = summary_model or os.getenv("MODEL_SUMMARY", DEFAULT_SUMMARY_MODEL)
        self.emotion_model = emotion_model or os.getenv("MODEL_EMOTION", DEFAULT_EMOTION_MODEL)
        self.hf_token = hf_token if hf_token is not None else os.getenv("HUGGINGFACE_API_KEY")
        if local_mode is None:
            local_mode = os.getenv("HF_LOCAL_MODE", "false").lower() == "true"
        self.local_mode = local_mode
        self.max_chunk_words = int(os.getenv("MAX_CHUNK_WORDS", "800"))
        self.chunk_overlap_words = int(os.getenv("CHUNK_OVERLAP_WORDS", "100"))

        self._use_inference_api = bool(self.hf_token) and not self.local_mode

        if self._use_inference_api:
            # Use direct HTTP calls to the Hugging Face Inference API. This
            # avoids tying the code to a particular version of
            # `huggingface_hub` which may change API surface.
            # We keep the model names and token and perform requests in
            # `_call_summary` / `_call_emotion`.
            self._summary_client = None
            self._emotion_client = None
            self._summary_tokenizer = None
            self._summary_model = None
        else:
            # prepare local pipelines (may require downloads)
            if not _HAS_TRANSFORMERS:
                raise RuntimeError("transformers is not available for local mode; install transformers and torch")
            # summarization via explicit seq2seq model/tokenizer to avoid depending on
            # the pipeline task registry, which varies across transformers versions.
            self._summary_tokenizer = AutoTokenizer.from_pretrained(self.summary_model)
            self._summary_model = AutoModelForSeq2SeqLM.from_pretrained(self.summary_model)
            self._summary_model.eval()
            self._summary_client = None
            # emotion/sentiment pipeline
            # some models are 'text-classification' tasks
            self._emotion_client = pipeline("text-classification", model=self.emotion_model, return_all_scores=True)

    def chunk_text(self, text: str) -> List[str]:
        text = text.strip()
        if not text:
            return []
        words = text.split()
        max_chunk_words = getattr(self, "max_chunk_words", MAX_CHUNK_WORDS)
        chunk_overlap_words = getattr(self, "chunk_overlap_words", CHUNK_OVERLAP_WORDS)
        if len(words) <= max_chunk_words:
            return [text]

        chunks = []
        step = max_chunk_words - chunk_overlap_words
        if step <= 0:
            step = max_chunk_words
        for start in range(0, len(words), step):
            end = start + max_chunk_words
            chunk_words = words[start:end]
            chunks.append(" ".join(chunk_words))
            if end >= len(words):
                break
        return chunks

    def _call_summary(self, text: str) -> str:
        if self._use_inference_api:
            # Call the stable HTTP Inference API endpoint
            url = f"https://api-inference.huggingface.co/models/{self.summary_model}"
            headers = {"Authorization": f"Bearer {self.hf_token}"} if self.hf_token else {}

            import os
            log_level = os.getenv("LOG_LEVEL", "info").lower()
            if log_level == "debug":
                print(f"[DEBUG] Calling HF summary API: {url}")

            resp = requests.post(url, headers=headers, json={"inputs": text, "parameters": {"max_length": 150}})
            content_type = resp.headers.get("content-type", "")
            if resp.status_code != 200:
                # raise with body to be captured by caller
                error_msg = f"HF summary request failed: {resp.status_code} {resp.text}"
                if log_level == "debug":
                    print(f"[DEBUG] {error_msg}")
                raise RuntimeError(error_msg)

            if "application/json" in content_type:
                out = resp.json()
                # Inference API may return list/dict/string
                if isinstance(out, (list, tuple)) and len(out) > 0:
                    item = out[0]
                    if isinstance(item, dict) and "summary_text" in item:
                        return item["summary_text"]
                    if isinstance(item, dict) and "generated_text" in item:
                        return item["generated_text"]
                    if isinstance(item, str):
                        return item
                if isinstance(out, dict):
                    for k in ("summary_text", "generated_text", "text"):
                        if k in out:
                            return out[k]
                return str(out)
            else:
                # non-JSON response (e.g., HTML error page)
                raise RuntimeError(f"Unexpected content-type from HF summary: {content_type} - {resp.text[:500]}")
        else:
            # local pipeline
            inputs = self._summary_tokenizer(text, return_tensors="pt", truncation=True, max_length=1024)
            with torch.no_grad():
                output_ids = self._summary_model.generate(
                    **inputs,
                    max_length=150,
                    num_beams=4,
                    early_stopping=True,
                )
            return self._summary_tokenizer.decode(output_ids[0], skip_special_tokens=True).strip()

    def _call_emotion(self, text: str) -> List[Emotion]:
        if self._use_inference_api:
            url = f"https://api-inference.huggingface.co/models/{self.emotion_model}"
            headers = {"Authorization": f"Bearer {self.hf_token}"} if self.hf_token else {}

            import os
            log_level = os.getenv("LOG_LEVEL", "info").lower()
            if log_level == "debug":
                print(f"[DEBUG] Calling HF emotion API: {url}")

            resp = requests.post(url, headers=headers, json={"inputs": text})
            content_type = resp.headers.get("content-type", "")
            if resp.status_code != 200:
                error_msg = f"HF emotion request failed: {resp.status_code} {resp.text}"
                if log_level == "debug":
                    print(f"[DEBUG] {error_msg}")
                raise RuntimeError(error_msg)

            if "application/json" in content_type:
                out = resp.json()
                # HF emotion model often returns list of dicts or list of lists
                scores = []
                if isinstance(out, list) and len(out) > 0 and isinstance(out[0], list):
                    scores = out[0]
                elif isinstance(out, list) and len(out) > 0 and isinstance(out[0], dict):
                    scores = out
                elif isinstance(out, dict):
                    # single dict
                    scores = [out]
                emotions = []
                for item in scores:
                    if isinstance(item, dict) and "label" in item and "score" in item:
                        emotions.append(Emotion(label=item["label"], score=float(item["score"])))
                return emotions
            else:
                raise RuntimeError(f"Unexpected content-type from HF emotion: {content_type} - {resp.text[:500]}")
        else:
            out = self._emotion_client(text)
            # transformers pipeline with return_all_scores=True -> list of lists
            if isinstance(out, list) and len(out) > 0 and isinstance(out[0], list):
                scores = out[0]
            else:
                scores = out
            emotions = []
            for item in scores:
                if isinstance(item, dict) and "label" in item and "score" in item:
                    emotions.append(Emotion(label=item["label"], score=float(item["score"])))
            return emotions

    def analyze(self, text: str, summary_model: Optional[str] = None, emotion_model: Optional[str] = None) -> Dict:
        if not text or not text.strip():
            raise ValueError("text is empty")

        # allow overriding models per-request (simple MVP: recreate client if model override is provided)
        if summary_model or emotion_model:
            # create a temporary Analyzer for this request
            temp = Analyzer(summary_model=summary_model or self.summary_model,
                            emotion_model=emotion_model or self.emotion_model,
                            hf_token=self.hf_token,
                            local_mode=self.local_mode)
            return temp.analyze(text)

        chunks = self.chunk_text(text)
        if len(chunks) == 0:
            raise ValueError("no text to analyze")

        # Summarize each chunk and collect errors/raw responses for debugging
        summaries: List[str] = []
        summary_errors: List[str] = []
        raw_summary_outputs: List[object] = []
        for ch in chunks:
            try:
                s = self._call_summary(ch)
                raw_summary_outputs.append(s)
            except Exception as e:
                # Record the exception message for debugging and continue
                s = ""
                summary_errors.append(str(e))
                raw_summary_outputs.append(None)
            summaries.append(s)

        # Merge summaries: if multiple, summarize the concatenated summaries
        if len(summaries) == 1:
            final_summary = summaries[0]
        else:
            concat = "\n\n".join(summaries)
            try:
                final_summary = self._call_summary(concat)
            except Exception:
                # fallback: join summaries
                final_summary = concat

        # Emotion: classify per-chunk and aggregate by averaging scores for labels
        label_scores: Dict[str, List[float]] = {}
        emotion_errors: List[str] = []
        raw_emotion_outputs: List[object] = []
        for ch in chunks:
            try:
                emo = self._call_emotion(ch)
                raw_emotion_outputs.append([{"label": e.label, "score": e.score} for e in emo])
            except Exception as e:
                emo = []
                emotion_errors.append(str(e))
                raw_emotion_outputs.append(None)
            for e in emo:
                label_scores.setdefault(e.label, []).append(e.score)

        aggregated: List[Emotion] = []
        for label, scores in label_scores.items():
            avg = float(sum(scores) / len(scores)) if scores else 0.0
            aggregated.append(Emotion(label=label, score=avg))

        # sort descending by score
        aggregated.sort(key=lambda x: x.score, reverse=True)

        metadata = {
            "words": len(text.split()),
            "chunks": len(chunks),
            "model_summary": self.summary_model,
            "model_emotion": self.emotion_model,
            "mode": "inference_api" if self._use_inference_api else "local",
        }

        # attach debugging info to metadata so the frontend can surface errors
        metadata["chunk_summaries"] = summaries
        metadata["raw_summary_outputs"] = raw_summary_outputs
        if summary_errors:
            metadata["summary_errors"] = summary_errors

        metadata["raw_emotion_outputs"] = raw_emotion_outputs
        if emotion_errors:
            metadata["emotion_errors"] = emotion_errors

        return {
            "summary": final_summary,
            "emotions": [{"label": e.label, "score": e.score} for e in aggregated],
            "metadata": metadata,
        }

