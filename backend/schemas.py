from typing import Optional
from pydantic import BaseModel


class AnalyzeRequest(BaseModel):
    text: Optional[str] = None
    language: Optional[str] = "en"


class AnalyzeResponse(BaseModel):
    summary: str
    mood: str
    metadata: dict


class JournalEntryForWeekly(BaseModel):
    title: str
    content: str


class WeeklyNarrativeRequest(BaseModel):
    entries: list[JournalEntryForWeekly]
    language: Optional[str] = "en"


class WeeklyNarrativeResponse(BaseModel):
    narrative: str
    metadata: dict
