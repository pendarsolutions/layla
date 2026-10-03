"""The HTTP contract. Field names are the consumer's words (text, outputs, options), not the model's."""
from typing import Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .catalog import PRESETS


class OutputSpec(BaseModel):
    """One thing to decide about the text: a ready-made output (`preset`) or your own question."""
    model_config = ConfigDict(extra="forbid", json_schema_extra={"examples": [
        {"id": "tone", "preset": "sentiment"},
        {"id": "refund", "type": "yes_no", "question": "آیا مشتری پولش را پس می‌خواهد؟"},
        {"id": "team", "type": "choice", "question": "این پیام به کدام واحد مربوط است؟",
         "options": ["فروش", "پشتیبانی فنی", "مالی"]},
    ]})

    id: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_\-]+$",
                    description="Your name for this output; its result comes back under the same id.")
    preset: Optional[str] = Field(default=None, description="A ready-made output id from GET /api/v1/outputs.")
    type: Optional[Literal["choice", "yes_no", "scale"]] = Field(
        default=None,
        description="choice: one of `options`. yes_no: probability of yes. scale: ordered levels, lowest first.")
    question: Optional[str] = Field(default=None, min_length=2, max_length=400)
    options: Optional[Union[list[str], dict[str, str]]] = Field(
        default=None,
        description="choice: 2-12 options (a list, or {key: description}). scale: 2-10 levels, lowest first.")

    @model_validator(mode="after")
    def _shape(self):
        if self.preset is not None:
            if self.preset not in PRESETS:
                raise ValueError(f"unknown preset '{self.preset}'")
            if self.type or self.question or self.options:
                raise ValueError("give either `preset` or your own `type` + `question`, not both")
            return self
        if not self.type or not self.question:
            raise ValueError("give `preset`, or both `type` and `question`")
        opts = self.options
        if self.type == "yes_no":
            if opts:
                raise ValueError("yes_no takes no options")
            return self
        if not opts:
            raise ValueError(f"{self.type} needs `options`")
        if self.type == "scale" and not isinstance(opts, list):
            raise ValueError("scale options must be a list, lowest level first")
        hi = 12 if self.type == "choice" else 10
        if not 2 <= len(opts) <= hi:
            raise ValueError(f"{self.type} takes 2 to {hi} options")
        items = list(opts) if isinstance(opts, list) else list(opts.keys()) + list(opts.values())
        if any(not x.strip() or len(x) > 120 for x in items):
            raise ValueError("each option must be 1-120 characters")
        if isinstance(opts, list) and len(set(opts)) != len(opts):
            raise ValueError("options must be different from each other")
        return self

    def to_question(self):
        """-> (model question, {answer key: display label})."""
        if self.preset:
            p = PRESETS[self.preset]
            q = p["question"]
            crit = q["criteria"]
            if isinstance(crit, dict):
                labels = {k: p.get("labels", {}).get(k, v) for k, v in crit.items()}
            else:
                labels = {str(i): v for i, v in enumerate(crit)}
            return q, labels
        if self.type == "yes_no":
            return {"type": "noul", "instructions": self.question}, {}
        if self.type == "scale":
            return ({"type": "score", "instructions": self.question, "criteria": list(self.options)},
                    {str(i): v for i, v in enumerate(self.options)})
        crit = {o: o for o in self.options} if isinstance(self.options, list) else dict(self.options)
        return {"type": "choice", "instructions": self.question, "criteria": crit}, dict(crit)


class DecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", json_schema_extra={"examples": [{
        "text": "سفارشم سه روز پیش ثبت شد و هنوز نرسیده. لطفاً پولم را برگردانید.",
        "outputs": [{"id": "tone", "preset": "sentiment"}, {"id": "urgency", "preset": "urgency"},
                    {"id": "refund", "type": "yes_no", "question": "آیا مشتری پولش را پس می‌خواهد؟"}],
    }]})

    text: str = Field(min_length=1, description="The text to read. Persian works best; long text is shortened to fit.")
    outputs: list[OutputSpec] = Field(min_length=1)

    @model_validator(mode="after")
    def _unique(self):
        ids = [o.id for o in self.outputs]
        if len(set(ids)) != len(ids):
            raise ValueError("output ids must be unique")
        if not self.text.strip():
            raise ValueError("text is empty")
        return self


class OptionProb(BaseModel):
    key: str
    label: str
    probability: float


class Result(BaseModel):
    id: str
    type: Literal["choice", "yes_no", "scale"]
    answer: str = Field(description="choice: the chosen key. yes_no: 'yes' or 'no'. scale: the most likely level index.")
    label: str = Field(description="The answer in display words.")
    probability: float = Field(description="Probability of `answer`.")
    level: Optional[float] = Field(default=None, description="scale only: expected level, 0 = lowest.")
    options: list[OptionProb] = Field(default_factory=list)
    confidence: float
    duration_ms: float
    cached: bool


class Usage(BaseModel):
    input_tokens: int


class DecisionResponse(BaseModel):
    request_id: str
    model: str
    results: list[Result]
    truncated: bool = Field(description="True when the text was longer than the model reads and was shortened.")
    usage: Usage
    duration_ms: float


class ErrorBody(BaseModel):
    code: str
    message: str
    request_id: str


class ErrorResponse(BaseModel):
    error: ErrorBody


class CatalogItem(BaseModel):
    id: str
    title: str
    hint: str
    group: str
    type: Literal["choice", "yes_no", "scale"]
    question: str
    options: list[str]


class Catalog(BaseModel):
    outputs: list[CatalogItem]
    limits: dict


class Health(BaseModel):
    status: str
    version: str
    git_sha: str


class Ready(Health):
    model: str
    engine: str
