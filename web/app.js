/* Layla — local web client. Talks to the Layla API over NDJSON streaming; no framework, no build step. */
(() => {
  "use strict";

  const QS = new URLSearchParams(location.search);
  const API = (QS.get("api") || window.LAYLA_API || "").replace(/\/$/, "");
  const TIMING = QS.has("timing") || window.LAYLA_TIMING === true;  // speed readout for testing
  const $ = (s, r = document) => r.querySelector(s);
  const fa = (n) => Number(n).toLocaleString("fa-IR");
  const pct = (p) => `${fa(Math.round(p * 100))}٪`;
  const store = {
    get(k, d) { try { const v = localStorage.getItem("layla:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("layla:" + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c));
    return n;
  };

  const ICON = {
    arcade: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 17.5V9.8Q2.5 5.6 6.2 3.2 9.9 5.6 9.9 9.8V17.5"/><path d="M10.1 17.5V9.8Q10.1 5.6 13.8 3.2 17.5 5.6 17.5 9.8V17.5"/></svg>',
    send: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 16V4"/><path d="M5 9l5-5 5 5"/></svg>',
    tick: '<svg class="tick" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>',
    x: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>',
    spin: '<svg class="spin" viewBox="0 0 24 26"><path d="M4.4 25V12.5a3 3 0 0 1 .25-1.2A17.2 17.2 0 0 1 12 3a17.2 17.2 0 0 1 7.35 8.3 3 3 0 0 1 .25 1.2V25"/></svg>',
  };
  const TAQ = '<svg viewBox="0 0 24 28" aria-hidden="true"><path class="arch" d="M4.4 27V13.5a3 3 0 0 1 .25-1.2A17.2 17.2 0 0 1 12 3a17.2 17.2 0 0 1 7.35 8.3 3 3 0 0 1 .25 1.2V27"/><path class="inner" d="M8.6 27v-7.6a1.6 1.6 0 0 1 .13-.62A9 9 0 0 1 12 14.5a9 9 0 0 1 3.27 4.28 1.6 1.6 0 0 1 .13.62V27"/></svg>';

  const SUGGESTIONS = [
    { kind: "پیام پشتیبانی",
      text: "سلام، سه روز است سفارشم را ثبت کرده‌ام و هنوز خبری نیست. اگر تا فردا نرسد لغوش می‌کنم و پولم را می‌خواهم.",
      outputs: ["sentiment", "message_act", "urgency", { type: "yes_no", question: "آیا مشتری می‌خواهد سفارش را لغو کند؟" }] },
    { kind: "نظر خریدار",
      text: "صدای هدفون عالی است ولی بعد از دو هفته یک طرفش قطع و وصل می‌شود. با این قیمت انتظار بیشتری داشتم.",
      outputs: ["star_rating", "recommend", "sentiment"] },
    { kind: "تیتر خبر",
      text: "بانک مرکزی از کاهش نرخ تورم ماهانه در شهریور خبر داد و گفت سیاست‌های انقباضی ادامه پیدا می‌کند.",
      outputs: ["news_topic", "formality"] },
    { kind: "پیامک ناشناس",
      text: "تبریک! شما برندهٔ یک دستگاه خودرو شده‌اید. برای دریافت جایزه همین حالا روی لینک بزنید و کد تأیید را وارد کنید.",
      outputs: ["spam", "urgency", { type: "yes_no", question: "آیا از خواننده رمز یا کد تأیید می‌خواهد؟" }] },
  ];
  const DEFAULT_SELECTION = ["sentiment", "message_act", "urgency"];
  const TYPE_NAME = { choice: "چندگزینه‌ای", yes_no: "بله یا خیر", scale: "طیف" };

  const S = {
    catalog: [], limits: null,
    customs: store.get("customs", []),          // [{id, type, question, options?}]
    selection: store.get("selection", DEFAULT_SELECTION), // preset ids and custom ids
    turns: [],
  };
  const presetById = (id) => S.catalog.find((c) => c.id === id);
  const customById = (id) => S.customs.find((c) => c.id === id);
  const maxOutputs = () => S.limits?.anonymous?.max_outputs || 6;
  const titleOf = (id) => presetById(id)?.title || customById(id)?.question || id;
  const specOf = (id) => {
    if (presetById(id)) return { id, preset: id };
    const c = customById(id);
    return c && { id, type: c.type, question: c.question, ...(c.options ? { options: c.options } : {}) };
  };
  const saveSel = () => { store.set("selection", S.selection); store.set("customs", S.customs); syncButtons(); };

  /* ---------------- API ---------------- */

  const MESSAGES = {
    rate_limited: (e, h) => `درخواست‌ها زیاد شد. ${fa(h.get("retry-after") || 30)} ثانیهٔ دیگر دوباره بفرستید.`,
    not_ready: () => "لیلا هنوز در حال بالا آمدن است. چند ثانیهٔ دیگر دوباره بفرستید.",
    busy: () => "سرور مشغول است. چند لحظهٔ دیگر دوباره بفرستید.",
    text_too_long: () => `متن طولانی است. حداکثر ${fa(S.limits?.anonymous?.max_chars || 4000)} نویسه بفرستید.`,
    too_many_outputs: () => `حداکثر ${fa(maxOutputs())} خروجی در هر درخواست.`,
    missing_key: () => "این سرور کلید API می‌خواهد و حالت نمایشی آن خاموش است.",
    timeout: () => "پاسخ بیش از حد طول کشید. متن کوتاه‌تر یا خروجی کمتر بفرستید.",
  };
  async function apiError(res) {
    let body = {};
    try { body = await res.json(); } catch { /* not JSON */ }
    const e = body.error || {};
    return (MESSAGES[e.code] || (() => e.message || `خطای سرور (${fa(res.status)})`))(e, res.headers);
  }

  async function loadCatalog() {
    try {
      const r = await fetch(API + "/api/v1/outputs");
      if (!r.ok) throw new Error(await apiError(r));
      const b = await r.json();
      S.catalog = b.outputs; S.limits = b.limits;
      S.selection = S.selection.filter((id) => presetById(id) || customById(id)).slice(0, maxOutputs());
      if (!S.selection.length) S.selection = DEFAULT_SELECTION.slice();
      saveSel();
    } catch (err) {
      toast(err.message.includes("fetch") ? "به سرور لیلا وصل نشد. نشانی API را بررسی کنید." : err.message);
    }
  }

  /** Streams results into `turn`. Each row stays in its waiting state until its own real result line arrives. */
  async function run(turn, ids) {
    const rows = ids.map((id) => ({ id, status: "queued", result: null, error: null }));
    turn.rows.push(...rows);
    turn.running += 1;
    renderTurn(turn);
    const fail = (msg) => { rows.forEach((r) => { if (r.status !== "done") { r.status = "error"; r.error = msg; } }); };
    const ctrl = new AbortController();
    turn.ctrls.push(ctrl);
    const t0 = performance.now();
    try {
      const res = await fetch(API + "/api/v1/decisions/stream", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({ text: turn.text, outputs: ids.map(specOf) }),
      });
      if (!res.ok) { fail(await apiError(res)); return; }
      markWorking(rows); renderTurn(turn);
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.event === "start") { turn.truncated = turn.truncated || ev.truncated; turn.ttfb = performance.now() - t0; }
          else if (ev.event === "done") { turn.total = performance.now() - t0; turn.server = ev.duration_ms; }
          else if (ev.event === "result") {
            const row = rows.find((r) => r.id === ev.result.id && r.status !== "done");
            if (row) { row.status = "done"; row.result = ev.result; row.at = performance.now() - t0; }
            markWorking(rows); renderTurn(turn);
          } else if (ev.event === "error") fail(MESSAGES[ev.error.code]?.() || ev.error.message);
        }
      }
      if (rows.some((r) => r.status !== "done" && r.status !== "error")) fail("پاسخ کامل نرسید. دوباره بفرستید.");
    } catch {
      if (ctrl.signal.aborted) return;
      fail("به سرور لیلا وصل نشد. اتصال را بررسی کنید.");
    } finally {
      turn.running -= 1;
      turn.ctrls = turn.ctrls.filter((c) => c !== ctrl);
      if (!ctrl.signal.aborted) renderTurn(turn);
      syncSend();
    }
  }
  // The server answers in order, one at a time: the first unfinished row is the one being read right now.
  function markWorking(rows) {
    let first = true;
    for (const r of rows) {
      if (r.status === "done" || r.status === "error" || r.removed) continue;
      r.status = first ? "working" : "queued"; first = false;
    }
  }

  /* ---------------- thread ---------------- */

  const app = $(".app"), thread = $("#turns");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const EASE = "cubic-bezier(.2, .8, .2, 1)";

  /** Change the page, letting the browser cross-fade old and new when it can. */
  function transition(mutate) {
    if (document.startViewTransition && !reduce.matches) document.startViewTransition(mutate);
    else mutate();
  }
  /** Run `mutate`, then animate `node` from its old height to its new one. */
  function morphHeight(node, mutate, ms = 280) {
    if (reduce.matches || !node.isConnected) return mutate();
    const h0 = node.offsetHeight;
    mutate();
    const h1 = node.offsetHeight;
    if (Math.abs(h1 - h0) < 2) return;
    node.style.overflow = "hidden";
    node.animate([{ height: h0 + "px" }, { height: h1 + "px" }], { duration: ms, easing: EASE })
      .finished.finally(() => { node.style.overflow = ""; });
  }
  function growIn(node, ms = 320) {
    if (reduce.matches) return;
    const h = node.offsetHeight;
    node.style.overflow = "hidden";
    node.animate([{ height: 0, opacity: 0 }, { height: h + "px", opacity: 1 }], { duration: ms, easing: EASE })
      .finished.finally(() => { node.style.overflow = ""; });
  }
  function collapseOut(node, done, ms = 240) {
    if (reduce.matches) { node.remove(); return done?.(); }
    node.style.overflow = "hidden";
    node.animate([{ height: node.offsetHeight + "px", opacity: 1 }, { height: 0, opacity: 0, paddingTop: 0, paddingBottom: 0 }],
      { duration: ms, easing: EASE }).finished.then(() => { node.remove(); done?.(); });
  }

  function submit(text, ids) {
    text = text.trim();
    if (!text || !ids.length) return;
    const turn = { text, rows: [], running: 0, truncated: false, ctrls: [] };
    S.turns.push(turn);
    turn.node = el("section", { class: "turn", "aria-label": "پرسش" });
    turn.prompt = el("div", { class: "prompt" + (text.length > 320 ? " clamped" : ""),
      onclick: () => { if (turn.prompt.classList.contains("clamped")) morphHeight(turn.prompt, () => turn.prompt.classList.remove("clamped")); } }, text);
    turn.head = el("div", { class: "sheet-head" });
    turn.list = el("div", { class: "rows" });
    turn.node.append(turn.prompt, el("div", { class: "sheet" }, turn.head, turn.list));
    const first = app.dataset.view !== "thread";
    const show = () => { app.dataset.view = "thread"; thread.append(turn.node); };
    if (first) transition(show); else { show(); growIn(turn.node, 380); }
    run(turn, ids);
    syncSend();
    requestAnimationFrame(() => turn.node.scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth", block: "start" }));
    $("#dock-input").focus({ preventScroll: true });
  }

  function goHome() {
    if (app.dataset.view === "home") return;
    closePicker();
    for (const t of S.turns) t.ctrls.forEach((c) => c.abort());
    S.turns = [];
    transition(() => {
      thread.replaceChildren();
      app.dataset.view = "home";
      scrollTo(0, 0);
    });
    syncSend();
    $("#home-input").focus({ preventScroll: true });
  }

  /** Bring a turn's DOM in line with its rows, touching only what changed. */
  function renderTurn(turn) {
    const live = turn.rows.filter((r) => !r.removed);
    renderHead(turn, live);
    for (const r of turn.rows) {
      if (r.removed) {
        if (r.node && !r.leaving) { r.leaving = true; collapseOut(r.node, () => { r.node = null; }); }
        continue;
      }
      if (!r.node) {
        r.node = el("div", { class: "result" }, el("div", { class: "name" }, titleOf(r.id)),
          el("button", { class: "del", type: "button", "aria-label": `حذف ${titleOf(r.id)}`, html: ICON.x,
            onclick: () => removeRow(turn, r.id) }),
          el("div", { class: "val" }));
        turn.list.append(r.node);
        paintRow(r);
        if (turn.node.isConnected) growIn(r.node);
      } else if (r.shown !== r.status) {
        morphHeight(r.node, () => paintRow(r));
      }
    }
    const empty = !live.length;
    if (empty && !turn.emptyNode) {
      turn.emptyNode = el("div", { class: "result empty" }, el("div", { class: "val" }, "خروجی‌ای نمانده. با «خروجی» یکی اضافه کنید."));
      turn.list.append(turn.emptyNode); growIn(turn.emptyNode);
    } else if (!empty && turn.emptyNode) { collapseOut(turn.emptyNode); turn.emptyNode = null; }
  }

  function renderHead(turn, live) {
    const done = live.filter((r) => r.status === "done").length;
    let status = turn.running ? `${fa(done)} از ${fa(live.length)}`
      : turn.truncated && live.length ? "متن بلند بود؛ ابتدا و انتهایش خوانده شد" : "";
    if (TIMING && !turn.running && turn.total) status = `total ${Math.round(turn.total)} ms · server ${Math.round(turn.server)} ms · first byte ${Math.round(turn.ttfb)} ms`;
    if (!turn.headBuilt) {
      turn.segs = el("span", { class: "segs", "aria-hidden": "true" });
      turn.status = el("span", {});
      turn.head.append(el("div", { class: "progress", role: "status", "aria-live": "polite" }, turn.segs, turn.status),
        el("button", { class: "add-btn", type: "button", "aria-haspopup": "dialog", html: ICON.plus + "<span>خروجی</span>",
          onclick: (e) => openPicker(e.currentTarget, { turn }) }));
      turn.headBuilt = true;
    }
    // one segment per output; existing segments keep their element so colour changes transition
    const segs = turn.segs;
    while (segs.children.length > live.length) segs.lastChild.remove();
    while (segs.children.length < live.length) segs.append(el("i"));
    live.forEach((r, i) => { segs.children[i].className = r.status === "done" ? "on" : r.status === "error" ? "err" : ""; });
    if (turn.status.textContent !== status) turn.status.textContent = status;
  }

  function removeRow(turn, id) {
    turn.rows.forEach((r) => { if (r.id === id && !r.removed) r.removed = true; });
    renderTurn(turn);
  }

  function paintRow(r) {
    const old = r.node.querySelector(".val");
    let val;
    if (r.status === "error") val = el("div", { class: "val err-text" }, r.error);
    else if (r.status !== "done") {
      val = el("div", { class: "val" }, el("div", { class: "taq-wait" + (r.status === "queued" ? " queued" : ""), html: TAQ },
        el("span", {}, r.status === "working" ? "در حال خواندن…" : "در صف")));
    } else val = renderAnswer(r);
    if (r.shown && r.shown !== r.status) val.classList.add("landed");
    old.replaceWith(val);
    r.shown = r.status;
  }

  function renderAnswer(r) {
    const res = r.result;
    const unsure = res.type === "yes_no" ? res.probability < 0.65 : res.probability < 0.5;
    const top = el("div", { class: "answer" }, el("b", {}, res.label), el("span", { class: "pct" }, pct(res.probability)),
      unsure ? el("span", { class: "unsure" }, "نامطمئن") : null);
    const wrap = el("div", { class: "val" }, top);
    if (TIMING) wrap.append(el("div", { class: "timing" },
      `model ${res.cached ? "cache" : Math.round(res.duration_ms) + " ms"} · arrived ${Math.round(r.at || 0)} ms after send`));
    const grow = (bar, p) => requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = (p * 100).toFixed(1) + "%"; }));
    if (res.type === "scale") {
      const n = res.options.length, lvl = Number(res.answer);
      const cells = res.options.map(() => el("i"));
      wrap.append(el("div", { class: "scale", role: "img", "aria-label": `${res.label}، سطح ${fa(lvl + 1)} از ${fa(n)}` },
        el("div", { class: "track" }, cells),
        el("div", { class: "ends" }, el("span", {}, res.options[0].label), el("span", {}, res.options[n - 1].label))));
      cells.forEach((c, i) => { if (i <= lvl) setTimeout(() => c.classList.add("fill"), 60 + i * 70); });
    } else {
      const fill = el("i");
      wrap.append(el("div", { class: "bar" }, fill));
      grow(fill, res.probability);
    }
    if (res.type !== "yes_no" && res.options.length > 2) {
      const opts = [...res.options].sort((a, b) => (res.type === "scale" ? 0 : b.probability - a.probability));
      const fills = opts.map(() => el("i"));
      const dist = el("div", { class: "dist", hidden: true },
        opts.map((o, i) => el("div", { class: "opt" + (o.key === res.answer ? " top" : "") }, el("span", {}, o.label),
          el("div", { class: "bar" }, fills[i]), el("span", {}, pct(o.probability)))));
      const more = el("button", { class: "more", type: "button", "aria-expanded": "false", onclick: () => {
        const open = dist.hidden;
        morphHeight(r.node, () => { dist.hidden = !open; more.textContent = open ? "بستن" : "همهٔ گزینه‌ها"; });
        more.setAttribute("aria-expanded", String(open));
        fills.forEach((f, i) => { f.style.width = "0"; if (open) grow(f, opts[i].probability); });
      } }, "همهٔ گزینه‌ها");
      wrap.append(more, dist);
    }
    return wrap;
  }

  /* ---------------- output window (modal over a dimmed page) ---------------- */

  const picker = $("#picker"), scrim = $("#scrim");
  let P = null; // {anchor, turn?, draft}
  const MAX_CUSTOMS = 8;

  function openPicker(anchor, { turn } = {}) {
    P = { anchor, turn, draft: { type: "choice", question: "", options: [] } };
    picker.dataset.tab = "ready";
    anchor.setAttribute("aria-expanded", "true");
    renderPicker();
    picker.dataset.open = scrim.dataset.open = "true";
    picker.removeAttribute("inert");
    document.documentElement.style.overflow = "hidden";
    setTimeout(() => picker.querySelector(".chip:not(:disabled)")?.focus({ preventScroll: true }), 60);
  }
  function closePicker() {
    if (!P) return;
    picker.dataset.open = scrim.dataset.open = "false";
    picker.setAttribute("inert", "");
    document.documentElement.style.overflow = "";
    P.anchor.setAttribute("aria-expanded", "false");
    const a = P.anchor; P = null;
    if (document.body.contains(a)) a.focus({ preventScroll: true });
  }

  function current() { return P.turn ? P.turn.rows.filter((r) => !r.removed).map((r) => r.id) : S.selection; }

  function toggle(id) {
    const on = current().includes(id);
    if (P.turn) {
      if (on) removeRow(P.turn, id);
      else run(P.turn, [id]);
    } else {
      S.selection = on ? S.selection.filter((x) => x !== id) : [...S.selection, id];
      saveSel();
    }
    refreshPicker();
  }

  /** Update chip states and the footer in place, so selection changes animate instead of redrawing. */
  function refreshPicker() {
    const cur = current(), full = cur.length >= maxOutputs();
    picker.querySelectorAll(".chip[data-id]").forEach((b) => {
      const on = cur.includes(b.dataset.id);
      b.setAttribute("aria-pressed", String(on));
      b.disabled = !on && full;
    });
    picker.querySelectorAll(".meter i").forEach((m, i) => m.classList.toggle("on", i < cur.length));
    const sum = picker.querySelector(".summary");
    sum.children[1].textContent = cur.length ? `${fa(cur.length)} از ${fa(maxOutputs())}:` : "هنوز خروجی‌ای انتخاب نشده";
    sum.querySelector(".names")?.remove();
    if (cur.length) sum.append(el("span", { class: "names" }, cur.map(titleOf).join("، ")));
    const add = picker.querySelector(".builder .btn.primary");
    if (add && full) add.disabled = true;
  }

  function chip(id, title, hint, cur, full, removable) {
    const on = cur.includes(id);
    const b = el("button", { class: "chip", type: "button", "aria-pressed": String(on), "data-id": id,
      title: hint || null, disabled: !on && full, onclick: () => toggle(id), html: ICON.tick },
      el("span", { class: "q" }, title));
    if (removable) b.append(el("span", { class: "x", role: "button", tabindex: "-1", "aria-label": `پاک کردن ${title}`, html: ICON.x,
      onclick: (e) => { e.stopPropagation();
        S.customs = S.customs.filter((c) => c.id !== id); S.selection = S.selection.filter((x) => x !== id);
        saveSel(); renderPicker(); } }));
    return b;
  }

  function renderPicker(focusId) {
    const cur = current(), full = cur.length >= maxOutputs();
    const groups = [...new Set(S.catalog.map((c) => c.group))];
    const ready = el("div", { class: "col col-ready" },
      el("p", { class: "col-title" }, "خروجی‌های آماده"),
      el("div", { class: "groups" }, groups.map((g) => el("div", {},
        el("h3", {}, g),
        el("div", { class: "chips" }, S.catalog.filter((c) => c.group === g).map((c) => chip(c.id, c.title, c.hint, cur, full)))))));
    const own = el("div", { class: "col col-own" },
      el("p", { class: "col-title" }, "سؤال خودتان"), builder(full),
      S.customs.length ? el("div", { class: "mine" }, el("h3", {}, "سؤال‌های شما"),
        el("div", { class: "chips" }, S.customs.map((c) => chip(c.id, c.question, TYPE_NAME[c.type], cur, full, true)))) : null);
    const names = cur.map(titleOf).join("، ");
    picker.replaceChildren(
      el("header", {},
        el("div", {}, el("h2", { id: "picker-title" }, P.turn ? "خروجی‌های این متن" : "خروجی‌ها"),
          el("p", {}, "لیلا برای هر خروجی یک بار متن را می‌خواند؛ خروجی کمتر یعنی پاسخ زودتر.")),
        el("button", { class: "close", type: "button", "aria-label": "بستن", html: ICON.x, onclick: closePicker })),
      el("div", { class: "tabs", role: "tablist", "aria-label": "بخش‌ها" }, [["ready", "آماده"], ["own", "سؤال خودتان"]].map(([k, name]) =>
        el("button", { type: "button", role: "tab", "aria-selected": String((picker.dataset.tab || "ready") === k),
          onclick: (e) => { picker.dataset.tab = k;
            e.currentTarget.parentNode.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b === e.currentTarget))); } }, name))),
      el("div", { class: "body" }, ready, own),
      el("footer", {},
        el("div", { class: "summary", role: "status" },
          el("span", { class: "meter", "aria-hidden": "true" },
            Array.from({ length: maxOutputs() }, (_, i) => el("i", { class: i < cur.length ? "on" : "" }))),
          el("span", {}, cur.length ? `${fa(cur.length)} از ${fa(maxOutputs())}:` : "هنوز خروجی‌ای انتخاب نشده"),
          cur.length ? el("span", { class: "names" }, names) : null),
        el("button", { class: "btn primary", type: "button", onclick: closePicker }, "تمام")));
    if (focusId) picker.querySelector(`.chip[data-id="${CSS.escape(focusId)}"]`)?.focus({ preventScroll: true });
  }

  function builder(full) {
    const d = P.draft;
    const needsOptions = d.type !== "yes_no";
    const isValid = () => d.question.trim().length >= 2 && (!needsOptions || d.options.length >= 2);
    const q = el("input", { class: "field", type: "text", maxlength: "400", value: d.question,
      placeholder: d.type === "yes_no" ? "مثلاً: آیا مشتری پولش را پس می‌خواهد؟" :
        d.type === "scale" ? "مثلاً: مشتری چقدر عصبانی است؟" : "مثلاً: این پیام به کدام واحد مربوط است؟",
      "aria-label": "متن سؤال", oninput: (e) => { d.question = e.target.value; sync(); },
      onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); needsOptions ? optIn.focus() : add.click(); } } });
    const optIn = el("input", { class: "field", type: "text", maxlength: "120",
      placeholder: d.type === "scale" ? "سطح‌ها را از کم به زیاد بنویسید و Enter بزنید" : "گزینه را بنویسید و Enter بزنید",
      "aria-label": "افزودن گزینه", hidden: !needsOptions,
      onkeydown: (e) => {
        if (e.key !== "Enter" && e.key !== "،" && e.key !== ",") return;
        e.preventDefault();
        const v = e.target.value.trim();
        if (!v && e.key === "Enter" && isValid()) return add.click();
        if (v && !d.options.includes(v) && d.options.length < (d.type === "scale" ? 10 : 12)) { d.options.push(v); e.target.value = ""; redraw("opt"); }
      } });
    const list = el("div", { class: "opt-list" }, needsOptions ? d.options.map((o, i) =>
      el("span", { class: "chip", "aria-pressed": "true" }, d.type === "scale" ? `${fa(i + 1)}. ${o}` : o,
        el("button", { class: "x", type: "button", "aria-label": `حذف ${o}`, html: ICON.x,
          onclick: () => { d.options.splice(i, 1); redraw("opt"); } }))) : []);
    const add = el("button", { class: "btn primary", type: "button", disabled: !isValid() || full, onclick: () => {
      if (!isValid() || full) return;
      const c = { id: "c" + Date.now().toString(36), type: d.type, question: d.question.trim(),
        ...(needsOptions ? { options: d.options.slice() } : {}) };
      S.customs.push(c);
      while (S.customs.length > MAX_CUSTOMS) {
        const old = S.customs.findIndex((x) => !S.selection.includes(x.id) && x.id !== c.id);
        if (old < 0) break;
        S.customs.splice(old, 1);
      }
      P.draft = { type: d.type, question: "", options: [] };
      if (P.turn) run(P.turn, [c.id]); else S.selection.push(c.id);
      saveSel();
      renderPicker(c.id);
    } }, "افزودن");
    const note = el("span", { class: "note" }, d.type === "choice" ? "دست‌کم دو گزینه" : d.type === "scale" ? "دست‌کم دو سطح، از کم به زیاد" : "پاسخ: احتمال «بله»");
    const box = el("div", { class: "builder" },
      el("div", { class: "seg", role: "group", "aria-label": "نوع سؤال" }, Object.entries(TYPE_NAME).map(([t, name]) =>
        el("button", { type: "button", "aria-pressed": String(d.type === t), onclick: () => { d.type = t; redraw("seg"); } }, name))),
      q, optIn, list, el("div", { class: "row" }, note, add));
    function sync() { add.disabled = !isValid() || full; }
    function redraw(focus) {
      const next = builder(full);
      box.replaceWith(next);
      const target = focus === "opt" ? 'input[aria-label="افزودن گزینه"]' : '.seg button[aria-pressed="true"]';
      next.querySelector(target)?.focus({ preventScroll: true });
    }
    return box;
  }

  scrim.addEventListener("click", closePicker);
  addEventListener("keydown", (e) => {
    if (!P) return;
    if (e.key === "Escape") { e.preventDefault(); closePicker(); return; }
    if (e.key === "Tab") { // keep focus inside the window
      const f = [...picker.querySelectorAll("button:not(:disabled), input:not([hidden])")].filter((n) => n.offsetParent);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------------- composers ---------------- */

  const sends = [];
  function mountComposer(form) {
    const ta = $("textarea", form), btn = $(".send", form), out = $(".out-btn", form);
    btn.innerHTML = ICON.send; out.insertAdjacentHTML("afterbegin", ICON.arcade);
    const fit = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 220) + "px"; };
    const can = () => ta.value.trim().length > 0 && S.selection.length > 0;
    const sync = () => { btn.disabled = !can(); };
    ta.addEventListener("input", () => { fit(); sync(); });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!can()) { if (!S.selection.length) openPicker(out); return; }
      submit(ta.value, S.selection.slice());
      ta.value = ""; fit(); sync();
    });
    out.addEventListener("click", () => (P ? closePicker() : openPicker(out)));
    sends.push({ sync, btn });
    sync();
  }
  function syncSend() {
    const busy = S.turns.some((t) => t.running);
    for (const s of sends) {
      s.sync();
      s.btn.dataset.busy = String(busy);
      s.btn.innerHTML = busy ? ICON.spin : ICON.send;
      s.btn.setAttribute("aria-label", busy ? "در حال خواندن" : "بفرست");
    }
  }
  function syncButtons() {
    const n = S.selection.length;
    document.querySelectorAll(".out-btn").forEach((b) => {
      b.querySelector(".count").textContent = fa(n);
      b.setAttribute("aria-label", `خروجی‌ها: ${fa(n)} انتخاب شده`);
      b.title = S.selection.map(titleOf).join("، ") || "خروجی‌ای انتخاب نشده";
    });
    sends.forEach((s) => s.sync());
  }

  /** Select these outputs (preset ids or {type, question, options}) and send `text`. */
  function runExample(text, outputs) {
    const ids = outputs.map((o) => {
      if (typeof o === "string") return o;
      let c = S.customs.find((x) => x.type === o.type && x.question === o.question);
      if (!c) { c = { id: "c" + Math.random().toString(36).slice(2, 9), ...o }; S.customs.push(c); }
      return c.id;
    });
    S.selection = ids.slice(0, maxOutputs()); saveSel();
    submit(text, S.selection.slice());
  }

  function renderSuggestions() {
    $("#suggest").replaceChildren(...SUGGESTIONS.map((sg) => el("button", { type: "button",
      onclick: () => runExample(sg.text, sg.outputs) },
      el("span", { class: "kind" }, sg.kind), el("span", { class: "snip" }, sg.text))));
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.dataset.open = "true";
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.dataset.open = "false"), 4200);
  }

  document.querySelectorAll("form.composer").forEach(mountComposer);
  $("#home-link").addEventListener("click", goHome);
  renderSuggestions();
  loadCatalog().then(syncButtons);
  // Never let placeholder answers pass for Layla: say so loudly when the API runs its test engine.
  fetch(API + "/ready").then((r) => r.ok ? r.json() : null).then((b) => {
    if (b && b.engine !== "laya") document.body.append(el("div", { class: "fake-banner", role: "alert" },
      "موتور آزمایشی: این پاسخ‌ها از لیلا نیستند و فقط برای آزمودن صفحه‌اند."));
  }).catch(() => {});
  syncButtons();

  // The rest of the site (site.js) drives the playground through this.
  window.LaylaPlay = {
    api: API, timing: TIMING, el, fa, toast,
    run: (text, outputs) => { if (S.catalog.length) runExample(text, outputs); else loadCatalog().then(() => runExample(text, outputs)); },
    home: goHome,
    focus: () => (app.dataset.view === "home" ? $("#home-input") : $("#dock-input")).focus({ preventScroll: true }),
    closePicker,
  };
})();
