// @ts-nocheck
// =====================================================================
//  Start Play — coletor de notícias (Supabase Edge Function "noticias")
//
//  As TVs consultam só esta função. Ela busca os portais da lista fixa
//  (tabela news_sources), guarda a última coleta válida no banco e
//  compartilha esse cache entre todas as telas.
//
//  GET  ?fontes=uol,g1        manchetes para a TV (sem login)
//  GET  ?validar=uol|todas    valida um portal agora (só administrador)
// =====================================================================

const env = (k, d) => {
  const v = typeof Deno !== "undefined" ? Deno.env.get(k) : globalThis.process?.env?.[k];
  return v == null || v === "" ? d : v;
};
const SUPA = () => String(env("SUPABASE_URL", "")).replace(/\/$/, "");
const SERVICE = () => env("SUPABASE_SERVICE_ROLE_KEY", "");
const ANON = () => env("SUPABASE_ANON_KEY", "");
const FETCH_TIMEOUT = () => Number(env("NEWS_FETCH_TIMEOUT_MS", 6000));  // por portal
const WAIT_BUDGET = () => Number(env("NEWS_WAIT_MS", 7000));            // espera máxima da TV
const MAX_AGE_MS = 24 * 3600 * 1000;   // última coleta válida vale por até 24 h
const MAX_BYTES = 4 * 1024 * 1024;
const PER_SOURCE_STORE = 30;
const PER_SOURCE_OUT = 15;
const MAX_OUT = 80;
const UA = "Mozilla/5.0 (compatible; StartPlayNews/1.0; +https://startmidias.github.io/startplay/)";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Max-Age": "86400",
};

// ---------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------
const NAMED = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  lsquo: "‘", rsquo: "’", sbquo: "‚", ldquo: "“", rdquo: "”", bdquo: "„", laquo: "«", raquo: "»",
  bull: "•", middot: "·", ordf: "ª", ordm: "º", deg: "°", euro: "€", copy: "©", reg: "®", trade: "™",
  iexcl: "¡", iquest: "¿", szlig: "ß", aelig: "æ", AElig: "Æ", oslash: "ø", Oslash: "Ø", aring: "å", Aring: "Å",
  sup1: "¹", sup2: "²", sup3: "³", frac12: "½", frac14: "¼", frac34: "¾", times: "×", divide: "÷", shy: "",
  zwj: "", zwnj: "", lrm: "", rlm: "", thinsp: " ", ensp: " ", emsp: " ", prime: "′", Prime: "″",
};
const MARKS = { acute: "\u0301", grave: "\u0300", circ: "\u0302", tilde: "\u0303", uml: "\u0308", cedil: "\u0327" };
const CP1252 = { 128: "€", 130: "‚", 132: "„", 133: "…", 139: "‹", 145: "‘", 146: "’", 147: "“", 148: "”", 149: "•", 150: "–", 151: "—", 153: "™", 155: "›" };

function entity(whole, body) {
  if (body[0] === "#") {
    const n = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    if (!isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return " ";
    if (n >= 128 && n <= 159) return CP1252[n] || " ";
    return String.fromCodePoint(n);
  }
  if (Object.prototype.hasOwnProperty.call(NAMED, body)) return NAMED[body];
  const m = body.match(/^([A-Za-z])(acute|grave|circ|tilde|uml|cedil)$/);
  if (m) return (m[1] + MARKS[m[2]]).normalize("NFC");
  return whole;
}
const decodeEntities = s => s.replace(/&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,8});/g, entity);
const unCdata = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");

// título como texto simples: sem HTML, sem entidades, sem caracteres de controle
export function cleanText(raw, max = 220) {
  let s = unCdata(String(raw || ""));
  s = s.replace(/<[^>]*>/g, " ");
  s = decodeEntities(s);
  if (/&(#\d+|#x[0-9a-f]+|[a-z]{2,8});/i.test(s)) s = decodeEntities(s);   // entidade codificada duas vezes
  s = s.replace(/<[^>]*>/g, " ");
  s = s.replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\u2060\ufeff]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > max) s = s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
  return s;
}

// título para a TV: texto simples, sem emoji (a TV Box pode não ter a fonte) e sem hashtags no fim
export function cleanTitle(raw) {
  let s = cleanText(raw, 400);
  s = s.replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0E}\u{FE0F}\u{20E3}]/gu, " ");
  s = s.replace(/(\s+#[\p{L}\p{N}_]+)+\s*$/u, "");
  s = s.replace(/\s+/g, " ").replace(/\s*[|\-–—:]\s*$/, "").trim();
  if (s.length > 220) s = s.slice(0, 219).replace(/\s+\S*$/, "") + "…";
  return s;
}

// chave para achar manchetes repetidas
export function normTitle(t) {
  return String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// ---------------------------------------------------------------------
// Datas (inclui o formato em português do UOL: "Ter, 10 Nov 2026 14:32:00 -0300")
// ---------------------------------------------------------------------
const MONTHS = { jan: 0, fev: 1, feb: 1, mar: 2, abr: 3, apr: 3, mai: 4, may: 4, jun: 5, jul: 6,
  ago: 7, aug: 7, set: 8, sep: 8, out: 9, oct: 9, nov: 10, dez: 11, dec: 11 };
const ZONES = { z: 0, ut: 0, utc: 0, gmt: 0, brt: -180, brst: -120, amt: -240, est: -300, edt: -240,
  cst: -360, cdt: -300, mst: -420, mdt: -360, pst: -480, pdt: -420 };
const DEFAULT_OFFSET = -180;  // sem fuso informado: horário de Brasília

function zoneOffset(z) {
  if (!z) return DEFAULT_OFFSET;
  z = z.toLowerCase();
  if (z in ZONES) return ZONES[z];
  const m = z.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!m) return DEFAULT_OFFSET;
  const v = parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
  return m[1] === "-" ? -v : v;
}
function build(y, mo, d, h, mi, s, z, now) {
  y = +y; mo = +mo; d = +d; h = +(h || 0); mi = +(mi || 0); s = +(s || 0);
  if (!(y >= 2000 && y <= 2100) || !(mo >= 0 && mo <= 11) || !(d >= 1 && d <= 31) || h > 23 || mi > 59 || s > 60) return null;
  const check = new Date(Date.UTC(y, mo, d));
  if (check.getUTCDate() !== d || check.getUTCMonth() !== mo) return null;        // 31/02 etc.
  const ms = Date.UTC(y, mo, d, h, mi, Math.min(s, 59)) - zoneOffset(z) * 60000;
  if (ms > now + 2 * 86400000) return null;                                        // data no futuro: inválida
  return ms;
}

export function parseDate(raw, now = Date.now()) {
  if (!raw) return null;
  const s = cleanText(raw, 120);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
  if (m) return build(m[1], m[2] - 1, m[3], m[4], m[5], m[6], m[7] || (m[4] ? null : "z"), now);
  const n = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  m = n.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[^\d]+(\d{1,2})\s*[:h]\s*(\d{2})(?:\s*:\s*(\d{2}))?)?\s*([+-]\d{2}:?\d{2}|gmt|utc|z|brt|brst)?/);
  if (m) return build(m[3], m[2] - 1, m[1], m[4], m[5], m[6], m[7], now);
  m = n.match(/(\d{1,2})(?:\s+de)?[\s.\-\/]+([a-z]{3,})\.?(?:\s+de)?[\s.\-\/,]+(\d{4})(?:[^\d]+?(\d{1,2})\s*[:h]\s*(\d{2})(?:\s*:\s*(\d{2}))?)?\s*([+-]\d{2}:?\d{2}|gmt|utc|ut|z|brt|brst|amt|est|edt|cst|cdt|mst|mdt|pst|pdt)?\b/);
  if (m) {
    const mo = MONTHS[m[2].slice(0, 3)];
    if (mo != null) return build(m[3], mo, m[1], m[4], m[5], m[6], m[7], now);
  }
  const t = Date.parse(s);
  return isFinite(t) && t > Date.UTC(2000, 0, 1) && t <= now + 2 * 86400000 ? t : null;
}

// ---------------------------------------------------------------------
// Leitura do feed (RSS 0.91/2.0, RSS 1.0 e Atom)
// ---------------------------------------------------------------------
export function decodeBytes(bytes, contentType) {
  let cs = ((contentType || "").match(/charset\s*=\s*["']?([\w.:-]+)/i) || [])[1] || "";
  if (!cs) {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 300));
    cs = (head.match(/<\?xml[^>]*encoding\s*=\s*["']([\w.:-]+)["']/i) || [])[1] || "";
  }
  cs = (cs || "utf-8").toLowerCase();
  let text;
  try { text = new TextDecoder(cs).decode(bytes); } catch (_) { text = new TextDecoder("utf-8").decode(bytes); cs = "utf-8"; }
  // feed sem charset que na verdade é Latin-1
  if (cs === "utf-8" && (text.match(/\ufffd/g) || []).length > 3) {
    text = new TextDecoder("windows-1252").decode(bytes); cs = "windows-1252 (detectado)";
  }
  return { text: text.replace(/^\ufeff/, ""), charset: cs };
}

function tag(block, names) {
  for (const name of names) {
    const re = new RegExp("<" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\s[^>]*)?>([\\s\\S]*?)</" +
      name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*>", "i");
    const m = block.match(re);
    if (m && cleanText(m[1], 2000)) return m[1];
  }
  return "";
}
function unwrap(l) {
  const m = l.match(/^https?:\/\/[^\s]*?\*(https?:\/\/\S+)$/i);
  return m ? m[1] : l;
}
function linkOf(block) {
  const l = linkRaw(block);
  return l ? unwrap(l) : "";
}
function linkRaw(block) {
  let l = cleanText(tag(block, ["link", "feedburner:origLink"]), 2000);
  if (/^https?:\/\//i.test(l)) return l;
  const links = block.match(/<link\b[^>]*>/gi) || [];
  let best = "";
  for (const t of links) {
    const href = (t.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    const rel = ((t.match(/\brel\s*=\s*["']([^"']+)["']/i) || [])[1] || "alternate").toLowerCase();
    if (rel === "alternate") { best = href; break; }
    if (!best) best = href;
  }
  l = cleanText(best, 2000);
  if (/^https?:\/\//i.test(l)) return l;
  const g = cleanText(tag(block, ["guid", "id"]), 2000);
  return /^https?:\/\//i.test(g) ? g : "";
}

export function parseFeed(xml, opts = {}) {
  const now = opts.now || Date.now();
  let skip = null;
  if (opts.skip) { try { skip = new RegExp(opts.skip, "i"); } catch (_) { skip = null; } }
  const blocks = xml.match(/<item\b[^>]*>[\s\S]*?<\/item\s*>/gi) || xml.match(/<entry\b[^>]*>[\s\S]*?<\/entry\s*>/gi) || [];
  const kind = /<feed\b[^>]*xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom/i.test(xml) && !/<item\b/i.test(xml) ? "atom" : "rss";
  const raw = [];
  let skipped = 0;
  blocks.forEach((b, i) => {
    const t = cleanTitle(tag(b, ["title"]));
    if (!t || t.length < 4) return;
    const l = linkOf(b);
    if (skip && (skip.test(t) || (l && skip.test(l)))) { skipped++; return; }
    const rawDate = tag(b, ["pubDate", "dc:date", "published", "updated", "a10:updated", "date", "lastBuildDate"]);
    const ms = parseDate(rawDate, now);
    raw.push({ t, l, ms, o: i, rd: cleanText(rawDate, 80) });
  });
  return { kind, total: blocks.length, skipped, items: orderAndDedupe(raw) };
}

// tira repetidas (fica a primeira do feed) e põe as mais recentes primeiro;
// item sem data (ou com data inválida) fica na posição em que veio no feed
export function orderAndDedupe(items) {
  const seenT = new Set(), seenL = new Set(), uniq = [];
  for (const it of items) {
    const nt = normTitle(it.t), nl = it.l ? it.l.replace(/[?#].*$/, "").replace(/\/$/, "") : "";
    if (!nt || seenT.has(nt) || (nl && seenL.has(nl))) continue;
    seenT.add(nt); if (nl) seenL.add(nl);
    uniq.push(it);
  }
  uniq.forEach((it, i) => { it.o = i; });
  const dated = uniq.filter(i => i.ms != null).sort((a, b) => b.ms - a.ms || a.o - b.o);
  let k = 0;
  return uniq.map(it => it.ms != null ? dated[k++] : it);
}

const toStored = it => ({ t: it.t, l: it.l || null, d: it.ms != null ? new Date(it.ms).toISOString() : null });

async function download(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT());
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: "follow", headers: {
      "User-Agent": UA, "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5",
      "Accept-Language": "pt-BR,pt;q=0.9" } });
    const ct = r.headers.get("content-type") || "";
    if (!r.ok) { try { await r.body?.cancel(); } catch (_) {} throw Object.assign(new Error("HTTP " + r.status), { status: r.status, ct }); }
    const len = Number(r.headers.get("content-length") || 0);
    if (len > MAX_BYTES) throw Object.assign(new Error("feed grande demais"), { status: r.status, ct });
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length > MAX_BYTES) throw Object.assign(new Error("feed grande demais"), { status: r.status, ct });
    const dec = decodeBytes(bytes, ct);
    return { status: r.status, ct, bytes: bytes.length, ms: Date.now() - t0, ...dec };
  } catch (e) {
    if (e && e.name === "AbortError") throw Object.assign(new Error("sem resposta em " + Math.round(FETCH_TIMEOUT() / 1000) + " s"), { ms: Date.now() - t0 });
    throw e;
  } finally { clearTimeout(timer); }
}

// ---------------------------------------------------------------------
// Banco (com a chave de serviço; a TV nunca vê essa chave)
// ---------------------------------------------------------------------
async function rest(path, init = {}) {
  const r = await fetch(SUPA() + "/rest/v1/" + path, { ...init, headers: {
    apikey: SERVICE(), Authorization: "Bearer " + SERVICE(), "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!r.ok) throw new Error("banco " + r.status + ": " + (await r.text()).slice(0, 200));
  return r.status === 204 ? null : r.json();
}
const rpc = (fn, body) => rest("rpc/" + fn, { method: "POST", body: JSON.stringify(body) });
const COLS = "id,name,section,url,enabled,refresh_min,skip_pattern,items,ok_at,fetched_at,last_error,position";
const loadSources = ids => rest("news_sources?select=" + COLS + "&id=in.(" + ids.map(encodeURIComponent).join(",") + ")&order=position");

async function refresh(src) {
  const t0 = Date.now();
  try {
    const d = await download(src.url);
    const p = parseFeed(d.text, { skip: src.skip_pattern });
    if (!p.items.length) throw new Error(p.total ? "nenhuma manchete aproveitável" : "não parece um feed RSS");
    const items = p.items.slice(0, PER_SOURCE_STORE).map(toStored);
    await rpc("sf_news_store", { p_id: src.id, p_ok: true, p_items: items, p_error: null, p_ms: Date.now() - t0 });
    return { ok: true, items, ok_at: new Date().toISOString() };
  } catch (e) {
    const msg = String((e && e.message) || e).slice(0, 300);
    try { await rpc("sf_news_store", { p_id: src.id, p_ok: false, p_items: null, p_error: msg, p_ms: Date.now() - t0 }); } catch (_) {}
    return { ok: false, error: msg };
  }
}

const later = p => {
  const rt = globalThis.EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") rt.waitUntil(p);
  return p;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fresh = (s, now) => s.ok_at && now - Date.parse(s.ok_at) < MAX_AGE_MS && Array.isArray(s.items) && s.items.length > 0;

// junta os portais alternando entre eles e tira manchetes repetidas
export function merge(sources, now = Date.now()) {
  const lists = sources.filter(s => fresh(s, now)).map(s => ({ name: s.name, items: s.items.slice(0, PER_SOURCE_OUT) }));
  const out = [], seen = new Set();
  for (let i = 0; i < PER_SOURCE_OUT && out.length < MAX_OUT; i++) {
    for (const l of lists) {
      const it = l.items[i];
      if (!it || !it.t) continue;
      const k = normTitle(it.t);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push({ f: l.name, t: it.t, l: it.l || null, d: it.d || null });
      if (out.length >= MAX_OUT) break;
    }
  }
  return out;
}

export async function headlines(ids) {
  const now = Date.now();
  ids = [...new Set(ids.filter(id => /^[a-z0-9-]{2,30}$/.test(id)))].slice(0, 30);
  if (!ids.length) return { itens: [], fontes: {}, gerado: new Date(now).toISOString() };
  const rows = (await loadSources(ids)).filter(s => s.enabled);
  const stale = rows.filter(s => !s.fetched_at || now - Date.parse(s.fetched_at) > s.refresh_min * 60000);
  if (stale.length) {
    let claimed = [];
    try { claimed = await rpc("sf_news_claim", { p_ids: stale.map(s => s.id), p_force: false }) || []; } catch (_) {}
    const jobs = claimed.map(c => refresh(c).then(res => {
      const row = rows.find(r => r.id === c.id);
      if (row) {
        if (res.ok) { row.items = res.items; row.ok_at = res.ok_at; row.last_error = null; }
        else row.last_error = res.error;
        row.fetched_at = new Date().toISOString();
      }
      return res;
    }));
    later(Promise.allSettled(jobs));
    // só espera quem ainda não tem nada para mostrar; o resto atualiza em segundo plano
    const waiting = claimed.filter(c => !fresh(rows.find(r => r.id === c.id) || {}, now));
    if (waiting.length) await Promise.race([Promise.allSettled(jobs), sleep(WAIT_BUDGET())]);
  }
  const fontes = {};
  for (const s of rows) {
    fontes[s.id] = { nome: s.name, secao: s.section, ok: fresh(s, Date.now()), n: Array.isArray(s.items) ? s.items.length : 0,
      atualizado: s.ok_at || null, erro: s.last_error || null };
  }
  return { itens: merge(rows), fontes, gerado: new Date().toISOString() };
}

// valida um portal no ambiente do Start Play e guarda o resultado
export async function validate(src) {
  const r = { id: src.id, nome: src.name, secao: src.section, url: src.url, ok: false, quando: new Date().toISOString() };
  const t0 = Date.now();
  try {
    const d = await download(src.url);
    Object.assign(r, { http: d.status, tipo: d.ct, charset: d.charset, bytes: d.bytes, ms: d.ms });
    const p = parseFeed(d.text, { skip: src.skip_pattern });
    const withLink = p.items.filter(i => i.l).length, withDate = p.items.filter(i => i.ms != null).length;
    Object.assign(r, { formato: p.kind, itens_no_feed: p.total, ignorados: p.skipped, manchetes: p.items.length,
      com_link: withLink, com_data: withDate,
      amostra: p.items.slice(0, 6).map(i => ({ titulo: i.t, link: i.l, data_original: i.rd || null,
        data: i.ms != null ? new Date(i.ms).toISOString() : null })) });
    const problems = [];
    if (d.status !== 200) problems.push("HTTP " + d.status);
    if (p.items.length < 3) problems.push("poucas manchetes (" + p.items.length + ")");
    if (p.items.length && withLink / p.items.length < 0.8) problems.push("manchetes sem link");
    if (p.items.some(i => /<|&[a-z]+;|\ufffd/i.test(i.t))) problems.push("texto com sobras de HTML ou acentos quebrados");
    r.ok = problems.length === 0;
    r.problemas = problems;
    if (r.ok) await rpc("sf_news_store", { p_id: src.id, p_ok: true, p_items: p.items.slice(0, PER_SOURCE_STORE).map(toStored), p_error: null, p_ms: Date.now() - t0 });
  } catch (e) {
    r.ms = Date.now() - t0;
    r.problemas = [String((e && e.message) || e)];
  }
  try { await rpc("sf_news_validation", { p_id: src.id, p_result: r }); } catch (_) {}
  return r;
}

async function isAdmin(req) {
  const auth = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+\.\S+\.\S+$/i.test(auth)) return false;
  try {
    const r = await fetch(SUPA() + "/rest/v1/rpc/sf_is_admin", { method: "POST", body: "{}",
      headers: { apikey: ANON(), Authorization: auth, "Content-Type": "application/json" } });
    return r.ok && (await r.json()) === true;
  } catch (_) { return false; }
}

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", ...extra } });

export async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const u = new URL(req.url);
  try {
    const v = u.searchParams.get("validar");
    if (v) {
      if (!(await isAdmin(req))) return json({ erro: "Entre no painel como administrador." }, 401);
      const all = await rest("news_sources?select=" + COLS + "&order=position");
      const list = v === "todas" ? all : all.filter(s => s.id === v);
      if (!list.length) return json({ erro: "Fonte não encontrada." }, 404);
      const out = await Promise.all(list.map(validate));
      return json({ resultados: out });
    }
    const ids = (u.searchParams.get("fontes") || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const data = await headlines(ids);
    return json(data, 200, { "Cache-Control": "public, max-age=60" });
  } catch (e) {
    return json({ erro: String((e && e.message) || e).slice(0, 300), itens: [] }, 500);
  }
}

if (typeof Deno !== "undefined" && typeof Deno.serve === "function") Deno.serve(handler);
