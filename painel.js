"use strict";
/* START PLAY — painel (parte 1: base, Início, Telas e Anúncios) */
const CFG = window.STARTPLAY || window.SCREENFLOW || {};
const A = window.SPAgenda;
const BUCKET = "midia";
const MAX_MB = 50;            // depois de convertido (limite do armazenamento)
const MAX_IN_MB = 600;        // arquivo original que o conversor aceita
const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const ORIENT = { landscape: "Horizontal", portrait: "Vertical (girar para a direita)", portrait_ccw: "Vertical (girar para a esquerda)" };
const EDITORIAS = ["Últimas notícias", "Brasil", "Mundo", "Economia", "Esportes", "Tecnologia", "Saúde e ciência", "Entretenimento", "Mato Grosso"];
const NEW_NAME = "Nova tela";
const SPEED_TXT = ["Muito lenta", "Lenta", "Normal", "Rápida", "Muito rápida"];
let sb = null, me = null;
const state = { tab: "inicio", media: [], screens: [], clients: [], payments: [], receipts: [], exceptions: [], sources: [],
  settings: {}, latest: null, poll: null, report: { client: "", period: "30", from: "", to: "", screen: "", media: "" }, fin: { view: "parcelas", status: "aberto", client: "" } };

// ---------------------------------------------------------------------------
// utilidades
// ---------------------------------------------------------------------------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = n => `<svg><use href="#${n}"/></svg>`;
const two = n => String(n).padStart(2, "0");
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = v => BRL.format(Number(v) || 0);
const nf = n => Math.round(Number(n) || 0).toLocaleString("pt-BR");
const tz = () => state.settings.timezone || "America/Cuiaba";
const P = () => A.nowParts(tz());
const today = () => P().ymd;
const addDays = (ymd, n) => A.ymdAdd(ymd, n);
const hm = t => t ? String(t).slice(0, 5) : "";
const fmtDay = d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : "";
const fmtDate = d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "";
const fmtDT = ts => ts ? new Date(ts).toLocaleString("pt-BR", { timeZone: tz(), day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtMB = b => b < 1048576 ? Math.max(1, Math.round(b / 1024)) + " KB" : (b / 1048576).toFixed(b < 10485760 ? 1 : 0).replace(".", ",") + " MB";
function fmtSecs(s) {
  s = Math.round(s || 0);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min${s % 60 ? " " + (s % 60) + "s" : ""}`;
  return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}min`;
}
function ago(ts) {
  if (!ts) return "nunca";
  const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 90) return "agora";
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86400)} dias`;
}
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
function monthAdd(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  const dt = new Date(Date.UTC(y, m - 1 + n, Math.min(d, last)));
  return dt.toISOString().slice(0, 10);
}
// instante (UTC) da meia-noite do dia no fuso configurado
function startOf(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const p = A.nowParts(tz(), guess);
  const [py, pm, pd] = p.ymd.split("-").map(Number);
  const local = Date.UTC(py, pm - 1, pd, Math.floor(p.min / 60), p.min % 60);
  return new Date(guess - (local - guess));
}
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2));
const loaded = {};
function loadScript(src) {
  return loaded[src] || (loaded[src] = new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res;
    s.onerror = () => { delete loaded[src]; rej(new Error("Não consegui carregar " + src)); };
    document.head.appendChild(s);
  }));
}
function toast(msg, ms = 3000, action) {
  $$(".toast").forEach(t => t.remove());
  const t = document.createElement("div"); t.className = "toast";
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ""}`;
  if (action) t.querySelector("button").addEventListener("click", () => { t.remove(); action.fn(); });
  document.body.appendChild(t); setTimeout(() => t.remove(), action ? Math.max(ms, 8000) : ms);
}
function friendly(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e);
  if (/Invalid login/i.test(m)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(m)) return "Confirme o seu e-mail primeiro (veja a caixa de entrada).";
  if (/already registered/i.test(m)) return "Esse e-mail já tem conta. Use Entrar.";
  if (/Password should be/i.test(m)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/exceeded the maximum allowed size|Payload too large|413/i.test(m)) return `Arquivo grande demais (máximo ${MAX_MB} MB).`;
  if (/mime type|invalid_mime/i.test(m)) return "O armazenamento recusou esse tipo de arquivo. Tente enviar de novo: o painel converte para PNG, WEBP, JPG ou MP4.";
  if (/Valide a fonte/i.test(m)) return m.replace(/^.*?(Valide a fonte)/, "$1");
  if (/row-level security|permission denied/i.test(m)) return "Sem permissão. Entre com a conta de administrador.";
  if (/duplicate key|unique/i.test(m)) return "Já existe um registro igual para essa data.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão. Confira a internet e tente de novo.";
  return m;
}
async function token() { const { data } = await sb.auth.getSession(); return data.session && data.session.access_token; }

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------
async function start() {
  if (!window.supabase || !CFG.supabaseUrl || CFG.supabaseUrl.startsWith("COLE_")) {
    $("#v-auth").classList.remove("hide");
    $("#auth-box").innerHTML = `<p>Falta configurar o arquivo <b>config.js</b> com os dados do Supabase.</p>`;
    return;
  }
  sb = supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);
  sb.auth.onAuthStateChange((ev) => {
    if (ev === "PASSWORD_RECOVERY") { showAuth("newpass"); return; }
    if (ev === "SIGNED_OUT") { me = null; showAuth("login"); }
  });
  const { data } = await sb.auth.getSession();
  if (data.session) await enter(data.session.user);
  else {
    const { data: has } = await sb.rpc("sf_has_admin");
    showAuth(has ? "login" : "signup");
  }
}

function showAuth(mode, note) {
  $("#v-app").classList.add("hide");
  $("#v-auth").classList.remove("hide");
  const box = $("#auth-box");
  const forms = {
    login: `<p>Entre para gerenciar as telas, os anúncios e os clientes da START PLAY.</p>
      ${note ? `<div class="ok-box" style="margin:0 0 12px">${esc(note)}</div>` : ""}
      <form id="f-auth"><div class="field"><label for="em">E-mail</label><input class="in" id="em" type="email" autocomplete="email" required></div>
      <div class="field"><label for="pw">Senha</label><input class="in" id="pw" type="password" autocomplete="current-password" required></div>
      <div id="auth-err"></div><button class="btn" type="submit">Entrar</button></form>
      <div class="alt"><a href="#" id="forgot">Esqueci a senha</a></div>`,
    signup: `<p><b>Primeiro acesso.</b> Crie a conta de administrador. Só esta conta vai poder mexer no painel.</p>
      <form id="f-auth"><div class="field"><label for="em">E-mail</label><input class="in" id="em" type="email" autocomplete="email" required></div>
      <div class="field"><label for="pw">Senha (mínimo 6 caracteres)</label><input class="in" id="pw" type="password" autocomplete="new-password" minlength="6" required></div>
      <div id="auth-err"></div><button class="btn" type="submit">Criar conta</button></form>
      <div class="alt"><a href="#" id="to-login">Já tenho conta</a></div>`,
    confirm: `<p>Pronto! Enviamos um link de confirmação para o seu e-mail. Clique nele e depois entre aqui.</p>
      <button class="btn" id="to-login2">Ir para o login</button>`,
    newpass: `<p>Digite a nova senha.</p>
      <form id="f-auth"><div class="field"><label for="pw">Nova senha</label><input class="in" id="pw" type="password" minlength="6" required autocomplete="new-password"></div>
      <div id="auth-err"></div><button class="btn" type="submit">Salvar senha</button></form>`
  };
  box.innerHTML = forms[mode];
  const err = m => { $("#auth-err").innerHTML = m ? `<div class="err-box">${esc(m)}</div>` : ""; };
  $("#to-login")?.addEventListener("click", e => { e.preventDefault(); showAuth("login"); });
  $("#to-login2")?.addEventListener("click", () => showAuth("login"));
  $("#forgot")?.addEventListener("click", async e => {
    e.preventDefault();
    const em = $("#em").value.trim();
    if (!em) { err("Digite o seu e-mail acima e clique de novo em 'Esqueci a senha'."); return; }
    const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
    if (error) err(friendly(error)); else showAuth("login", "Enviamos um link para redefinir a senha no seu e-mail.");
  });
  $("#f-auth")?.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("#f-auth .btn"); btn.disabled = true; btn.innerHTML = `<span class="spin"></span>`; err("");
    try {
      if (mode === "login") {
        const { data, error } = await sb.auth.signInWithPassword({ email: $("#em").value.trim(), password: $("#pw").value });
        if (error) throw error; await enter(data.user);
      } else if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email: $("#em").value.trim(), password: $("#pw").value,
          options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (data.session) await enter(data.user); else showAuth("confirm");
      } else if (mode === "newpass") {
        const { data, error } = await sb.auth.updateUser({ password: $("#pw").value });
        if (error) throw error; await enter(data.user);
      }
    } catch (ex) { err(friendly(ex)); btn.disabled = false; btn.textContent = { login: "Entrar", signup: "Criar conta", newpass: "Salvar senha" }[mode]; }
  });
}

async function enter(user) {
  me = user;
  const { data: isAdmin } = await sb.rpc("sf_is_admin");
  if (!isAdmin) { await sb.auth.signOut(); showAuth("login", "Esta conta não é a administradora deste painel."); return; }
  $("#v-auth").classList.add("hide");
  $("#v-app").classList.remove("hide");
  $("#who").textContent = user.email || "";
  try { await need("settings"); } catch (e) {}
  route();
}
$("#logout").addEventListener("click", async () => { await sb.auth.signOut(); });
$$(".tab").forEach(b => b.addEventListener("click", () => { location.hash = b.dataset.tab; }));
window.addEventListener("hashchange", () => { if (me) route(); });

const PAGES = {};
function route() {
  const [t, ...rest] = (location.hash || "#inicio").slice(1).split("/");
  const arg = rest.join("/");
  state.tab = PAGES[t] ? t : "inicio";
  $$(".tab").forEach(b => b.classList.toggle("on", b.dataset.tab === state.tab));
  clearInterval(state.poll);
  closeModal();
  PAGES[state.tab](arg ? decodeURIComponent(arg) : null);
}
function loading() { $("#main").innerHTML = `<div class="empty"><span class="spin dark"></span></div>`; }
function pageError(e) { $("#main").innerHTML = `<div class="err-box">${esc(friendly(e))}</div>`; }

// ---------------------------------------------------------------------------
// dados
// ---------------------------------------------------------------------------
async function q(table, cols, build) {
  let r = sb.from(table).select(cols || "*");
  if (build) r = build(r);
  const { data, error } = await r;
  if (error) throw error;
  return data || [];
}
const SRC_COLS = "id,name,section,url,position,enabled,refresh_min,note,validated_at,validation,ok_at,fetched_at,last_error,last_ms,fails";
const LOAD = {
  media: async () => { state.media = await q("media", "*", r => r.order("position").order("created_at")); },
  screens: async () => { state.screens = await q("screens", "*", r => r.order("created_at")); },
  clients: async () => { state.clients = await q("clients", "*", r => r.order("name")); },
  payments: async () => { state.payments = await q("payments", "*", r => r.order("due_date")); },
  receipts: async () => { state.receipts = await q("receipts", "*", r => r.order("paid_on", { ascending: false })); },
  exceptions: async () => { state.exceptions = await q("schedule_exceptions", "*", r => r.order("day")); },
  sources: async () => { state.sources = await q("news_sources", SRC_COLS, r => r.order("position")); },
  settings: async () => { state.settings = (await q("settings"))[0] || {}; },
  // última miniatura de cada TV ("ver a tela agora")
  shots: async () => {
    const { data, error } = await sb.rpc("sf_shots_latest");
    state.shots = error ? (state.shots || {}) : Object.fromEntries((data || []).map(x => [x.screen_id, x]));
  },
  version: async () => {
    try { const t = await (await fetch("version.txt?t=" + Date.now(), { cache: "no-store" })).text(); state.latest = t.trim(); } catch (e) {}
  }
};
const need = (...keys) => Promise.all(keys.map(k => LOAD[k]()));

// ---------------------------------------------------------------------------
// telas: situação, expediente e capacidade
// ---------------------------------------------------------------------------
const codeOf = s => s.id.slice(-6).toUpperCase();
const isAdded = s => s.name && s.name !== NEW_NAME;
const addedScreens = () => state.screens.filter(isAdded);
const screenLabel = s => isAdded(s) ? (s.location ? `${s.location} · ${s.name}` : s.name) : `Código ${codeOf(s)}`;
const screenName = id => { const s = state.screens.find(x => x.id === id); return s ? screenLabel(s) : "tela removida"; };
const isOnline = s => s.last_seen && (Date.now() - new Date(s.last_seen).getTime()) < 3 * 60 * 1000;
const hoursOf = s => ({ on: !!s.hours_on, open: hm(s.open_at) || "08:00", close: hm(s.close_at) || "22:00", days: s.open_days && s.open_days.length ? s.open_days : [0, 1, 2, 3, 4, 5, 6] });
const excOf = s => state.exceptions.filter(e => !e.screen_id || e.screen_id === s.id)
  .map(e => ({ day: e.day, closed: e.closed, open: hm(e.open_at), close: hm(e.close_at), own: !!e.screen_id, note: e.note }));
const screenOpen = (s, p = P()) => A.isOpen(hoursOf(s), excOf(s), p);
function screenState(s) {
  if (!isAdded(s)) return { k: "novo", txt: "Aguardando pareamento", cls: "" };
  const st = s.status || {};
  if (isOnline(s)) return st.sleep ? { k: "espera", txt: "Em espera · fora do expediente", cls: "acc" } : { k: "online", txt: "Online", cls: "ok" };
  if (!screenOpen(s)) return { k: "fora", txt: "Desligada · fora do expediente", cls: "" };
  return { k: "offline", txt: "Offline", cls: "err" };
}
function versionInfo(s) {
  const v = (s.status || {}).v;
  if (!v) return { ok: false, txt: "versão desconhecida" };
  if (state.latest && v !== state.latest) return { ok: false, txt: `player ${v} · atualizando para ${state.latest}` };
  return { ok: true, txt: `player ${v} (mais recente)` };
}
function progInfo(s) {
  const st = s.status || {};
  if (st.pending) return { cls: "acc", txt: `baixando arquivos: ${st.pending.done} de ${st.pending.total}` };
  if (!st.prog) return { cls: "", txt: /^2\./.test(st.v || "") ? "programação: player antigo" : "programação: aguardando a TV" };
  if (s.prog_latest && st.prog === s.prog_latest) return { cls: "ok", txt: "programação em uso: a mais recente" };
  return { cls: "warn", txt: "programação nova publicada · a TV troca em até 1 min" };
}
const powerTxt = s => (s.status || {}).power === "fisico" ? "Liga e desliga a TV pelo horário" : "Modo de espera visual: a tela fica preta fora do expediente (este aparelho não desliga a TV)";

// ---------------------------------------------------------------------------
// anúncios: agenda e estimativa
// ---------------------------------------------------------------------------
const adModel = m => ({ id: m.id, duration: m.duration_sec, days: m.days, from: hm(m.time_from), to: hm(m.time_to), starts_on: m.starts_on, ends_on: m.ends_on });
const targets = (m, s) => !m.screen_ids || !m.screen_ids.length || m.screen_ids.includes(s.id);
const loopMax = () => state.settings.loop_max || 300;
function statusOf(m) {
  const t = today();
  if (!m.active) return ["Pausado", ""];
  if (m.starts_on && m.starts_on > t) return ["Agendado", "acc"];
  if (m.ends_on && m.ends_on < t) return ["Vencido", "err"];
  return ["No ar", "ok"];
}
function daysText(days) {
  if (!days || !days.length || days.length === 7) return "todos os dias";
  const k = [...days].sort((a, b) => a - b).join(",");
  if (k === "1,2,3,4,5") return "seg a sex";
  if (k === "1,2,3,4,5,6") return "seg a sáb";
  if (k === "0,6") return "fins de semana";
  return [...days].sort((a, b) => a - b).map(d => DAYS[d].toLowerCase()).join(", ");
}
const timeText = (f, t) => f && t ? `${f} às ${t}` : "o dia todo";
function estimateFor(s, ymd, extra, excludeId) {
  const ads = state.media.filter(m => m.active && m.id !== excludeId && targets(m, s)).map(adModel);
  if (extra) ads.push(extra);
  return A.estimateDay({ hours: hoursOf(s) }, excOf(s), ads, ymd, loopMax());
}
const clientById = id => state.clients.find(c => c.id === id);
const clientName = m => (m.client_id && clientById(m.client_id)?.name) || m.advertiser || "";

// formatos que as TVs abrem (o player informa); alguns TV Box não abrem JPEG
function tvFormats() {
  const f = addedScreens().map(s => (s.status || {}).fmt).filter(x => x && typeof x === "object");
  return { noJpeg: f.some(x => x.jpeg === false), webpOk: f.length > 0 && f.every(x => x.webp === true) };
}
let webpEnc = null;
function canWebp() {
  if (webpEnc === null) { try { const c = document.createElement("canvas"); c.width = c.height = 2; webpEnc = c.toDataURL("image/webp").startsWith("data:image/webp"); } catch (e) { webpEnc = false; } }
  return webpEnc;
}
function outType() { const f = tvFormats(); if (!f.noJpeg) return "image/jpeg"; return f.webpOk && canWebp() ? "image/webp" : "image/png"; }
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

// ---------------------------------------------------------------------------
// imagens leves para TV Box
// ---------------------------------------------------------------------------
const MAX_SIDE = 1920, HEAVY = 1.2 * 1048576;
// Conversor automático (conversor.js): qualquer foto, PDF ou vídeo vira um
// arquivo que as TVs abrem. Fotos: PNG/WEBP/JPEG conforme o que as TVs informam.
async function prepImage(file, info) {
  const f = tvFormats();
  return SPConv.image(file, { info, target: outType(), webpOk: f.webpOk && canWebp(), maxSide: MAX_SIDE, heavy: HEAVY });
}
// extensão que todas as TVs abrem
function tvSafeImage(path) {
  const e = ((path || "").match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase(), f = tvFormats();
  return e === "png" || (e === "webp" && f.webpOk) || ((e === "jpg" || e === "jpeg") && !f.noJpeg);
}
const isHeavy = m => m.kind === "image" && (!m.size_bytes || m.size_bytes > HEAVY);
const needsConvert = m => m.kind === "image" && !tvSafeImage(m.path);
async function optimizeExisting(m) {
  const r = await fetch(m.url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Não consegui baixar a imagem de "${m.title}".`);
  const blob = await r.blob();
  const p = await prepImage(new File([blob], m.path, { type: blob.type || "" }));
  if (!p.changed) { await sb.from("media").update({ size_bytes: blob.size }).eq("id", m.id); return false; }
  const newPath = `${uuid()}.${EXT[p.file.type] || "png"}`;
  const up = await sb.storage.from(BUCKET).upload(newPath, p.file, { cacheControl: "31536000", contentType: p.file.type, upsert: false });
  if (up.error) throw up.error;
  const url = sb.storage.from(BUCKET).getPublicUrl(newPath).data.publicUrl;
  const { error } = await sb.from("media").update({ path: newPath, url, size_bytes: p.file.size }).eq("id", m.id);
  if (error) { await sb.storage.from(BUCKET).remove([newPath]); throw error; }
  return true;   // o arquivo antigo fica guardado para permitir restaurar a versão anterior
}
const looksAuto = n => /^(img|dsc|pxl|mvimg|whatsapp|chatgpt|screenshot|captura|imagem|image|photo|foto|video|vid|wp|signal)[\s_-]/i.test(n) || /^\d[\d\s_.-]+$/.test(n);

async function loadStatsToday() {
  const t = today();
  const { data } = await sb.rpc("sf_report", { p_from: startOf(t).toISOString(), p_to: startOf(addDays(t, 1)).toISOString() });
  const st = {};
  (data || []).forEach(r => { const x = st[r.media_id] = st[r.media_id] || { plays: 0, last: null }; x.plays += Number(r.plays); if (!x.last || r.last_at > x.last) x.last = r.last_at; });
  state.stats = st;
}

// ---------------------------------------------------------------------------
// INÍCIO
// ---------------------------------------------------------------------------
PAGES.inicio = async function pageInicio() {
  loading();
  let daily = [];
  try {
    await need("screens", "media", "clients", "payments", "receipts", "exceptions", "sources", "version", "shots");
    const t = today();
    const { data, error } = await sb.rpc("sf_plays_daily", { p_from: startOf(addDays(t, -13)).toISOString(), p_to: startOf(addDays(t, 1)).toISOString() });
    if (error) throw error; daily = data || [];
  } catch (e) { pageError(e); return; }
  if (state.tab !== "inicio") return;
  const t = today(), main = $("#main");
  const scr = addedScreens();
  const states = scr.map(s => ({ s, st: screenState(s) }));
  const cnt = k => states.filter(x => x.st.k === k).length;
  const byDay = Object.fromEntries(daily.map(d => [d.day, d]));
  const playsToday = Number(byDay[t]?.plays || 0), playsYest = Number(byDay[addDays(t, -1)]?.plays || 0);
  const live = state.media.filter(m => statusOf(m)[0] === "No ar").length, sched = state.media.filter(m => statusOf(m)[0] === "Agendado").length;
  const month = t.slice(0, 7);
  const recMonth = state.receipts.filter(r => r.paid_on.slice(0, 7) === month).reduce((a, r) => a + Number(r.amount), 0);
  const overdue = state.payments.filter(p => !p.paid_at && p.due_date < t);
  const overdueSum = overdue.reduce((a, p) => a + saldo(p), 0);
  const ending = state.clients.filter(c => c.active && contractEnd(c) >= t && daysBetween(t, contractEnd(c)) <= 30);
  // alertas (offline só conta dentro do expediente)
  const al = [];
  states.filter(x => x.st.k === "offline").forEach(({ s }) => al.push(["err", `${screenLabel(s)} está offline no expediente`, `Último contato ${ago(s.last_seen)} (${fmtDT(s.last_seen)}). Confira se o TV Box está ligado e com internet.`, `#telas`]));
  scr.filter(s => isOnline(s) && !versionInfo(s).ok && (s.status || {}).v).forEach(s => al.push(["warn", `${screenLabel(s)} com player antigo`, versionInfo(s).txt + ". Ela atualiza sozinha; se demorar, use Recarregar.", "#telas"]));
  scr.filter(s => { const st = s.status || {}; return st.lastErrAt && Date.now() - new Date(st.lastErrAt) < 2 * 3600e3; }).forEach(s => al.push(["warn", `Erro de reprodução em ${screenLabel(s)}`, s.status.lastErr, "#telas"]));
  overdue.forEach(p => { const c = clientById(p.client_id); al.push(["err", `Parcela atrasada · ${c ? c.name : "cliente"}`, `${money(saldo(p))} venceu em ${fmtDate(p.due_date)} (${daysBetween(p.due_date, t)} dias).`, "#financeiro"]); });
  ending.forEach(c => al.push(["warn", `Contrato termina em ${daysBetween(t, contractEnd(c))} dias · ${c.name}`, `Fim em ${fmtDate(contractEnd(c))}. Boa hora para renovar.`, "#clientes"]));
  state.media.filter(m => m.active && m.ends_on && m.ends_on >= t && daysBetween(t, m.ends_on) <= 7).forEach(m => al.push(["", `Anúncio sai do ar em ${daysBetween(t, m.ends_on)} dia(s)`, `${m.title}${clientName(m) ? " · " + clientName(m) : ""} · termina ${fmtDate(m.ends_on)}`, "#anuncios"]));
  state.sources.filter(x => x.enabled && x.last_error && (!x.ok_at || Date.now() - new Date(x.ok_at) > 3600e3)).forEach(x => al.push(["", `Notícias: ${x.name} · ${x.section} sem atualizar`, `${x.last_error}. As TVs seguem com os outros portais.`, "#ajustes"]));
  const pending = state.screens.filter(s => !isAdded(s) && s.last_seen && Date.now() - new Date(s.last_seen) < 24 * 3600e3);
  if (pending.length) al.push(["acc", `${pending.length} TV(s) aguardando pareamento`, `Código: ${pending.map(codeOf).join(", ")}`, "#telas"]);

  const days14 = Array.from({ length: 14 }, (_, i) => addDays(t, i - 13));
  const max = Math.max(1, ...days14.map(d => Number(byDay[d]?.plays || 0)));
  main.innerHTML = `
    <div class="head"><div><h1>Olá! Aqui está a START PLAY agora</h1><div class="sub">${new Date().toLocaleDateString("pt-BR", { timeZone: tz(), weekday: "long", day: "numeric", month: "long" })} · ${P().hm} (${esc(tz().replace("America/", "").replace("_", " "))})</div></div>
      <div class="spacer"></div><button class="btn ghost" onclick="location.hash='anuncios/novo'">+ Novo anúncio</button><button class="btn" onclick="location.hash='clientes/novo'">+ Novo cliente</button></div>
    <div class="kpis">
      <div class="card kpi ${cnt("offline") ? "alert" : ""}"><div class="k">TVs</div><div class="v">${cnt("online") + cnt("espera")}<span class="sub"> online</span></div>
        <div class="d">${cnt("offline")} offline · ${cnt("fora") + cnt("espera")} fora do expediente</div></div>
      <div class="card kpi"><div class="k">Anúncios no ar</div><div class="v">${live}</div><div class="d">${sched} agendado(s) · ${state.media.length} no total</div></div>
      <div class="card kpi"><div class="k">Exibições hoje</div><div class="v">${nf(playsToday)}</div><div class="d">ontem: ${nf(playsYest)}</div></div>
      <div class="card kpi"><div class="k">Recebido no mês</div><div class="v">${money(recMonth)}</div><div class="d">${state.clients.filter(c => c.active).length} cliente(s) ativo(s)</div></div>
      <div class="card kpi ${overdue.length ? "alert" : ""}"><div class="k">Em atraso</div><div class="v ${overdue.length ? "err-txt" : ""}">${money(overdueSum)}</div><div class="d">${overdue.length} parcela(s)</div></div>
      <div class="card kpi ${ending.length ? "alert" : ""}"><div class="k">Contratos acabando</div><div class="v">${ending.length}</div><div class="d">nos próximos 30 dias</div></div>
    </div>
    <div class="grid2c">
      <div>
        <div class="card pad"><div class="head" style="margin-bottom:8px"><b>TVs agora</b><div class="spacer"></div><a href="#telas" class="small">Ver telas</a></div>
          ${states.length ? `<div class="list">${states.map(({ s, st }) => { const pr = progInfo(s), vi = versionInfo(s), sx = s.status || {};
            return `<div class="tvnow" data-id="${esc(s.id)}" style="padding:8px 0;border-bottom:1px solid var(--line);display:flex;gap:12px;align-items:flex-start">${shotThumb(s, true)}<div style="flex:1;min-width:0"><div style="display:flex;gap:8px;align-items:center"><b class="t1" style="flex:1">${esc(screenLabel(s))}</b><span class="chip ${st.cls}"><span class="dot"></span>${st.txt}</span></div>
              <div class="t2">Último contato ${ago(s.last_seen)}${sx.now && isOnline(s) ? ` · tocando <b>${esc(sx.now)}</b>` : ""}</div>
              <div class="meta"><span class="chip ${pr.cls}">${esc(pr.txt)}</span><span class="chip ${vi.ok ? "ok" : "warn"}">${esc(vi.txt)}</span>${sx.queue ? `<span class="chip acc">${sx.queue} registro(s) para enviar</span>` : ""}</div></div></div>`; }).join("")}</div>`
            : `<div class="empty">Nenhuma TV pareada ainda. <a href="#telas">Adicionar tela</a></div>`}
        </div>
        <div class="card pad" style="margin-top:16px"><b>Exibições por dia</b><div class="sub small">últimos 14 dias, todas as telas</div>
          <div class="bars" style="margin-bottom:20px">${days14.map(d => { const v = Number(byDay[d]?.plays || 0); return `<div class="b" title="${fmtDate(d)}: ${nf(v)} exibições" style="height:${Math.max(2, v / max * 100)}%"><span>${d.slice(8)}</span></div>`; }).join("")}</div>
        </div>
      </div>
      <div class="card"><div class="pad" style="border-bottom:1px solid var(--line)"><b>Precisa de atenção</b> <span class="sub small">(${al.length})</span></div>
        <div class="alerts">${al.length ? al.slice(0, 30).map(([c, h, d, href]) => `<a class="al" href="${href}" style="color:inherit;text-decoration:none"><span class="chip ${c}" style="margin-top:2px"><span class="dot"></span></span><div><b>${esc(h)}</b><div class="t2">${esc(d || "")}</div></div></a>`).join("")
          : `<div class="empty" style="padding:28px">Tudo certo por aqui.</div>`}</div></div>
    </div>`;
  main.querySelectorAll(".tvnow [data-a=shot]").forEach(b => b.addEventListener("click", () => { const s = state.screens.find(x => x.id === b.closest(".tvnow").dataset.id); if (s) shotModal(s); }));
  state.poll = setInterval(() => { if (state.tab === "inicio" && !$("#modal-root").innerHTML) PAGES.inicio(); }, 60000);
};

// ---------------------------------------------------------------------------
// TELAS
// ---------------------------------------------------------------------------
function siteHost() { return (location.origin + location.pathname.replace(/painel(\.html)?\/?$/, "")).replace(/^https?:\/\//, "").replace(/\/$/, ""); }

// miniatura do que a TV está mostrando (clicável)
function shotThumb(s, small) {
  const sh = (state.shots || {})[s.id];
  if (!sh) return `<button class="shot none ${small ? "sm" : ""}" data-a="shot" title="Ver a tela agora"><span>${isOnline(s) ? "Aguardando a 1ª imagem" : "Sem imagem"}</span></button>`;
  const old = Date.now() - new Date(sh.at) > 15 * 60e3;
  return `<button class="shot ${small ? "sm" : ""}" data-a="shot" title="Ver a tela agora · imagem de ${esc(fmtDT(sh.at))}"><img src="${esc(sh.img)}" alt="Tela ${esc(screenLabel(s))}"><span class="age ${old ? "old" : ""}">${old ? ago(sh.at) : "agora"}</span></button>`;
}
// janela "Tela agora": imagem grande, histórico e pedido de imagem nova
async function shotModal(s) {
  modal(`<h2>Tela agora · ${esc(screenLabel(s))}</h2><div id="shx"><div class="empty"><span class="spin dark"></span></div></div>
    <div class="modal-foot"><a class="btn ghost" id="shdl" download>Baixar imagem</a><div class="spacer"></div>
      ${isOnline(s) ? `<button class="btn ghost" id="shnew">${icon("reload")} Atualizar agora</button>` : ""}<button class="btn" data-close>Fechar</button></div>`, "mid");
  let hist = [], pick = null;
  const load = async () => {
    hist = await q("screen_shots", "id,at,img,what,w,h", r => r.eq("screen_id", s.id).order("at", { ascending: false }).limit(12)).catch(() => []);
    if (hist.length) { state.shots = state.shots || {}; state.shots[s.id] = Object.assign({ screen_id: s.id }, hist[0]); }
  };
  const draw = () => {
    const box = $("#shx"); if (!box) return;
    if (!hist.length) {
      box.innerHTML = `<div class="empty" style="padding:28px">${isOnline(s) ? "A TV ainda não mandou nenhuma imagem. Clique em <b>Atualizar agora</b>: ela manda em até 1 minuto." : `A TV está sem sinal desde ${esc(fmtDT(s.last_seen))}. Quando voltar, ela manda uma imagem nova.`}</div>`;
      $("#shdl").style.display = "none"; return;
    }
    const cur = pick || hist[0];
    box.innerHTML = `<div class="shotbig ${cur.h > cur.w ? "v" : ""}"><img src="${esc(cur.img)}" alt=""></div>
      <div class="sub" style="margin:8px 0 12px">Imagem de <b>${esc(fmtDT(cur.at))}</b> (${ago(cur.at)})${cur.what ? ` · passando: <b>${esc(cur.what)}</b>` : ""}${!isOnline(s) ? ` · <span class="warn-txt">TV sem sinal desde ${esc(fmtDT(s.last_seen))}</span>` : ""}</div>
      ${hist.length > 1 ? `<div class="small" style="font-weight:700;margin-bottom:6px">Últimas imagens</div><div class="shotstrip">${hist.map(h => `<button data-id="${h.id}" class="${h.id === cur.id ? "on" : ""}"><img src="${esc(h.img)}" alt=""><span>${esc(fmtDT(h.at).slice(-5))}</span></button>`).join("")}</div>` : ""}
      <div class="hint" style="margin-top:10px">A TV manda uma imagem a cada 5 minutos. Serve também como prova para o anunciante.</div>`;
    $("#shx .shotstrip")?.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; pick = hist.find(h => String(h.id) === b.dataset.id); draw(); });
    // baixar em JPG (abre em qualquer celular/computador)
    const im = new Image();
    im.onload = () => { const c = document.createElement("canvas"); c.width = im.width * 3; c.height = im.height * 3; const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(im, 0, 0, c.width, c.height);
      const a = $("#shdl"); if (!a) return; a.style.display = ""; a.href = c.toDataURL("image/jpeg", 0.9); a.download = `START PLAY - ${screenLabel(s)} - ${fmtDT(cur.at).replace(/[/:]/g, "-")}.jpg`; };
    im.src = cur.img;
  };
  await load(); draw();
  $("#shnew")?.addEventListener("click", async () => {
    const b = $("#shnew"), before = hist[0] ? hist[0].at : null;
    b.disabled = true; b.innerHTML = `<span class="spin dark"></span> Pedindo à TV…`;
    const { error } = await sb.from("screens").update({ command: "shot" }).eq("id", s.id);
    if (error) { toast(friendly(error), 4000); b.disabled = false; b.innerHTML = `${icon("reload")} Atualizar agora`; return; }
    for (let i = 0; i < 25 && $("#shx"); i++) {
      await new Promise(r => setTimeout(r, 4000));
      await load();
      if (hist[0] && hist[0].at !== before) { pick = null; draw(); toast("Imagem nova da TV."); break; }
    }
    if ($("#shnew")) { b.disabled = false; b.innerHTML = `${icon("reload")} Atualizar agora`; }
  });
}

function screenRow(s) {
  const st = screenState(s), sx = s.status || {}, added = isAdded(s), inf = s.info || {};
  const dev = [inf.model, inf.ip ? String(inf.ip).split(" ")[0] : ""].filter(Boolean).join(" · ");
  let lines = "";
  if (added) {
    const pr = progInfo(s), vi = versionInfo(s), h = hoursOf(s);
    lines = `<div class="t2">Último contato ${ago(s.last_seen)}${isOnline(s) && sx.now ? ` · tocando agora <b>${esc(sx.now)}</b>` : ""}</div>
      <div class="meta"><span class="chip ${st.cls}"><span class="dot"></span>${st.txt}</span><span class="chip ${pr.cls}">${esc(pr.txt)}</span><span class="chip ${vi.ok ? "ok" : "warn"}">${esc(vi.txt)}</span>
        <span class="chip">${esc(ORIENT[s.orientation] || "Horizontal")}</span>
        <span class="chip">${h.on ? `expediente ${h.open}–${h.close} · ${daysText(h.days)}` : "liga 24 h"}</span>
        ${(s.ticker || {}).enabled ? `<span class="chip acc">notícias</span>` : ""}${s.promo ? `<span class="chip acc">chamada comercial</span>` : ""}${(s.extras || {}).enabled ? `<span class="chip acc">clima · cotação · futebol</span>` : ""}
        ${sx.fmt && sx.fmt.jpeg === false ? `<span class="chip warn" title="O player converte as fotos sozinho">não abre JPEG</span>` : ""}</div>
      ${sx.lastErr && sx.lastErrAt && Date.now() - new Date(sx.lastErrAt) < 6 * 3600e3 ? `<div class="t2 warn-txt">Último erro ${ago(sx.lastErrAt)}: ${esc(sx.lastErr)}</div>` : ""}`;
  } else lines = `<div class="t2">Abriu o player ${ago(s.last_seen)}${dev ? " · " + esc(dev) : ""}. Se for uma TV sua, pareie com o código.</div>`;
  return `<div class="card row" data-id="${esc(s.id)}">
    ${added ? shotThumb(s) : ""}
    <div class="info"><div class="t1">${esc(screenLabel(s))}</div><div class="t2">${added ? "Código " + esc(codeOf(s)) + (dev ? " · " + esc(dev) : "") : ""}</div>${lines}</div>
    <div class="acts">${added ? `<button class="btn ghost sm" data-a="edit">${icon("gear")} Configurar</button>
      <button class="icon" data-a="hist" title="Histórico e erros" aria-label="Histórico">${icon("clock")}</button>
      ${isOnline(s) ? `<button class="icon" data-a="identify" title="Mostrar o nome na TV" aria-label="Identificar">${icon("eye")}</button>
      <button class="icon" data-a="reload" title="Recarregar a TV" aria-label="Recarregar">${icon("reload")}</button>` : ""}`
      : `<button class="btn sm" data-a="add">Parear</button>`}
      <button class="icon" data-a="del" title="Remover" aria-label="Remover">${icon("trash")}</button></div></div>`;
}

PAGES.telas = async function pageScreens(arg) {
  const main = $("#main");
  if (!main.querySelector("#slist")) loading();
  try { await need("screens", "exceptions", "sources", "version", "media", "shots"); } catch (e) { pageError(e); return; }
  if (state.tab !== "telas") return;
  const mine = addedScreens();
  const waiting = state.screens.filter(s => !isAdded(s) && s.last_seen && Date.now() - new Date(s.last_seen) < 24 * 3600e3);
  const units = {};
  mine.forEach(s => { const u = s.location || "Sem unidade"; (units[u] = units[u] || []).push(s); });
  const upcoming = state.exceptions.filter(e => e.day >= today()).slice(0, 3);
  main.innerHTML = `
    <div class="head"><div><h1>Telas</h1><div class="sub">${mine.length} tela(s) · ${mine.filter(isOnline).length} online agora</div></div>
      <div class="spacer"></div><button class="btn ghost" id="exc">${icon("clock")} Feriados e exceções</button><button class="btn" id="add-screen">+ Adicionar tela</button></div>
    ${upcoming.length ? `<div class="card pad" style="margin-bottom:12px"><span class="sub">Próximas exceções:</span> ${upcoming.map(e => `<span class="chip ${e.closed ? "" : "acc"}">${fmtDay(e.day)} · ${e.closed ? "fechado" : hm(e.open_at) + "–" + hm(e.close_at)}${e.screen_id ? " · " + esc(screenName(e.screen_id)) : ""}${e.note ? " · " + esc(e.note) : ""}</span>`).join(" ")}</div>` : ""}
    <div id="slist">
      ${waiting.length ? `<div class="unit-h">Aguardando pareamento</div><div class="sub" style="margin:-4px 0 8px">TVs que abriram o player e ainda não foram pareadas. Se não for sua, remova.</div><div class="list">${waiting.map(screenRow).join("")}</div>` : ""}
      ${mine.length ? Object.keys(units).sort().map(u => `<div class="unit-h">${esc(u)}</div><div class="list">${units[u].map(screenRow).join("")}</div>`).join("")
        : `<div class="card empty"><h3>Nenhuma TV pareada ainda</h3><div>Ligue o TV Box com o app START PLAY: a TV mostra um <b>código de pareamento</b>. Digite esse código aqui.</div>
            <button class="btn" id="add-screen2">+ Parear a primeira TV</button></div>`}
    </div>
    <div class="sub" style="margin-top:24px">Instalar ou atualizar o app na TV: no navegador do TV Box, abra <span class="pill">${esc(siteHost())}/startplay.apk</span></div>`;
  $("#add-screen").addEventListener("click", () => addScreenForm());
  $("#add-screen2")?.addEventListener("click", () => addScreenForm());
  $("#exc").addEventListener("click", () => exceptionsForm(null));
  $("#slist").addEventListener("click", e => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const s = state.screens.find(x => x.id === b.closest("[data-id]").dataset.id);
    const a = b.dataset.a;
    if (a === "edit") screenForm(s);
    else if (a === "shot") shotModal(s);
    else if (a === "hist") historyModal(s);
    else if (a === "add") addScreenForm(codeOf(s));
    else if (a === "identify" || a === "reload") {
      sb.from("screens").update({ command: a }).eq("id", s.id).then(({ error }) => {
        if (error) toast(friendly(error), 4000);
        else toast(a === "reload" ? `"${screenLabel(s)}" recarrega em até 1 minuto.` : `O nome aparece na TV "${screenLabel(s)}" em até 1 minuto.`, 4000);
      });
    } else confirmBox(`Remover "${screenLabel(s)}"?`, "Se o aparelho ainda estiver com o player aberto, ele volta a aparecer em 'Aguardando pareamento'. O histórico de exibições desta tela é apagado.", "Remover", async () => {
      const { error } = await sb.from("screens").delete().eq("id", s.id); if (error) throw error;
      toast("Tela removida"); PAGES.telas();
    });
  });
  if (arg) { const s = state.screens.find(x => x.id === arg); if (s) screenForm(s); }
  state.poll = setInterval(() => { if (state.tab === "telas" && !$("#modal-root").innerHTML) PAGES.telas(); }, 30000);
};

function addScreenForm(prefill) {
  const host = siteHost();
  modal(`<h2>Parear nova TV</h2>
    <ol class="sub" style="margin:0 0 16px 18px;line-height:1.6">
      <li>Ligue o TV Box com o app <b>START PLAY</b> (se ainda não tem, abra <span class="pill">${esc(host)}/startplay.apk</span> no navegador do TV Box).</li>
      <li>A TV mostra <b>"Tela pronta"</b> com o <b>código de pareamento</b> de 6 letras. Cada TV tem o seu.</li>
      <li>Digite o código aqui e diga onde a tela fica.</li>
    </ol>
    <form id="f-add">
      <div class="field"><label for="code">Código de pareamento</label>
        <input class="in code-big" id="code" maxlength="8" required autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="KCYVSB" value="${esc(prefill || "")}"></div>
      <div class="grid2">
        <div class="field"><label for="sl">Unidade</label><input class="in" id="sl" maxlength="120" placeholder="Ex.: Loja Centro" list="units">
          <datalist id="units">${[...new Set(addedScreens().map(s => s.location).filter(Boolean))].map(u => `<option value="${esc(u)}">`).join("")}</datalist></div>
        <div class="field"><label for="sn">Local na unidade</label><input class="in" id="sn" maxlength="80" required placeholder="Ex.: Recepção"></div>
      </div>
      <div id="f-err"></div>
      <div class="modal-foot"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn" type="submit" id="add-ok">Parear</button></div>
    </form>`);
  if (prefill) $("#sl").focus();
  const err = (t, ok) => { $("#f-err").innerHTML = t ? `<div class="${ok ? "info-box" : "err-box"}" style="margin:0 0 12px">${t}</div>` : ""; };
  $("#f-add").addEventListener("submit", async e => {
    e.preventDefault(); err("");
    const code = $("#code").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const name = $("#sn").value.trim(), loc = $("#sl").value.trim() || null;
    if (code.length !== 6) { err("O código de pareamento tem 6 letras/números. Ele aparece na TV, na tela \"Tela pronta\"."); return; }
    if (!name || name.toLowerCase() === NEW_NAME.toLowerCase()) { err("Diga onde a tela fica, por exemplo \"Recepção\"."); return; }
    const btn = $("#add-ok"); btn.disabled = true;
    for (let i = 0; i < 13; i++) {   // a TV fala com o servidor a cada minuto
      btn.innerHTML = `<span class="spin"></span> ${i ? "Esperando a TV…" : "Procurando…"}`;
      try {
        await need("screens");
        const found = state.screens.filter(s => codeOf(s) === code);
        if (found.length) {
          const s = found.sort((a, b) => new Date(b.last_seen || 0) - new Date(a.last_seen || 0))[0];
          if (isAdded(s)) { err(`Essa TV já está pareada como <b>${esc(screenLabel(s))}</b>.`); btn.disabled = false; btn.textContent = "Parear"; return; }
          const { error } = await sb.from("screens").update({ name, location: loc }).eq("id", s.id);
          if (error) throw error;
          closeModal(); toast(`TV "${loc ? loc + " · " : ""}${name}" pareada! O nome aparece nela em até 1 minuto.`, 4500); PAGES.telas();
          return;
        }
      } catch (ex) { err(esc(friendly(ex))); btn.disabled = false; btn.textContent = "Parear"; return; }
      if (!$("#f-add")) return;
      if (i === 0) err(`Ainda não achei a TV <b>${esc(code)}</b>. Deixe a TV ligada mostrando "Tela pronta". Vou continuar procurando por 1 minuto…`, true);
      await new Promise(r => setTimeout(r, 5000));
      if (!$("#f-add")) return;
    }
    err(`Não achei a TV <b>${esc(code)}</b>. Confira o código e se a TV está com internet e com o app START PLAY aberto.`);
    btn.disabled = false; btn.textContent = "Tentar de novo";
  });
}

// editor da tela com prévia ao vivo
const EXTRAS = [["clima", "Clima (agora e próximos dias)"], ["cotacao", "Cotação (dólar, euro…)"], ["futebol", "Futebol (jogos e classificação)"]];
function screenForm(s) {
  const h = hoursOf(s), tk = s.ticker || { enabled: false, sources: ["uol"], speed: 3 };
  const ex = Object.assign({ enabled: false, items: ["clima", "cotacao", "futebol"], every: 3, seconds: 10 }, s.extras || {});
  const sel = new Set(tk.sources || []);
  const defPromo = state.settings.promo_text || "Anuncie aqui com a START PLAY • WhatsApp (65) 99328-8233";
  const bySec = {};
  state.sources.forEach(x => { (bySec[x.section] = bySec[x.section] || []).push(x); });
  const secs = EDITORIAS.filter(e => bySec[e]).concat(Object.keys(bySec).filter(e => !EDITORIAS.includes(e)));
  modal(`<h2>${esc(screenLabel(s))} <span class="sub">· código ${esc(codeOf(s))}</span></h2>
    <div class="cols"><form id="f-scr">
      <div class="box"><h3>Identificação</h3><div class="grid2">
        <div class="field"><label for="sl">Unidade</label><input class="in" id="sl" maxlength="120" value="${esc(s.location || "")}" placeholder="Ex.: Loja Centro"></div>
        <div class="field"><label for="sn">Local na unidade</label><input class="in" id="sn" maxlength="80" required value="${esc(s.name)}" placeholder="Ex.: Recepção"></div></div>
        <div class="field" style="margin:0"><span class="lbl">Posição da TV</span><div class="seg" id="ori">${Object.entries(ORIENT).map(([k, v]) => `<button type="button" data-v="${k}" class="${(s.orientation || "landscape") === k ? "on" : ""}">${k === "landscape" ? "Horizontal" : k === "portrait" ? "Vertical ↻" : "Vertical ↺"}</button>`).join("")}</div>
          <div class="hint">Na TV em pé, se a imagem ficar de cabeça para baixo, escolha o outro sentido.</div></div></div>
      <div class="box"><h3>Expediente</h3>
        <label class="switch"><input type="checkbox" id="hon" ${h.on ? "checked" : ""}><span class="sl"></span>Ligar e desligar pelo horário</label>
        <div id="hbox" style="margin-top:12px">
          <div class="grid2"><div class="field"><label for="ho">Liga às</label><input class="in" type="time" id="ho" value="${h.open}"></div>
            <div class="field"><label for="hc">Desliga às</label><input class="in" type="time" id="hc" value="${h.close}"></div></div>
          <div class="field"><span class="lbl">Dias</span><div class="days" id="hd">${DAYS.map((d, i) => `<button type="button" data-d="${i}" class="${h.days.includes(i) ? "on" : ""}">${d}</button>`).join("")}</div>
            <div class="hint">Se o horário de desligar for antes do de ligar (ex.: 18:00 às 02:00), a tela fica ligada depois da meia-noite. Feriados e exceções: botão abaixo.</div></div>
        </div>
        <div class="info-box">${esc(powerTxt(s))}</div>
        <button type="button" class="btn ghost sm" id="exc-s" style="margin-top:10px">${icon("clock")} Feriados e exceções desta tela</button>
      </div>
      <div class="box"><h3>Rodapé · Notícias</h3>
        <label class="switch"><input type="checkbox" id="ton" ${tk.enabled ? "checked" : ""}><span class="sl"></span>Mostrar faixa de notícias</label>
        <div id="tbox" style="margin-top:12px">
          <div class="field"><span class="lbl">Editorias e portais</span>
            ${secs.map(sec => `<div style="margin-bottom:8px"><div class="small" style="font-weight:700;margin-bottom:4px">${esc(sec)}</div><div class="checks">${bySec[sec].map(x => {
              const okv = x.enabled; return `<label class="check ${sel.has(x.id) ? "on" : ""} ${okv ? "" : "off"}" title="${okv ? esc(x.note || x.url) : "Indisponível: não passou na validação"}"><input type="checkbox" value="${esc(x.id)}" ${sel.has(x.id) && okv ? "checked" : ""} ${okv ? "" : "disabled"} style="display:none">${esc(x.name)}${x.note ? ` <span class="small">(${esc(x.note)})</span>` : ""}</label>`; }).join("")}</div></div>`).join("")}
            <div class="hint">Cada item aparece como "UOL • Manchete". Se um portal sair do ar, a faixa segue com os outros.</div></div>
          <div class="field"><label for="tsp">Velocidade: <span id="tspv">${SPEED_TXT[(tk.speed || 3) - 1]}</span></label><input type="range" id="tsp" min="1" max="5" step="1" value="${tk.speed || 3}"></div>
        </div></div>
      <div class="box"><h3>Rodapé · Chamada comercial</h3>
        <label class="switch"><input type="checkbox" id="pon" ${s.promo ? "checked" : ""}><span class="sl"></span>Mostrar chamada comercial</label>
        <div class="field" style="margin:12px 0 0"><label for="ptx">Texto desta tela</label><input class="in" id="ptx" maxlength="140" value="${esc(s.promo_text || defPromo)}">
          <div class="hint">Com as notícias ligadas, as duas se revezam no mesmo rodapé (${state.settings.news_seconds || 40} s de notícias, ${state.settings.promo_seconds || 10} s de chamada). <a href="#" id="pdef">Usar o texto padrão</a></div></div></div>
      <div class="box"><h3>Entre os anúncios · Clima, cotação e futebol</h3>
        <label class="switch"><input type="checkbox" id="xon" ${ex.enabled ? "checked" : ""}><span class="sl"></span>Mostrar cartões entre os anúncios</label>
        <div id="xbox" style="margin-top:12px">
          <div class="checks" id="xit">${EXTRAS.map(([k, t]) => `<label class="check ${ex.items.includes(k) ? "on" : ""}"><input type="checkbox" value="${k}" ${ex.items.includes(k) ? "checked" : ""} style="display:none">${esc(t)}</label>`).join("")}</div>
          <div class="grid2" style="margin-top:10px"><div class="field"><label for="xev">A cada quantos anúncios</label><input class="in" type="number" id="xev" min="1" max="20" value="${ex.every}"></div>
            <div class="field"><label for="xsec">Segundos na tela</label><input class="in" type="number" id="xsec" min="6" max="30" value="${ex.seconds}"></div></div>
          <div class="hint">Os cartões não contam como exibição de anúncio e só aparecem com dados atualizados. Cidade do clima, moedas e campeonatos ficam em <a href="#ajustes">Ajustes</a>.</div>
        </div></div>
      <label class="check" style="margin-bottom:12px"><input type="checkbox" id="all">Aplicar o rodapé (notícias e chamada) a todas as telas</label>
      <div id="f-err"></div>
      <div class="modal-foot"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn" type="submit" id="sv">Salvar</button></div>
    </form>
    <div class="sticky"><div class="lbl">Prévia ao vivo (o que a TV mostra)</div>
      <div class="tvwrap"><div class="tvbox" id="tvbox"><iframe id="pv" title="Prévia" src="index.html?preview=${encodeURIComponent(s.id)}"></iframe></div></div>
      <div class="sub small" style="margin-top:8px">A prévia usa os anúncios e as notícias reais desta tela e não conta exibição.</div>
      <div class="box" style="margin-top:12px"><h3>Situação</h3><div class="small">${esc(screenState(s).txt)} · último contato ${ago(s.last_seen)}<br>${esc(progInfo(s).txt)}<br>${esc(versionInfo(s).txt)}</div></div>
    </div></div>`, "wide");
  const ori = () => $("#ori .on").dataset.v;
  const days = () => $$("#hd .on").map(b => Number(b.dataset.d));
  const srcs = () => $$("#tbox input:checked").map(i => i.value);
  const extras = () => ({ enabled: $("#xon").checked, items: $$("#xit input:checked").map(i => i.value),
    every: Math.max(1, Math.min(20, parseInt($("#xev").value, 10) || 3)), seconds: Math.max(6, Math.min(30, parseInt($("#xsec").value, 10) || 10)) });
  const sync = () => {
    $("#hbox").style.display = $("#hon").checked ? "" : "none";
    $("#tbox").style.display = $("#ton").checked ? "" : "none";
    $("#xbox").style.display = $("#xon").checked ? "" : "none";
    $("#tspv").textContent = SPEED_TXT[$("#tsp").value - 1];
    const portrait = ori() !== "landscape", box = $("#tvbox"), fr = $("#pv");
    const W = portrait ? 720 : 1280, H = portrait ? 1280 : 720, scale = portrait ? 420 / H : Math.min(400, box.parentElement.clientWidth - 20) / W;
    fr.style.width = W + "px"; fr.style.height = H + "px"; fr.style.transform = `scale(${scale})`;
    box.style.width = Math.round(W * scale) + "px"; box.style.height = Math.round(H * scale) + "px";
    const ov = { orientation: ori(), hours: { on: $("#hon").checked, open: $("#ho").value, close: $("#hc").value, days: days() },
      ticker: { enabled: $("#ton").checked, sources: srcs(), speed: Number($("#tsp").value) }, promo: $("#pon").checked, promo_text: $("#ptx").value.trim() || defPromo,
      extras: extras() };
    const news = state.sources.filter(x => x.enabled && ov.ticker.sources.includes(x.id)).map(x => ({ id: x.id, name: x.name }));
    try { fr.contentWindow.postMessage({ type: "sp-preview", screen: ov, news }, location.origin); } catch (e) {}
  };
  window.onmessage = e => { if (e.origin === location.origin && e.data && e.data.type === "sp-ready") sync(); };
  $("#ori").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; $$("#ori button").forEach(x => x.classList.toggle("on", x === b)); sync(); });
  $("#hd").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; b.classList.toggle("on"); sync(); });
  $("#tbox").addEventListener("change", e => { const l = e.target.closest("label"); if (l) l.classList.toggle("on", e.target.checked); sync(); });
  $("#xit").addEventListener("change", e => { const l = e.target.closest("label"); if (l) l.classList.toggle("on", e.target.checked); sync(); });
  $("#f-scr").addEventListener("input", sync);
  $("#pdef").addEventListener("click", e => { e.preventDefault(); $("#ptx").value = defPromo; sync(); });
  $("#exc-s").addEventListener("click", () => exceptionsForm(s));
  $("#pv").addEventListener("load", () => setTimeout(sync, 300));
  sync();
  $("#f-scr").addEventListener("submit", async e => {
    e.preventDefault();
    const err = t => { $("#f-err").innerHTML = t ? `<div class="err-box">${esc(t)}</div>` : ""; };
    const name = $("#sn").value.trim();
    if (!name || name === NEW_NAME) { err("Diga onde a tela fica (ex.: Recepção)."); return; }
    if ($("#hon").checked && $("#ho").value === $("#hc").value) { err("Os horários de ligar e desligar precisam ser diferentes."); return; }
    if ($("#hon").checked && !days().length) { err("Escolha pelo menos um dia de expediente."); return; }
    if ($("#ton").checked && !srcs().length) { err("Escolha pelo menos um portal de notícias (ou desligue a faixa)."); return; }
    if ($("#xon").checked && !extras().items.length) { err("Escolha clima, cotação ou futebol (ou desligue os cartões)."); return; }
    const pt = $("#ptx").value.trim();
    if ($("#pon").checked && pt.length < 3) { err("Escreva o texto da chamada comercial."); return; }
    const foot = { ticker: { enabled: $("#ton").checked, sources: srcs().length ? srcs() : (tk.sources || ["uol"]), speed: Number($("#tsp").value) },
      promo: $("#pon").checked, promo_text: !pt || pt === defPromo ? null : pt };
    const row = { name, location: $("#sl").value.trim() || null, orientation: ori(), hours_on: $("#hon").checked,
      open_at: $("#ho").value || "08:00", close_at: $("#hc").value || "22:00", open_days: days().length ? days() : [0, 1, 2, 3, 4, 5, 6], ...foot,
      extras: extras() };
    $("#sv").disabled = true;
    try {
      const { error } = await sb.from("screens").update(row).eq("id", s.id); if (error) throw error;
      if ($("#all").checked) {
        const others = addedScreens().filter(x => x.id !== s.id).map(x => x.id);
        if (others.length) { const { error: e2 } = await sb.from("screens").update(foot).in("id", others); if (e2) throw e2; }
      }
      window.onmessage = null;
      closeModal(); toast("Tela salva. A TV muda em até 1 minuto."); PAGES.telas();
    } catch (ex) { err(friendly(ex)); $("#sv").disabled = false; }
  });
}

// histórico de conexão e erros de reprodução
async function historyModal(s) {
  modal(`<h2>Histórico · ${esc(screenLabel(s))}</h2><div id="hx"><div class="empty"><span class="spin dark"></span></div></div>
    <div class="modal-foot"><button class="btn ghost" data-close>Fechar</button></div>`, "mid");
  const t = today();
  const [ev, fails] = await Promise.all([
    q("screen_events", "*", r => r.eq("screen_id", s.id).order("at", { ascending: false }).limit(80)),
    sb.rpc("sf_play_log", { p_from: startOf(addDays(t, -6)).toISOString(), p_to: startOf(addDays(t, 1)).toISOString(), p_screen: s.id, p_limit: 3000 }).then(r => (r.data || []).filter(x => x.status !== "ok"))
  ]).catch(e => { $("#hx").innerHTML = `<div class="err-box">${esc(friendly(e))}</div>`; return [null, null]; });
  if (!ev) return;
  const sx = s.status || {}, inf = s.info || {};
  const kind = { back: ["ok", "Voltou a se conectar"], boot: ["", "Player reiniciou"], version: ["acc", "Versão do player"], error: ["err", "Erro"], program: ["acc", "Programação aplicada"], alert: ["warn", "Aviso de TV fora do ar"] };
  $("#hx").innerHTML = `
    <div class="grid2">
      <div class="box"><h3>Agora</h3><div class="small">${esc(screenState(s).txt)} · último contato ${fmtDT(s.last_seen)}<br>${esc(progInfo(s).txt)}<br>${esc(versionInfo(s).txt)}<br>
        Ligado há ${fmtSecs(sx.up || 0)} · ${nf(sx.ok || 0)} exibição(ões) desde que ligou<br>${sx.queue ? `<b>${sx.queue} registro(s) aguardando internet</b><br>` : ""}${esc(powerTxt(s))}</div></div>
      <div class="box"><h3>Aparelho</h3><div class="small">${esc(inf.model || "TV Box")}${inf.android ? " · Android " + esc(inf.android) : ""}${inf.ip ? "<br>IP " + esc(String(inf.ip).split(" ")[0]) : ""}<br>
        Tela ${sx.vw || "?"}×${sx.vh || "?"}${sx.memMB ? ` · memória ${sx.memMB} MB` : ""}<br>
        Formatos: ${sx.fmt ? Object.entries(sx.fmt).map(([k, v]) => `${k.toUpperCase()} ${v ? "✓" : "✗"}`).join(" · ") : "aguardando o player 3"}${sx.cache ? "<br>Guarda os arquivos para tocar sem internet" : ""}</div></div>
    </div>
    <h3 style="font-size:14px;margin:8px 0">Conexão e eventos</h3>
    <div class="timeline card pad" style="max-height:280px;overflow:auto">${ev.length ? ev.map(x => {
      const [c, l] = kind[x.kind] || ["", x.kind];
      const extra = x.kind === "back" && x.since ? `ficou ${fmtSecs((new Date(x.at) - new Date(x.since)) / 1000)} sem contato (desde ${fmtDT(x.since)})` : (x.detail || "");
      return `<div class="ev"><span class="when">${fmtDT(x.at)}</span><span><span class="chip ${c}">${esc(l)}</span> ${esc(extra)}</span></div>`; }).join("")
      : `<div class="sub">Sem eventos registrados ainda.</div>`}</div>
    <h3 style="font-size:14px;margin:14px 0 8px">Falhas e interrupções de reprodução (7 dias)</h3>
    <div class="card tbl-wrap" style="max-height:240px;overflow:auto">${fails.length ? `<table><thead><tr><th>Quando</th><th>Anúncio</th><th>Resultado</th><th>Motivo</th></tr></thead><tbody>
      ${fails.slice(0, 150).map(f => `<tr><td class="num">${fmtDT(f.played_at)}</td><td>${esc(f.title)}</td><td><span class="chip ${f.status === "failed" ? "err" : "warn"}">${f.status === "failed" ? "falhou" : "interrompida"}</span></td><td class="small">${esc(f.detail || "")}</td></tr>`).join("")}</tbody></table>`
      : `<div class="empty" style="padding:20px">Nenhuma falha nos últimos 7 dias.</div>`}</div>`;
}

// feriados e exceções (todas as telas ou uma tela)
function brHolidays(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = `${year}-${two(month)}-${two(day)}`;
  return [[`${year}-01-01`, "Confraternização Universal"], [addDays(easter, -2), "Sexta-feira Santa"], [`${year}-04-08`, "Aniversário de Cuiabá"],
    [`${year}-04-21`, "Tiradentes"], [`${year}-05-01`, "Dia do Trabalho"], [addDays(easter, 60), "Corpus Christi"], [`${year}-09-07`, "Independência"],
    [`${year}-10-12`, "Nossa Senhora Aparecida"], [`${year}-11-02`, "Finados"], [`${year}-11-15`, "Proclamação da República"],
    [`${year}-11-20`, "Consciência Negra"], [`${year}-12-25`, "Natal"]];
}
async function exceptionsForm(scr) {
  await need("exceptions");
  const back = scr ? () => screenForm(state.screens.find(x => x.id === scr.id) || scr) : null;
  const render = () => {
    const list = state.exceptions.filter(e => e.day >= addDays(today(), -1) && (scr ? (!e.screen_id || e.screen_id === scr.id) : true));
    modal(`<h2>Feriados e exceções${scr ? " · " + esc(screenLabel(scr)) : ""}</h2>
      <p class="sub" style="margin-bottom:12px">Num dia de exceção vale o que estiver aqui no lugar do expediente normal. ${scr ? "Exceção desta tela vale mais que a de todas as telas." : ""}</p>
      <div class="card tbl-wrap" style="max-height:260px;overflow:auto;margin-bottom:14px">${list.length ? `<table><thead><tr><th>Dia</th><th>Vale para</th><th>Funcionamento</th><th>Motivo</th><th></th></tr></thead><tbody>
        ${list.map(e => `<tr><td class="num">${DAYS[A.dowOf(e.day)]} ${fmtDate(e.day)}</td><td>${e.screen_id ? esc(screenName(e.screen_id)) : "Todas as telas"}</td>
          <td>${e.closed ? `<span class="chip">Fechado</span>` : `<span class="chip acc">${hm(e.open_at)}–${hm(e.close_at)}</span>`}</td><td>${esc(e.note || "")}</td>
          <td class="num">${!scr || e.screen_id ? `<button class="icon" data-del="${e.id}" title="Remover">${icon("trash")}</button>` : ""}</td></tr>`).join("")}</tbody></table>`
        : `<div class="empty" style="padding:20px">Nenhuma exceção cadastrada.</div>`}</div>
      <form id="f-ex" class="box"><h3>Adicionar</h3>
        <div class="grid3"><div class="field"><label for="ed">Dia</label><input class="in" type="date" id="ed" required min="${today()}"></div>
          <div class="field"><label for="et">Funcionamento</label><select class="in" id="et"><option value="closed">Fechado o dia todo</option><option value="hours">Horário especial</option></select></div>
          <div class="field"><label for="en">Motivo</label><input class="in" id="en" maxlength="80" placeholder="Ex.: Feriado"></div></div>
        <div class="grid2 hide" id="eh"><div class="field"><label for="eo">Liga às</label><input class="in" type="time" id="eo" value="08:00"></div><div class="field"><label for="ec">Desliga às</label><input class="in" type="time" id="ec" value="18:00"></div></div>
        ${scr ? "" : `<div class="field"><label for="es">Vale para</label><select class="in" id="es"><option value="">Todas as telas</option>${addedScreens().map(x => `<option value="${esc(x.id)}">${esc(screenLabel(x))}</option>`).join("")}</select></div>`}
        <div id="f-err"></div><button class="btn sm" type="submit">Adicionar exceção</button>
        ${scr ? "" : `<button class="btn ghost sm" type="button" id="hol">Adicionar feriados nacionais e de Cuiabá (${P().ymd.slice(0, 4)} e ${Number(P().ymd.slice(0, 4)) + 1})</button>`}</form>
      <div class="modal-foot"><button class="btn ghost" data-close id="ex-close">${back ? "Voltar à tela" : "Fechar"}</button></div>`, "mid");
    if (back) $("#ex-close").addEventListener("click", e => { e.preventDefault(); back(); });
    $("#et").addEventListener("change", () => $("#eh").classList.toggle("hide", $("#et").value !== "hours"));
    $$("[data-del]").forEach(b => b.addEventListener("click", async () => {
      const { error } = await sb.from("schedule_exceptions").delete().eq("id", b.dataset.del);
      if (error) toast(friendly(error), 4000); else { await need("exceptions"); render(); }
    }));
    $("#hol")?.addEventListener("click", async () => {
      const y = Number(P().ymd.slice(0, 4)), have = new Set(state.exceptions.filter(e => !e.screen_id).map(e => e.day));
      const rows = brHolidays(y).concat(brHolidays(y + 1)).filter(([d]) => d >= today() && !have.has(d)).map(([day, note]) => ({ day, note, closed: true }));
      if (!rows.length) { toast("Os feriados já estão cadastrados."); return; }
      const { error } = await sb.from("schedule_exceptions").insert(rows);
      if (error) toast(friendly(error), 4000); else { toast(`${rows.length} feriado(s) adicionado(s). Remova os que não valem para você.`, 4500); await need("exceptions"); render(); }
    });
    $("#f-ex").addEventListener("submit", async e => {
      e.preventDefault();
      const closed = $("#et").value === "closed";
      const row = { day: $("#ed").value, closed, open_at: closed ? null : $("#eo").value, close_at: closed ? null : $("#ec").value,
        note: $("#en").value.trim() || null, screen_id: scr ? scr.id : ($("#es").value || null) };
      if (!closed && row.open_at === row.close_at) { $("#f-err").innerHTML = `<div class="err-box">Os horários precisam ser diferentes.</div>`; return; }
      const { error } = await sb.from("schedule_exceptions").insert(row);
      if (error) { $("#f-err").innerHTML = `<div class="err-box">${esc(friendly(error))}</div>`; return; }
      await need("exceptions"); render();
    });
  };
  render();
}

// ---------------------------------------------------------------------------
// ANÚNCIOS
// ---------------------------------------------------------------------------
function tvLine(m) {
  if (statusOf(m)[0] !== "No ar") return "";
  const x = (state.stats || {})[m.id];
  const tg = addedScreens().filter(s => targets(m, s));
  if (x && x.plays) return `<div class="meta"><span class="chip ok">Na TV</span><span class="sub small">passou ${nf(x.plays)}x hoje · última ${ago(x.last)}</span></div>`;
  if (!tg.filter(isOnline).length) return `<div class="meta"><span class="chip">Nenhuma tela ligada</span><span class="sub small">${tg.length ? "as telas deste anúncio estão desligadas" : "pareie uma TV na aba Telas"}</span></div>`;
  const p = P();
  if (!A.itemOn(adModel(m), p)) return `<div class="meta"><span class="chip acc">Fora do horário agora</span><span class="sub small">passa ${daysText(m.days)}, ${timeText(hm(m.time_from), hm(m.time_to))}</span></div>`;
  return Date.now() - new Date(m.created_at).getTime() < 3 * 60 * 1000 ? `<div class="meta"><span class="chip acc">Indo para a TV</span><span class="sub small">aparece em até 1 minuto</span></div>`
    : `<div class="meta"><span class="chip warn">Ainda não passou hoje</span><span class="sub small">veja a aba Telas para saber o que a TV está fazendo</span></div>`;
}

// Anúncios organizados em pastas: uma pasta por TV, com a sequência que passa nela
function adRow(m, i, n, scrCtx) {
  const [st, cls] = statusOf(m);
  const period = m.starts_on || m.ends_on ? `${m.starts_on ? fmtDay(m.starts_on) : "hoje"} → ${m.ends_on ? fmtDay(m.ends_on) : "sem fim"}` : "sem data de fim";
  const where = m.screen_ids && m.screen_ids.length ? m.screen_ids.map(screenName).join(", ") : "todas as telas";
  let here = "";
  if (scrCtx) {
    const sx = scrCtx.status || {};
    const nowOn = A.itemOn(adModel(m), P());
    const est = scrCtx._est ? scrCtx._est.perAd[m.id] : null;
    here = `<div class="meta">${isOnline(scrCtx) && sx.now === m.title ? `<span class="chip ok"><span class="dot"></span>Passando agora</span>` : ""}
      ${st === "No ar" ? (nowOn ? `<span class="chip ok">No horário agora</span>` : `<span class="chip acc">Fora do horário agora</span>`) : ""}
      ${est != null ? `<span class="sub small">≈ ${nf(est)} inserções hoje nesta TV</span>` : ""}</div>`;
  }
  return `<div class="card row" data-id="${m.id}">
    ${scrCtx ? `<div class="code-big" style="width:34px;text-align:center;color:var(--muted);letter-spacing:0">${i + 1}</div>` : ""}
    <div class="thumb">${m.kind === "video" ? `<video src="${esc(m.url)}#t=1" preload="metadata" muted playsinline></video>` : `<img src="${esc(m.url)}" alt="" loading="lazy">`}
      <span class="kind">${m.kind === "video" ? "VÍDEO" : "FOTO"} · ${m.duration_sec}s</span></div>
    <div class="info"><div class="t1">${esc(m.title)}</div>
      <div class="t2 one">${clientName(m) ? `<b>${esc(clientName(m))}</b> · ` : ""}${daysText(m.days)} · ${timeText(hm(m.time_from), hm(m.time_to))} · ${period}${scrCtx ? (m.screen_ids && m.screen_ids.length ? "" : " · em todas as telas") : " · " + esc(where)}</div>
      <div class="meta"><span class="chip ${cls}">${st}</span>${isHeavy(m) ? `<span class="chip warn">foto pesada</span>` : ""}${needsConvert(m) ? `<span class="chip warn">convertendo para a TV</span>` : ""}${m.target_daily ? `<span class="chip">meta ${nf(m.target_daily)}/dia por tela</span>` : ""}</div>
      ${here}<div class="tvslot">${scrCtx ? "" : tvLine(m)}</div></div>
    <div class="acts">
      <button class="icon" data-a="up" aria-label="Subir na sequência" title="Subir na sequência" ${i === 0 ? "disabled" : ""}>${icon("up")}</button>
      <button class="icon" data-a="down" aria-label="Descer na sequência" title="Descer na sequência" ${i === n - 1 ? "disabled" : ""}>${icon("down")}</button>
      <button class="icon" data-a="toggle" aria-label="${m.active ? "Pausar" : "Retomar"}" title="${m.active ? "Pausar" : "Retomar"}">${icon(m.active ? "pause" : "play")}</button>
      <button class="icon" data-a="edit" aria-label="Editar" title="Editar">${icon("edit")}</button>
      <button class="icon" data-a="del" aria-label="Apagar" title="Apagar">${icon("trash")}</button>
    </div></div>`;
}

function bindAdList(listEl, shown, reload) {
  listEl.addEventListener("click", async e => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const id = b.closest("[data-id]").dataset.id;
    const k = shown.findIndex(m => m.id === id), m = shown[k];
    try {
      if (b.dataset.a === "edit") return mediaForm(m);
      if (b.dataset.a === "del") return confirmBox(`Apagar "${m.title}"?`, "O anúncio sai das TVs. O comprovante das exibições que já aconteceram continua guardado no relatório.", "Apagar", async () => {
        const { error } = await sb.from("media").delete().eq("id", m.id); if (error) throw error;
        toast("Anúncio apagado"); reload();
      });
      if (b.dataset.a === "toggle") {
        const { error } = await sb.from("media").update({ active: !m.active }).eq("id", m.id); if (error) throw error;
        toast(m.active ? "Anúncio pausado" : "Anúncio de volta ao ar", 5000, { label: "Desfazer", fn: () => restoreVersion(m.id) }); return reload();
      }
      // troca de lugar com o vizinho desta sequência (a ordem vale para todas as TVs em que os dois passam)
      const o = shown[b.dataset.a === "up" ? k - 1 : k + 1];
      if (!o) return;
      const order = state.media.map(x => x.id), gi = order.indexOf(m.id), gj = order.indexOf(o.id);
      order[gi] = o.id; order[gj] = m.id;
      await Promise.all(order.map((oid, n) => sb.from("media").update({ position: (n + 1) * 10 }).eq("id", oid)));
      reload();
    } catch (ex) { toast(friendly(ex), 4000); }
  });
}

PAGES.anuncios = async function pageMedia(arg) {
  loading();
  try { await need("media", "screens", "clients", "exceptions", "settings"); await loadStatsToday(); } catch (e) { pageError(e); return; }
  if (state.tab !== "anuncios") return;
  const main = $("#main");
  // conversor automático: fotos que alguma TV não abre (ou pesadas demais) são
  // convertidas sozinhas assim que esta página abre; ninguém precisa clicar.
  state.convTried = state.convTried || new Set();
  const heavy = state.media.filter(m => (isHeavy(m) || needsConvert(m)) && !state.convTried.has(m.id));
  const banner = heavy.length ? `<div class="card banner" id="optb"><div><span class="spin dark"></span> <b id="optt">Convertendo ${heavy.length} foto(s) para o formato da TV…</b>
      <span class="sub">${tvFormats().noJpeg ? "Uma das TVs não abre JPEG: o painel converte sozinho." : "Fotos muito grandes podem travar a TV Box: o painel deixa mais leves."}</span></div></div>` : "";
  const bindOpt = () => {
    if (!heavy.length || state.convBusy) return;
    state.convBusy = true;
    (async () => {
      let n = 0, done = 0, fail = null;
      for (const m of heavy) {
        state.convTried.add(m.id);
        const el = $("#optt"); if (el) el.textContent = `Convertendo ${++n} de ${heavy.length} para o formato da TV…`;
        try { if (await optimizeExisting(m)) done++; } catch (ex) { fail = fail || ex; }
      }
      state.convBusy = false;
      if (done) toast(`${done} anúncio(s) convertido(s). As TVs pegam a versão nova em até 1 minuto.`, 5000);
      if (fail) toast(friendly(fail), 6000);
      const back = (location.hash || "").replace(/^#/, "");
      if (state.tab === "anuncios") PAGES.anuncios(back.split("/").slice(1).join("/") || undefined);
    })();
  };
  const t = today();

  // pasta de uma TV: a sequência que passa nela
  if (arg && arg.startsWith("tela/")) {
    const s = state.screens.find(x => x.id === arg.slice(5));
    if (!s) { location.hash = "anuncios"; return; }
    const seq = state.media.filter(m => targets(m, s));
    s._est = estimateFor(s, t);
    const onNow = seq.filter(m => statusOf(m)[0] === "No ar" && A.itemOn(adModel(m), P()));
    const loop = onNow.reduce((a, m) => a + m.duration_sec, 0), st = screenState(s);
    main.innerHTML = `
      <div class="sub" style="margin-bottom:6px"><a href="#anuncios">← Todas as pastas</a></div>
      <div class="head"><div><h1>${esc(screenLabel(s))}</h1><div class="sub">Sequência desta TV, na ordem em que passa. ${seq.length} anúncio(s) · ${onNow.length} no horário agora · ciclo de ${fmtSecs(loop)}</div></div>
        <div class="spacer"></div><span class="chip ${st.cls}"><span class="dot"></span>${st.txt}</span><button class="btn" id="new">+ Novo anúncio nesta TV</button></div>
      ${banner}
      ${(s.status || {}).now && isOnline(s) ? `<div class="card pad" style="margin-bottom:12px">Tocando agora: <b>${esc(s.status.now)}</b> · último contato ${ago(s.last_seen)}</div>` : ""}
      <div class="list" id="mlist">${seq.length ? seq.map((m, i) => adRow(m, i, seq.length, s)).join("") : `<div class="card empty"><h3>Nenhum anúncio nesta TV</h3><div>Crie um anúncio e marque esta tela.</div></div>`}</div>
      <div class="sub" style="margin-top:14px">Anúncios marcados para "todas as telas" aparecem em todas as pastas. Para tirar um anúncio desta TV, edite e desmarque a tela.</div>`;
    $("#new").addEventListener("click", () => mediaForm(null, { screens: [s.id] }));
    bindOpt();
    bindAdList($("#mlist"), seq, () => PAGES.anuncios(arg));
    return;
  }

  // lista completa (com filtro por cliente)
  if (arg === "todos" || arg === "novo") {
    const f = state.adFilter || (state.adFilter = { client: "" });
    const shown = state.media.filter(m => !f.client || m.client_id === f.client);
    main.innerHTML = `
      <div class="sub" style="margin-bottom:6px"><a href="#anuncios">← Todas as pastas</a></div>
      <div class="head"><div><h1>Todos os anúncios</h1><div class="sub">Ordem geral; cada TV passa só os que estão marcados para ela.</div></div>
        <div class="spacer"></div><select class="in" id="fc" style="width:auto"><option value="">Todos os clientes</option>${state.clients.map(c => `<option value="${c.id}" ${f.client === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
        <button class="btn" id="new">+ Novo anúncio</button></div>
      ${banner}<div class="list" id="mlist">${shown.length ? shown.map((m, i) => adRow(m, i, shown.length, null)).join("") : `<div class="card empty">Nenhum anúncio${f.client ? " desse cliente" : ""}.</div>`}</div>`;
    $("#new").addEventListener("click", () => mediaForm());
    $("#fc").addEventListener("change", e => { f.client = e.target.value; PAGES.anuncios("todos"); });
    bindOpt();
    bindAdList($("#mlist"), shown, () => PAGES.anuncios("todos"));
    if (arg === "novo") mediaForm();
    state.poll = setInterval(async () => {
      if (state.tab !== "anuncios" || $("#modal-root").innerHTML) return;
      try { await Promise.all([loadStatsToday(), need("screens")]); state.media.forEach(m => { const el = document.querySelector(`[data-id="${m.id}"] .tvslot`); if (el) el.innerHTML = tvLine(m); }); } catch (e) {}
    }, 60000);
    return;
  }

  // pastas
  const counts = { "No ar": 0, "Agendado": 0, "Vencido": 0, "Pausado": 0 };
  state.media.forEach(m => counts[statusOf(m)[0]]++);
  const scr = addedScreens(), units = {};
  scr.forEach(s => { const u = s.location || "Sem unidade"; (units[u] = units[u] || []).push(s); });
  const folder = s => {
    const seq = state.media.filter(m => targets(m, s)), live = seq.filter(m => statusOf(m)[0] === "No ar");
    const clients = [...new Set(seq.map(clientName).filter(Boolean))];
    const st = screenState(s), sx = s.status || {};
    return `<a class="card pad" href="#anuncios/tela/${encodeURIComponent(s.id)}" style="color:inherit;text-decoration:none;display:block">
      <div style="display:flex;gap:10px;align-items:center"><div style="font-size:26px;line-height:1">📁</div><div style="flex:1;min-width:0"><div class="t1">${esc(s.name)}</div><div class="t2">${esc(s.location || "Sem unidade")}</div></div><span class="chip ${st.cls}"><span class="dot"></span>${st.k === "online" ? "Online" : st.k === "offline" ? "Offline" : st.k === "novo" ? "Nova" : "Fora do expediente"}</span></div>
      <div class="meta"><span class="chip ok">${live.length} no ar</span><span class="chip">${seq.length} na sequência</span>${clients.length ? `<span class="chip acc">${clients.length} anunciante(s)</span>` : ""}</div>
      <div class="t2 one" style="margin-top:6px">${clients.length ? esc(clients.slice(0, 4).join(", ")) + (clients.length > 4 ? "…" : "") : "Sem anunciantes ainda"}</div>
      ${isOnline(s) && sx.now ? `<div class="t2 one">Tocando agora: <b>${esc(sx.now)}</b></div>` : ""}</a>`;
  };
  main.innerHTML = `
    <div class="head"><div><h1>Anúncios</h1><div class="sub">Uma pasta por TV, com a sequência que passa em cada uma.</div></div>
      <div class="spacer"></div><a class="btn ghost" href="#anuncios/todos">Lista completa</a><button class="btn ghost" id="art">${icon("edit")} Criar arte</button><button class="btn" id="new">+ Novo anúncio</button></div>
    ${state.media.length ? `<div class="chips"><span class="chip ok"><span class="dot"></span>${counts["No ar"]} no ar</span>
      ${counts["Agendado"] ? `<span class="chip acc">${counts["Agendado"]} agendado(s)</span>` : ""}${counts["Vencido"] ? `<span class="chip err">${counts["Vencido"]} vencido(s)</span>` : ""}${counts["Pausado"] ? `<span class="chip">${counts["Pausado"]} pausado(s)</span>` : ""}</div>` : ""}
    ${banner}
    ${scr.length ? Object.keys(units).sort().map(u => `<div class="unit-h">${esc(u)}</div><div class="kpis" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${units[u].map(folder).join("")}</div>`).join("")
      : `<div class="card empty"><h3>Nenhuma TV pareada ainda</h3><div>As pastas aparecem quando você parear as TVs na aba Telas.</div><a class="btn" href="#telas">Ir para Telas</a></div>`}`;
  $("#new").addEventListener("click", () => mediaForm());
  $("#art").addEventListener("click", () => openArtes(null, null, r => mediaForm(null, { file: r.file, design: r.design, assets: r.assets, title: r.title, client: r.design.client_id })));
  bindOpt();
};

// volta o anúncio para a última versão publicada
async function restoreVersion(id) {
  const { data, error } = await sb.from("media_versions").select("*").eq("media_id", id).order("saved_at", { ascending: false }).order("id", { ascending: false }).limit(1);
  if (error || !data || !data.length) { toast(error ? friendly(error) : "Não há versão anterior deste anúncio.", 4000); return false; }
  const v = data[0].data, keys = ["title", "advertiser", "client_id", "kind", "path", "url", "size_bytes", "duration_sec", "active", "starts_on", "ends_on", "screen_ids", "days", "time_from", "time_to", "target_daily"];
  const row = {}; keys.forEach(k => { if (k in v) row[k] = v[k]; });
  const { error: e2 } = await sb.from("media").update(row).eq("id", id);
  if (e2) { toast(friendly(e2), 4000); return false; }
  toast(`Versão de ${fmtDT(data[0].saved_at)} restaurada.`);
  if (state.tab === "anuncios") PAGES.anuncios((location.hash || "").split("/").slice(1).join("/") || undefined);
  return true;
}

// a prévia segue a mesma regra do player: arte de formato parecido com o da
// tela preenche tudo (corta uma faixa fina); muito diferente aparece inteira
// com o fundo preenchido pela própria arte.
window.spFit = el => {
  const a = el.parentElement, w = el.naturalWidth || el.videoWidth, h = el.naturalHeight || el.videoHeight;
  if (!a || !w || !h || !a.clientWidth || !a.clientHeight) return;
  const r = w / h, sc = a.clientWidth / a.clientHeight, fill = 1 - Math.min(r, sc) / Math.max(r, sc) <= 0.2;
  el.style.objectFit = fill ? "cover" : "contain";
  const bd = a.querySelector(".bd"); if (bd) bd.style.display = fill ? "none" : "";
};
function tvPreview(url, isVid, vertical, band) {
  return `<div class="tvprev ${vertical ? "v" : ""}"><div class="area${band ? " b" : ""}">${isVid ? "" : `<div class="bd" style="background-image:url('${esc(url)}')"></div>`}
    ${isVid ? `<video src="${esc(url)}#t=1" muted preload="metadata" playsinline onloadedmetadata="spFit(this)"></video>` : `<img src="${esc(url)}" alt="" onload="spFit(this)">`}</div><span class="lbl">COMO FICA NA TV · ${vertical ? "VERTICAL" : "HORIZONTAL"}</span>
    ${band ? `<div class="mock"><b>${band === "news" ? "NOTÍCIAS" : "START PLAY"}</b><span>${band === "news" ? `<em>UOL •</em> Manchete do dia rola aqui` : esc(state.settings.promo_text || "Anuncie aqui")}</span></div>` : ""}</div>`;
}
function videoDuration(file) {
  return new Promise(res => {
    const v = document.createElement("video"); v.preload = "metadata"; v.muted = true;
    v.onloadedmetadata = () => { const d = v.duration; URL.revokeObjectURL(v.src); res(isFinite(d) ? d : null); };
    v.onerror = () => res(null);
    v.src = URL.createObjectURL(file);
  });
}

function openArtes(design, clientId, done) {
  const clientDesign = id => {
    const ms = state.media.filter(x => x.client_id === id && x.design).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return ms[0] ? ms[0].design : null;
  };
  const d = Object.assign({}, design || {});
  if (!design && clientId) { const prev = clientDesign(clientId); if (prev) ["pal", "cor1", "cor2", "cor3", "cor4", "corTxt", "whatsapp", "instagram", "endereco", "logo_url"].forEach(k => { if (prev[k] != null) d[k] = prev[k]; }); d.client_id = clientId; }
  SPArtes.open({ design: Object.keys(d).length ? d : null, modal, closeModal, toast, clients: state.clients.filter(c => c.active !== false), clientDesign,
    company: (state.settings || {}).company, onDone: done });
}

function mediaForm(m, preset) {
  const edit = !!m;
  const sel = new Set(m?.screen_ids || (preset && preset.screens) || []);
  const scr = state.screens.filter(x => isAdded(x) || sel.has(x.id));
  const d0 = m?.days && m.days.length ? m.days : [0, 1, 2, 3, 4, 5, 6];
  const timed = !!(m?.time_from && m?.time_to);
  modal(`<h2>${edit ? "Editar anúncio" : "Novo anúncio"}</h2>
    <div id="step1"><div class="cols"><form id="f-media">
      <div class="field"><label>Arquivo</label>
        <input type="file" id="file" accept="image/*,video/*,application/pdf,.heic,.heif,.tif,.tiff,.mov,.mkv,.avi,.wmv,.flv,.mpg,.mpeg,.m4v,.3gp,.ts" class="hide">
        <div class="drop ${edit ? "has" : ""}" id="drop" tabindex="0" role="button">${edit
          ? `<div class="preview"><div class="thumb">${m.kind === "video" ? `<video src="${esc(m.url)}#t=1" muted preload="metadata"></video>` : `<img src="${esc(m.url)}" alt="">`}</div><div><strong>Arquivo atual</strong><div class="t2">Clique para trocar</div></div></div>`
          : `<strong>Escolher foto, vídeo ou PDF</strong><div>Qualquer formato (JPG, PNG, HEIC do iPhone, PDF, MOV, MP4, AVI…) · o painel converte para o formato da TV · ideal 1920×1080 (horizontal) ou 1080×1920 (vertical)</div>`}</div>
        <div class="hint" style="margin-top:6px">${edit && m.design ? `Arte feita no painel: <a href="#" id="mkart">editar a arte</a>.` : `Não tem a arte? <a href="#" id="mkart">Crie aqui com um modelo pronto</a> (foto, preço, logo e WhatsApp).`}</div></div>
      <div id="prep"></div>
      <div class="field"><label for="title">Título</label><input class="in" id="title" maxlength="120" required value="${esc(m?.title || "")}" placeholder="Ex.: Promoção de verão"></div>
      <div class="grid2">
        <div class="field"><label for="cli">Cliente</label><select class="in" id="cli"><option value="">Sem cliente (avulso)</option>${state.clients.filter(c => c.active || c.id === m?.client_id).map(c => `<option value="${c.id}" ${m?.client_id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
          <div class="hint"><a href="#" id="newcli">+ cadastrar cliente</a></div></div>
        <div class="field" id="dur-field"><label for="dur">Tempo na tela (segundos)</label><input class="in" id="dur" type="number" min="3" max="600" value="${m?.duration_sec || 10}">
          <div class="hint" id="dur-hint">${m?.kind === "video" ? "Para vídeo, vale a duração do próprio vídeo." : "Quanto tempo a foto fica na tela."}</div></div>
      </div>
      <div class="field ${m?.client_id ? "hide" : ""}" id="adv-f"><label for="adv">Anunciante <span class="sub">(se não tiver cliente cadastrado)</span></label><input class="in" id="adv" maxlength="120" value="${esc(m?.advertiser || "")}" placeholder="Ex.: Padaria Central"></div>
      <div class="grid2">
        <div class="field"><label for="d1">Começa em</label><input class="in" id="d1" type="date" value="${m?.starts_on || ""}"></div>
        <div class="field"><label for="d2">Termina em</label><input class="in" id="d2" type="date" value="${m?.ends_on || ""}"></div>
      </div>
      <div class="field"><span class="lbl">Dias da semana</span><div class="days" id="ad">${DAYS.map((d, i) => `<button type="button" data-d="${i}" class="${d0.includes(i) ? "on" : ""}">${d}</button>`).join("")}</div></div>
      <div class="field"><label class="switch"><input type="checkbox" id="tw" ${timed ? "checked" : ""}><span class="sl"></span>Só em um horário</label>
        <div class="grid2 ${timed ? "" : "hide"}" id="twb" style="margin-top:10px"><div class="field" style="margin:0"><label for="tf">Das</label><input class="in" type="time" id="tf" value="${hm(m?.time_from) || "08:00"}"></div>
          <div class="field" style="margin:0"><label for="tt">Até</label><input class="in" type="time" id="tt" value="${hm(m?.time_to) || "12:00"}"></div></div>
        <div class="hint">Fora desse horário o anúncio fica em espera. "22:00 até 02:00" passa da meia-noite.</div></div>
      <div class="field"><span class="lbl">Em quais telas</span>
        ${scr.length ? `<div class="checks" id="sc">${scr.map(s => `<label class="check ${sel.has(s.id) ? "on" : ""}"><input type="checkbox" value="${esc(s.id)}" ${sel.has(s.id) ? "checked" : ""}>${esc(screenLabel(s))}</label>`).join("")}</div>
        <div class="hint">Nenhuma marcada = passa em todas as telas.</div>` : `<div class="hint">Vai passar em todas as telas.</div>`}</div>
      <div class="field"><label for="tg">Inserções por dia desejadas, em cada tela <span class="sub">(opcional)</span></label><input class="in" id="tg" type="number" min="1" max="5000" value="${m?.target_daily || ""}" placeholder="Ex.: 120">
        <div class="hint">Serve para avisar se o horário escolhido não tem espaço suficiente.</div></div>
      <div id="f-err"></div>
    </form>
    <div class="sticky"><div class="box"><h3>Estimativa e ocupação</h3><div id="est" class="small"></div></div>
      ${edit ? `<button type="button" class="btn ghost sm" id="rv">${icon("undo")} Restaurar versão anterior</button>` : ""}</div></div>
    <div class="modal-foot"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn" type="button" id="next">Revisar e publicar</button></div></div>
    <div id="step2" class="hide"></div>`, "wide");
  let file = null, vidDur = null, prevUrl = m?.url || null, prevVid = m?.kind === "video", note = "";
  let design = preset && preset.design ? preset.design : null, designAssets = (preset && preset.assets) || {};
  const err = t => { $("#f-err").innerHTML = t ? `<div class="err-box">${esc(t)}</div>` : ""; };
  const days = () => $$("#ad .on").map(b => Number(b.dataset.d));
  const screensSel = () => $$("#sc input:checked").map(i => i.value);
  const draft = () => ({ id: "__novo", duration: Math.min(600, Math.max(3, parseInt($("#dur").value, 10) || 10)), days: days().length === 7 ? null : days(),
    from: $("#tw").checked ? $("#tf").value : null, to: $("#tw").checked ? $("#tt").value : null, starts_on: $("#d1").value || null, ends_on: $("#d2").value || null });
  function estimate() {
    const d = draft(), tg = parseInt($("#tg").value, 10) || null;
    const list = screensSel().length ? addedScreens().filter(s => screensSel().includes(s.id)) : addedScreens();
    if (!list.length) { $("#est").innerHTML = `<div class="sub">Pareie uma TV para ver a estimativa.</div>`; return []; }
    let start = d.starts_on && d.starts_on > today() ? d.starts_on : today(), ymd = start;
    for (let i = 0; i < 7; i++) { const y = addDays(start, i); if (!d.days || d.days.includes(A.dowOf(y))) { ymd = y; break; } }
    const rows = list.map(s => { const e = estimateFor(s, ymd, d, m?.id); return { s, ins: e.perAd["__novo"] || 0, occ: e.occupancy || 0, peak: e.peakLoop, open: e.openMinutes }; });
    const lm = loopMax(), total = rows.reduce((a, r) => a + r.ins, 0);
    $("#est").innerHTML = `<div class="sub" style="margin-bottom:8px">Para ${DAYS[A.dowOf(ymd)].toLowerCase()}, ${fmtDate(ymd)} · ciclo máximo ${lm}s (Ajustes)</div>` + rows.map(r => {
      const pct = Math.round(r.occ * 100), cls = r.occ > 1 ? "err" : r.occ > 0.85 ? "warn" : "";
      const warn = !r.open ? `<div class="warn-txt">A tela está fora do expediente nesse dia.</div>`
        : !r.ins ? `<div class="warn-txt">Não vai passar: o horário do anúncio não cruza o expediente da tela.</div>`
        : r.occ > 1 ? `<div class="err-txt">Horário lotado: o ciclo chega a ${r.peak}s (limite ${lm}s). Cada anúncio demora mais para voltar.</div>`
        : tg && r.ins < tg ? `<div class="warn-txt">Pedido ${nf(tg)}/dia, cabem ≈${nf(r.ins)}. Aumente o horário, reduza a duração ou escolha mais telas.</div>` : "";
      return `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><b>${esc(screenLabel(r.s))}</b><div>≈ <b>${nf(r.ins)}</b> inserções/dia · ocupação no pico ${pct}%</div>
        <div class="meter ${cls}"><i style="width:${Math.min(100, pct)}%"></i></div>${warn}</div>`;
    }).join("") + `<div style="margin-top:8px">Total: <b>≈ ${nf(total)}</b> inserções/dia somando as telas.</div>`;
    return rows;
  }
  const pick = () => $("#file").click();
  $("#drop").addEventListener("click", pick);
  $("#drop").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
  $("#drop").addEventListener("dragover", e => e.preventDefault());
  $("#drop").addEventListener("drop", e => { e.preventDefault(); if (e.dataTransfer.files[0]) choose(e.dataTransfer.files[0]); });
  $("#file").addEventListener("change", e => { if (e.target.files[0]) choose(e.target.files[0]); });
  $("#ad").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { b.classList.toggle("on"); estimate(); } });
  $("#tw").addEventListener("change", () => { $("#twb").classList.toggle("hide", !$("#tw").checked); estimate(); });
  $("#sc")?.addEventListener("change", e => { e.target.closest("label").classList.toggle("on", e.target.checked); estimate(); });
  $("#cli").addEventListener("change", () => {
    const c = clientById($("#cli").value);
    $("#adv-f").classList.toggle("hide", !!c);
    if (c && c.daily_insertions && !$("#tg").value) $("#tg").value = c.daily_insertions;
    if (c && !edit && c.ad_seconds && !file?.type?.startsWith("video/")) $("#dur").value = c.ad_seconds;
    estimate();
  });
  $("#newcli").addEventListener("click", e => { e.preventDefault(); closeModal(); location.hash = "clientes/novo"; });
  $("#f-media").addEventListener("input", () => estimate());
  $("#rv")?.addEventListener("click", async () => { if (await restoreVersion(m.id)) closeModal(); });
  const drop0 = $("#drop").innerHTML;
  let picks = 0;
  async function choose(f) {
    err("");
    const my = ++picks;
    file = null; vidDur = null; note = "";
    $("#prep").innerHTML = ""; $("#next").disabled = true;
    const stop = msg => { if (my !== picks) return; $("#drop").classList.toggle("has", edit); $("#drop").innerHTML = drop0; $("#next").disabled = false; err(msg); };
    let info = { kind: null };
    try { info = await SPConv.sniff(f); } catch (e) {}
    if (my !== picks) return;
    if (!info.kind) { stop(info.fmt === "audio" ? "Esse arquivo é só áudio. Envie uma foto, um vídeo ou um PDF." : "Não reconheci esse arquivo. Envie a arte do anúncio como foto, vídeo ou PDF."); return; }
    if (f.size > MAX_IN_MB * 1048576) { stop(`Esse arquivo tem ${fmtMB(f.size)}. O máximo é ${MAX_IN_MB} MB.`); return; }
    let animated = false;
    if (info.fmt === "gif") { try { animated = (await SPConv.gifInfo(f)).frames > 1; } catch (e) {} }
    const isVid = info.kind === "video" || animated;
    const show = (fr, t) => {
      if (my !== picks) return;
      const pct = fr == null ? null : Math.round(fr * 100);
      $("#drop").innerHTML = `<div class="preview"><span class="spin dark"></span><div style="flex:1;min-width:0"><strong>${esc(f.name)}</strong><div class="t2">${esc(t)}</div>${pct == null ? "" : `<div class="pbar"><i style="width:${pct}%"></i></div>`}</div></div>`;
    };
    try {
      if (!isVid) {
        show(null, info.fmt === "pdf" ? "Lendo o PDF…" : `Preparando para a TV (${info.name})…`);
        const p = await prepImage(f, info);
        if (my !== picks) return;
        f = p.file;
        if (p.changed) note = `<div class="ok-box">Preparada para a TV: ${esc(p.from)} ${p.w0}×${p.h0} → ${esc(p.to)} ${p.w}×${p.h} · ${fmtMB(p.before)} → ${fmtMB(f.size)}</div>`;
        (p.notes || []).forEach(n => { note += `<div class="info-box">${esc(n)}</div>`; });
        if (p.h > p.w) note += `<div class="info-box">Arte em pé: nas telas horizontais ela aparece inteira com o fundo preenchido pela própria arte; nas telas verticais ocupa a tela toda.</div>`;
      } else {
        show(0, animated ? "GIF animado: vou transformar em vídeo…" : "Analisando o vídeo…");
        const v = await SPConv.video(f, { info, maxMB: MAX_MB, onProgress: (fr, t) => show(fr, t) });
        if (my !== picks) return;
        f = v.file; vidDur = v.duration || null;
        if (v.changed) note = `<div class="ok-box">${v.remux ? "Ajustado" : "Convertido"} para a TV: ${esc(v.from)} → MP4 (H.264) · ${fmtMB(v.before)} → ${fmtMB(f.size)}</div>`;
        (v.notes || []).forEach(n => { note += `<div class="info-box">${esc(n)}</div>`; });
      }
    } catch (ex) { stop(friendly(ex)); return; }
    if (f.size > MAX_MB * 1048576) { stop(`Mesmo depois de converter, o arquivo ficou com ${fmtMB(f.size)}. O máximo é ${MAX_MB} MB.`); return; }
    file = f;
    prevUrl = URL.createObjectURL(f); prevVid = isVid;
    $("#drop").classList.add("has");
    $("#drop").innerHTML = `<div class="preview"><div class="thumb">${isVid ? `<video src="${prevUrl}" muted></video>` : `<img src="${prevUrl}" alt="">`}</div>
      <div><strong>${esc(f.name)}</strong><div class="t2">${isVid ? "Vídeo" : "Foto"} · ${fmtMB(f.size)} · clique para trocar</div></div></div>`;
    $("#prep").innerHTML = note;
    $("#next").disabled = false;
    const base = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    if (!$("#title").value && !looksAuto(base)) $("#title").value = base.slice(0, 120);
    if (isVid) {
      vidDur = vidDur || await videoDuration(f);
      if (vidDur && vidDur > 600) { err("Vídeo com mais de 10 minutos. Envie um vídeo mais curto."); file = null; return; }
      if (vidDur) $("#dur").value = Math.max(3, Math.ceil(vidDur - 0.25));   // 6,02 s conta como 6 s
      $("#dur").disabled = true; $("#dur-hint").textContent = "Para vídeo, vale a duração do próprio vídeo.";
    } else { $("#dur").disabled = false; $("#dur-hint").textContent = "Quanto tempo a foto fica na tela."; }
    estimate();
  }
  if (m?.kind === "video") $("#dur").disabled = true;
  // criador de artes: abre por cima e volta para este formulário com a arte pronta
  $("#mkart")?.addEventListener("click", e => {
    e.preventDefault();
    const keep = { screens: screensSel(), title: $("#title").value.trim(), client: $("#cli").value };
    openArtes(design || (m && m.design) || null, keep.client, r => mediaForm(m, { screens: keep.screens.length ? keep.screens : (preset && preset.screens), file: r.file, design: r.design, assets: r.assets,
      title: keep.title || r.title, client: keep.client || r.design.client_id }));
  });
  if (preset && preset.client && $("#cli")) { $("#cli").value = preset.client; $("#cli").dispatchEvent(new Event("change")); }
  if (preset && preset.title) $("#title").value = preset.title;
  if (preset && preset.file) choose(preset.file);
  estimate();

  // passo 2: revisar antes de publicar
  $("#next").addEventListener("click", () => {
    err("");
    if (!edit && !file) { err("Escolha uma foto ou vídeo."); return; }
    const title = $("#title").value.trim();
    if (!title) { err("Dê um título ao anúncio."); return; }
    const d1 = $("#d1").value || null, d2 = $("#d2").value || null;
    if (d1 && d2 && d2 < d1) { err("A data de término é antes do início."); return; }
    if (!days().length) { err("Escolha pelo menos um dia da semana."); return; }
    if ($("#tw").checked && $("#tf").value === $("#tt").value) { err("Os horários de início e fim precisam ser diferentes."); return; }
    const rows = estimate();
    const list = screensSel().length ? addedScreens().filter(s => screensSel().includes(s.id)) : addedScreens();
    const anyV = list.some(s => s.orientation && s.orientation !== "landscape"), anyH = !list.length || list.some(s => !s.orientation || s.orientation === "landscape");
    const band = list.some(s => (s.ticker || {}).enabled) ? "news" : list.some(s => s.promo) ? "promo" : null;
    const c = clientById($("#cli").value);
    const d = draft();
    $("#step1").classList.add("hide");
    $("#step2").classList.remove("hide");
    $("#step2").innerHTML = `<div class="cols"><div>
      <div class="box"><h3>Resumo</h3><table><tbody>
        <tr><td class="sub">Anúncio</td><td><b>${esc(title)}</b>${c ? " · " + esc(c.name) : $("#adv").value.trim() ? " · " + esc($("#adv").value.trim()) : ""}</td></tr>
        <tr><td class="sub">Arquivo</td><td>${file ? `${file.type.startsWith("video/") ? "Vídeo" : "Foto"} ${esc(EXT[file.type] ? EXT[file.type].toUpperCase() : file.type)} · ${fmtMB(file.size)}` : "o atual (sem troca)"} · ${d.duration}s na tela</td></tr>
        <tr><td class="sub">Vigência</td><td>${d1 ? fmtDate(d1) : "a partir de hoje"} → ${d2 ? fmtDate(d2) : "sem data de fim"}</td></tr>
        <tr><td class="sub">Dias</td><td>${daysText(d.days)}</td></tr>
        <tr><td class="sub">Horário</td><td>${timeText(d.from, d.to)}</td></tr>
        <tr><td class="sub">Telas afetadas</td><td>${(list.length ? list : []).map(s => `${esc(screenLabel(s))} <span class="sub">(${(ORIENT[s.orientation] || "Horizontal").split(" (")[0]})</span>`).join("<br>") || "todas as telas"}</td></tr>
        <tr><td class="sub">Estimativa</td><td>${rows.map(r => `${esc(screenLabel(r.s))}: ≈${nf(r.ins)}/dia · pico ${Math.round(r.occ * 100)}%`).join("<br>") || "—"}</td></tr>
      </tbody></table>
      ${rows.some(r => r.occ > 1) ? `<div class="warn-box">Atenção: alguma tela fica lotada no horário. Dá para publicar mesmo assim.</div>` : ""}</div></div>
      <div><div class="lbl">Prévia</div>${anyH && anyV ? `<div class="seg" id="po"><button type="button" class="on" data-v="h">Horizontal</button><button type="button" data-v="v">Vertical</button></div>` : ""}
        <div id="pvbox">${prevUrl ? tvPreview(prevUrl, prevVid, !anyH && anyV, band) : ""}</div></div></div>
      <div class="modal-foot"><button type="button" class="btn ghost" id="back">Voltar e ajustar</button><button class="btn" type="button" id="save">${edit ? "Publicar alterações" : "Publicar"}</button></div>`;
    $("#po")?.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; $$("#po button").forEach(x => x.classList.toggle("on", x === b)); $("#pvbox").innerHTML = tvPreview(prevUrl, prevVid, b.dataset.v === "v", band); });
    $("#back").addEventListener("click", () => { $("#step2").classList.add("hide"); $("#step1").classList.remove("hide"); });
    $("#save").addEventListener("click", publish);
  });

  async function publish() {
    const btn = $("#save"); btn.disabled = true;
    const d = draft();
    const c = clientById($("#cli").value);
    const screens = screensSel();
    const row = { title: $("#title").value.trim(), client_id: c ? c.id : null, advertiser: c ? c.name : ($("#adv").value.trim() || null),
      duration_sec: d.duration, starts_on: d.starts_on, ends_on: d.ends_on, screen_ids: screens.length ? screens : null,
      days: d.days, time_from: d.from, time_to: d.to, target_daily: parseInt($("#tg").value, 10) || null };
    btn.innerHTML = `<span class="spin"></span> ${file ? "Enviando " + fmtMB(file.size) + "…" : "Salvando…"}`;
    let newPath = null;
    try {
      if (design && file) {
        const dz = Object.assign({}, design);
        for (const k of ["foto", "logo"]) {
          const b = designAssets[k]; if (!b) continue;
          const pth = `artes/${uuid()}.${b.type === "image/png" ? "png" : "webp"}`;
          const up = await sb.storage.from(BUCKET).upload(pth, b, { cacheControl: "31536000", contentType: b.type, upsert: false });
          if (up.error) throw up.error;
          dz[k + "_url"] = sb.storage.from(BUCKET).getPublicUrl(pth).data.publicUrl;
        }
        row.design = dz;
      } else if (file && !design) row.design = null;
      if (file) {
        const ext = EXT[file.type] || (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || file.type.split("/")[1]).toLowerCase();
        newPath = `${uuid()}.${ext}`;
        const up = await sb.storage.from(BUCKET).upload(newPath, file, { cacheControl: "31536000", contentType: file.type, upsert: false });
        if (up.error) throw up.error;
        row.path = newPath;
        row.url = sb.storage.from(BUCKET).getPublicUrl(newPath).data.publicUrl;
        row.kind = file.type.startsWith("video/") ? "video" : "image";
        row.size_bytes = file.size;
        if (row.kind === "video" && vidDur) row.duration_sec = Math.min(600, Math.max(3, Math.ceil(vidDur - 0.25)));
      }
      if (edit) {
        const { error } = await sb.from("media").update(row).eq("id", m.id); if (error) throw error;
      } else {
        row.position = (state.media.reduce((a, x) => Math.max(a, x.position), 0) || 0) + 10;
        const { error } = await sb.from("media").insert(row); if (error) throw error;
      }
      closeModal();
      if (edit) toast("Anúncio publicado. As TVs trocam em até 1 minuto.", 8000, { label: "Desfazer", fn: () => restoreVersion(m.id) });
      else toast("Anúncio publicado! Aparece nas TVs em até 1 minuto.");
      const back = (location.hash || "").replace(/^#/, "");
      if (back.startsWith("anuncios")) PAGES.anuncios(back.split("/").slice(1).join("/") || undefined); else location.hash = "anuncios";
    } catch (ex) {
      if (newPath) await sb.storage.from(BUCKET).remove([newPath]);
      btn.disabled = false; btn.textContent = edit ? "Publicar alterações" : "Publicar";
      toast(friendly(ex), 5000);
    }
  }
}

// ---------------------------------------------------------------------------
// janelas
// ---------------------------------------------------------------------------
function modal(html, size) {
  const root = $("#modal-root");
  root.innerHTML = `<div class="modal-bg"><div class="modal ${size || ""}" role="dialog" aria-modal="true">${html}</div></div>`;
  root.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeModal));
  root.querySelector(".modal-bg").addEventListener("mousedown", e => { if (e.target.classList.contains("modal-bg")) closeModal(); });
  const f = root.querySelector("input:not([type=hidden]):not(.hide):not([type=checkbox]), select, button"); f && f.focus();
}
function closeModal() { $("#modal-root").innerHTML = ""; window.onmessage = null; }
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#modal-root").innerHTML) closeModal(); });
function confirmBox(title, text, label, fn) {
  modal(`<h2>${esc(title)}</h2><p class="sub" style="margin-bottom:12px">${esc(text)}</p><div id="f-err"></div>
    <div class="modal-foot"><button class="btn ghost" data-close>Cancelar</button><button class="btn danger" id="ok">${esc(label)}</button></div>`);
  $("#ok").addEventListener("click", async () => {
    $("#ok").disabled = true;
    try { await fn(); if ($("#ok")) closeModal(); } catch (ex) { $("#f-err").innerHTML = `<div class="err-box">${esc(friendly(ex))}</div>`; $("#ok").disabled = false; }
  });
}
