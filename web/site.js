/* Layla site: top bar, routing, sign-in, API keys, docs and services. The playground lives in app.js. */
(() => {
  "use strict";

  const P = window.LaylaPlay;
  const { el, fa } = P;
  const API = P.api;
  const BASE = /^https?:/.test(API) ? API : location.origin + API;   // what code samples call
  const $ = (s, r = document) => r.querySelector(s);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const ICON = {
    copy: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="5" y="5" width="8.5" height="8.5" rx="2"/><path d="M10.5 5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5H5"/></svg>',
    key: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="5.5" cy="10.5" r="3"/><path d="M7.7 8.3L13.5 2.5M11.5 4.5l1.6 1.6M10 6l1.2 1.2"/></svg>',
    out: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v7A1.5 1.5 0 0 0 3.5 13H6M10.5 11l3-3-3-3M13.5 8H6"/></svg>',
  };
  const G = {
    me: undefined,          // account overview, null when signed out, undefined while unknown
    auth: null, models: null,
  };

  /* ---------------- API ---------------- */

  async function call(path, { method = "GET", body } = {}) {
    let res;
    try {
      res = await fetch(API + path, {
        method, credentials: "include",
        headers: { ...(body ? { "Content-Type": "application/json" } : {}), "X-Requested-With": "layla" },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      return { ok: false, status: 0, error: { code: "network", message: "به سرور لیلا وصل نشد." } };
    }
    let data = null;
    if (res.status !== 204) { try { data = await res.json(); } catch { /* empty */ } }
    return { ok: res.ok, status: res.status, data, error: data?.error };
  }
  const MSG = {
    network: "به سرور لیلا وصل نشد. اتصال را بررسی کنید.",
    key_limit: "به سقف کلیدها رسیده‌اید. اول یکی را حذف کنید.",
    rate_limited: "درخواست‌ها زیاد شد. کمی بعد دوباره امتحان کنید.",
    invalid_credential: "ورود با Google تأیید نشد. دوباره امتحان کنید.",
    google_not_configured: "ورود با Google هنوز روی این سرور راه نیفتاده است.",
  };
  const say = (e) => MSG[e?.code] || e?.message || "کار انجام نشد. دوباره امتحان کنید.";

  async function loadMe() {
    const r = await call("/api/v1/account");
    G.me = r.ok ? r.data : null;
    renderAccount();
    return G.me;
  }

  /* ---------------- router ---------------- */

  const ROUTES = ["play", "api", "docs", "services", "login", "keys"];
  function parse() {
    const [path, q] = location.hash.replace(/^#\/?/, "").split("?");
    return { route: ROUTES.includes(path) ? path : "play", params: new URLSearchParams(q || "") };
  }
  function go(hash) { if (location.hash !== hash) location.hash = hash; else show(); }

  async function show() {
    const { route, params } = parse();
    P.closePicker();
    const swap = async () => {
      document.body.dataset.route = route;
      document.querySelectorAll("[data-route-view]").forEach((v) => { v.hidden = v.dataset.routeView !== route; });
      document.querySelectorAll(".tb-nav a").forEach((a) => a.setAttribute("aria-current", String(a.dataset.route === route)));
      await PAGES[route]?.(params);
    };
    if (document.startViewTransition && !reduce.matches && document.body.dataset.route && document.body.dataset.route !== route) {
      document.startViewTransition(swap);
    } else await swap();
    if (route !== "play") scrollTo(0, 0); else P.focus();
    document.title = { play: "لیلا", api: "API لیلا", docs: "مستندات لیلا", services: "خدمات لیلا",
      login: "ورود به لیلا", keys: "کلیدهای API لیلا" }[route];
  }
  addEventListener("hashchange", show);

  /* ---------------- top bar ---------------- */

  function renderAccount() {
    const box = $("#tb-account");
    if (G.me === undefined) return box.replaceChildren();
    if (!G.me) {
      return box.replaceChildren(el("a", { class: "btn tb-login", href: "#/login" }, "ورود"));
    }
    const u = G.me.user;
    const avatar = u.picture
      ? el("img", { src: u.picture, alt: "", referrerpolicy: "no-referrer" })
      : el("span", {}, (u.name || u.email).trim().charAt(0).toUpperCase());
    const menu = el("div", { class: "menu", role: "menu", hidden: true },
      el("div", { class: "who" }, el("b", {}, u.name), el("span", {}, u.email)),
      el("a", { href: "#/keys", role: "menuitem", html: ICON.key }, "کلیدهای API"),
      el("button", { type: "button", role: "menuitem", html: ICON.out, onclick: logout }, "خروج"));
    const btn = el("button", { class: "avatar", type: "button", "aria-haspopup": "menu", "aria-expanded": "false",
      "aria-label": `حساب ${u.name}`, onclick: (e) => { e.stopPropagation(); toggleMenu(menu, btn); } }, avatar);
    box.replaceChildren(btn, menu);
  }
  function toggleMenu(menu, btn, force) {
    const open = force ?? menu.hidden;
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    if (open) menu.querySelector("a,button")?.focus({ preventScroll: true });
  }
  document.addEventListener("click", (e) => {
    const m = $("#tb-account .menu");
    if (m && !m.hidden && !m.contains(e.target)) toggleMenu(m, $("#tb-account .avatar"), false);
  });
  document.addEventListener("keydown", (e) => {
    const m = $("#tb-account .menu");
    if (e.key === "Escape" && m && !m.hidden) { toggleMenu(m, $("#tb-account .avatar"), false); $("#tb-account .avatar").focus(); }
  });
  async function logout() {
    await call("/api/v1/auth/logout", { method: "POST" });
    G.me = null; renderAccount();
    P.toast("از حساب خارج شدید.");
    if (parse().route === "keys") go("#/");
  }

  /* ---------------- shared bits ---------------- */

  const page = (route) => $(`[data-route-view="${route}"] .page-body`);
  function copyButton(getText, label = "کپی") {
    const b = el("button", { class: "copy", type: "button", html: ICON.copy + `<span>${label}</span>`, onclick: async () => {
      const text = getText();
      try { await navigator.clipboard.writeText(text); }
      catch {
        const t = el("textarea", { style: "position:fixed;opacity:0" }); t.value = text; document.body.append(t);
        t.select(); document.execCommand("copy"); t.remove();
      }
      b.querySelector("span").textContent = "کپی شد";
      b.classList.add("done");
      setTimeout(() => { b.querySelector("span").textContent = label; b.classList.remove("done"); }, 1600);
    } });
    return b;
  }
  function codeBlock(tabs) {
    let cur = 0;
    const pre = el("pre", { dir: "ltr" }, el("code", {}, tabs[0][1]));
    const bar = el("div", { class: "code-tabs", role: "tablist" }, tabs.map(([name], i) =>
      el("button", { type: "button", role: "tab", "aria-selected": String(i === 0), onclick: (e) => {
        cur = i; pre.firstChild.textContent = tabs[i][1];
        bar.querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-selected", String(j === i)));
      } }, name)));
    return el("div", { class: "code" }, el("div", { class: "code-head" }, bar, copyButton(() => tabs[cur][1])), pre);
  }
  function morph(node, mutate) {
    if (reduce.matches) return mutate();
    const h0 = node.offsetHeight; mutate(); const h1 = node.offsetHeight;
    node.style.overflow = "hidden";
    node.animate([{ height: h0 + "px" }, { height: h1 + "px" }], { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" })
      .finished.finally(() => { node.style.overflow = ""; });
  }
  const jdate = (iso) => new Date(iso).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" });

  const SAMPLE_BODY = `{
  "text": "سفارشم سه روز است نرسیده. لطفاً پولم را برگردانید.",
  "outputs": [
    {"id": "tone", "preset": "sentiment"},
    {"id": "urgency", "preset": "urgency"},
    {"id": "refund", "type": "yes_no", "question": "آیا مشتری پولش را پس می‌خواهد؟"}
  ]
}`;
  const SAMPLES = (key = "lyl_YOUR_KEY") => [
    ["cURL", `curl ${BASE}/api/v1/decisions \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '${SAMPLE_BODY.replace(/\n\s*/g, " ")}'`],
    ["Python", `import requests

r = requests.post(
    "${BASE}/api/v1/decisions",
    headers={"Authorization": "Bearer ${key}"},
    json=${SAMPLE_BODY.replace(/\n/g, "\n    ")},
)
for result in r.json()["results"]:
    print(result["id"], result["label"], result["probability"])`],
    ["JavaScript", `const r = await fetch("${BASE}/api/v1/decisions", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${key}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${SAMPLE_BODY.replace(/\n/g, "\n  ")}),
});
const { results } = await r.json();
results.forEach((x) => console.log(x.id, x.label, x.probability));`],
  ];

  /* ---------------- pages ---------------- */

  const PAGES = {
    play() {},

    async api() {
      const body = page("api");
      if (!G.models) {
        const r = await call("/api/v1/models");
        G.models = r.ok ? r.data.models : [];
      }
      const getKey = el("button", { class: "btn primary big", type: "button", html: ICON.key,
        onclick: () => go(G.me ? "#/keys" : "#/login?next=keys") }, "دریافت کلید API");
      const rows = G.models.map((m) => {
        const panel = el("div", { class: "model-code", hidden: true }, codeBlock(SAMPLES()));
        const toggle = el("button", { class: "btn", type: "button", "aria-expanded": "false", onclick: () => {
          const open = panel.hidden;
          morph(row, () => { panel.hidden = !open; });
          toggle.setAttribute("aria-expanded", String(open));
          toggle.textContent = open ? "بستن کد" : "نمونهٔ کد";
        } }, "نمونهٔ کد");
        const row = el("article", { class: "model-row" },
          el("div", { class: "model-main" },
            el("div", { class: "model-name" }, el("h3", {}, m.name_fa), el("code", { dir: "ltr" }, m.id),
              el("span", { class: "pill ok" }, "در دسترس")),
            el("p", {}, m.description_fa),
            el("div", { class: "tags" },
              el("span", {}, "فارسی و انگلیسی"),
              el("span", {}, "چندگزینه‌ای، بله یا خیر، طیف"),
              el("span", {}, `تا ${fa(m.max_text_tokens)} توکن متن`))),
          el("div", { class: "model-actions" }, toggle),
          panel);
        return row;
      });
      body.replaceChildren(
        el("header", { class: "page-head" },
          el("div", {}, el("h1", {}, "API لیلا"),
            el("p", { class: "lede" }, "لیلا را در محصول خودتان به کار ببرید: متن را بفرستید و پاسخ هر پرسش را با احتمالش، در قالب JSON بگیرید."),
            el("div", { class: "head-actions" }, getKey))),
        el("ul", { class: "facts" },
          el("li", {}, el("b", {}, `${fa(100)} درخواست رایگان`), el("span", {}, "برای هر حساب، بدون کارت بانکی")),
          el("li", {}, el("b", {}, "پاسخ یک‌جا یا جریانی"), el("span", {}, "هر پاسخ همان لحظه که آماده شد می‌رسد")),
          el("li", {}, el("b", {}, "نسخهٔ ویژه به‌زودی"), el("span", {}, "سقف بیشتر برای کار جدی"))),
        el("h2", { class: "section-title" }, "مدل‌ها"),
        el("div", { class: "models" }, rows.length ? rows : el("p", { class: "muted" }, "فهرست مدل‌ها بارگیری نشد.")),
        el("p", { class: "muted small" }, "راهنمای کامل در ", el("a", { href: "#/docs" }, "مستندات"), " است."));
    },

    async login(params) {
      const next = params.get("next") || "keys";
      if (G.me) return go("#/" + next);
      const body = page("login");
      if (!G.auth) {
        const r = await call("/api/v1/auth/config");
        G.auth = r.ok ? r.data : { google_client_id: "", dev_login: false };
      }
      const status = el("p", { class: "form-error", role: "alert" });
      const done = async (r) => {
        if (!r.ok) { status.textContent = say(r.error); return; }
        G.me = r.data; renderAccount();
        P.toast(`خوش آمدید، ${G.me.user.name}.`);
        go("#/" + next);
      };
      const googleBox = el("div", { class: "google-box" });
      const parts = [];
      if (G.auth.google_client_id) {
        parts.push(googleBox);
        loadGoogle().then(() => {
          google.accounts.id.initialize({ client_id: G.auth.google_client_id, ux_mode: "popup",
            callback: async (resp) => done(await call("/api/v1/auth/google", { method: "POST", body: { credential: resp.credential } })) });
          google.accounts.id.renderButton(googleBox, { theme: "outline", size: "large", shape: "pill", text: "signin_with",
            locale: "fa", width: 280 });
        }).catch(() => { status.textContent = "دکمهٔ Google بارگیری نشد. اتصال را بررسی کنید."; });
      } else {
        parts.push(el("p", { class: "muted" }, "ورود با Google هنوز روی این سرور راه نیفتاده است."));
      }
      if (G.auth.dev_login) {
        const email = el("input", { class: "field", type: "email", required: true, placeholder: "you@example.com", dir: "ltr", "aria-label": "ایمیل" });
        parts.push(el("form", { class: "dev-login", onsubmit: async (e) => {
          e.preventDefault();
          done(await call("/api/v1/auth/dev", { method: "POST", body: { email: email.value.trim() } }));
        } }, el("span", { class: "dev-tag" }, "فقط برای آزمایش"), email, el("button", { class: "btn primary", type: "submit" }, "ورود آزمایشی")));
      }
      body.replaceChildren(el("div", { class: "login-card" },
        $(".logo-wrap svg").cloneNode(true),
        el("h1", {}, "ورود به لیلا"),
        el("p", { class: "lede" }, `برای ساختن کلید API وارد شوید. هر حساب ${fa(100)} درخواست رایگان دارد.`),
        parts, status));
    },

    async keys() {
      const body = page("keys");
      if (G.me === undefined) await loadMe();
      if (!G.me) return go("#/login?next=keys");
      body.replaceChildren(el("div", { class: "skeleton" }));
      const [acct, keys, usage] = await Promise.all([call("/api/v1/account"), call("/api/v1/keys"), call("/api/v1/account/usage?days=30")]);
      if (acct.status === 401) { G.me = null; renderAccount(); return go("#/login?next=keys"); }
      if (!acct.ok || !keys.ok) { body.replaceChildren(el("p", { class: "form-error" }, say(acct.error || keys.error))); return; }
      G.me = acct.data; renderAccount();
      const q = G.me.quota;
      const quota = el("section", { class: "card quota" },
        el("div", { class: "quota-top" },
          el("div", {}, el("p", { class: "label" }, "درخواست‌های رایگان"),
            el("p", { class: "big" }, el("b", {}, fa(q.remaining)), el("span", {}, ` از ${fa(q.limit)} باقی مانده`))),
          el("span", { class: "pill soon" }, "نسخهٔ ویژه به‌زودی")),
        el("div", { class: "meter", role: "img", "aria-label": `${fa(q.used)} از ${fa(q.limit)} استفاده شده` },
          el("i", { style: `width:${Math.min(100, (q.used / q.limit) * 100).toFixed(1)}%` })),
        el("p", { class: "muted small" }, q.remaining ? "هر درخواست موفق با کلید شما یکی از این‌ها را مصرف می‌کند. آزمودن لیلا در همین سایت رایگان است و از سهم شما کم نمی‌شود."
          : "سهم رایگان این حساب تمام شده است. نسخهٔ ویژه به‌زودی می‌آید."));

      const list = el("div", { class: "key-list" });
      const reveal = el("div", { class: "reveal", hidden: true });
      const renderKeys = (items) => {
        list.replaceChildren(...(items.length ? items.map(keyRow) : [el("p", { class: "muted empty" }, "هنوز کلیدی نساخته‌اید.")]));
        count.textContent = `${fa(items.length)} از ${fa(keys.data.max)} کلید`;
        newBtn.disabled = items.length >= keys.data.max;
      };
      const keyRow = (k) => {
        const row = el("div", { class: "key-row" },
          el("div", { class: "key-info" }, el("b", {}, k.name), el("code", { dir: "ltr" }, k.prefix + "…"),
            el("span", { class: "muted small" }, `ساخته‌شده در ${jdate(k.created_at)}`,
              k.last_used_at ? `، آخرین استفاده ${jdate(k.last_used_at)}` : "، هنوز استفاده نشده")),
          el("div", { class: "key-act" }));
        const act = row.querySelector(".key-act");
        const ask = () => act.replaceChildren(el("span", { class: "small" }, "حذف شود؟"),
          el("button", { class: "btn danger", type: "button", onclick: async () => {
            const r = await call(`/api/v1/keys/${k.id}`, { method: "DELETE" });
            if (!r.ok && r.status !== 404) return P.toast(say(r.error));
            items = items.filter((x) => x.id !== k.id);
            morph(list, () => renderKeys(items));
            P.toast("کلید حذف شد و دیگر کار نمی‌کند.");
          } }, "حذف"),
          el("button", { class: "btn", type: "button", onclick: idle }, "انصراف"));
        const idle = () => act.replaceChildren(el("button", { class: "btn ghost", type: "button", onclick: ask }, "حذف"));
        idle();
        return row;
      };
      let items = keys.data.keys;
      const count = el("span", { class: "muted" });
      const name = el("input", { class: "field", type: "text", maxlength: "60", placeholder: "نام کلید، مثلاً «اپ فروشگاه»", "aria-label": "نام کلید" });
      const createForm = el("form", { class: "create", hidden: true, onsubmit: async (e) => {
        e.preventDefault();
        const r = await call("/api/v1/keys", { method: "POST", body: { name: name.value.trim() || "کلید من" } });
        if (!r.ok) return P.toast(say(r.error));
        items = [r.data.key, ...items];
        name.value = "";
        morph(card, () => {
          createForm.hidden = true;
          renderKeys(items);
          reveal.hidden = false;
          reveal.replaceChildren(
            el("p", {}, el("b", {}, "کلید تازه ساخته شد. "), "همین حالا کپی‌اش کنید؛ این کلید دیگر نشان داده نمی‌شود."),
            el("div", { class: "secret" }, el("code", { dir: "ltr" }, r.data.secret), copyButton(() => r.data.secret)),
            el("button", { class: "btn", type: "button", onclick: () => morph(card, () => { reveal.hidden = true; reveal.replaceChildren(); }) }, "کپی کردم"));
        });
      } }, name, el("button", { class: "btn primary", type: "submit" }, "ساختن"),
        el("button", { class: "btn", type: "button", onclick: () => morph(card, () => { createForm.hidden = true; }) }, "انصراف"));
      const newBtn = el("button", { class: "btn primary", type: "button", onclick: () => {
        morph(card, () => { createForm.hidden = false; }); name.focus();
      } }, "ساختن کلید تازه");
      const card = el("section", { class: "card" },
        el("div", { class: "card-head" }, el("h2", {}, "کلیدها"), count, newBtn),
        reveal, createForm, list);
      renderKeys(items);

      body.replaceChildren(
        el("header", { class: "page-head" }, el("div", {}, el("h1", {}, "کلیدهای API"),
          el("p", { class: "lede" }, "با این کلیدها از برنامهٔ خودتان به لیلا درخواست بفرستید. کلید را مثل رمز نگه دارید."))),
        quota, card, usageCard(usage.ok ? usage.data : null),
        el("section", { class: "card" }, el("h2", {}, "نمونهٔ درخواست"), codeBlock(SAMPLES())));
    },

    docs() {
      const body = page("docs");
      if (body.dataset.built) return;
      body.dataset.built = "1";
      const S = (id, title, ...content) => el("section", { id: "doc-" + id, class: "doc-sec" }, el("h2", {}, title), content);
      const code = (t) => el("pre", { dir: "ltr" }, el("code", {}, t));
      const toc = [["start", "شروع سریع"], ["auth", "کلید و احراز هویت"], ["request", "درخواست"], ["response", "پاسخ"],
        ["stream", "پاسخ جریانی"], ["presets", "خروجی‌های آماده"], ["errors", "خطاها"], ["limits", "سهم و محدودیت‌ها"]];
      body.replaceChildren(
        el("header", { class: "page-head" }, el("div", {}, el("h1", {}, "مستندات"),
          el("p", { class: "lede" }, "هر آنچه برای فرستادن اولین درخواست به لیلا لازم دارید."))),
        el("div", { class: "docs" },
          el("nav", { class: "toc", "aria-label": "فهرست" }, toc.map(([id, t]) =>
            el("a", { href: "#/docs", onclick: (e) => { e.preventDefault(); $("#doc-" + id).scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth" }); } }, t))),
          el("article", { class: "doc" },
            S("start", "شروع سریع",
              el("ol", {},
                el("li", {}, "وارد شوید و در صفحهٔ ", el("a", { href: "#/keys" }, "کلیدها"), " یک کلید بسازید."),
                el("li", {}, "متن را همراه با خروجی‌هایی که می‌خواهید به ", el("code", { dir: "ltr" }, "POST /api/v1/decisions"), " بفرستید."),
                el("li", {}, "برای هر خروجی یک پاسخ با احتمالش برمی‌گردد.")),
              codeBlock(SAMPLES())),
            S("auth", "کلید و احراز هویت",
              el("p", {}, "کلید را در سرآیند ", el("code", { dir: "ltr" }, "Authorization"), " بفرستید. کلید با ", el("code", { dir: "ltr" }, "lyl_"), " شروع می‌شود و فقط یک بار، هنگام ساختن، نشان داده می‌شود."),
              code("Authorization: Bearer lyl_..."),
              el("p", {}, "کلیدی که حذف شود بی‌درنگ از کار می‌افتد. هر حساب تا پنج کلید فعال دارد.")),
            S("request", "درخواست",
              el("p", {}, "بدنهٔ درخواست متن و فهرست خروجی‌هاست. هر خروجی یا یکی از ", el("a", { href: "#doc-presets", onclick: (e) => { e.preventDefault(); $("#doc-presets").scrollIntoView({ behavior: "smooth" }); } }, "خروجی‌های آماده"), " است یا پرسش خود شما:"),
              el("ul", {},
                el("li", {}, el("code", { dir: "ltr" }, "choice"), ": یکی از گزینه‌ها؛ دو تا دوازده گزینه."),
                el("li", {}, el("code", { dir: "ltr" }, "yes_no"), ": احتمال «بله»؛ گزینه نمی‌خواهد."),
                el("li", {}, el("code", { dir: "ltr" }, "scale"), ": جایگاه روی طیفی مرتب؛ دو تا ده سطح، از کم به زیاد.")),
              code(SAMPLE_BODY.replace('"refund", "type": "yes_no", "question": "آیا مشتری پولش را پس می‌خواهد؟"}',
                '"refund", "type": "yes_no", "question": "آیا مشتری پولش را پس می‌خواهد؟"},\n    {"id": "team", "type": "choice", "question": "به کدام واحد مربوط است؟", "options": ["فروش", "پشتیبانی", "مالی"]}')),
              el("p", { class: "muted small" }, "شناسهٔ هر خروجی (id) را خودتان می‌گذارید و پاسخ با همان شناسه برمی‌گردد.")),
            S("response", "پاسخ",
              el("p", {}, "پاسخ‌ها به همان ترتیب درخواست برمی‌گردند. ", el("code", { dir: "ltr" }, "label"), " پاسخ به زبان ساده است و ", el("code", { dir: "ltr" }, "options"), " احتمال همهٔ گزینه‌ها را دارد."),
              code(`{
  "request_id": "4aa274fc…",
  "model": "layla-1.0",
  "results": [
    {"id": "tone", "type": "choice", "answer": "منفی", "label": "منفی",
     "probability": 0.76, "options": [ … ], "confidence": 0.52}
  ],
  "truncated": false,
  "usage": {"input_tokens": 51}
}`),
              el("p", {}, "متن بلندتر از حد مدل کوتاه می‌شود: ابتدا و انتهایش خوانده می‌شود و ", el("code", { dir: "ltr" }, "truncated"), " برابر true است.")),
            S("stream", "پاسخ جریانی",
              el("p", {}, "با ", el("code", { dir: "ltr" }, "POST /api/v1/decisions/stream"), " هر پاسخ همان لحظه که آماده شد، در یک خط JSON می‌رسد. برای رابط‌هایی که می‌خواهند پاسخ‌ها را یکی‌یکی نشان دهند مناسب است."),
              code(`{"event": "start", "outputs": ["tone", "urgency"], …}
{"event": "result", "result": {"id": "tone", …}}
{"event": "result", "result": {"id": "urgency", …}}
{"event": "done", "usage": {"input_tokens": 51}}`)),
            S("presets", "خروجی‌های آماده",
              el("p", {}, "این خروجی‌ها با همان عبارت‌هایی پرسیده می‌شوند که لیلا با آن‌ها آموزش دیده، پس دقیق‌ترین پاسخ را می‌دهند. فهرست کامل از ", el("code", { dir: "ltr" }, "GET /api/v1/outputs"), " می‌آید."),
              el("div", { class: "preset-table", id: "preset-table" }, el("p", { class: "muted" }, "در حال بارگیری…"))),
            S("errors", "خطاها",
              el("p", {}, "هر خطا یک کد ثابت و یک پیام دارد:"),
              code(`{"error": {"code": "quota_exhausted", "message": "…", "request_id": "…"}}`),
              el("table", { class: "errors" }, el("tbody", {}, [
                ["401", "invalid_key", "کلید نامعتبر است یا حذف شده."],
                ["402", "quota_exhausted", "درخواست‌های رایگان این حساب تمام شده."],
                ["413", "text_too_long", "متن از حد مجاز بلندتر است."],
                ["422", "invalid_request", "بدنهٔ درخواست درست نیست؛ پیام می‌گوید کجا."],
                ["429", "rate_limited", "درخواست‌ها زیاد شده؛ سرآیند Retry-After می‌گوید کی دوباره بفرستید."],
                ["503", "busy", "سرور مشغول است؛ کمی بعد دوباره بفرستید."],
              ].map(([s, c, d]) => el("tr", {}, el("td", { dir: "ltr" }, s), el("td", { dir: "ltr" }, el("code", {}, c)), el("td", {}, d)))))),
            S("limits", "سهم و محدودیت‌ها",
              el("ul", {},
                el("li", {}, `هر حساب ${fa(100)} درخواست رایگان دارد. هر درخواست موفق، با هر تعداد خروجی، یکی حساب می‌شود؛ درخواستی که پاسخی نگیرد حساب نمی‌شود.`),
                el("li", {}, "نسخهٔ ویژه با سقف بیشتر به‌زودی می‌آید."),
                el("li", {}, `هر درخواست حداکثر ${fa(12)} خروجی و ${fa(20000)} نویسه متن.`),
                el("li", {}, "هر خروجی یک بار خواندن متن است؛ خروجی کمتر یعنی پاسخ زودتر.")),
              el("p", { class: "muted small" }, "مرجع فنی کامل با امکان آزمودن: ", el("a", { href: BASE + "/docs", target: "_blank", rel: "noopener", dir: "ltr" }, BASE + "/docs"))))));
      call("/api/v1/outputs").then((r) => {
        if (!r.ok) return;
        const T = { choice: "چندگزینه‌ای", yes_no: "بله یا خیر", scale: "طیف" };
        $("#preset-table").replaceChildren(el("table", {}, el("thead", {}, el("tr", {}, el("th", {}, "شناسه"), el("th", {}, "نام"), el("th", {}, "نوع"), el("th", {}, "پاسخ‌ها"))),
          el("tbody", {}, r.data.outputs.map((o) => el("tr", {}, el("td", { dir: "ltr" }, el("code", {}, o.id)), el("td", {}, o.title), el("td", {}, T[o.type]),
            el("td", { class: "muted" }, o.options.join("، ")))))));
      });
    },

    services() {
      const body = page("services");
      if (body.dataset.built) return;
      body.dataset.built = "1";
      const T = { choice: "چندگزینه‌ای", yes_no: "بله یا خیر", scale: "طیف" };
      body.replaceChildren(
        el("header", { class: "page-head" }, el("div", {}, el("h1", {}, "خدمات"),
          el("p", { class: "lede" }, "کارهایی که لیلا از پسشان برمی‌آید، آماده برای امتحان. هر کدام را باز کنید تا روی نمونه‌ای واقعی اجرا شود."))),
        el("div", { class: "services" }, SERVICES.map((sv) => el("article", { class: "service" },
          el("div", { class: "taq-mark", "aria-hidden": "true", html: '<svg viewBox="0 0 24 28"><path d="M4.4 27V13.5a3 3 0 0 1 .25-1.2A17.2 17.2 0 0 1 12 3a17.2 17.2 0 0 1 7.35 8.3 3 3 0 0 1 .25 1.2V27"/></svg>' }),
          el("h2", {}, sv.title),
          el("p", { class: "who" }, sv.for),
          el("p", {}, sv.what),
          el("div", { class: "tags" }, sv.outputs.map((o) => el("span", {}, typeof o === "string" ? sv.names[o] : o.question))),
          el("blockquote", {}, sv.text),
          el("button", { class: "btn primary", type: "button", onclick: () => { go("#/"); setTimeout(() => P.run(sv.text, sv.outputs), 60); } }, "امتحان کنید")))));
    },
  };

  const SERVICES = [
    { title: "دسته‌بندی پیام‌های پشتیبانی", for: "برای تیم‌های پشتیبانی و مرکز تماس",
      what: "هدف پیام، فوریت و لحن مشتری را تشخیص می‌دهد تا هر پیام زودتر به دست آدم درست برسد.",
      text: "سلام، سه روز است سفارشم را ثبت کرده‌ام و هنوز خبری نیست. اگر تا فردا نرسد لغوش می‌کنم و پولم را می‌خواهم.",
      outputs: ["message_act", "urgency", "sentiment", { type: "yes_no", question: "آیا مشتری می‌خواهد سفارش را لغو کند؟" }],
      names: { message_act: "هدف پیام", urgency: "فوریت", sentiment: "لحن" } },
    { title: "تحلیل نظر خریداران", for: "برای فروشگاه‌های اینترنتی و برندها",
      what: "از نظر هر خریدار، امتیاز ستاره، لحن و پیشنهاد خرید را بیرون می‌کشد؛ بی‌آنکه کسی همه را بخواند.",
      text: "صدای هدفون عالی است ولی بعد از دو هفته یک طرفش قطع و وصل می‌شود. با این قیمت انتظار بیشتری داشتم.",
      outputs: ["star_rating", "recommend", "sentiment"],
      names: { star_rating: "ستاره", recommend: "پیشنهاد خرید", sentiment: "لحن" } },
    { title: "پالایش پیامک و ایمیل", for: "برای بانک‌ها، اپراتورها و صندوق‌های پیام",
      what: "پیام‌های تبلیغاتی و کلاه‌برداری را جدا می‌کند و درخواست رمز یا کد تأیید را نشان می‌دهد.",
      text: "تبریک! شما برندهٔ یک دستگاه خودرو شده‌اید. برای دریافت جایزه همین حالا روی لینک بزنید و کد تأیید را وارد کنید.",
      outputs: ["spam", { type: "yes_no", question: "آیا از خواننده رمز یا کد تأیید می‌خواهد؟" }, "urgency"],
      names: { spam: "تبلیغ یا کلاه‌برداری", urgency: "فوریت" } },
    { title: "پایش دیدگاه کاربران", for: "برای شبکه‌های اجتماعی، انجمن‌ها و بخش نظرها",
      what: "توهین و حال‌وهوای نوشته را می‌سنجد تا نظرهای آزارنده پیش از انتشار دیده شوند.",
      text: "این چه وضع پشتیبانیه؟ هر بار زنگ می‌زنم یه جواب تکراری می‌دید، واقعاً که خجالت داره.",
      outputs: ["offensive", "emotion", "sentiment"],
      names: { offensive: "توهین", emotion: "احساس", sentiment: "لحن" } },
    { title: "دسته‌بندی خبر", for: "برای خبرگزاری‌ها و پایش رسانه",
      what: "هر خبر را در بخش درست می‌گذارد و لحن رسمی یا خودمانی‌اش را مشخص می‌کند.",
      text: "بانک مرکزی از کاهش نرخ تورم ماهانه در شهریور خبر داد و گفت سیاست‌های انقباضی ادامه پیدا می‌کند.",
      outputs: ["news_topic", "formality"],
      names: { news_topic: "موضوع خبر", formality: "رسمی یا خودمانی" } },
    { title: "ارجاع درخواست‌ها به واحد درست", for: "برای سازمان‌هایی با صندوق مشترک درخواست",
      what: "با پرسش خودتان، هر درخواست را به واحد مسئولش می‌فرستد؛ گزینه‌ها را هرطور بخواهید تعریف کنید.",
      text: "سلام، فاکتور ماه گذشته دو بار از حساب ما کسر شده. لطفاً بررسی کنید و مبلغ اضافه را برگردانید.",
      outputs: [{ type: "choice", question: "این درخواست به کدام واحد مربوط است؟", options: ["فروش", "پشتیبانی فنی", "مالی", "منابع انسانی"] }, "urgency"],
      names: { urgency: "فوریت" } },
  ];

  function usageCard(u) {
    const card = el("section", { class: "card usage" }, el("div", { class: "card-head" }, el("h2", {}, "مصرف ۳۰ روز گذشته"),
      el("span", { class: "muted" }, u ? `${fa(u.total)} درخواست` : "")));
    if (!u) return card.append(el("p", { class: "muted" }, "آمار مصرف بارگیری نشد.")), card;
    if (!u.total) return card.append(el("p", { class: "muted chart-empty" }, "هنوز با کلیدهایتان درخواستی نفرستاده‌اید. اولین درخواست اینجا دیده می‌شود.")), card;
    const max = Math.max(1, ...u.days.map((d) => d.requests));
    const W = 600, H = 120, gap = 4, bw = (W - gap * (u.days.length - 1)) / u.days.length;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H + 4}`); svg.setAttribute("class", "chart");
    svg.setAttribute("role", "img"); svg.setAttribute("aria-label", `${fa(u.total)} درخواست در ۳۰ روز گذشته`);
    u.days.forEach((d, i) => {
      const h = d.requests ? Math.max(3, (d.requests / max) * H) : 2;
      const r = document.createElementNS(NS, "rect");
      // RTL: today on the left end, like the rest of the page reads
      r.setAttribute("x", String(W - (i + 1) * bw - i * gap)); r.setAttribute("y", String(H - h + 2));
      r.setAttribute("width", String(bw)); r.setAttribute("height", String(h)); r.setAttribute("rx", "2");
      r.setAttribute("class", d.requests ? "on" : "off");
      r.style.animationDelay = `${i * 12}ms`;
      const t = document.createElementNS(NS, "title");
      t.textContent = `${jdate(d.day)}: ${fa(d.requests)} درخواست`;
      r.append(t); svg.append(r);
    });
    card.append(svg, el("div", { class: "chart-ends muted small" }, el("span", {}, "۳۰ روز پیش"), el("span", {}, "امروز")));
    return card;
  }

  let gsi;
  function loadGoogle() {
    gsi = gsi || new Promise((ok, fail) => {
      const s = el("script", { src: "https://accounts.google.com/gsi/client", async: true });
      s.onload = ok; s.onerror = fail; document.head.append(s);
    });
    return gsi;
  }

  /* ---------------- start ---------------- */

  $(".tb-brand").append($(".logo-wrap svg").cloneNode(true));
  loadMe().then(() => { if (parse().route === "keys") show(); });
  show();
})();
