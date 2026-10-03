"""Ready-made outputs. Wording follows the questions Layla 1.0 was trained on, so accuracy matches the evals."""

_PN = {"مثبت": "مثبت", "منفی": "منفی", "خنثی": "خنثی", "دوگانه": "دوگانه"}

PRESETS = {
    "sentiment": {
        "title": "لحن", "hint": "مثبت، منفی، خنثی یا دوگانه", "group": "برداشت",
        "question": {"type": "choice", "instructions": "لحن کلی این نوشته مثبت است یا منفی؟", "criteria": _PN},
    },
    "emotion": {
        "title": "احساس", "hint": "شادی، غم، خشم، ترس…", "group": "برداشت",
        "question": {"type": "choice", "instructions": "این متن بیشتر چه حسی را نشان می‌دهد؟",
                     "criteria": {k: k for k in ["شادی", "غم", "خشم", "ترس", "شگفتی", "انزجار", "بدون احساس خاص"]}},
    },
    "formality": {
        "title": "رسمی یا خودمانی", "hint": "سه پله، از خودمانی تا رسمی", "group": "برداشت",
        "question": {"type": "score", "instructions": "این متن رسمی نوشته شده یا خودمانی؟",
                     "criteria": ["خودمانی", "نیمه‌رسمی", "رسمی"]},
    },
    "message_act": {
        "title": "هدف پیام", "hint": "پرسش، درخواست، شکایت، تشکر…", "group": "پیام و پشتیبانی",
        "question": {"type": "choice", "instructions": "هدف اصلی این پیام چیست؟",
                     "criteria": {k: k for k in ["پرسش", "درخواست", "گزارش مشکل", "شکایت", "تشکر", "پیشنهاد"]}},
    },
    "urgency": {
        "title": "فوریت", "hint": "عادی، مهم یا فوری", "group": "پیام و پشتیبانی",
        "question": {"type": "score", "instructions": "رسیدگی به این پیام چقدر عجله دارد؟",
                     "criteria": ["عادی", "مهم", "فوری"]},
    },
    "spam": {
        "title": "تبلیغ یا کلاه‌برداری", "hint": "عادی، تبلیغاتی یا کلاه‌برداری", "group": "پیام و پشتیبانی",
        "question": {"type": "choice", "instructions": "این پیام از چه نوعی است؟",
                     "criteria": {k: k for k in ["عادی", "تبلیغاتی", "کلاه‌برداری"]}},
    },
    "offensive": {
        "title": "توهین", "hint": "آیا فحش یا توهین دارد؟", "group": "پیام و پشتیبانی",
        "question": {"type": "choice", "instructions": "آیا در این پیام فحش یا توهین هست؟",
                     "criteria": {"A": "خیر، توهین‌آمیز نیست", "B": "بله، توهین‌آمیز است"}},
        "labels": {"A": "توهین ندارد", "B": "توهین دارد"},
    },
    "star_rating": {
        "title": "ستاره", "hint": "رضایت خریدار از ۱ تا ۵", "group": "نظر خریدار",
        "question": {"type": "score", "instructions": "خریدار چقدر از این کالا راضی است؟",
                     "criteria": ["۱ ستاره", "۲ ستاره", "۳ ستاره", "۴ ستاره", "۵ ستاره"]},
    },
    "recommend": {
        "title": "پیشنهاد خرید", "hint": "آیا خرید را پیشنهاد می‌کند؟", "group": "نظر خریدار",
        "question": {"type": "choice", "instructions": "آیا نویسنده خرید این کالا را به دیگران پیشنهاد می‌کند؟",
                     "criteria": {k: k for k in ["پیشنهاد می‌کند", "پیشنهاد نمی‌کند", "نظری ندارد"]}},
    },
    "news_topic": {
        "title": "موضوع خبر", "hint": "سیاست، اقتصاد، ورزش…", "group": "خبر",
        "question": {"type": "choice", "instructions": "این خبر را باید در کدام بخش خبرگزاری گذاشت؟",
                     "criteria": {"Politics": "سیاست", "Economy": "اقتصاد", "Sports": "ورزش", "Society": "اجتماعی",
                                  "International": "بین‌الملل", "Science-Technology": "علم و فناوری",
                                  "Culture-Art": "فرهنگ و هنر"}},
    },
}


def public_catalog() -> list:
    """What GET /api/v1/outputs returns: enough for a client to list presets, never internal wording keys."""
    out = []
    for pid, p in PRESETS.items():
        q = p["question"]
        crit = q["criteria"]
        keys = list(crit) if isinstance(crit, dict) else [str(i) for i in range(len(crit))]
        labels = [p.get("labels", {}).get(k) or (crit[k] if isinstance(crit, dict) else crit[int(k)]) for k in keys]
        out.append({"id": pid, "title": p["title"], "hint": p["hint"], "group": p["group"],
                    "type": {"choice": "choice", "noul": "yes_no", "score": "scale"}[q["type"]], "question": q["instructions"], "options": labels})
    return out
