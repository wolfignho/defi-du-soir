/* Défi du soir — logique du jeu (100 % local, aucune donnée envoyée) */
(function () {
  "use strict";
  const THEMES = window.DDS_THEMES, CH = window.DDS_CHALLENGES, LEVELS = window.DDS_LEVELS, QUOTES = window.DDS_QUOTES;
  const BY_ID = Object.fromEntries(CH.map(c => [c.id, c]));
  const THEME_KEYS = Object.keys(THEMES);
  const KEY = "defiDuSoir.v1";
  const DAY_CUTOFF_H = 4; // avant 4 h du matin, on compte encore la veille
  const MOODS = [
    { e: "😞", l: "Journée difficile" }, { e: "😕", l: "Bof" }, { e: "😐", l: "Correcte" },
    { e: "🙂", l: "Bonne journée" }, { e: "🤩", l: "Excellente journée" }
  ];
  const SPORTS = [["foot", "⚽ Foot"], ["natation", "🏊 Natation"], ["muscu", "🏋️ Muscu"], ["course", "🏃 Course"], ["marche", "🚶 Marche"], ["mobilite", "🧘 Étirements"], ["repos", "😴 Repos"]];
  const XP = { base: 50, deep: 15, mood: 5, streakStep: 3, streakMax: 30, grat: 15, victoire: 10, objectif: 10, objCheck: 10, sport: 10, week: 30, badge: 20 };

  /* ---------- Utilitaires ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const pad = n => String(n).padStart(2, "0");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
  const todayKey = () => keyOf(new Date(Date.now() - DAY_CUTOFF_H * 3600e3));
  const weekKey = k => { const d = parseKey(k); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return keyOf(d); };
  const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 864e5);
  const fmtDate = (k, opts) => parseKey(k).toLocaleDateString("fr-FR", opts || { weekday: "long", day: "numeric", month: "long" });
  const plural = (n, s, p) => `${n} ${n > 1 ? (p || s + "s") : s}`;

  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function shuffle(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* ---------- État ---------- */
  function freshState() {
    return { v: 1, name: "", createdAt: todayKey(), seed: Math.floor(Math.random() * 1e9), pos: 0,
      assigned: {}, swaps: {}, entries: {}, bonus: {}, weeks: {}, frozen: {}, shields: 0, bestStreak: 0,
      badges: {}, exported: false, theme: "auto", welcomed: false, shieldUsed: 0 };
  }
  let S;
  function load() {
    try { const raw = localStorage.getItem(KEY); S = raw ? Object.assign(freshState(), JSON.parse(raw)) : freshState(); }
    catch (e) { S = freshState(); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast("⚠️", "Impossible d'enregistrer (stockage plein ou navigation privée)."); }
  }

  /* ---------- Séquence des défis : rotation des thèmes ---------- */
  const seqCache = {};
  function cycleSeq(cycle) {
    if (seqCache[cycle]) return seqCache[cycle];
    const rnd = mulberry32(S.seed + cycle * 7919);
    const pools = {}; THEME_KEYS.forEach(t => pools[t] = shuffle(CH.filter(c => c.theme === t).map(c => c.id), rnd));
    const rounds = Math.max(...THEME_KEYS.map(t => pools[t].length));
    const out = []; let last = null;
    for (let r = 0; r < rounds; r++) {
      let order = shuffle(THEME_KEYS, rnd).filter(t => pools[t][r]);
      if (order[0] === last && order.length > 1) [order[0], order[1]] = [order[1], order[0]];
      order.forEach(t => out.push(pools[t][r]));
      last = order[order.length - 1];
    }
    return (seqCache[cycle] = out);
  }
  const seqAt = p => { const n = CH.length; return cycleSeq(Math.floor(p / n))[p % n]; };
  function recentIds(days) {
    const t = todayKey(); const s = new Set();
    Object.keys(S.assigned).forEach(k => { if (daysBetween(k, t) <= days && k !== t) s.add(S.assigned[k]); });
    return s;
  }
  function nextId(excludeTheme) {
    const recent = recentIds(45);
    for (let i = 0; i < CH.length * 2; i++) {
      const id = seqAt(S.pos++);
      if (!BY_ID[id]) continue;
      if (recent.has(id)) continue;
      if (excludeTheme && BY_ID[id].theme === excludeTheme) continue;
      return id;
    }
    return seqAt(S.pos++);
  }
  function todayChallenge() {
    const k = todayKey();
    if (!S.assigned[k] || !BY_ID[S.assigned[k]]) { S.assigned[k] = nextId(); save(); }
    return BY_ID[S.assigned[k]];
  }
  function peekTomorrowTheme() {
    const recent = recentIds(45); recent.add(S.assigned[todayKey()]);
    for (let p = S.pos; p < S.pos + CH.length; p++) { const id = seqAt(p); if (!recent.has(id)) return BY_ID[id].theme; }
    return null;
  }

  /* ---------- Série & boucliers ---------- */
  function streak() {
    const t = todayKey(); let k = S.entries[t] ? t : addDays(t, -1); let n = 0;
    while (S.entries[k] || S.frozen[k]) { if (S.entries[k]) n++; k = addDays(k, -1); }
    return n;
  }
  function reconcileShields() {
    const t = todayKey(); const y = addDays(t, -1);
    const done = Object.keys(S.entries).filter(k => k < t).sort();
    if (!done.length) return;
    const last = done[done.length - 1];
    if (last >= y) return;
    const missed = []; for (let k = addDays(last, 1); k <= y; k = addDays(k, 1)) if (!S.frozen[k]) missed.push(k);
    if (!missed.length) return;
    if (missed.length <= S.shields) {
      missed.forEach(k => S.frozen[k] = true);
      S.shields -= missed.length; S.shieldUsed = (S.shieldUsed || 0) + missed.length; save();
      setTimeout(() => toast("🛡️", `${missed.length > 1 ? "Vos boucliers ont" : "Votre bouclier a"} protégé votre série. Ne la laissez pas filer ce soir !`), 600);
    }
  }

  /* ---------- XP, niveaux ---------- */
  function totalXP() {
    let x = 0;
    Object.values(S.entries).forEach(e => x += e.xp || 0);
    Object.values(S.bonus).forEach(b => Object.values(b.xp || {}).forEach(v => x += v));
    Object.values(S.weeks).forEach(w => x += w.xp || 0);
    x += Object.keys(S.badges).length * XP.badge;
    return x;
  }
  function levelInfo(xp) {
    let i = 0; while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
    const cur = LEVELS[i], nxt = LEVELS[i + 1];
    return { n: i + 1, title: cur.title, xp, from: cur.xp, to: nxt ? nxt.xp : null, nextTitle: nxt ? nxt.title : null,
      pct: nxt ? Math.min(100, Math.round((xp - cur.xp) / (nxt.xp - cur.xp) * 100)) : 100 };
  }
  function dayXP(k) {
    let x = (S.entries[k] && S.entries[k].xp) || 0;
    const b = S.bonus[k]; if (b && b.xp) Object.values(b.xp).forEach(v => x += v);
    return x;
  }

  /* ---------- Badges ---------- */
  function stats() {
    const es = Object.entries(S.entries);
    const themeCounts = {}; THEME_KEYS.forEach(t => themeCounts[t] = 0);
    es.forEach(([, e]) => { if (themeCounts[e.theme] != null) themeCounts[e.theme]++; });
    const bonus = Object.values(S.bonus);
    const weeksCount = {}; es.forEach(([k]) => { const w = weekKey(k); weeksCount[w] = (weeksCount[w] || 0) + 1; });
    return {
      total: es.length, streak: streak(), best: Math.max(S.bestStreak || 0, streak()), themeCounts,
      themesTouched: THEME_KEYS.filter(t => themeCounts[t] > 0).length,
      longAnswers: es.filter(([, e]) => (e.answer || "").length >= 200).length,
      grat: bonus.filter(b => b.xp && b.xp.grat).length, obj: bonus.filter(b => b.xp && b.xp.objectif).length,
      objOk: bonus.filter(b => b.objCheck === true).length, sport: bonus.filter(b => b.xp && b.xp.sport && b.sport !== "repos").length,
      perfectWeek: Object.values(weeksCount).some(n => n >= 7),
      weeksDone: Object.values(S.weeks).filter(w => w.xp).length, level: levelInfo(totalXP()).n,
      exported: !!S.exported, shieldUsed: S.shieldUsed || 0
    };
  }
  const BADGES = [
    { id: "premier", i: "🌱", n: "Premier pas", d: "Valider votre 1er défi", t: s => s.total >= 1 },
    { id: "serie3", i: "🔥", n: "Allumage", d: "Série de 3 soirs", t: s => s.best >= 3 },
    { id: "serie7", i: "🔥", n: "Semaine de feu", d: "Série de 7 soirs", t: s => s.best >= 7 },
    { id: "serie14", i: "⚡", n: "Quinzaine", d: "Série de 14 soirs", t: s => s.best >= 14 },
    { id: "serie30", i: "🌋", n: "Mois de fer", d: "Série de 30 soirs", t: s => s.best >= 30 },
    { id: "serie60", i: "💎", n: "Diamant", d: "Série de 60 soirs", t: s => s.best >= 60 },
    { id: "serie100", i: "👑", n: "Centurion", d: "Série de 100 soirs", t: s => s.best >= 100 },
    { id: "defis10", i: "🎯", n: "Dix sur dix", d: "10 défis validés", t: s => s.total >= 10 },
    { id: "defis25", i: "🏅", n: "Régulier", d: "25 défis validés", t: s => s.total >= 25 },
    { id: "defis50", i: "🥇", n: "Acharné", d: "50 défis validés", t: s => s.total >= 50 },
    { id: "defis100", i: "🏆", n: "Cent soirs", d: "100 défis validés", t: s => s.total >= 100 },
    { id: "explorateur", i: "🧭", n: "Explorateur", d: "Les 8 thèmes au moins une fois", t: s => s.themesTouched >= 8 },
    ...THEME_KEYS.map(k => ({ id: "maitre_" + k, i: THEMES[k].emoji, n: "Maître · " + THEMES[k].short, d: "5 défis « " + THEMES[k].short + " »", t: s => s.themeCounts[k] >= 5 })),
    { id: "plume", i: "✍️", n: "Plume", d: "10 réponses de plus de 200 caractères", t: s => s.longAnswers >= 10 },
    { id: "gratitude", i: "🙏", n: "Cœur reconnaissant", d: "10 fois « 3 gratitudes »", t: s => s.grat >= 10 },
    { id: "planif", i: "🗓️", n: "Planificateur", d: "10 objectifs de demain fixés", t: s => s.obj >= 10 },
    { id: "parole", i: "✅", n: "Parole tenue", d: "10 objectifs atteints", t: s => s.objOk >= 10 },
    { id: "sportif", i: "🏃", n: "Corps en mouvement", d: "15 séances de sport notées", t: s => s.sport >= 15 },
    { id: "parfaite", i: "🌟", n: "Semaine parfaite", d: "7 défis sur 7 dans une semaine", t: s => s.perfectWeek },
    { id: "introspection", i: "🔍", n: "Introspection", d: "4 bilans hebdo remplis", t: s => s.weeksDone >= 4 },
    { id: "bouclier", i: "🛡️", n: "Sauvé !", d: "Un bouclier a protégé votre série", t: s => s.shieldUsed >= 1 },
    { id: "niveau5", i: "🚀", n: "Décollage", d: "Atteindre le niveau 5", t: s => s.level >= 5 },
    { id: "niveau10", i: "🪐", n: "Maître de soi", d: "Atteindre le niveau 10", t: s => s.level >= 10 },
    { id: "sauvegarde", i: "💾", n: "Prudent", d: "Exporter une sauvegarde", t: s => s.exported }
  ];
  function checkBadges() {
    const fresh = [];
    for (let loop = 0; loop < 4; loop++) {
      const st = stats(); let changed = false;
      BADGES.forEach(b => { if (!S.badges[b.id] && b.t(st)) { S.badges[b.id] = todayKey(); fresh.push(b); changed = true; } });
      if (!changed) break;
    }
    if (fresh.length) save();
    return fresh;
  }
  /* Exécute une action, puis célèbre badges et passages de niveau */
  function act(fn) {
    const lvBefore = levelInfo(totalXP()).n;
    const res = fn();
    save();
    const fresh = checkBadges();
    const lv = levelInfo(totalXP());
    fresh.forEach((b, i) => setTimeout(() => toast(b.i, `<b>Badge débloqué : ${esc(b.n)}</b><br><span class="small muted">${esc(b.d)} · +${XP.badge} XP</span>`), 400 + i * 900));
    if (lv.n > lvBefore) setTimeout(() => levelUpModal(lv), 900 + fresh.length * 300);
    return res;
  }

  /* ---------- UI générique ---------- */
  function toast(icon, html, ms = 3600) {
    const el = document.createElement("div"); el.className = "toast";
    el.innerHTML = `<span class="ti2">${icon}</span><div>${html}</div>`;
    $("#toasts").appendChild(el); setTimeout(() => el.remove(), ms);
  }
  const modalQueue = [];
  function openModal(html, onMount, queue) {
    const m = $("#modal"), c = $("#modal-card");
    if (queue && !m.classList.contains("hidden")) { modalQueue.push([html, onMount]); return; }
    c.innerHTML = html; m.classList.remove("hidden");
    m.onclick = e => { if (e.target === m && !m.dataset.locked) closeModal(); };
    if (onMount) onMount(c);
  }
  function closeModal() {
    const m = $("#modal"); m.classList.add("hidden"); delete m.dataset.locked; $("#modal-card").innerHTML = "";
    if (modalQueue.length) { const [h, f] = modalQueue.shift(); setTimeout(() => openModal(h, f), 250); }
  }
  function confetti() {
    const cv = $("#confetti"), ctx = cv.getContext("2d"), dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.scale(dpr, dpr);
    const cols = ["#8b5cf6", "#ec4899", "#f59e0b", "#22c55e", "#3b82f6", "#ffffff"];
    const P = Array.from({ length: 140 }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 80, y: innerHeight * .35, vx: (Math.random() - .5) * 13, vy: -Math.random() * 13 - 4,
      s: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: cols[Math.floor(Math.random() * cols.length)] }));
    const t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      P.forEach(p => { p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); ctx.restore(); });
      if (t - t0 < 2600) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })(t0);
  }
  function themePill(t) { const th = THEMES[t]; return `<span class="pill theme" style="background:${th.color}">${th.emoji} ${esc(th.short)}</span>`; }
  function greeting() { const h = new Date().getHours(); return h >= 5 && h < 12 ? "Bonjour" : h >= 12 && h < 18 ? "Bon après-midi" : "Bonsoir"; }
  function applyTheme() {
    const r = document.documentElement;
    if (S.theme === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", S.theme);
  }
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function renderTop() {
    $("#hello").textContent = greeting() + (S.name ? " " + S.name : "");
    $("#today-date").textContent = fmtDate(todayKey());
    const st = streak();
    $("#streak-n").textContent = st;
    $("#chip-streak").className = "chip flame " + (st > 0 ? "on" : "off");
    $("#shield-n").textContent = S.shields || 0;
    $("#chip-shield").classList.toggle("hidden", !(S.shields > 0));
  }

  /* ---------- Onglet : Ce soir ---------- */
  let draft = { mood: 0 };
  function levelCard() {
    const lv = levelInfo(totalXP());
    return `<section class="card level">
      <div class="lv-top"><div class="lv-badge">${lv.n}</div>
        <div style="flex:1"><div class="small muted">Niveau ${lv.n}</div><div class="lv-title">${esc(lv.title)}</div></div>
        <div class="center"><div style="font-weight:850;font-size:18px">${lv.xp}</div><div class="small muted">XP</div></div></div>
      <div class="bar"><i style="width:${lv.pct}%"></i></div>
      <div class="small muted" style="margin-top:6px">${lv.to ? `Encore <b>${lv.to - lv.xp} XP</b> pour devenir « ${esc(lv.nextTitle)} »` : "Niveau maximum atteint. Respect."}</div>
    </section>`;
  }
  function renderSoir() {
    reconcileShields();
    const k = todayKey(), c = todayChallenge(), e = S.entries[k], th = THEMES[c.theme];
    const hour = new Date().getHours();
    const quote = QUOTES[daysBetween("2026-01-01", k) % QUOTES.length];
    let html = levelCard();
    if (!e) {
      const canSwap = !S.swaps[k];
      html += `<section class="card challenge">
        <div class="row between mb"><div class="section-title" style="margin:0">Défi du soir</div>
          <span class="small muted">${c.min} min</span></div>
        <div class="meta">${themePill(c.theme)}<span class="pill">${esc(c.type)}</span></div>
        <div class="ch-title">${esc(c.title)}</div>
        <p class="ch-prompt">${esc(c.prompt)}</p>
        <textarea id="answer" placeholder="${esc(c.ph || "Votre réponse…")}">${esc(draft.k === k ? draft.text || "" : "")}</textarea>
        <div class="counter" id="counter"></div>
        <div class="section-title" style="margin:14px 2px 4px">Comment s'est passée votre journée ?</div>
        <div class="moods" id="moods">${MOODS.map((m, i) => `<button data-m="${i + 1}" aria-label="${m.l}" class="${draft.mood === i + 1 ? "sel" : ""}">${m.e}</button>`).join("")}</div>
        <div class="mood-label" id="mood-label">${draft.mood ? MOODS[draft.mood - 1].l : "Touchez une humeur"}</div>
        <button class="btn primary block mt" id="validate">Valider le défi · +${XP.base} XP</button>
        <div class="center">${canSwap ? `<button class="linkbtn" id="swap">Ce défi ne vous parle pas ? Changer (1 fois par soir)</button>` : `<span class="small muted">Défi déjà changé ce soir.</span>`}</div>
        ${hour >= DAY_CUTOFF_H && hour < 17 ? `<p class="small muted center" style="margin:6px 0 0">Idéalement ce soir, au calme… mais vous pouvez le faire dès maintenant.</p>` : ""}
      </section>`;
    } else {
      const tt = peekTomorrowTheme();
      html += `<section class="card">
        <div class="done-banner"><span style="font-size:28px">✅</span><div><b>Défi du soir validé !</b><div class="small muted">+${e.xp} XP · série de ${plural(streak(), "soir")}</div></div></div>
        <div class="meta">${themePill(e.theme)}<span class="pill">${MOODS[(e.mood || 3) - 1].e} ${e.mood ? MOODS[e.mood - 1].l : ""}</span></div>
        <div class="ch-title" style="font-size:19px">${esc(BY_ID[e.id] ? BY_ID[e.id].title : "")}</div>
        <div class="answer">${esc(e.answer)}</div>
        <div class="row between mt"><button class="linkbtn" id="edit-today">Modifier ma réponse</button>
          ${tt ? `<span class="small muted">Demain : ${THEMES[tt].emoji} ${esc(THEMES[tt].short)}</span>` : ""}</div>
      </section>`;
    }
    html += `<div class="section-title">Quêtes bonus</div>` + bonusHTML(k);
    html += `<p class="quote">« ${esc(quote)} »</p>`;
    if (!isStandalone() && !S.installHidden) html += installCard(true);
    $("#view").innerHTML = html;
    bindSoir(k, c);
  }
  function bindSoir(k, c) {
    const ta = $("#answer");
    if (ta) {
      const upd = () => { const n = ta.value.trim().length; $("#counter").textContent = n < 20 ? `${n} caractères · encore ${20 - n} pour valider` : n >= 150 ? `${n} caractères · bonus réflexion +${XP.deep} XP ✓` : `${n} caractères · ${150 - n} de plus pour le bonus réflexion (+${XP.deep} XP)`; draft.k = k; draft.text = ta.value; };
      ta.addEventListener("input", upd); upd();
      $$("#moods button").forEach(b => b.onclick = () => { draft.mood = +b.dataset.m; $$("#moods button").forEach(x => x.classList.toggle("sel", x === b)); $("#mood-label").textContent = MOODS[draft.mood - 1].l; });
      $("#validate").onclick = () => validate(k, c);
      const sw = $("#swap"); if (sw) sw.onclick = () => { act(() => { S.assigned[k] = nextId(c.theme); S.swaps[k] = true; }); draft.text = ""; renderSoir(); toast("🔄", "Nouveau défi tiré. À vous de jouer !"); };
    }
    const ed = $("#edit-today"); if (ed) ed.onclick = () => editEntry(k);
    bindBonus(k);
    bindInstall();
  }
  function validate(k, c) {
    const ta = $("#answer"), text = ta.value.trim();
    if (text.length < 20) { toast("✍️", "Écrivez au moins quelques phrases (20 caractères) pour valider."); ta.focus(); return; }
    if (!draft.mood) { toast("🙂", "Choisissez d'abord l'humeur de votre journée."); $("#moods").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    let gained = null;
    act(() => {
      const prev = streak();
      const newStreak = prev + 1;
      const bonusStreak = Math.min((newStreak - 1) * XP.streakStep, XP.streakMax);
      const deep = text.length >= 150 ? XP.deep : 0;
      const xp = XP.base + deep + XP.mood + bonusStreak;
      S.entries[k] = { id: c.id, theme: c.theme, answer: text, mood: draft.mood, xp, at: new Date().toISOString(), detail: { base: XP.base, deep, mood: XP.mood, streak: bonusStreak } };
      const st = streak(); S.bestStreak = Math.max(S.bestStreak || 0, st);
      let shield = false; if (st > 0 && st % 7 === 0 && (S.shields || 0) < 2) { S.shields = (S.shields || 0) + 1; shield = true; }
      gained = { xp, deep, bonusStreak, st, shield };
    });
    draft = { mood: 0 };
    confetti(); renderTop(); renderSoir();
    openModal(`<div class="center"><div style="font-size:54px">🔥</div><h2 style="margin:4px 0">Défi validé !</h2>
      <div class="xp-pop">+${gained.xp} XP</div>
      <div class="small muted">+${XP.base} défi · +${XP.mood} humeur${gained.deep ? ` · +${gained.deep} réflexion` : ""}${gained.bonusStreak ? ` · +${gained.bonusStreak} série` : ""}</div>
      <p style="margin:16px 0 4px;font-size:18px"><b>Série : ${plural(gained.st, "soir")}</b> ${"🔥".repeat(Math.min(gained.st, 7))}</p>
      ${gained.shield ? `<p class="small">🛡️ 7 soirs d'affilée : vous gagnez un <b>bouclier</b>. Il protégera votre série si vous manquez un soir.</p>` : ""}
      <p class="muted small">Encore une quête bonus ? Chaque petite victoire compte.</p>
      <button class="btn primary block mt" id="m-ok">Continuer</button></div>`, c2 => $("#m-ok", c2).onclick = closeModal);
  }
  function editEntry(k) {
    const e = S.entries[k]; if (!e) return;
    openModal(`<h2>Modifier la réponse</h2><p class="small muted">${esc(fmtDate(k))} · ${esc(BY_ID[e.id] ? BY_ID[e.id].title : "")}</p>
      <textarea id="ed-ta">${esc(e.answer)}</textarea>
      <div class="moods" id="ed-moods">${MOODS.map((m, i) => `<button data-m="${i + 1}" class="${e.mood === i + 1 ? "sel" : ""}">${m.e}</button>`).join("")}</div>
      <div class="grid2 mt"><button class="btn" id="ed-cancel">Annuler</button><button class="btn primary" id="ed-save">Enregistrer</button></div>`, c => {
      let mood = e.mood;
      $$("#ed-moods button", c).forEach(b => b.onclick = () => { mood = +b.dataset.m; $$("#ed-moods button", c).forEach(x => x.classList.toggle("sel", x === b)); });
      $("#ed-cancel", c).onclick = closeModal;
      $("#ed-save", c).onclick = () => { const v = $("#ed-ta", c).value.trim(); if (v.length < 5) { toast("✍️", "La réponse est trop courte."); return; } e.answer = v; e.mood = mood; save(); closeModal(); route(); toast("💾", "Réponse mise à jour."); };
    });
  }

  /* ---------- Quêtes bonus ---------- */
  function bonusHTML(k) {
    const b = S.bonus[k] || {}, xp = b.xp || {};
    const y = addDays(k, -1), yb = S.bonus[y];
    const check = v => `<span class="q-check ${v ? "on" : ""}">${v ? "✓" : ""}</span>`;
    let h = "";
    if (yb && yb.objectif && b.objCheck == null) {
      h += `<section class="card"><div class="row"><div class="q-ico">🎯</div><div class="q-body"><div class="q-title">Objectif d'hier atteint ?</div>
        <div class="small muted">« ${esc(yb.objectif)} »</div></div></div>
        <div class="grid2 mt"><button class="btn" data-objcheck="0">Pas cette fois</button><button class="btn primary" data-objcheck="1">Oui ! +${XP.objCheck} XP</button></div></section>`;
    } else if (yb && yb.objectif && b.objCheck != null) {
      h += `<section class="card"><div class="row"><div class="q-ico">🎯</div><div class="q-body"><div class="q-title">Objectif d'hier</div><div class="small muted">« ${esc(yb.objectif)} » · ${b.objCheck ? "atteint ✅" : "pas atteint, on recommence 💪"}</div></div></div></section>`;
    }
    h += `<details class="card quest" ${!xp.grat ? "" : ""}><summary><div class="q-ico">🙏</div><div class="q-body"><div class="q-title">3 gratitudes</div><div class="q-xp">+${XP.grat} XP</div></div>${check(xp.grat)}</summary>
      <div class="q-content">${[0, 1, 2].map(i => `<input type="text" data-grat="${i}" placeholder="Merci pour… (${i + 1})" value="${esc((b.grat || [])[i] || "")}">`).join("")}
      <button class="btn primary" data-save="grat">${xp.grat ? "Mettre à jour" : "Valider"}</button></div></details>`;
    h += `<details class="card quest"><summary><div class="q-ico">🏆</div><div class="q-body"><div class="q-title">Victoire du jour</div><div class="q-xp">+${XP.victoire} XP</div></div>${check(xp.victoire)}</summary>
      <div class="q-content"><input type="text" data-field="victoire" placeholder="Ma plus belle réussite d'aujourd'hui…" value="${esc(b.victoire || "")}">
      <button class="btn primary" data-save="victoire">${xp.victoire ? "Mettre à jour" : "Valider"}</button></div></details>`;
    h += `<details class="card quest"><summary><div class="q-ico">🗓️</div><div class="q-body"><div class="q-title">Objectif de demain</div><div class="q-xp">+${XP.objectif} XP · vérifié demain soir</div></div>${check(xp.objectif)}</summary>
      <div class="q-content"><input type="text" data-field="objectif" placeholder="Demain, je vais…" value="${esc(b.objectif || "")}">
      <button class="btn primary" data-save="objectif">${xp.objectif ? "Mettre à jour" : "Valider"}</button></div></details>`;
    h += `<details class="card quest"><summary><div class="q-ico">💪</div><div class="q-body"><div class="q-title">Corps en mouvement</div><div class="q-xp">+${XP.sport} XP · qu'avez-vous fait aujourd'hui ?</div></div>${check(xp.sport)}</summary>
      <div class="q-content"><div class="choices">${SPORTS.map(([v, l]) => `<button data-sport="${v}" class="${b.sport === v ? "sel" : ""}">${l}</button>`).join("")}</div></div></details>`;
    return h;
  }
  function bindBonus(k) {
    const get = () => (S.bonus[k] = S.bonus[k] || { xp: {} });
    $$("[data-objcheck]").forEach(btn => btn.onclick = () => { act(() => { const b = get(); b.objCheck = btn.dataset.objcheck === "1"; if (b.objCheck) b.xp.objCheck = XP.objCheck; }); if (btn.dataset.objcheck === "1") toast("🎯", `Parole tenue ! +${XP.objCheck} XP`); route(); });
    $$("[data-save]").forEach(btn => btn.onclick = () => {
      const q = btn.dataset.save;
      if (q === "grat") {
        const vals = $$("[data-grat]").map(i => i.value.trim());
        if (vals.some(v => v.length < 2)) { toast("🙏", "Remplissez les 3 gratitudes."); return; }
        const first = !(S.bonus[k] && S.bonus[k].xp && S.bonus[k].xp.grat);
        act(() => { const b = get(); b.grat = vals; b.xp.grat = XP.grat; });
        if (first) toast("🙏", `Gratitude notée. +${XP.grat} XP`);
      } else {
        const v = $(`[data-field="${q}"]`).value.trim();
        if (v.length < 3) { toast("✍️", "Écrivez quelques mots d'abord."); return; }
        const first = !(S.bonus[k] && S.bonus[k].xp && S.bonus[k].xp[q]);
        act(() => { const b = get(); b[q] = v; b.xp[q] = XP[q]; });
        if (first) toast(q === "victoire" ? "🏆" : "🗓️", `${q === "victoire" ? "Victoire enregistrée" : "Objectif fixé. Je vous le rappellerai demain soir"}. +${XP[q]} XP`);
      }
      renderTop(); route();
    });
    $$("[data-sport]").forEach(btn => btn.onclick = () => {
      const first = !(S.bonus[k] && S.bonus[k].xp && S.bonus[k].xp.sport);
      act(() => { const b = get(); b.sport = btn.dataset.sport; b.xp.sport = XP.sport; });
      if (first) toast("💪", btn.dataset.sport === "repos" ? `La récupération fait partie de l'entraînement. +${XP.sport} XP` : `Bien joué ! +${XP.sport} XP`);
      route();
    });
  }

  /* ---------- Onglet : Journal ---------- */
  let jFilter = "all", jSearch = "";
  function renderJournal() {
    const keys = Object.keys(S.entries).concat(Object.keys(S.bonus).filter(k => !S.entries[k])).sort().reverse();
    const q = jSearch.toLowerCase();
    const list = keys.filter(k => {
      const e = S.entries[k], b = S.bonus[k] || {};
      if (jFilter !== "all" && (!e || e.theme !== jFilter)) return false;
      if (!q) return true;
      const hay = [e && e.answer, e && BY_ID[e.id] && BY_ID[e.id].title, b.victoire, b.objectif, (b.grat || []).join(" ")].join(" ").toLowerCase();
      return hay.includes(q);
    });
    let h = `<input type="search" id="jsearch" placeholder="Rechercher dans vos réponses…" value="${esc(jSearch)}" style="margin-bottom:10px">
      <div class="chips"><button data-f="all" class="${jFilter === "all" ? "sel" : ""}">Tout (${Object.keys(S.entries).length})</button>
      ${THEME_KEYS.map(t => `<button data-f="${t}" class="${jFilter === t ? "sel" : ""}">${THEMES[t].emoji} ${esc(THEMES[t].short)}</button>`).join("")}</div>`;
    if (!list.length) h += `<div class="empty"><div class="big">📖</div><p>${Object.keys(S.entries).length ? "Aucune entrée ne correspond." : "Votre journal est vide pour l'instant.<br>Chaque défi validé viendra s'écrire ici."}</p></div>`;
    list.forEach(k => {
      const e = S.entries[k], b = S.bonus[k] || {};
      const sp = SPORTS.find(s => s[0] === b.sport);
      h += `<article class="card entry"><div class="e-head"><span class="e-date">${esc(fmtDate(k, { weekday: "short", day: "numeric", month: "short", year: "numeric" }))}</span>
        <span>${e ? themePill(e.theme) : ""} ${e && e.mood ? MOODS[e.mood - 1].e : ""}</span></div>
        ${e ? `<div class="e-title">${esc(BY_ID[e.id] ? BY_ID[e.id].title : "Défi")}</div><div class="answer">${esc(e.answer)}</div>` : `<div class="small muted">Pas de défi ce soir-là, seulement des quêtes bonus.</div>`}
        ${b.grat ? `<div class="e-extra">🙏 <b>Gratitudes :</b> ${b.grat.map(esc).join(" · ")}</div>` : ""}
        ${b.victoire ? `<div class="e-extra">🏆 <b>Victoire :</b> ${esc(b.victoire)}</div>` : ""}
        ${b.objectif ? `<div class="e-extra">🗓️ <b>Objectif du lendemain :</b> ${esc(b.objectif)}${S.bonus[addDays(k, 1)] && S.bonus[addDays(k, 1)].objCheck != null ? (S.bonus[addDays(k, 1)].objCheck ? " ✅" : " ❌") : ""}</div>` : ""}
        ${sp ? `<div class="e-extra">💪 <b>Sport :</b> ${sp[1]}</div>` : ""}
        <div class="row between mt"><span class="small muted">+${dayXP(k)} XP</span>${e ? `<button class="linkbtn" data-edit="${k}">Modifier</button>` : ""}</div></article>`;
    });
    $("#view").innerHTML = h;
    const s = $("#jsearch");
    s.oninput = () => { jSearch = s.value; const pos = s.selectionStart; renderJournal(); const s2 = $("#jsearch"); s2.focus(); try { s2.setSelectionRange(pos, pos); } catch (e) {} };
    $$("[data-f]").forEach(b => b.onclick = () => { jFilter = b.dataset.f; renderJournal(); });
    $$("[data-edit]").forEach(b => b.onclick = () => editEntry(b.dataset.edit));
  }

  /* ---------- Onglet : Bilan ---------- */
  let wOffset = 0;
  function renderBilan() {
    const tk = todayKey(), wk = addDays(weekKey(tk), -7 * wOffset);
    const days = Array.from({ length: 7 }, (_, i) => addDays(wk, i));
    const done = days.filter(k => S.entries[k]);
    const moods = done.map(k => S.entries[k].mood).filter(Boolean);
    const avg = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : 0;
    const w = S.weeks[wk] || {};
    const wxp = days.reduce((a, k) => a + dayXP(k), 0) + (w.xp || 0);
    const elapsed = days.filter(k => k <= tk).length;
    const label = wOffset === 0 ? "Cette semaine" : wOffset === 1 ? "Semaine dernière" : `Semaine du ${fmtDate(wk, { day: "numeric", month: "short" })}`;
    let coach;
    if (!done.length) coach = wOffset === 0 ? "Nouvelle semaine, page blanche. Le premier défi est le plus important : lancez-vous ce soir." : "Semaine sans défi. Ce n'est pas grave : ce qui compte, c'est de repartir.";
    else if (done.length >= 6) coach = "Semaine de champion. Votre régularité est votre super-pouvoir, continuez comme ça.";
    else if (done.length >= 4) coach = "Belle semaine ! Vous avez fait plus de la moitié des soirs. Visez un soir de plus la semaine prochaine.";
    else coach = "Vous avez posé des bases. Pour progresser, fixez un horaire fixe pour votre défi (par exemple 22 h).";
    const themesW = {}; done.forEach(k => { const t = S.entries[k].theme; themesW[t] = (themesW[t] || 0) + 1; });
    const st = stats();
    let h = `<div class="weeknav"><button id="wprev" aria-label="Semaine précédente">‹</button>
      <div class="center"><b>${label}</b><div class="small muted">${fmtDate(days[0], { day: "numeric", month: "short" })} – ${fmtDate(days[6], { day: "numeric", month: "short" })}</div></div>
      <button id="wnext" aria-label="Semaine suivante" ${wOffset === 0 ? "disabled style='opacity:.3'" : ""}>›</button></div>
      <div class="stats">
        <div class="stat"><div class="v">${done.length}/${wOffset === 0 ? elapsed : 7}</div><div class="l">défis validés</div></div>
        <div class="stat"><div class="v">${wxp}</div><div class="l">XP gagnés</div></div>
        <div class="stat"><div class="v">${avg ? MOODS[Math.round(avg) - 1].e + " " + avg.toFixed(1) : "–"}</div><div class="l">humeur moyenne</div></div>
        <div class="stat"><div class="v">🔥 ${st.streak}</div><div class="l">série actuelle · record ${st.best}</div></div>
      </div>
      <section class="card"><h3>Vos soirs</h3><div class="days">${days.map(k => { const e = S.entries[k]; const hgt = e ? (e.mood ? 30 + e.mood * 14 : 60) : (S.frozen[k] ? 20 : 8);
        return `<div class="day"><div class="em">${e && e.mood ? MOODS[e.mood - 1].e : S.frozen[k] ? "🛡️" : ""}</div><div class="col ${e ? "done" : ""}" style="height:${hgt}%"></div><div class="lbl">${fmtDate(k, { weekday: "short" }).slice(0, 3)}</div></div>`; }).join("")}</div>
        <p class="small" style="margin:12px 0 0">💬 ${esc(coach)}</p></section>`;
    if (Object.keys(themesW).length) h += `<section class="card"><h3>Thèmes travaillés</h3>${Object.entries(themesW).map(([t, n]) => `<div class="row" style="margin:4px 0">${themePill(t)}<span class="small muted">× ${n}</span></div>`).join("")}</section>`;
    h += `<section class="card"><h3>Bilan de la semaine ${w.xp ? "✅" : `<span class="q-xp">+${XP.week} XP</span>`}</h3>
      <p class="small muted" style="margin-top:-4px">Trois minutes, idéalement le dimanche soir.</p>
      <label class="small"><b>Ma plus grande victoire de la semaine</b></label><textarea id="w-win" style="min-height:70px" placeholder="Cette semaine, je suis fier de…">${esc(w.win || "")}</textarea>
      <label class="small"><b>Ce que j'ai appris sur moi</b></label><textarea id="w-learn" style="min-height:70px" placeholder="J'ai remarqué que…">${esc(w.learn || "")}</textarea>
      <label class="small"><b>Ce que j'améliore la semaine prochaine</b></label><textarea id="w-improve" style="min-height:70px" placeholder="La semaine prochaine, je…">${esc(w.improve || "")}</textarea>
      <button class="btn primary block mt" id="w-save">${w.xp ? "Mettre à jour le bilan" : "Enregistrer le bilan"}</button></section>`;
    // Vue globale
    const weeksN = 16, start = addDays(weekKey(tk), -7 * (weeksN - 1));
    let heat = ""; for (let i = 0; i < weeksN * 7; i++) { const k = addDays(start, i); const e = S.entries[k]; const x = dayXP(k);
      heat += `<i class="${k > tk ? "fut" : e ? (x >= 90 ? "l3" : x >= 70 ? "l2" : "l1") : S.frozen[k] ? "frz" : ""}" title="${k}"></i>`; }
    const allMoods = Object.values(S.entries).map(e => e.mood).filter(Boolean);
    const maxT = Math.max(1, ...Object.values(st.themeCounts));
    h += `<div class="section-title">Depuis le début</div>
      <div class="stats"><div class="stat"><div class="v">${st.total}</div><div class="l">défis au total</div></div>
        <div class="stat"><div class="v">${totalXP()}</div><div class="l">XP au total</div></div>
        <div class="stat"><div class="v">${st.best}</div><div class="l">meilleure série</div></div>
        <div class="stat"><div class="v">${allMoods.length ? (allMoods.reduce((a, b) => a + b, 0) / allMoods.length).toFixed(1) : "–"}</div><div class="l">humeur moyenne /5</div></div></div>
      <section class="card"><h3>16 dernières semaines</h3><div class="heat">${heat}</div>
        <p class="small muted" style="margin:8px 0 0">Plus la case est chaude, plus vous avez gagné d'XP ce soir-là. 🛡️ en bleu : soir protégé.</p></section>
      <section class="card"><h3>Équilibre des thèmes</h3>${THEME_KEYS.map(t => `<div class="tbar"><span class="tn">${THEMES[t].emoji} ${esc(THEMES[t].short)}</span><span class="tt"><i style="width:${st.themeCounts[t] / maxT * 100}%;background:${THEMES[t].color}"></i></span><span class="tc">${st.themeCounts[t]}</span></div>`).join("")}</section>`;
    $("#view").innerHTML = h;
    $("#wprev").onclick = () => { wOffset++; renderBilan(); };
    $("#wnext").onclick = () => { if (wOffset > 0) { wOffset--; renderBilan(); } };
    $("#w-save").onclick = () => {
      const win = $("#w-win").value.trim(), learn = $("#w-learn").value.trim(), improve = $("#w-improve").value.trim();
      if (win.length < 3 || improve.length < 3) { toast("✍️", "Remplissez au moins la victoire et l'amélioration."); return; }
      const first = !(S.weeks[wk] && S.weeks[wk].xp);
      act(() => { S.weeks[wk] = { win, learn, improve, xp: XP.week, at: new Date().toISOString() }; });
      if (first) { confetti(); toast("📊", `Bilan enregistré. +${XP.week} XP`); } else toast("💾", "Bilan mis à jour.");
      renderTop(); renderBilan();
    };
  }

  /* ---------- Onglet : Profil ---------- */
  function installCard(dismissable) {
    const ios = isIOS();
    return `<section class="card install"><h3>📲 Installer l'application</h3>
      ${ios ? `<p class="small" style="margin:0 0 6px">Dans Safari : touchez <b>Partager</b> <span style="font-size:17px">⎋</span> puis <b>« Sur l'écran d'accueil »</b>. L'appli s'ouvrira en plein écran et fonctionnera hors connexion.</p>
      <p class="small muted" style="margin:0">Important : sur iPhone, les données de Safari et celles de l'appli installée sont séparées. Installez-la avant de commencer à jouer.</p>`
      : `<p class="small" style="margin:0">Ouvrez le menu du navigateur et choisissez « Installer l'application » ou « Ajouter à l'écran d'accueil ».</p>`}
      ${dismissable ? `<button class="linkbtn" id="hide-install">Masquer</button>` : ""}</section>`;
  }
  function bindInstall() { const b = $("#hide-install"); if (b) b.onclick = () => { S.installHidden = true; save(); route(); }; }
  function renderProfil() {
    const lv = levelInfo(totalXP()), st = stats();
    const unlocked = BADGES.filter(b => S.badges[b.id]).length;
    let h = levelCard();
    h += `<div class="section-title">Badges · ${unlocked}/${BADGES.length}</div><div class="badges">${BADGES.map(b => { const got = S.badges[b.id];
      return `<div class="badge ${got ? "" : "locked"}"><div class="bi">${b.i}</div><div class="bn">${esc(b.n)}</div><div class="bd">${got ? "Obtenu le " + esc(fmtDate(got, { day: "numeric", month: "short" })) : esc(b.d)}</div></div>`; }).join("")}</div>`;
    h += `<div class="section-title">Niveaux</div><section class="card"><div class="levels">${LEVELS.map((l, i) => `<div class="lvrow ${i + 1 === lv.n ? "cur" : i + 1 > lv.n ? "lock" : ""}"><span class="n">${i + 1}</span><span style="flex:1"><b>${esc(l.title)}</b></span><span class="small muted">${l.xp} XP</span>${i + 1 <= lv.n ? "✓" : "🔒"}</div>`).join("")}</div></section>`;
    h += `<div class="section-title">Règles du jeu</div><section class="card small">
      <p style="margin-top:0">🌙 <b>Un défi par soir</b> (10-20 min), tiré dans 8 thèmes qui tournent : jamais deux fois le même thème de suite, et ${CH.length} défis avant la moindre répétition.</p>
      <p>⭐ <b>XP</b> : ${XP.base} par défi, +${XP.mood} pour l'humeur, +${XP.deep} si votre réponse dépasse 150 caractères, +${XP.streakStep} par soir de série (jusqu'à +${XP.streakMax}). Quêtes bonus : +10 à +15. Bilan hebdo : +${XP.week}. Chaque badge : +${XP.badge}.</p>
      <p>🔥 <b>Série</b> : validez un défi chaque soir. La journée se termine à ${DAY_CUTOFF_H} h du matin : un défi fait à 1 h compte pour la veille.</p>
      <p style="margin-bottom:0">🛡️ <b>Boucliers</b> : tous les 7 soirs d'affilée, vous en gagnez un (2 maximum). Si vous manquez un soir, il protège automatiquement votre série.</p></section>`;
    h += `<div class="section-title">Réglages</div><section class="card">
      <label class="small"><b>Votre prénom</b></label>
      <div class="row" style="margin:6px 0 14px"><input type="text" id="p-name" value="${esc(S.name)}" placeholder="Prénom"><button class="btn" id="p-name-save">OK</button></div>
      <label class="small"><b>Apparence</b></label>
      <div class="seg" style="margin-top:6px">${[["auto", "Auto"], ["dark", "Sombre"], ["light", "Clair"]].map(([v, l]) => `<button data-th="${v}" class="${S.theme === v ? "sel" : ""}">${l}</button>`).join("")}</div></section>`;
    if (!isStandalone()) h += installCard(false);
    h += `<div class="section-title">Sauvegarde</div><section class="card">
      <p class="small muted" style="margin-top:0">Vos données restent uniquement sur ce téléphone. Exportez une sauvegarde de temps en temps (dans Fichiers ou par e-mail) pour ne rien perdre.</p>
      <div class="grid2"><button class="btn primary" id="exp">⬇️ Exporter</button><button class="btn" id="imp">⬆️ Importer</button></div>
      <button class="btn block mt" id="copy">📋 Copier la sauvegarde</button>
      <input type="file" id="imp-file" accept="application/json,.json,text/plain" class="hidden">
      <p class="small muted" style="margin-bottom:0">${st.total} défis · ${Object.keys(S.bonus).length} jours de quêtes · ${Object.keys(S.weeks).length} bilans</p></section>
      <section class="card"><button class="btn danger block" id="reset">Tout effacer et recommencer</button></section>
      <p class="small muted center">Défi du soir · v1.0 · 100 % hors ligne, aucune donnée envoyée</p>`;
    $("#view").innerHTML = h;
    $("#p-name-save").onclick = () => { S.name = $("#p-name").value.trim().slice(0, 30); save(); renderTop(); toast("👋", S.name ? `Enchanté, ${esc(S.name)} !` : "Prénom effacé."); };
    $$("[data-th]").forEach(b => b.onclick = () => { S.theme = b.dataset.th; save(); applyTheme(); renderProfil(); });
    $("#exp").onclick = exportData;
    $("#copy").onclick = async () => { try { await navigator.clipboard.writeText(backupJSON()); markExported(); toast("📋", "Sauvegarde copiée. Collez-la dans une note ou un e-mail."); } catch (e) { toast("⚠️", "Copie impossible sur cet appareil."); } };
    $("#imp").onclick = importDialog;
    $("#imp-file").onchange = ev => { const f = ev.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => doImport(r.result); r.readAsText(f); ev.target.value = ""; };
    $("#reset").onclick = () => {
      openModal(`<h2>Tout effacer ?</h2><p>Vos réponses, votre XP, vos badges et votre série seront supprimés de ce téléphone. Pensez à exporter une sauvegarde avant.</p>
        <p class="small">Tapez <b>EFFACER</b> pour confirmer :</p><input type="text" id="rs-in" autocomplete="off">
        <div class="grid2 mt"><button class="btn" id="rs-no">Annuler</button><button class="btn danger" id="rs-yes">Effacer</button></div>`, c => {
        $("#rs-no", c).onclick = closeModal;
        $("#rs-yes", c).onclick = () => { if ($("#rs-in", c).value.trim().toUpperCase() !== "EFFACER") { toast("✋", "Tapez EFFACER pour confirmer."); return; }
          const keepName = S.name, keepTheme = S.theme; S = freshState(); S.name = keepName; S.theme = keepTheme; S.welcomed = true; Object.keys(seqCache).forEach(k => delete seqCache[k]); save(); closeModal(); renderTop(); go("soir"); toast("🧹", "Nouveau départ !"); };
      });
    };
  }
  function backupJSON() { return JSON.stringify({ app: "defi-du-soir", version: 1, exportedAt: new Date().toISOString(), data: S }, null, 2); }
  function markExported() { act(() => { S.exported = true; S.lastExport = new Date().toISOString(); }); }
  async function exportData() {
    const json = backupJSON(), name = `defi-du-soir-sauvegarde-${todayKey()}.json`;
    try {
      const file = new File([json], name, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Sauvegarde Défi du soir" }); markExported(); toast("💾", "Sauvegarde exportée."); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([json], { type: "application/json" })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    markExported(); toast("💾", "Sauvegarde téléchargée.");
  }
  function importDialog() {
    openModal(`<h2>Importer une sauvegarde</h2><p class="small muted">Choisissez le fichier .json exporté, ou collez son contenu ci-dessous. Les données actuelles de ce téléphone seront remplacées.</p>
      <button class="btn block" id="im-file">📁 Choisir un fichier</button>
      <textarea id="im-ta" class="mt" placeholder='Collez ici le contenu de la sauvegarde ({"app":"defi-du-soir", …})'></textarea>
      <div class="grid2 mt"><button class="btn" id="im-no">Annuler</button><button class="btn primary" id="im-yes">Importer le texte</button></div>`, c => {
      $("#im-no", c).onclick = closeModal;
      $("#im-file", c).onclick = () => { closeModal(); $("#imp-file").click(); };
      $("#im-yes", c).onclick = () => doImport($("#im-ta", c).value);
    });
  }
  function doImport(text) {
    let obj; try { obj = JSON.parse(text); } catch (e) { toast("⚠️", "Ce fichier n'est pas une sauvegarde valide."); return; }
    const data = obj && obj.data ? obj.data : obj;
    if (!data || typeof data !== "object" || typeof data.entries !== "object" || typeof data.seed !== "number") { toast("⚠️", "Sauvegarde non reconnue."); return; }
    S = Object.assign(freshState(), data); S.welcomed = true; Object.keys(seqCache).forEach(k => delete seqCache[k]);
    save(); closeModal(); applyTheme(); renderTop(); go("soir");
    toast("✅", `Sauvegarde importée : ${plural(Object.keys(S.entries).length, "défi")} retrouvés.`);
  }

  /* ---------- Modales spéciales ---------- */
  function levelUpModal(lv) {
    openModal(`<div class="center"><div style="font-size:56px">🏅</div><div class="small muted">Nouveau niveau</div>
      <div class="lv-badge" style="margin:10px auto;width:72px;height:72px;font-size:30px">${lv.n}</div>
      <h2 style="margin:0">${esc(lv.title)}</h2>
      <p class="muted">${lv.nextTitle ? `Prochain titre : « ${esc(lv.nextTitle)} » à ${lv.to} XP.` : "Vous avez atteint le sommet. Légendaire."}</p>
      <button class="btn primary block" id="lu-ok">Je continue</button></div>`, c => { confetti(); $("#lu-ok", c).onclick = closeModal; }, true);
  }
  function welcome() {
    const m = $("#modal"); m.dataset.locked = "1";
    openModal(`<div class="center"><div style="font-size:52px">🌙🔥</div><h2 style="margin:6px 0 4px">Bienvenue dans Défi du soir</h2>
      <p class="muted" style="margin:0 0 14px">Chaque soir, 10 à 20 minutes pour devenir une meilleure version de vous-même.</p></div>
      <div class="small" style="display:grid;gap:8px;margin-bottom:14px">
        <div>🎯 <b>Un défi par soir</b> : confiance, discipline, leadership, vente, finances, santé, mental, apprentissage.</div>
        <div>⭐ <b>Gagnez de l'XP</b>, montez de niveau de « Recrue » à « Légende ».</div>
        <div>🔥 <b>Gardez votre série</b> et débloquez ${BADGES.length} badges.</div>
        <div>🔒 <b>Tout reste sur votre téléphone.</b></div></div>
      ${isIOS() && !isStandalone() ? `<p class="small" style="background:var(--card2);padding:10px 12px;border-radius:12px">📲 Conseil : installez d'abord l'appli (Partager › « Sur l'écran d'accueil »), puis ouvrez-la depuis l'icône. Sinon vos progrès resteraient dans Safari.</p>` : ""}
      <label class="small"><b>Comment voulez-vous que je vous appelle ?</b></label>
      <input type="text" id="wl-name" placeholder="Votre prénom" style="margin:6px 0 12px" value="${esc(S.name)}">
      <button class="btn primary block" id="wl-go">C'est parti 🚀</button>`, c => {
      $("#wl-go", c).onclick = () => { S.name = $("#wl-name", c).value.trim().slice(0, 30); S.welcomed = true; save(); closeModal(); renderTop(); route(); };
    });
  }

  /* ---------- Navigation ---------- */
  let tab = "soir";
  function route() {
    renderTop();
    ({ soir: renderSoir, journal: renderJournal, bilan: renderBilan, profil: renderProfil })[tab]();
  }
  function go(t) { tab = t; $$("#tabbar button").forEach(b => b.classList.toggle("active", b.dataset.tab === t)); if (t === "bilan") wOffset = 0; route(); window.scrollTo(0, 0); }

  /* ---------- Démarrage ---------- */
  load(); applyTheme();
  $$("#tabbar button").forEach(b => b.onclick = () => go(b.dataset.tab));
  checkBadges(); route();
  if (!S.welcomed) welcome();
  // Changement de jour pendant que l'appli reste ouverte
  let lastDay = todayKey();
  document.addEventListener("visibilitychange", () => { if (!document.hidden && todayKey() !== lastDay) { lastDay = todayKey(); route(); } });
  setInterval(() => { if (todayKey() !== lastDay) { lastDay = todayKey(); route(); } }, 60000);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
  // Exposé pour les tests
  window.__DDS = { get state() { return S; }, todayKey, streak, totalXP, levelInfo, cycleSeq, BADGES };
})();
