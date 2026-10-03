# Layla API — CPU image. The model weights are NOT in the image; they are mounted read-only at /models.
#   docker build -t layla-api:1.0.0 .
FROM python:3.12.7-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    PYTHONPATH=/srv:/srv/vendor

WORKDIR /srv

# CPU-only torch first (large, rarely changes), then the rest.
RUN pip install torch==2.14.0 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY vendor ./vendor
COPY app ./app
COPY migrations ./migrations
COPY alembic.ini .
COPY web ./web

ARG LAYLA_VERSION=dev
ARG LAYLA_GIT_SHA=unknown
ENV LAYLA_VERSION=${LAYLA_VERSION} LAYLA_GIT_SHA=${LAYLA_GIT_SHA}

RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin layla
USER 10001

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).status == 200 else 1)"

# One worker on purpose: one model copy in RAM; CPU parallelism comes from LAYLA_THREADS.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log", "--timeout-keep-alive", "15"]
