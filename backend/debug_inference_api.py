#!/usr/bin/env python3
"""
Debug script to test Hugging Face Inference API directly.
Run this to see what's actually happening with API calls.

Usage:
    python debug_inference_api.py
"""

import os
import sys
import requests
import json
from dotenv import load_dotenv

# Load env vars
load_dotenv()

def test_summary_api():
    """Test summary API endpoint."""
    api_key = os.getenv("HUGGINGFACE_API_KEY")
    model = os.getenv("MODEL_SUMMARY", "sshleifer/distilbart-cnn-12-6")

    print("=" * 80)
    print("TESTING SUMMARY API")
    print("=" * 80)
    print(f"Model: {model}")
    print(f"Token present: {bool(api_key)}")
    print()

    if not api_key:
        print("❌ ERROR: HUGGINGFACE_API_KEY not set in .env")
        return False

    url = f"https://api-inference.huggingface.co/models/{model}"
    headers = {"Authorization": f"Bearer {api_key}"}
    test_text = "This is a test article about artificial intelligence and machine learning. It discusses recent advances in deep learning."

    print(f"URL: {url}")
    print(f"Payload: {json.dumps({'inputs': test_text, 'parameters': {'max_length': 150}}, indent=2)}")
    print()

    try:
        resp = requests.post(
            url,
            headers=headers,
            json={"inputs": test_text, "parameters": {"max_length": 150}},
            timeout=30
        )

        print(f"Status: {resp.status_code}")
        print(f"Content-Type: {resp.headers.get('content-type', 'N/A')}")
        print(f"Response Headers: {dict(resp.headers)}")
        print()
        print(f"Response Body:")
        try:
            data = resp.json()
            print(json.dumps(data, indent=2))
            return resp.status_code == 200
        except:
            print(resp.text[:1000])
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False


def test_emotion_api():
    """Test emotion API endpoint."""
    api_key = os.getenv("HUGGINGFACE_API_KEY")
    model = os.getenv("MODEL_EMOTION", "j-hartmann/emotion-english-distilroberta-base")

    print("\n" + "=" * 80)
    print("TESTING EMOTION API")
    print("=" * 80)
    print(f"Model: {model}")
    print(f"Token present: {bool(api_key)}")
    print()

    if not api_key:
        print("❌ ERROR: HUGGINGFACE_API_KEY not set in .env")
        return False

    url = f"https://api-inference.huggingface.co/models/{model}"
    headers = {"Authorization": f"Bearer {api_key}"}
    test_text = "I am so happy today! This is wonderful news!"

    print(f"URL: {url}")
    print(f"Payload: {json.dumps({'inputs': test_text}, indent=2)}")
    print()

    try:
        resp = requests.post(
            url,
            headers=headers,
            json={"inputs": test_text},
            timeout=30
        )

        print(f"Status: {resp.status_code}")
        print(f"Content-Type: {resp.headers.get('content-type', 'N/A')}")
        print(f"Response Headers: {dict(resp.headers)}")
        print()
        print(f"Response Body:")
        try:
            data = resp.json()
            print(json.dumps(data, indent=2))
            return resp.status_code == 200
        except:
            print(resp.text[:1000])
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False


def test_full_analyzer():
    """Test the full Analyzer with Inference API."""
    print("\n" + "=" * 80)
    print("TESTING FULL ANALYZER")
    print("=" * 80)
    print()

    try:
        from analyzer import Analyzer

        api_key = os.getenv("HUGGINGFACE_API_KEY")
        if not api_key:
            print("❌ ERROR: HUGGINGFACE_API_KEY not set in .env")
            return False

        print("Creating Analyzer with Inference API mode...")
        analyzer = Analyzer(
            hf_token=api_key,
            local_mode=False
        )

        print(f"Mode: {'inference_api' if analyzer._use_inference_api else 'local'}")

        test_text = """
        I am absolutely thrilled about the new project! The team is doing amazing work
        and I'm excited about the possibilities. However, there are some concerns about
        the timeline and resource allocation. Overall, I feel optimistic and ready to tackle
        the challenges ahead.
        """

        print(f"\nAnalyzing text ({len(test_text.split())} words)...")
        result = analyzer.analyze(test_text)

        print("\nResult:")
        print(json.dumps(result, indent=2))

        # Check for errors
        metadata = result.get("metadata", {})
        if "summary_errors" in metadata:
            print(f"\n⚠️  Summary Errors: {metadata['summary_errors']}")
            return False
        if "emotion_errors" in metadata:
            print(f"\n⚠️  Emotion Errors: {metadata['emotion_errors']}")
            return False

        summary = result.get("summary", "")
        emotions = result.get("emotions", [])

        if not summary:
            print("\n⚠️  WARNING: Summary is empty!")
        if not emotions:
            print("\n⚠️  WARNING: Emotions are empty!")

        return True
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    print("Hugging Face Inference API Debug Script")
    print()

    summary_ok = test_summary_api()
    emotion_ok = test_emotion_api()
    analyzer_ok = test_full_analyzer()

    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"✓ Summary API: {'PASS' if summary_ok else 'FAIL'}")
    print(f"✓ Emotion API: {'PASS' if emotion_ok else 'FAIL'}")
    print(f"✓ Full Analyzer: {'PASS' if analyzer_ok else 'FAIL'}")
    print()

    if not (summary_ok and emotion_ok):
        print("Troubleshooting:")
        print("1. Check that HUGGINGFACE_API_KEY is valid")
        print("2. Check that your HF account has access to these models")
        print("3. Models may be loading/warming up on first request (can take 1-2 min)")
        print("4. Check network connectivity to api-inference.huggingface.co")
        print("5. Enable debug logging: LOG_LEVEL=debug python debug_inference_api.py")

