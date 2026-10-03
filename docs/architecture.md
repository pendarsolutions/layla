# Architecture

```
browser (web/ page)                    client with an API key
        │  NDJSON stream / JSON                │
        ▼                                      ▼
  [nginx: TLS, limit_req, no buffering on /stream]   ← later, once a subdomain exists
        │
  127.0.0.1:8790 ──► container layla-api (cpus 6, 2.5 GB, no swap, cpu_shares 256, oom_score_adj 800)
                      FastAPI (app/main.py)
                        auth: Bearer key | anonymous tier (demo)
                        limits: chars, outputs, per-IP rate, in-flight cap, timeout
                        │
                      Runner (app/engine.py): 1 worker thread, LRU answer cache
                        │
                      LayaEngine: laya.Agent on CPU, torch threads = LAYLA_THREADS
                        │
                      /models/layla-1.0 (read-only mount)
```

## Decisions

- **One question per forward pass, one pass at a time.** Measured on the host (8 threads): 5 questions in one batch
  cost ~5× one question. Sequential passes cost the same in total, spread CPU fairly between concurrent requests
  (their questions interleave on the worker), and let the stream send each answer when it exists. The page's progress
  display waits on these real answers; nothing is timed or simulated.
- **fp32.** bf16 autocast gave no speed-up on this CPU. Dynamic int8 was 2× faster but dropped mean macro-F1 from
  0.785 to 0.665 on a 630-row stratified validation sample, so it is not used (the Layla latency rule allows the same
  model in another numeric form only if accuracy holds).
- **Token cap.** Text over `LAYLA_MAX_TEXT_TOKENS` (default 512) keeps its head (45%) and tail, as Layla Studio does.
  The response says `truncated: true`.
- **Stateless.** No sessions, no stored decisions. The answer cache and the anonymous rate-limit window are per-process
  speed/abuse helpers; losing them changes no answer. With several instances, nginx `limit_req` is the shared limit.
- **Presets use the model's training wording** (`app/catalog.py`), so preset answers match the evaluated accuracy.
- **`laya` is vendored** (`vendor/laya`, Apache-2.0, v0.3.7) to pin the exact code the model was evaluated with.
