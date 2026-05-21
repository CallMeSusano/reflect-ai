"""
analyzer.py — ReflectAI journal analyzer

Summary + mood detection → gemma-4-26b-a4b-it via Google AI Studio

Both calls use a low thinking budget for faster responses.

Required env vars:
    GOOGLE_API_KEY  — Google AI Studio API key (https://aistudio.google.com/apikey)

Optional env vars:
    GEMMA_MODEL     — override the Gemma model name (default: gemma-4-26b-a4b-it)
"""

import os
import time
from typing import Optional

from google import genai
from google.genai import types


DEFAULT_GEMMA_MODEL = "gemma-4-26b-a4b-it"

VALID_MOODS = {
    "happy", "sad", "anxious", "grateful", "angry",
    "peaceful", "proud", "relieved", "neutral",
}

LANGUAGE_NAMES: dict[str, str] = {
    "en": "English",
    "pt": "Portuguese",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "nl": "Dutch",
    "pl": "Polish",
    "ru": "Russian",
    "zh": "Chinese",
    "ja": "Japanese",
    "ko": "Korean",
    "ar": "Arabic",
    "hi": "Hindi",
    "tr": "Turkish",
    "sv": "Swedish",
    "no": "Norwegian",
    "da": "Danish",
    "fi": "Finnish",
}

SUMMARY_SYSTEM = """
You are a thoughtful journaling companion.

Write a short, personal reflection based on journal entries, focusing on emotions, patterns, growth, struggles, hopes, and realizations.

Style:
- warm, intimate, reflective, empathetic
- natural and emotionally aware
- never clinical, robotic, or generic
- never say “the user”, “the author”, “they”, or “the journal entries”

Rules:
- 3–5 sentences
- no headings, labels, or bullet points
- return only the reflection
"""

WEEKLY_NARRATIVE_SYSTEM = """
You are a compassionate weekly reflection writer for a personal journal app.

Synthesize the week's journal entries into a warm, insightful narrative that captures:
- Overall emotional arc
- Key themes and patterns
- Growth moments or realizations
- Moments of connection, challenge, or joy

Style:
- intimate, warm, deeply personal yet universal
- conversational, never clinical
- poetic but grounded
- never refer to "entries" or "the user" – speak directly to the emotions and experiences

Rules:
- 5–7 sentences (2 short paragraphs max)
- no headings, labels, or bullet points
- return only the narrative
- feel free to gently acknowledge struggles alongside growth
"""

MOOD_PROMPT = (
    "Read the following journal text and identify the single dominant mood. "
    "Choose exactly one word from this list: "
    "happy, sad, anxious, grateful, angry, peaceful, proud, relieved, neutral. "
    "Reply with that single word only — no punctuation, no explanation.\n\n"
)

_LOW_THINKING = types.ThinkingConfig(thinking_level="MINIMAL")
_RETRYABLE = ("500", "503", "INTERNAL", "UNAVAILABLE")
_MAX_RETRIES = 3


def _with_retry(fn):
    for attempt in range(_MAX_RETRIES):
        try:
            return fn()
        except Exception as e:
            msg = str(e)
            if not any(code in msg for code in _RETRYABLE) or attempt == _MAX_RETRIES - 1:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError("unreachable")


class Analyzer:
    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
    ):
        resolved_key = api_key or os.getenv("GOOGLE_API_KEY")
        if not resolved_key:
            raise RuntimeError(
                "GOOGLE_API_KEY is not set. "
                "Get a free key at https://aistudio.google.com/apikey"
            )
        self.model = model or os.getenv("GEMMA_MODEL", DEFAULT_GEMMA_MODEL)
        self._client = genai.Client(api_key=resolved_key)

    def _summarize(self, text: str, language: str) -> str:
        lang_name = LANGUAGE_NAMES.get(language.split("-")[0].lower(), "English")
        system = SUMMARY_SYSTEM + f"\n\nWrite your response in {lang_name}."
        response = _with_retry(lambda: self._client.models.generate_content(
            model=self.model,
            contents=text,
            config=types.GenerateContentConfig(
                system_instruction=system,
                thinking_config=_LOW_THINKING,
                max_output_tokens=512,
                temperature=0.3,
            ),
        ))
        return response.text.strip()

    def _detect_mood(self, text: str) -> str:
        sample = text[:4000] if len(text) > 4000 else text
        response = _with_retry(lambda: self._client.models.generate_content(
            model=self.model,
            contents=MOOD_PROMPT + sample,
            config=types.GenerateContentConfig(
                thinking_config=_LOW_THINKING,
                max_output_tokens=10,
                temperature=0.1,
            ),
        ))
        word = response.text.strip().lower().split()[0] if response.text else "neutral"
        word = word.rstrip(".,;:!?")
        return word if word in VALID_MOODS else "neutral"

    def analyze(self, text: str, language: str = "en") -> dict:
        if not text or not text.strip():
            raise ValueError("text is empty")

        summary = self._summarize(text, language)
        mood = self._detect_mood(text)

        return {
            "summary": summary,
            "mood": mood,
            "metadata": {
                "words": len(text.split()),
                "model": self.model,
            },
        }

    def generate_weekly_narrative(self, entries: list[dict], language: str = "en") -> str:
        """Generate a weekly narrative from multiple journal entries.

        Args:
            entries: List of dicts with 'title' and 'content' keys
            language: Language code (e.g., 'en', 'pt')

        Returns:
            Narrative text
        """
        if not entries:
            raise ValueError("no entries provided")

        # Combine all entries into a single text block
        combined = "\n\n".join([
            f"**{e.get('title', 'Untitled')}**\n{e.get('content', '')}"
            for e in entries
            if e.get('content', '').strip()
        ])

        if not combined.strip():
            raise ValueError("entries contain no content")

        lang_name = LANGUAGE_NAMES.get(language.split("-")[0].lower(), "English")
        system = WEEKLY_NARRATIVE_SYSTEM + f"\n\nWrite your response in {lang_name}."

        response = _with_retry(lambda: self._client.models.generate_content(
            model=self.model,
            contents=combined,
            config=types.GenerateContentConfig(
                system_instruction=system,
                thinking_config=_LOW_THINKING,
                max_output_tokens=1024,
                temperature=0.5,
            ),
        ))
        return response.text.strip()

