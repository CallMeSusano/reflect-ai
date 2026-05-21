# Backend Unit Tests

## Overview

Comprehensive test suite for the ReflectAI backend with **65 tests** covering:
- Analyzer core functionality (34 tests)
- FastAPI endpoints (31 tests)

All tests pass and are well-organized into logical test classes.

## Running Tests

```bash
# Run all tests
.\.venv\Scripts\python.exe -m pytest tests/ -v

# Run specific test file
.\.venv\Scripts\python.exe -m pytest tests/test_analyzer.py -v

# Run specific test class
.\.venv\Scripts\python.exe -m pytest tests/test_app.py::TestAnalyzeTextEndpoint -v

# Run with coverage
.\.venv\Scripts\python.exe -m pytest tests/ --cov=. --cov-report=html
```


