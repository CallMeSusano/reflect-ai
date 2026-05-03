from typing import List, Optional
from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    text: Optional[str] = None
    mode: Optional[str] = Field(None, description='"inference" or "local"')
    model_summary: Optional[str] = None
    model_emotion: Optional[str] = None


class EmotionLabel(BaseModel):
    label: str
    score: float


class AnalyzeResponse(BaseModel):
    summary: str
    emotions: List[EmotionLabel]
    metadata: dict

