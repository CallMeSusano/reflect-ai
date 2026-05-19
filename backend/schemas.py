from typing import Optional
from pydantic import BaseModel


class AnalyzeRequest(BaseModel):
    text: Optional[str] = None
    language: Optional[str] = "en"


class AnalyzeResponse(BaseModel):
    summary: str
    mood: str
    metadata: dict
