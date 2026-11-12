"use strict";
/* START PLAY — painel (parte 2: Clientes, Relatório e PDF, Financeiro e Ajustes) */

const saldo = p => Math.max(0, Number(p.amount) - Number(p.paid_amount || 0));
const contractEnd = c => addDays(monthAdd(c.start_date, c.contract_months), -1);
const refTxt = ymd => new Date(ymd + "T12:00:00Z").toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" }).replace(".", "");
const digits = s => String(s || "").replace(/\D/g, "");
const waLink = (phone, text) => { let d = digits(phone); if (d && d.length <= 11) d = "55" + d; return d ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : null; };
function parseMoney(s) {
  s = String(s ?? "").trim().replace(/[^\d,.-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");   // "1.500" = mil e quinhentos
  const v = Number(s); return isFinite(v) ? Math.round(v * 100) / 100 : NaN;
}
const moneyIn = v => (Number(v) || 0).toFixed(2).replace(".", ",");
function payStatus(p) {
  const t = today(), paid = Number(p.paid_amount || 0);
  if (p.paid_at) return ["Pago", "ok"];
  if (p.due_date < t) return [paid > 0 ? "Atrasado (parcial)" : "Atrasado", "err"];
  if (paid > 0) return ["Pago em parte", "acc"];
  return ["Em aberto", ""];
}
function contractState(c) {
  if (!c.active) return ["Inativo", ""];
  const end = contractEnd(c), t = today();
  if (end < t) return ["Contrato encerrado", ""];
  if (c.start_date > t) return [`Começa ${fmtDay(c.start_date)}`, "acc"];
  const d = daysBetween(t, end);
  if (d <= 30) return [`Termina em ${d} dia${d === 1 ? "" : "s"}`, "warn"];
  return ["Contrato ativo", "ok"];
}
function clientFin(c) {
  const t = today(), ps = state.payments.filter(p => p.client_id === c.id);
  return {
    ps, total: ps.reduce((a, p) => a + Number(p.amount), 0),
    received: state.receipts.filter(r => r.client_id === c.id).reduce((a, r) => a + Number(r.amount), 0),
    open: ps.filter(p => !p.paid_at).reduce((a, p) => a + saldo(p), 0),
    overdue: ps.filter(p => !p.paid_at && p.due_date < t).reduce((a, p) => a + saldo(p), 0),
    next: ps.filter(p => !p.paid_at && p.due_date >= t).sort((a, b) => a.due_date.localeCompare(b.due_date))[0]
  };
}
const METHODS = ["PIX", "Dinheiro", "Cartão", "Boleto", "Transferência"];

// ---------------------------------------------------------------------------
// CLIENTES
// ---------------------------------------------------------------------------
PAGES.clientes = async function pageClients(arg) {
  loading();
  try { await need("clients", "payments", "receipts", "media", "screens"); } catch (e) { pageError(e); return; }
  if (state.tab !== "clientes") return;
  const main = $("#main"), qy = state.cq || "";
  const list = state.clients.filter(c => !qy || (c.name + " " + (c.contact || "")).toLowerCase().includes(qy.toLowerCase()));
  main.innerHTML = `
    <div class="head"><div><h1>Clientes</h1><div class="sub">${state.clients.filter(c => c.active).length} ativo(s) · contrato, plano, pagamentos e comprovante de cada um.</div></div>
      <div class="spacer"></div><input class="in" id="cq" placeholder="Buscar cliente" value="${esc(qy)}" style="width:200px"><button class="btn" id="new">+ Novo cliente</button></div>
    <div class="list" id="clist">${list.length ? list.map(c => {
      const f = clientFin(c), [cs, cc] = contractState(c), ads = state.media.filter(m => m.client_id === c.id);
      return `<div class="card row" data-id="${c.id}"><div class="info">
        <div class="t1">${esc(c.name)}</div>
        <div class="t2">${[c.contact, c.phone, c.email].filter(Boolean).map(esc).join(" · ") || "sem contato"}</div>
        <div class="t2">Plano: ${c.ads_qty} anúncio(s) de ${c.ad_seconds}s${c.daily_insertions ? ` · ${nf(c.daily_insertions)} inserções/dia por tela` : ""}${c.screens_qty ? ` · ${c.screens_qty} tela(s)` : ""} · <b>${money(c.monthly_value)}/mês</b>
          · contrato ${fmtDay(c.start_date)} → ${fmtDay(contractEnd(c))} (${c.contract_months} ${c.contract_months === 1 ? "mês" : "meses"}) · vence dia ${c.due_day}</div>
        <div class="meta"><span class="chip ${cc}">${cs}</span>${f.overdue ? `<span class="chip err">${money(f.overdue)} em atraso</span>` : f.open ? `<span class="chip">${money(f.open)} a receber</span>` : f.ps.length ? `<span class="chip ok">em dia</span>` : ""}
          <span class="chip ${ads.length > c.ads_qty ? "warn" : ""}">${ads.length} de ${c.ads_qty} anúncio(s)</span></div></div>
        <div class="acts"><button class="btn ghost sm" data-a="rep">${icon("doc")} Relatório e PDF</button>
          <button class="icon" data-a="fin" title="Financeiro do cliente">${icon("money")}</button>
          ${c.phone ? `<a class="icon" target="_blank" rel="noopener" href="${esc(waLink(c.phone, `Olá ${c.contact || c.name}! Aqui é da START PLAY.`))}" title="WhatsApp">${icon("wa")}</a>` : ""}
          <button class="icon" data-a="edit" title="Editar">${icon("edit")}</button><button class="icon" data-a="del" title="Apagar">${icon("trash")}</button></div></div>`;
    }).join("") : `<div class="card empty"><h3>${qy ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}</h3><div>Cadastre o cliente com o plano e o contrato: as parcelas são geradas sozinhas.</div><button class="btn" id="new2">+ Cadastrar cliente</button></div>`}</div>`;
  $("#new").addEventListener("click", () => clientForm());
  $("#new2")?.addEventListener("click", () => clientForm());
  $("#cq").addEventListener("change", e => { state.cq = e.target.value; PAGES.clientes(); });
  $("#clist").addEventListener("click", e => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const c = clientById(b.closest("[data-id]").dataset.id);
    if (b.dataset.a === "edit") clientForm(c);
    else if (b.dataset.a === "fin") statementModal(c);
    else if (b.dataset.a === "rep") { state.report.client = c.id; state.report.media = ""; location.hash = "relatorio"; }
    else if (b.dataset.a === "del") confirmBox(`Apagar "${c.name}"?`, "As parcelas e os recebimentos deste cliente também são apagados. Os anúncios continuam, sem cliente.", "Apagar", async () => {
      const { error } = await sb.from("clients").delete().eq("id", c.id); if (error) throw error;
      toast("Cliente apagado"); PAGES.clientes();
    });
  });
  if (arg === "novo") clientForm();
};

function clientForm(c) {
  const edit = !!c, t = today();
  modal(`<h2>${edit ? "Editar cliente" : "Novo cliente"}</h2><form id="f-cli">
    <div class="box"><h3>Dados</h3>
      <div class="field"><label for="cn">Nome ou empresa</label><input class="in" id="cn" required maxlength="120" value="${esc(c?.name || "")}" placeholder="Ex.: Padaria Central"></div>
      <div class="grid2"><div class="field"><label for="cc">Responsável</label><input class="in" id="cc" maxlength="80" value="${esc(c?.contact || "")}"></div>
        <div class="field"><label for="cp">WhatsApp</label><input class="in" id="cp" maxlength="30" inputmode="tel" value="${esc(c?.phone || "")}" placeholder="(65) 9 9999-9999"></div></div>
      <div class="grid2"><div class="field"><label for="ce">E-mail</label><input class="in" id="ce" type="email" maxlength="120" value="${esc(c?.email || "")}"></div>
        <div class="field"><label for="cd">CPF ou CNPJ</label><input class="in" id="cd" maxlength="20" value="${esc(c?.doc || "")}"></div></div>
      <div class="field"><label for="ca">Endereço</label><input class="in" id="ca" maxlength="160" value="${esc(c?.address || "")}"></div></div>
    <div class="box"><h3>Plano contratado</h3><div class="grid2">
      <div class="field"><label for="pq">Quantidade de anúncios</label><input class="in" id="pq" type="number" min="0" max="100" value="${c?.ads_qty ?? 1}"></div>
      <div class="field"><label for="ps">Tempo de cada anúncio (segundos)</label><input class="in" id="ps" type="number" min="3" max="600" value="${c?.ad_seconds ?? 15}"></div>
      <div class="field"><label for="pi">Inserções por dia, em cada tela</label><input class="in" id="pi" type="number" min="1" max="5000" value="${c?.daily_insertions ?? ""}" placeholder="Ex.: 120"><div class="hint">Volume contratado que aparece no relatório.</div></div>
      <div class="field"><label for="pt">Telas contratadas <span class="sub">(opcional)</span></label><input class="in" id="pt" type="number" min="1" max="1000" value="${c?.screens_qty ?? ""}" placeholder="todas as telas dos anúncios"></div></div></div>
    <div class="box"><h3>Contrato e pagamento</h3><div class="grid2">
      <div class="field"><label for="mv">Valor mensal (R$)</label><input class="in" id="mv" inputmode="decimal" value="${moneyIn(c?.monthly_value ?? 0)}"></div>
      <div class="field"><label for="pm">Forma de pagamento</label><select class="in" id="pm"><option value="">—</option>${METHODS.map(m => `<option ${c?.pay_method === m ? "selected" : ""}>${m}</option>`).join("")}</select></div>
      <div class="field"><label for="sd">Início do contrato</label><input class="in" id="sd" type="date" required value="${c?.start_date || t}"></div>
      <div class="field"><label for="cm">Meses de contrato</label><input class="in" id="cm" type="number" min="1" max="120" value="${c?.contract_months ?? 3}"></div>
      <div class="field"><label for="dd">Dia do vencimento</label><input class="in" id="dd" type="number" min="1" max="28" value="${c?.due_day ?? 10}"></div>
      <div class="field"><label class="switch" style="margin-top:28px"><input type="checkbox" id="act" ${c?.active === false ? "" : "checked"}><span class="sl"></span>Cliente ativo</label></div></div>
      <div class="info-box" id="sum"></div></div>
    <div class="field"><label for="no">Observações</label><textarea class="in" id="no" rows="2" maxlength="500">${esc(c?.notes || "")}</textarea></div>
    <div id="f-err"></div>
    <div class="modal-foot"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn" type="submit" id="sv">${edit ? "Salvar" : "Cadastrar e gerar parcelas"}</button></div></form>`, "mid");
  const sum = () => {
    const v = parseMoney($("#mv").value), n = parseInt($("#cm").value, 10) || 0, sd = $("#sd").value;
    if (!sd || !n) { $("#sum").textContent = ""; return; }
    const end = addDays(monthAdd(sd, n), -1);
    $("#sum").innerHTML = `Total do contrato <b>${money((v || 0) * n)}</b> · ${n} parcela(s) de ${money(v || 0)} · vai de ${fmtDate(sd)} até <b>${fmtDate(end)}</b>`;
  };
  $("#f-cli").addEventListener("input", sum); sum();
  $("#f-cli").addEventListener("submit", async e => {
    e.preventDefault();
    const err = t => { $("#f-err").innerHTML = t ? `<div class="err-box">${esc(t)}</div>` : ""; };
    const mv = parseMoney($("#mv").value);
    if (!(mv >= 0)) { err("Valor mensal inválido. Exemplo: 350,00"); return; }
    const num = (id, d) => { const v = parseInt($(id).value, 10); return isFinite(v) ? v : d; };
    const row = { name: $("#cn").value.trim(), contact: $("#cc").value.trim() || null, phone: $("#cp").value.trim() || null, email: $("#ce").value.trim() || null,
      doc: $("#cd").value.trim() || null, address: $("#ca").value.trim() || null, ads_qty: num("#pq", 1), ad_seconds: num("#ps", 15),
      daily_insertions: num("#pi", null), screens_qty: num("#pt", null), monthly_value: mv, start_date: $("#sd").value,
      contract_months: num("#cm", 1), due_day: Math.min(28, Math.max(1, num("#dd", 10))), pay_method: $("#pm").value || null,
      notes: $("#no").value.trim() || null, active: $("#act").checked };
    if (!row.name) { err("Digite o nome do cliente."); return; }
    $("#sv").disabled = true;
    try {
      let id = c?.id;
      const contractChanged = !edit || ["monthly_value", "start_date", "contract_months", "due_day", "active"].some(k => String(c[k]) !== String(row[k]));
      if (edit) { const { error } = await sb.from("clients").update(row).eq("id", id); if (error) throw error; }
      else {
        const { data, error } = await sb.from("clients").insert(row).select().single(); if (error) throw error; id = data.id;
        // anúncios antigos com o mesmo anunciante passam a ser deste cliente
        await sb.from("media").update({ client_id: id }).is("client_id", null).ilike("advertiser", row.name.replace(/[\\%_]/g, "\\$&"));
      }
      if (contractChanged) { const { error } = await sb.rpc("sf_client_schedule", { p_client: id }); if (error) throw error; }
      closeModal(); toast(edit ? "Cliente salvo." + (contractChanged ? " Parcelas em aberto atualizadas." : "") : "Cliente cadastrado e parcelas geradas.");
      if (state.tab === "clientes") PAGES.clientes(); else location.hash = "clientes";
    } catch (ex) { err(friendly(ex)); $("#sv").disabled = false; }
  });
}

// extrato do cliente: parcelas, recebimentos e saldo
async function statementModal(c) {
  await need("payments", "receipts");
  const f = clientFin(c), t = today();
  const recs = state.receipts.filter(r => r.client_id === c.id);
  modal(`<h2>Financeiro · ${esc(c.name)}</h2>
    <div class="kpis"><div class="card kpi"><div class="k">Contrato</div><div class="v">${money(f.total)}</div><div class="d">${f.ps.length} parcela(s)</div></div>
      <div class="card kpi"><div class="k">Recebido</div><div class="v ok-txt">${money(f.received)}</div><div class="d">${recs.length} pagamento(s)</div></div>
      <div class="card kpi"><div class="k">Saldo a receber</div><div class="v">${money(f.open)}</div><div class="d">${f.next ? "próxima " + fmtDate(f.next.due_date) : "nada a vencer"}</div></div>
      <div class="card kpi ${f.overdue ? "alert" : ""}"><div class="k">Em atraso</div><div class="v ${f.overdue ? "err-txt" : ""}">${money(f.overdue)}</div><div class="d">${contractState(c)[0]}</div></div></div>
    <h3 style="font-size:14px;margin-bottom:8px">Parcelas</h3>
    <div class="card tbl-wrap" style="margin-bottom:14px"><table><thead><tr><th>Referência</th><th>Vencimento</th><th class="num">Valor</th><th class="num">Pago</th><th class="num">Saldo</th><th>Situação</th><th></th></tr></thead><tbody>
      ${f.ps.map(p => { const [s, cls] = payStatus(p); return `<tr><td>${refTxt(p.ref_month)}</td><td class="num">${fmtDate(p.due_date)}</td><td class="num">${money(p.amount)}</td><td class="num">${money(p.paid_amount || 0)}</td><td class="num"><b>${money(saldo(p))}</b></td>
        <td><span class="chip ${cls}">${s}</span></td><td class="num">${p.paid_at ? "" : `<button class="btn ghost sm" data-rcv="${p.id}">Receber</button>`}</td></tr>`; }).join("") || `<tr><td colspan="7" class="sub">Sem parcelas. Edite o cliente para gerar.</td></tr>`}
    </tbody></table></div>
    <h3 style="font-size:14px;margin-bottom:8px">Histórico de pagamentos</h3>
    <div class="card tbl-wrap"><table><thead><tr><th>Data</th><th>Parcela</th><th class="num">Valor</th><th>Forma</th><th>Obs.</th><th></th></tr></thead><tbody>
      ${recs.map(r => { const p = state.payments.find(x => x.id === r.payment_id); return `<tr><td class="num">${fmtDate(r.paid_on)}</td><td>${p ? refTxt(p.ref_month) : "—"}</td><td class="num">${money(r.amount)}</td><td>${esc(r.method || "")}</td><td class="small">${esc(r.note || "")}</td>
        <td class="num"><button class="icon" data-undo="${r.id}" title="Estornar">${icon("undo")}</button></td></tr>`; }).join("") || `<tr><td colspan="6" class="sub">Nenhum pagamento registrado.</td></tr>`}
    </tbody></table></div>
    <div class="modal-foot">${c.phone && f.open ? `<a class="btn ghost" target="_blank" rel="noopener" href="${esc(waLink(c.phone, chargeText(c, f.ps.filter(p => !p.paid_at && p.due_date <= addDays(t, 10)))))}">${icon("wa")} Cobrar no WhatsApp</a>` : ""}
      <button class="btn ghost" data-close>Fechar</button></div>`, "mid");
  $$("[data-rcv]").forEach(b => b.addEventListener("click", () => receiveForm(state.payments.find(p => p.id === b.dataset.rcv), () => statementModal(c))));
  $$("[data-undo]").forEach(b => b.addEventListener("click", async () => {
    const { error } = await sb.from("receipts").delete().eq("id", b.dataset.undo);
    if (error) toast(friendly(error), 4000); else { toast("Pagamento estornado."); statementModal(c); }
  }));
}
function chargeText(c, ps) {
  const st = state.settings, list = ps.length ? ps : state.payments.filter(p => p.client_id === c.id && !p.paid_at).slice(0, 1);
  const lines = list.map(p => `${refTxt(p.ref_month)}: ${money(saldo(p))} (vence ${fmtDate(p.due_date)})`).join("; ");
  return `Olá ${c.contact || c.name}! Tudo bem? Aqui é da ${st.company || "START PLAY"}. Passando para lembrar da mensalidade da mídia indoor: ${lines}.${st.pix ? ` Chave PIX: ${st.pix}.` : ""} Qualquer dúvida estou à disposição. Obrigado!`;
}
function receiveForm(p, after) {
  const c = clientById(p.client_id), sd = saldo(p);
  modal(`<h2>Registrar pagamento</h2><p class="sub" style="margin-bottom:12px">${esc(c ? c.name : "")} · ${refTxt(p.ref_month)} · valor ${money(p.amount)} · já pago ${money(p.paid_amount || 0)}</p>
    <form id="f-rcv"><div class="grid2"><div class="field"><label for="rv">Valor recebido (R$)</label><input class="in" id="rv" inputmode="decimal" value="${moneyIn(sd)}"><div class="hint">Pode ser parcial: o saldo continua em aberto.</div></div>
      <div class="field"><label for="rd">Data</label><input class="in" id="rd" type="date" value="${today()}"></div></div>
      <div class="grid2"><div class="field"><label for="rm">Forma</label><select class="in" id="rm">${METHODS.map(m => `<option ${c?.pay_method === m ? "selected" : ""}>${m}</option>`).join("")}</select></div>
        <div class="field"><label for="ro">Observação</label><input class="in" id="ro" maxlength="200"></div></div>
      <div id="f-err"></div><div class="modal-foot"><button type="button" class="btn ghost" id="cx">Cancelar</button><button class="btn" type="submit" id="sv">Registrar</button></div></form>`);
  $("#cx").addEventListener("click", () => after ? after() : closeModal());
  $("#f-rcv").addEventListener("submit", async e => {
    e.preventDefault();
    const v = parseMoney($("#rv").value);
    const err = t => { $("#f-err").innerHTML = `<div class="err-box">${esc(t)}</div>`; };
    if (!(v > 0)) { err("Digite um valor maior que zero."); return; }
    if (v > sd + 0.001) { err(`O valor passa do saldo desta parcela (${money(sd)}).`); return; }
    $("#sv").disabled = true;
    const { error } = await sb.from("receipts").insert({ payment_id: p.id, client_id: p.client_id, paid_on: $("#rd").value || today(), amount: v, method: $("#rm").value, note: $("#ro").value.trim() || null });
    if (error) { err(friendly(error)); $("#sv").disabled = false; return; }
    await need("payments", "receipts");
    toast(v + 0.001 >= sd ? "Parcela quitada." : `Pagamento parcial registrado. Falta ${money(sd - v)}.`);
    if (after) after(); else { closeModal(); if (state.tab === "financeiro") PAGES.financeiro(); }
  });
}

// ---------------------------------------------------------------------------
// RELATÓRIO
// ---------------------------------------------------------------------------
function reportRange(r) {
  const t = today(), [y, m] = t.split("-").map(Number);
  switch (r.period) {
    case "hoje": return [t, t];
    case "ontem": return [addDays(t, -1), addDays(t, -1)];
    case "7": return [addDays(t, -6), t];
    case "mes": return [`${y}-${two(m)}-01`, t];
    case "mespassado": { const a = monthAdd(`${y}-${two(m)}-01`, -1); return [a, addDays(`${y}-${two(m)}-01`, -1)]; }
    case "custom": return [r.from || addDays(t, -6), r.to || t];
    default: return [addDays(t, -29), t];
  }
}
// programado: o que a programação atual põe no ar, dia a dia, em cada tela
function programmed(a, b, R) {
  const end = b < today() ? b : today(), per = {}, scr = addedScreens().filter(s => !R.screen || s.id === R.screen);
  const mine = state.media.filter(m => (!R.client || m.client_id === R.client) && (!R.media || m.id === R.media));
  let total = 0;
  const born = ts => ts ? A.nowParts(tz(), new Date(ts).getTime()).ymd : "0000-00-00";
  for (let d = a, n = 0; d <= end && n < 400; d = addDays(d, 1), n++) {
    for (const s of scr) {
      if (d < born(s.created_at)) continue;                       // a TV ainda não existia
      const tg = mine.filter(m => m.active && targets(m, s) && d >= born(m.created_at));   // nem o anúncio
      if (!tg.length) continue;
      const e = estimateFor(s, d);
      for (const m of tg) { const v = e.perAd[m.id] || 0; per[m.id] = (per[m.id] || 0) + v; total += v; }
    }
  }
  return { per, total };
}
// contratado: inserções por dia × telas × dias de contrato dentro do período
function contracted(a, b, R) {
  const end = b < today() ? b : today();
  const cl = R.client ? [clientById(R.client)].filter(Boolean) : state.clients.filter(c => c.active);
  let total = 0, any = false;
  for (const c of cl) {
    if (!c.daily_insertions) continue;
    any = true;
    const s0 = c.start_date > a ? c.start_date : a, e0 = contractEnd(c) < end ? contractEnd(c) : end;
    if (s0 > e0) continue;
    const ads = state.media.filter(m => m.client_id === c.id && m.active);
    const scrs = addedScreens().filter(s => ads.some(m => targets(m, s)));
    let nScr = R.screen ? (scrs.some(s => s.id === R.screen) ? 1 : 0) : (c.screens_qty || scrs.length || 1);
    total += c.daily_insertions * nScr * (daysBetween(s0, e0) + 1);
  }
  return any ? total : null;
}

PAGES.relatorio = async function pageReport(arg) {
  const main = $("#main");
  try { await need("media", "screens", "clients", "exceptions"); } catch (e) { pageError(e); return; }
  if (arg) state.report.client = arg;
  const R = state.report;
  const ads = state.media.filter(m => !R.client || m.client_id === R.client);
  main.innerHTML = `
    <div class="head"><div><h1>Relatório de exibição</h1><div class="sub">O que o player realmente reproduziu, comparado com o contratado e o programado. Serve de comprovante para o cliente.</div></div></div>
    <div class="filters">
      <select class="in" id="rc"><option value="">Todos os clientes</option>${state.clients.map(c => `<option value="${c.id}" ${R.client === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
      <select class="in" id="rp">${[["30", "Últimos 30 dias"], ["7", "Últimos 7 dias"], ["hoje", "Hoje"], ["ontem", "Ontem"], ["mes", "Este mês"], ["mespassado", "Mês passado"], ["custom", "Escolher datas"]].map(([v, l]) => `<option value="${v}" ${R.period === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <span id="rcust" class="${R.period === "custom" ? "" : "hide"}" style="display:inline-flex;gap:6px"><input class="in" type="date" id="ra" value="${R.from || ""}"><input class="in" type="date" id="rb" value="${R.to || ""}"></span>
      <select class="in" id="rs"><option value="">Todas as telas</option>${addedScreens().map(s => `<option value="${esc(s.id)}" ${R.screen === s.id ? "selected" : ""}>${esc(screenLabel(s))}</option>`).join("")}</select>
      <select class="in" id="rm"><option value="">Todos os anúncios</option>${ads.map(m => `<option value="${m.id}" ${R.media === m.id ? "selected" : ""}>${esc(m.title)}</option>`).join("")}</select>
      <div class="spacer"></div>
      <button class="btn ghost sm" id="csv">Copiar planilha</button>
      <button class="btn ghost sm hide" id="share">Compartilhar PDF</button>
      <button class="btn sm" id="pdf">${icon("doc")} Salvar PDF</button>
    </div>
    <div id="rep"><div class="empty"><span class="spin dark"></span></div></div>`;
  const read = () => { R.client = $("#rc").value; R.period = $("#rp").value; R.from = $("#ra").value; R.to = $("#rb").value; R.screen = $("#rs").value; R.media = $("#rm").value; };
  $("#rc").addEventListener("change", () => { read(); R.media = ""; PAGES.relatorio(); });
  ["#rp", "#ra", "#rb", "#rs", "#rm"].forEach(id => $(id).addEventListener("change", () => { read(); $("#rcust").classList.toggle("hide", R.period !== "custom"); load(); }));
  if (navigator.canShare && navigator.canShare({ files: [new File(["x"], "x.pdf", { type: "application/pdf" })] })) $("#share").classList.remove("hide");
  let data = null;
  async function load() {
    const [a, b] = reportRange(R);
    if (b < a) { $("#rep").innerHTML = `<div class="err-box">A data final é antes da inicial.</div>`; return; }
    $("#rep").innerHTML = `<div class="empty"><span class="spin dark"></span></div>`;
    const args = { p_from: startOf(a).toISOString(), p_to: startOf(addDays(b, 1)).toISOString(), p_client: R.client || null, p_screen: R.screen || null, p_media: R.media || null };
    const [r1, r2, r3] = await Promise.all([sb.rpc("sf_report", args), sb.rpc("sf_plays_daily", args), sb.rpc("sf_play_log", { ...args, p_limit: 100 })]);
    const er = r1.error || r2.error || r3.error;
    if (er) { $("#rep").innerHTML = `<div class="err-box">${esc(friendly(er))}</div>`; return; }
    const rows = r1.data || [], daily = r2.data || [], log = r3.data || [];
    const prog = programmed(a, b, R), ctr = contracted(a, b, R);
    const by = {}, bs = {};
    rows.forEach(r => {
      const k = r.media_id || r.title;
      const x = by[k] = by[k] || { id: r.media_id, title: r.title, advertiser: r.advertiser, client_id: r.client_id, plays: 0, seconds: 0, interrupted: 0, failed: 0, offline: 0, screens: new Set() };
      x.plays += +r.plays; x.seconds += +r.seconds; x.interrupted += +r.interrupted; x.failed += +r.failed; x.offline += +r.offline; x.screens.add(r.screen_id);
      const y = bs[r.screen_id] = bs[r.screen_id] || { label: r.screen_location ? `${r.screen_location} · ${r.screen_name}` : r.screen_name, plays: 0, seconds: 0, interrupted: 0, failed: 0, first: r.first_at, last: r.last_at };
      y.plays += +r.plays; y.seconds += +r.seconds; y.interrupted += +r.interrupted; y.failed += +r.failed;
      if (r.first_at < y.first) y.first = r.first_at; if (r.last_at > y.last) y.last = r.last_at;
    });
    Object.keys(prog.per).forEach(id => { if (!by[id]) { const m = state.media.find(x => x.id === id); if (m && prog.per[id]) by[id] = { id, title: m.title, advertiser: clientName(m), client_id: m.client_id, plays: 0, seconds: 0, interrupted: 0, failed: 0, offline: 0, screens: new Set() }; } });
    const tot = Object.values(by).reduce((a, x) => (a.p += x.plays, a.s += x.seconds, a.i += x.interrupted, a.f += x.failed, a.o += x.offline, a), { p: 0, s: 0, i: 0, f: 0, o: 0 });
    const client = R.client ? clientById(R.client) : null;
    data = { a, b, R, rows, daily, log, prog, ctr, by, bs, tot, client, args };
    const partial = b > today() ? " até hoje" : "";
    const pct = (v, base) => base ? ` · ${Math.round(v / base * 100)}%` : "";
    $("#rep").innerHTML = `
      <div class="sub" style="margin-bottom:10px">${fmtDate(a)} a ${fmtDate(b)}${client ? " · " + esc(client.name) : ""}${R.screen ? " · " + esc(screenName(R.screen)) : ""}${R.media ? " · " + esc((state.media.find(m => m.id === R.media) || {}).title || "") : ""}</div>
      <div class="kpis">
        <div class="card kpi"><div class="k">Contratado${partial}</div><div class="v">${ctr == null ? "—" : nf(ctr)}</div><div class="d">${ctr == null ? "cadastre inserções/dia no cliente" : "inserções pelo contrato"}</div></div>
        <div class="card kpi"><div class="k">Programado${partial}</div><div class="v">${nf(prog.total)}</div><div class="d">pela programação atual${pct(prog.total, ctr)}</div></div>
        <div class="card kpi"><div class="k">Reproduzido</div><div class="v ok-txt">${nf(tot.p)}</div><div class="d">exibições concluídas${pct(tot.p, ctr || prog.total)}</div></div>
        <div class="card kpi"><div class="k">Interrompidas · falhas</div><div class="v">${nf(tot.i)} · ${nf(tot.f)}</div><div class="d">não contam como exibição</div></div>
        <div class="card kpi"><div class="k">Tempo no ar</div><div class="v">${fmtSecs(tot.s)}</div><div class="d">${nf(tot.o)} registro(s) feitos sem internet</div></div>
      </div>
      ${daily.length ? `<div class="card pad" style="margin-bottom:16px"><b>Exibições concluídas por dia</b><div class="bars" style="margin-bottom:20px">${(() => { const mx = Math.max(1, ...daily.map(d => +d.plays)); return daily.map(d => `<div class="b" title="${fmtDate(d.day)}: ${nf(d.plays)}" style="height:${Math.max(2, d.plays / mx * 100)}%"><span>${d.day.slice(8)}</span></div>`).join(""); })()}</div></div>` : ""}
      <h2 class="sec">Por anúncio</h2>
      <div class="card tbl-wrap">${Object.keys(by).length ? `<table><thead><tr><th>Anúncio</th><th class="num">Programado</th><th class="num">Reproduzido</th><th class="num">Interromp.</th><th class="num">Falhas</th><th class="num">Tempo</th><th class="num hide-sm">Telas</th></tr></thead><tbody>
        ${Object.values(by).sort((x, y) => y.plays - x.plays).map(x => `<tr><td><b>${esc(x.title)}</b>${x.advertiser ? `<div class="sub">${esc(x.advertiser)}</div>` : ""}</td><td class="num">${nf(prog.per[x.id] || 0)}</td><td class="num"><b>${nf(x.plays)}</b></td><td class="num">${nf(x.interrupted)}</td><td class="num">${nf(x.failed)}</td><td class="num">${fmtSecs(x.seconds)}</td><td class="num hide-sm">${x.screens.size}</td></tr>`).join("")}
        <tr class="tot"><td>Total</td><td class="num">${nf(prog.total)}</td><td class="num">${nf(tot.p)}</td><td class="num">${nf(tot.i)}</td><td class="num">${nf(tot.f)}</td><td class="num">${fmtSecs(tot.s)}</td><td class="hide-sm"></td></tr></tbody></table>`
        : `<div class="empty"><h3>Nenhuma exibição nesse período</h3><div>As exibições são registradas pela TV, mesmo sem internet, e chegam aqui quando ela se conecta.</div></div>`}</div>
      ${Object.keys(bs).length ? `<h2 class="sec">Por tela</h2><div class="card tbl-wrap"><table><thead><tr><th>Tela</th><th class="num">Reproduzido</th><th class="num">Interromp.</th><th class="num">Falhas</th><th class="num">Tempo</th><th class="num">Primeira</th><th class="num">Última</th></tr></thead><tbody>
        ${Object.values(bs).map(y => `<tr><td>${esc(y.label)}</td><td class="num"><b>${nf(y.plays)}</b></td><td class="num">${nf(y.interrupted)}</td><td class="num">${nf(y.failed)}</td><td class="num">${fmtSecs(y.seconds)}</td><td class="num">${fmtDT(y.first)}</td><td class="num">${fmtDT(y.last)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${log.length ? `<h2 class="sec">Registro do player <span class="sub">(últimos ${log.length}; o PDF traz até 2.000)</span></h2>
        <div class="card tbl-wrap" style="max-height:380px;overflow:auto"><table><thead><tr><th>Data e hora</th><th>Tela</th><th>Anúncio</th><th class="num">Duração</th><th>Resultado</th></tr></thead><tbody>
        ${log.map(l => `<tr><td class="num">${fmtDT(l.played_at)}</td><td>${esc(l.screen_location ? l.screen_location + " · " + l.screen_name : l.screen_name)}</td><td>${esc(l.title)}${l.advertiser ? ` <span class="sub">· ${esc(l.advertiser)}</span>` : ""}</td><td class="num">${l.seconds}s</td>
          <td><span class="chip ${l.status === "ok" ? "ok" : l.status === "failed" ? "err" : "warn"}">${l.status === "ok" ? "concluída" : l.status === "failed" ? "falhou" : "interrompida"}</span>${l.offline ? ` <span class="chip">sem internet</span>` : ""}${l.detail ? `<div class="sub small">${esc(l.detail)}</div>` : ""}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  }
  $("#csv").addEventListener("click", async () => {
    if (!data) return;
    let lg;
    try { lg = await rpcAll("sf_play_log", data.args, 20000); } catch (ex) { toast(friendly(ex), 5000); return; }
    if (!lg || !lg.length) { toast("Nada para copiar nesse período"); return; }
    const lines = [["Data", "Hora", "Unidade", "Tela", "Anúncio", "Anunciante", "Duração (s)", "Resultado", "Sem internet"].join("\t")]
      .concat(lg.map(l => { const d = new Date(l.played_at); return [d.toLocaleDateString("pt-BR", { timeZone: tz() }), d.toLocaleTimeString("pt-BR", { timeZone: tz() }), l.screen_location || "", l.screen_name, l.title, l.advertiser || "", l.seconds, l.status === "ok" ? "concluída" : l.status === "failed" ? "falhou" : "interrompida", l.offline ? "sim" : ""].join("\t"); }));
    try { await navigator.clipboard.writeText(lines.join("\n")); toast(`${nf(lg.length)} linha(s) copiadas. Cole no Excel ou Google Planilhas.`); }
    catch (e) { toast("Não consegui copiar neste navegador"); }
  });
  const makePdf = async btn => {
    if (!data) return null;
    const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin dark"></span> Gerando…`;
    try { return await buildPdf(data); }
    catch (ex) { toast(friendly(ex), 5000); return null; }
    finally { btn.disabled = false; btn.innerHTML = old; }
  };
  $("#pdf").addEventListener("click", async () => { const r = await makePdf($("#pdf")); if (r) { r.doc.save(r.name); toast("PDF salvo nos seus downloads."); } });
  $("#share").addEventListener("click", async () => {
    const r = await makePdf($("#share")); if (!r) return;
    const f = new File([r.doc.output("blob")], r.name, { type: "application/pdf" });
    try { await navigator.share({ files: [f], title: r.name }); } catch (e) {}
  });
  load();
};

// texto que as fontes padrão do PDF conseguem desenhar
const pdfTxt = s => String(s ?? "").replace(/[•‧]/g, "·").replace(/[–—]/g, "-").replace(/→/g, "a").replace(/…/g, "...").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x00-\xFF]/g, "");
async function headerImage() {
  const c = document.createElement("canvas"); c.width = 1680; c.height = 208;
  const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, c.width, 0);
  gr.addColorStop(0, "#FC0491"); gr.addColorStop(1, "#1D02A9");
  g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
  const logo = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = "logo.png"; });
  if (logo) { const h = 104, w = logo.naturalWidth * h / logo.naturalHeight; g.drawImage(logo, 90, (c.height - h) / 2, w, h); }
  g.fillStyle = "rgba(255,255,255,.92)"; g.font = "600 44px Arial"; g.textAlign = "right"; g.textBaseline = "middle";
  g.fillText("COMPROVANTE DE EXIBIÇÃO", c.width - 90, c.height / 2);
  return c.toDataURL("image/jpeg", 0.92);
}
async function buildPdf(D) {
  await loadScript("vendor/jspdf.umd.min.js");
  await loadScript("vendor/jspdf.plugin.autotable.min.js");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const st = state.settings, W = 210, M = 14, ACC = [179, 16, 143];
  const who = D.client ? D.client.name : "Todos os clientes";
  const lg = await rpcAll("sf_play_log", D.args, 2000);
  const hdr = await headerImage();
  doc.addImage(hdr, "JPEG", 0, 0, W, 26);
  doc.setTextColor(20); doc.setFont("helvetica", "bold"); doc.setFontSize(17);
  doc.text(pdfTxt(who), M, 38);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(90);
  const filt = [D.R.screen ? "Tela: " + screenName(D.R.screen) : "", D.R.media ? "Anúncio: " + ((state.media.find(m => m.id === D.R.media) || {}).title || "") : ""].filter(Boolean).join(" · ");
  doc.text(pdfTxt(`Período: ${fmtDate(D.a)} a ${fmtDate(D.b)}${filt ? " · " + filt : ""}`), M, 44);
  if (D.client) doc.text(pdfTxt([D.client.doc ? "CPF/CNPJ " + D.client.doc : "", `Plano: ${D.client.ads_qty} anúncio(s) de ${D.client.ad_seconds}s${D.client.daily_insertions ? ", " + D.client.daily_insertions + " inserções/dia por tela" : ""}`, `Contrato ${fmtDate(D.client.start_date)} a ${fmtDate(contractEnd(D.client))}`].filter(Boolean).join(" · ")), M, 49);
  doc.text(pdfTxt(`Emitido em ${new Date().toLocaleString("pt-BR", { timeZone: tz() })} por ${st.company || "START PLAY"} · ${st.phone || ""}${st.doc ? " · CNPJ " + st.doc : ""}`), M, D.client ? 54 : 49);
  // resumo
  const boxes = [["Contratado", D.ctr == null ? "-" : nf(D.ctr)], ["Programado", nf(D.prog.total)], ["Reproduzido", nf(D.tot.p)], ["Interromp./falhas", `${nf(D.tot.i)} / ${nf(D.tot.f)}`], ["Tempo no ar", fmtSecs(D.tot.s)]];
  const bw = (W - 2 * M - 4 * 3) / 5, by = D.client ? 60 : 55;
  boxes.forEach(([k, v], i) => {
    const x = M + i * (bw + 3);
    doc.setFillColor(i === 2 ? 252 : 246, i === 2 ? 232 : 247, i === 2 ? 244 : 249); doc.roundedRect(x, by, bw, 19, 2, 2, "F");
    doc.setFontSize(7.5); doc.setTextColor(100); doc.text(pdfTxt(k.toUpperCase()), x + 3, by + 6);
    doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(i === 2 ? ACC[0] : 20, i === 2 ? ACC[1] : 20, i === 2 ? ACC[2] : 20); doc.text(pdfTxt(v), x + 3, by + 14.5);
    doc.setFont("helvetica", "normal");
  });
  doc.setFontSize(8); doc.setTextColor(110);
  doc.text(pdfTxt("Reproduzido = exibições concluídas registradas pelo player na TV (inclusive as feitas sem internet). Programado = estimativa pela programação atual."), M, by + 24);
  const deco = data => {
    if (data.pageNumber > 1) {
      doc.setFillColor(ACC[0], ACC[1], ACC[2]); doc.rect(0, 0, W, 2.2, "F");
      doc.setFontSize(8.5); doc.setTextColor(90); doc.text(pdfTxt(`START PLAY · Comprovante de exibição · ${who} · ${fmtDate(D.a)} a ${fmtDate(D.b)}`), M, 9);
    }
  };
  const table = (title, head, body, extra = {}) => {
    let y = (doc.lastAutoTable ? doc.lastAutoTable.finalY : by + 28) + 9;
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFontSize(11.5); doc.setFont("helvetica", "bold"); doc.setTextColor(20); doc.text(pdfTxt(title), M, y);
    doc.setFont("helvetica", "normal");
    doc.autoTable({ startY: y + 3, head: [head.map(pdfTxt)], body: body.map(r => r.map(pdfTxt)), theme: "striped", margin: { left: M, right: M, top: 16, bottom: 16 },
      styles: { fontSize: 8.6, cellPadding: 1.8 }, headStyles: { fillColor: ACC, textColor: 255 }, alternateRowStyles: { fillColor: [248, 248, 251] }, didDrawPage: deco, ...extra });
  };
  const ads = Object.values(D.by).sort((x, y) => y.plays - x.plays);
  table("Por anúncio", ["Anúncio", "Anunciante", "Programado", "Reproduzido", "Interromp.", "Falhas", "Tempo no ar"],
    ads.map(x => [x.title, x.advertiser || "", nf(D.prog.per[x.id] || 0), nf(x.plays), nf(x.interrupted), nf(x.failed), fmtSecs(x.seconds)])
      .concat([["Total", "", nf(D.prog.total), nf(D.tot.p), nf(D.tot.i), nf(D.tot.f), fmtSecs(D.tot.s)]]),
    { columnStyles: { 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } } });
  const scr = Object.values(D.bs);
  if (scr.length) table("Por tela", ["Tela", "Reproduzido", "Interromp.", "Falhas", "Tempo no ar", "Primeira", "Última"],
    scr.map(y => [y.label, nf(y.plays), nf(y.interrupted), nf(y.failed), fmtSecs(y.seconds), fmtDT(y.first), fmtDT(y.last)]),
    { columnStyles: { 1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } } });
  if (D.daily.length) table("Por dia", ["Dia", "Reproduzido", "Interromp.", "Falhas", "Tempo no ar"],
    D.daily.map(d => [`${DAYS[A.dowOf(d.day)]} ${fmtDate(d.day)}`, nf(d.plays), nf(d.interrupted), nf(d.failed), fmtSecs(d.seconds)]),
    { columnStyles: { 1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } } });
  if (lg && lg.length) table(`Registro do player (${lg.length === 2000 ? "os 2.000 mais recentes" : nf(lg.length) + " registros"})`, ["Data", "Hora", "Tela", "Anúncio", "Duração", "Resultado"],
    lg.map(l => { const d = new Date(l.played_at); return [d.toLocaleDateString("pt-BR", { timeZone: tz() }), d.toLocaleTimeString("pt-BR", { timeZone: tz() }), l.screen_location ? `${l.screen_location} · ${l.screen_name}` : l.screen_name, l.title, `${l.seconds}s`, (l.status === "ok" ? "concluída" : l.status === "failed" ? "falhou" : "interrompida") + (l.offline ? " (sem internet)" : "")]; }),
    { styles: { fontSize: 7.6, cellPadding: 1.2 }, columnStyles: { 4: { halign: "right" } } });
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(pdfTxt(`${st.company || "START PLAY"} · mídia indoor · ${st.phone || "(65) 99328-8233"}${st.email ? " · " + st.email : ""}`), M, 290);
    doc.text(`Página ${i} de ${n}`, W - M, 290, { align: "right" });
  }
  const safe = s => pdfTxt(s).replace(/[\\/:*?"<>|]+/g, "").trim();
  return { doc, name: `START PLAY - Comprovante - ${safe(who)} - ${D.a} a ${D.b}.pdf`, pages: n, rows: (lg || []).length };
}

// ---------------------------------------------------------------------------
// FINANCEIRO
// ---------------------------------------------------------------------------
PAGES.financeiro = async function pageFinance() {
  loading();
  try { await need("clients", "payments", "receipts"); } catch (e) { pageError(e); return; }
  if (state.tab !== "financeiro") return;
  const t = today(), month = t.slice(0, 7), F = state.fin, main = $("#main");
  const recMonth = state.receipts.filter(r => r.paid_on.slice(0, 7) === month).reduce((a, r) => a + Number(r.amount), 0);
  const dueSoon = state.payments.filter(p => !p.paid_at && p.due_date >= t && p.due_date <= addDays(t, 30));
  const overdue = state.payments.filter(p => !p.paid_at && p.due_date < t);
  const mrr = state.clients.filter(c => c.active && c.start_date <= t && contractEnd(c) >= t).reduce((a, c) => a + Number(c.monthly_value), 0);
  const ending = state.clients.filter(c => c.active && contractEnd(c) >= t && daysBetween(t, contractEnd(c)) <= 60).sort((a, b) => contractEnd(a).localeCompare(contractEnd(b)));
  main.innerHTML = `
    <div class="head"><div><h1>Financeiro</h1><div class="sub">Recebimentos, valores a vencer e em atraso. Pagamento parcial é aceito.</div></div></div>
    <div class="kpis">
      <div class="card kpi"><div class="k">Recebido no mês</div><div class="v ok-txt">${money(recMonth)}</div><div class="d">${state.receipts.filter(r => r.paid_on.slice(0, 7) === month).length} pagamento(s)</div></div>
      <div class="card kpi"><div class="k">A vencer (30 dias)</div><div class="v">${money(dueSoon.reduce((a, p) => a + saldo(p), 0))}</div><div class="d">${dueSoon.length} parcela(s)</div></div>
      <div class="card kpi ${overdue.length ? "alert" : ""}"><div class="k">Em atraso</div><div class="v ${overdue.length ? "err-txt" : ""}">${money(overdue.reduce((a, p) => a + saldo(p), 0))}</div><div class="d">${overdue.length} parcela(s)</div></div>
      <div class="card kpi"><div class="k">Receita mensal</div><div class="v">${money(mrr)}</div><div class="d">contratos em vigor</div></div>
    </div>
    ${ending.length ? `<div class="card pad" style="margin-bottom:16px;border-color:#F1D9B5;background:#FFFCF6"><b class="warn-txt">Contratos perto do fim</b>
      <div class="list" style="margin-top:8px">${ending.map(c => `<div style="display:flex;gap:10px;align-items:center"><b style="flex:1">${esc(c.name)}</b><span class="chip warn">termina ${fmtDate(contractEnd(c))} · ${daysBetween(t, contractEnd(c))} dias</span>
        ${c.phone ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="${esc(waLink(c.phone, `Olá ${c.contact || c.name}! O seu contrato de mídia indoor com a START PLAY termina em ${fmtDate(contractEnd(c))}. Vamos renovar?`))}">${icon("wa")} Renovar</a>` : ""}</div>`).join("")}</div></div>` : ""}
    <div class="filters"><div class="seg" id="fv">${[["parcelas", "Parcelas"], ["recebimentos", "Recebimentos"], ["clientes", "Por cliente"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${F.view === v ? "on" : ""}">${l}</button>`).join("")}</div>
      ${F.view === "parcelas" ? `<select class="in" id="fs">${[["aberto", "Em aberto"], ["atraso", "Atrasadas"], ["pagas", "Pagas"], ["todas", "Todas"]].map(([v, l]) => `<option value="${v}" ${F.status === v ? "selected" : ""}>${l}</option>`).join("")}</select>` : ""}
      ${F.view !== "clientes" ? `<select class="in" id="fcl"><option value="">Todos os clientes</option>${state.clients.map(c => `<option value="${c.id}" ${F.client === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>` : ""}</div>
    <div class="card tbl-wrap" id="ftab"></div>`;
  $("#fv").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { F.view = b.dataset.v; PAGES.financeiro(); } });
  $("#fs")?.addEventListener("change", e => { F.status = e.target.value; PAGES.financeiro(); });
  $("#fcl")?.addEventListener("change", e => { F.client = e.target.value; PAGES.financeiro(); });
  const cn = id => (clientById(id) || {}).name || "—";
  if (F.view === "parcelas") {
    const ps = state.payments.filter(p => (!F.client || p.client_id === F.client) && (F.status === "todas" || (F.status === "pagas" ? p.paid_at : F.status === "atraso" ? !p.paid_at && p.due_date < t : !p.paid_at)));
    $("#ftab").innerHTML = ps.length ? `<table><thead><tr><th>Cliente</th><th>Referência</th><th>Vencimento</th><th class="num">Valor</th><th class="num">Pago</th><th class="num">Saldo</th><th>Situação</th><th></th></tr></thead><tbody>
      ${ps.map(p => { const [s, cls] = payStatus(p), c = clientById(p.client_id); return `<tr><td><a href="#" data-st="${p.client_id}">${esc(cn(p.client_id))}</a></td><td>${refTxt(p.ref_month)}</td><td class="num">${fmtDate(p.due_date)}</td><td class="num">${money(p.amount)}</td><td class="num">${money(p.paid_amount || 0)}</td><td class="num"><b>${money(saldo(p))}</b></td><td><span class="chip ${cls}">${s}</span></td>
        <td class="num" style="white-space:nowrap">${p.paid_at ? "" : `<button class="btn ghost sm" data-rcv="${p.id}">Receber</button>`}${!p.paid_at && c && c.phone ? ` <a class="icon" target="_blank" rel="noopener" title="Cobrar no WhatsApp" href="${esc(waLink(c.phone, chargeText(c, [p])))}">${icon("wa")}</a>` : ""}</td></tr>`; }).join("")}
      <tr class="tot"><td colspan="3">Total</td><td class="num">${money(ps.reduce((a, p) => a + Number(p.amount), 0))}</td><td class="num">${money(ps.reduce((a, p) => a + Number(p.paid_amount || 0), 0))}</td><td class="num">${money(ps.reduce((a, p) => a + saldo(p), 0))}</td><td colspan="2"></td></tr></tbody></table>`
      : `<div class="empty"><h3>Nenhuma parcela aqui</h3><div>As parcelas são geradas ao cadastrar o contrato do cliente.</div><a class="btn" href="#clientes/novo">+ Novo cliente</a></div>`;
  } else if (F.view === "recebimentos") {
    const rs = state.receipts.filter(r => !F.client || r.client_id === F.client);
    $("#ftab").innerHTML = rs.length ? `<table><thead><tr><th>Data</th><th>Cliente</th><th>Parcela</th><th class="num">Valor</th><th>Forma</th><th>Obs.</th><th></th></tr></thead><tbody>
      ${rs.map(r => { const p = state.payments.find(x => x.id === r.payment_id); return `<tr><td class="num">${fmtDate(r.paid_on)}</td><td><a href="#" data-st="${r.client_id}">${esc(cn(r.client_id))}</a></td><td>${p ? refTxt(p.ref_month) : "—"}</td><td class="num"><b>${money(r.amount)}</b></td><td>${esc(r.method || "")}</td><td class="small">${esc(r.note || "")}</td>
        <td class="num"><button class="icon" data-undo="${r.id}" title="Estornar">${icon("undo")}</button></td></tr>`; }).join("")}
      <tr class="tot"><td colspan="3">Total</td><td class="num">${money(rs.reduce((a, r) => a + Number(r.amount), 0))}</td><td colspan="3"></td></tr></tbody></table>`
      : `<div class="empty">Nenhum pagamento registrado.</div>`;
  } else {
    $("#ftab").innerHTML = state.clients.length ? `<table><thead><tr><th>Cliente</th><th class="num">Contrato</th><th class="num">Recebido</th><th class="num">Saldo</th><th class="num">Em atraso</th><th>Próximo vencimento</th><th>Contrato</th></tr></thead><tbody>
      ${state.clients.map(c => { const f = clientFin(c), [cs, cc] = contractState(c); return `<tr><td><a href="#" data-st="${c.id}">${esc(c.name)}</a></td><td class="num">${money(f.total)}</td><td class="num">${money(f.received)}</td><td class="num"><b>${money(f.open)}</b></td><td class="num ${f.overdue ? "err-txt" : ""}">${money(f.overdue)}</td>
        <td>${f.next ? `${fmtDate(f.next.due_date)} · ${money(saldo(f.next))}` : "—"}</td><td><span class="chip ${cc}">${cs}</span></td></tr>`; }).join("")}</tbody></table>`
      : `<div class="empty">Nenhum cliente ainda.</div>`;
  }
  $("#ftab").addEventListener("click", async e => {
    const st = e.target.closest("[data-st]"); if (st) { e.preventDefault(); const c = clientById(st.dataset.st); if (c) statementModal(c); return; }
    const rc = e.target.closest("[data-rcv]"); if (rc) { receiveForm(state.payments.find(p => p.id === rc.dataset.rcv)); return; }
    const un = e.target.closest("[data-undo]");
    if (un) confirmBox("Estornar este pagamento?", "O valor volta a ficar em aberto na parcela.", "Estornar", async () => {
      const { error } = await sb.from("receipts").delete().eq("id", un.dataset.undo); if (error) throw error;
      toast("Pagamento estornado."); PAGES.financeiro();
    });
  });
};

// ---------------------------------------------------------------------------
// AJUSTES
// ---------------------------------------------------------------------------
const TZS = ["America/Cuiaba", "America/Campo_Grande", "America/Porto_Velho", "America/Manaus", "America/Boa_Vista", "America/Rio_Branco", "America/Sao_Paulo", "America/Bahia", "America/Belem", "America/Fortaleza", "America/Recife", "America/Maceio", "America/Araguaina", "America/Santarem", "America/Noronha"];
function alertHist(h) {
  if (!h || !h.length) return `<div class="sub small">Nenhum aviso enviado ainda.</div>`;
  return `<div class="tbl-wrap"><table><tbody>${h.map(x => `<tr><td class="small" style="white-space:nowrap">${esc(fmtDT(x.at))}</td>
    <td class="small"><b>${esc(KIND_TXT[x.kind] || x.kind)}</b>${x.screen_name ? " · " + esc(x.screen_name) : ""}</td>
    <td class="small">${x.channel === "whatsapp" ? "WhatsApp" : "E-mail"}</td>
    <td class="small">${x.ok === true ? `<span class="chip ok">entregue</span>` : x.ok === false ? `<span class="chip err" title="${esc(x.error || "")}">falhou</span><div class="warn-txt">${esc((x.error || "").slice(0, 90))}</div>` : `<span class="chip">enviando</span>`}</td></tr>`).join("")}</tbody></table></div>`;
}
function contentStatus(st) {
  const keys = Object.keys(st || {}).sort();
  if (!keys.length) return `<div class="sub small">Nada coletado ainda. Ligue os cartões em alguma tela (Telas → Configurar → Entre os anúncios); a coleta começa em até 1 minuto.</div>`;
  return keys.map(k => { const x = st[k] || {}; return `<div style="display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid var(--line)"><b class="small" style="flex:1">${esc(CONTENT_TXT(k))}</b>
    ${x.ok_at ? `<span class="chip ok">atualizado ${ago(x.ok_at)}</span>` : `<span class="chip">${x.waiting ? "buscando…" : "sem dados"}</span>`}${x.error ? `<span class="chip warn" title="${esc(x.error)}">${esc(x.error.slice(0, 40))}</span>` : ""}</div>`; }).join("");
}

async function validateSource(id) {
  const tk = await token();
  const r = await fetch(`${CFG.supabaseUrl.replace(/\/$/, "")}/functions/v1/noticias?validar=${encodeURIComponent(id)}`, { headers: { Authorization: "Bearer " + tk } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || "HTTP " + r.status);
  return j.resultados || [];
}
// cidades para o clima (latitude, longitude)
const CIDADES = [["Cuiabá", -15.601, -56.097], ["Várzea Grande", -15.646, -56.132], ["Rondonópolis", -16.470, -54.636], ["Sinop", -11.864, -55.509],
  ["Tangará da Serra", -14.619, -57.486], ["Cáceres", -16.071, -57.682], ["Sorriso", -12.545, -55.711], ["Lucas do Rio Verde", -13.050, -55.911],
  ["Primavera do Leste", -15.561, -54.296], ["Barra do Garças", -15.890, -52.257], ["Alta Floresta", -9.876, -56.086], ["Nova Mutum", -13.837, -56.083],
  ["Campo Novo do Parecis", -13.675, -57.892], ["Pontes e Lacerda", -15.226, -59.335], ["Chapada dos Guimarães", -15.461, -55.750],
  ["Campo Grande", -20.469, -54.620], ["Goiânia", -16.686, -49.264], ["Brasília", -15.794, -47.882], ["Porto Velho", -8.761, -63.900], ["São Paulo", -23.550, -46.633]];
const MOEDAS_OP = [["USD", "Dólar"], ["EUR", "Euro"], ["GBP", "Libra"], ["ARS", "Peso argentino"], ["BTC", "Bitcoin"]];
const LIGAS_OP = [["bra.1", "Brasileirão Série A"], ["bra.2", "Brasileirão Série B"], ["bra.copa_do_brazil", "Copa do Brasil"], ["conmebol.libertadores", "Libertadores"]];
const KIND_TXT = { down: "TV sem sinal", reminder: "Lembrete", back: "TV voltou", test: "Teste" };
const CONTENT_TXT = k => k === "clima" ? "Clima" : k === "cotacao" ? "Cotação" : k.startsWith("jogos:") ? "Jogos · " + ((LIGAS_OP.find(x => x[0] === k.slice(6)) || [])[1] || k.slice(6))
  : k.startsWith("tabela:") ? "Classificação · " + ((LIGAS_OP.find(x => x[0] === k.slice(7)) || [])[1] || k.slice(7)) : k;

PAGES.ajustes = async function pageSettings() {
  loading();
  let al = {}, hist = [], cst = {};
  try {
    await need("settings", "sources", "version");
    al = (await q("alert_settings").catch(() => [{}]))[0] || {};
    hist = await sb.rpc("sf_alert_history", { p_limit: 15 }).then(r => r.data || []).catch(() => []);
    cst = await sb.rpc("sf_content_status", { p_refresh: false }).then(r => r.data || {}).catch(() => ({}));
  } catch (e) { pageError(e); return; }
  if (state.tab !== "ajustes") return;
  const s = state.settings, main = $("#main");
  const bySec = {}; state.sources.forEach(x => { (bySec[x.section] = bySec[x.section] || []).push(x); });
  const secs = EDITORIAS.filter(e => bySec[e]).concat(Object.keys(bySec).filter(e => !EDITORIAS.includes(e)));
  main.innerHTML = `
    <div class="head"><div><h1>Ajustes</h1><div class="sub">Dados da empresa, rodapé das TVs, fuso horário e fontes de notícias.</div></div></div>
    <form id="f-set"><div class="grid2c">
      <div class="box"><h3>Empresa (aparece no PDF e nas cobranças)</h3>
        <div class="grid2"><div class="field"><label for="s1">Nome</label><input class="in" id="s1" maxlength="80" value="${esc(s.company || "START PLAY")}"></div>
          <div class="field"><label for="s2">WhatsApp</label><input class="in" id="s2" maxlength="30" value="${esc(s.phone || "")}"></div>
          <div class="field"><label for="s3">E-mail</label><input class="in" id="s3" maxlength="120" value="${esc(s.email || "")}"></div>
          <div class="field"><label for="s4">CNPJ</label><input class="in" id="s4" maxlength="20" value="${esc(s.doc || "")}"></div>
          <div class="field"><label for="s5">Cidade</label><input class="in" id="s5" maxlength="80" value="${esc(s.city || "")}"></div>
          <div class="field"><label for="s6">Chave PIX</label><input class="in" id="s6" maxlength="120" value="${esc(s.pix || "")}"></div></div></div>
      <div><div class="box"><h3>Rodapé das TVs</h3>
        <div class="field"><label for="s7">Chamada comercial padrão</label><input class="in" id="s7" maxlength="140" value="${esc(s.promo_text || "")}"><div class="hint">Cada tela pode ter o seu texto (Telas → Configurar).</div></div>
        <div class="grid2"><div class="field"><label for="s8">Notícias por (segundos)</label><input class="in" id="s8" type="number" min="10" max="600" value="${s.news_seconds || 40}"></div>
          <div class="field"><label for="s9">Chamada por (segundos)</label><input class="in" id="s9" type="number" min="4" max="60" value="${s.promo_seconds || 10}"></div></div></div>
      <div class="box"><h3>Programação</h3><div class="grid2">
        <div class="field"><label for="s10">Fuso horário</label><select class="in" id="s10">${TZS.map(z => `<option ${s.timezone === z ? "selected" : ""} value="${z}">${z.replace("America/", "").replace("_", " ")}</option>`).join("")}</select><div class="hint">Vale para expediente, agenda e relatórios.</div></div>
        <div class="field"><label for="s11">Ciclo máximo (segundos)</label><input class="in" id="s11" type="number" min="30" max="3600" value="${s.loop_max || 300}"><div class="hint">Tempo até um anúncio voltar a passar. Base do cálculo de ocupação.</div></div></div></div></div>
    </div><div id="f-err"></div><button class="btn" type="submit" id="sv">Salvar ajustes</button></form>
    <h2 class="sec">Aviso de TV fora do ar</h2>
    <form id="f-al" class="grid2c">
      <div class="box"><h3>WhatsApp</h3>
        <label class="switch"><input type="checkbox" id="aw" ${al.wa_on ? "checked" : ""}><span class="sl"></span>Avisar no WhatsApp</label>
        <div class="grid2" style="margin-top:12px"><div class="field"><label for="awp">Número (com DDI e DDD)</label><input class="in" id="awp" placeholder="+5565999999999" value="${esc(al.wa_phone || "")}"></div>
          <div class="field"><label for="awk">Chave do CallMeBot</label><input class="in" id="awk" autocomplete="off" value="${esc(al.wa_key || "")}"></div></div>
        <div class="hint">Para ganhar a chave (grátis, 1 minuto): no celular desse número, abra <a href="https://www.callmebot.com/blog/free-api-whatsapp-messages/" target="_blank" rel="noopener">callmebot.com</a>, salve o número do robô que aparece lá e mande pelo WhatsApp a frase <b>I allow callmebot to send me messages</b>. A chave chega em seguida: cole aqui.</div></div>
      <div class="box"><h3>E-mail</h3>
        <label class="switch"><input type="checkbox" id="am" ${al.mail_on ? "checked" : ""}><span class="sl"></span>Avisar por e-mail</label>
        <div class="grid2" style="margin-top:12px"><div class="field"><label for="amt">E-mail</label><input class="in" id="amt" type="email" value="${esc(al.mail_to || "")}"></div>
          <div class="field"><label for="amk">Chave do Resend</label><input class="in" id="amk" autocomplete="off" placeholder="re_…" value="${esc(al.mail_key || "")}"></div></div>
        <div class="hint">Crie uma conta grátis em <a href="https://resend.com/api-keys" target="_blank" rel="noopener">resend.com</a>, gere uma chave em <b>API Keys</b> e cole aqui. Sem domínio próprio, o Resend envia só para o e-mail da conta.</div></div>
      <div class="box"><h3>Quando avisar</h3>
        <div class="field"><label for="aa">Avisar depois de quantos minutos sem sinal</label><input class="in" id="aa" type="number" min="3" max="240" value="${al.after_min || 10}"></div>
        <label class="switch"><input type="checkbox" id="ab" ${al.notify_back !== false ? "checked" : ""}><span class="sl"></span>Avisar também quando a TV voltar</label>
        <div class="hint">Só avisa no horário de funcionamento de cada tela (Telas → Configurar → Expediente) e respeita feriados. Se a TV continuar fora no dia seguinte, manda um lembrete na abertura.</div>
        <div id="al-err"></div>
        <div style="display:flex;gap:8px;margin-top:12px"><button class="btn" type="submit" id="asv">Salvar avisos</button><button class="btn ghost" type="button" id="atest">Enviar teste</button></div></div>
      <div class="box"><h3>Últimos avisos</h3><div id="al-hist">${alertHist(hist)}</div></div>
    </form>
    <h2 class="sec">Conteúdo entre os anúncios</h2>
    <form id="f-ct" class="grid2c">
      <div class="box"><h3>O que mostrar</h3>
        <div class="field"><label for="cc">Cidade do clima</label><select class="in" id="cc">${CIDADES.map(([n]) => `<option ${((s.content || {}).city || "Cuiabá") === n ? "selected" : ""}>${n}</option>`).join("")}</select></div>
        <div class="field"><span class="lbl">Moedas</span><div class="checks" id="cm">${MOEDAS_OP.map(([k, t]) => { const on = ((s.content || {}).coins || ["USD", "EUR"]).includes(k); return `<label class="check ${on ? "on" : ""}"><input type="checkbox" value="${k}" ${on ? "checked" : ""} style="display:none">${t}</label>`; }).join("")}</div></div>
        <div class="field"><span class="lbl">Campeonatos</span><div class="checks" id="cl">${LIGAS_OP.map(([k, t]) => { const on = ((s.content || {}).leagues || ["bra.1", "bra.2"]).includes(k); return `<label class="check ${on ? "on" : ""}"><input type="checkbox" value="${k}" ${on ? "checked" : ""} style="display:none">${t}</label>`; }).join("")}</div></div>
        <div class="hint">Para ligar numa TV: Telas → Configurar → Entre os anúncios. A coleta é feita pelo servidor da START PLAY e dividida entre todas as TVs.</div>
        <div id="ct-err"></div><button class="btn" type="submit" id="csv" style="margin-top:8px">Salvar</button></div>
      <div class="box"><h3>Situação das fontes</h3><div id="ct-st">${contentStatus(cst)}</div>
        <button class="btn ghost sm" type="button" id="crf" style="margin-top:10px">${icon("reload")} Atualizar agora</button>
        <div class="hint">Clima: MET Norway (licença CC BY 4.0) · cotação: AwesomeAPI · futebol: placar público da ESPN. Se uma fonte falhar, o cartão dela some sozinho até voltar.</div></div>
    </form>
    <h2 class="sec">Fontes de notícias <span class="sub">(lista fixa; só entra na TV o que passou na validação)</span></h2>
    <div class="filters"><button class="btn ghost sm" id="vall">Validar todas agora</button><span class="sub small">Cada portal é consultado pelo servidor da START PLAY a cada 10 minutos e o resultado é dividido entre todas as TVs.</span></div>
    <div class="card tbl-wrap"><table><thead><tr><th>Editoria</th><th>Portal</th><th>Validação</th><th>Última coleta</th><th>Na TV</th><th></th></tr></thead><tbody>
      ${secs.map(sec => bySec[sec].map((x, i) => { const v = x.validation || {}; return `<tr><td>${i ? "" : `<b>${esc(sec)}</b>`}</td><td>${esc(x.name)}${x.note ? ` <span class="sub small">${esc(x.note)}</span>` : ""}</td>
        <td>${x.validated_at ? (v.ok ? `<span class="chip ok">ok · ${nf(v.manchetes)} manchetes</span>` : `<span class="chip err" title="${esc((v.problemas || []).join("; "))}">falhou</span>`) : `<span class="chip">não validada</span>`}<div class="sub small">${x.validated_at ? fmtDT(x.validated_at) : ""}</div></td>
        <td class="small">${x.ok_at ? `${ago(x.ok_at)}` : "—"}${x.last_error ? `<div class="warn-txt">${esc(x.last_error)}</div>` : ""}</td>
        <td><label class="switch"><input type="checkbox" data-en="${x.id}" ${x.enabled ? "checked" : ""} ${v.ok ? "" : "disabled"}><span class="sl"></span></label></td>
        <td class="num"><button class="btn ghost sm" data-val="${x.id}">Validar</button></td></tr>`; }).join("")).join("")}
    </tbody></table></div>
    <h2 class="sec">App da TV</h2>
    <div class="card pad"><div>Player atual: <b>${esc(state.latest || "?")}</b> · as TVs atualizam sozinhas em até 5 minutos.</div>
      <div class="sub" style="margin-top:6px">Instalar ou atualizar o app no TV Box: no navegador do aparelho, abra <span class="pill">${esc(siteHost())}/startplay.apk</span>. Ao abrir, a TV mostra o <b>código de pareamento</b>; pareie em Telas → Adicionar tela.</div></div>`;
  $("#f-set").addEventListener("submit", async e => {
    e.preventDefault();
    const row = { company: $("#s1").value.trim() || "START PLAY", phone: $("#s2").value.trim() || "", email: $("#s3").value.trim() || null, doc: $("#s4").value.trim() || null,
      city: $("#s5").value.trim() || null, pix: $("#s6").value.trim() || null, promo_text: $("#s7").value.trim(), news_seconds: +$("#s8").value || 40,
      promo_seconds: +$("#s9").value || 10, timezone: $("#s10").value, loop_max: +$("#s11").value || 300 };
    if (row.promo_text.length < 3) { $("#f-err").innerHTML = `<div class="err-box">Escreva a chamada comercial padrão.</div>`; return; }
    $("#sv").disabled = true;
    const { error } = await sb.from("settings").update(row).eq("id", 1);
    $("#sv").disabled = false;
    if (error) { $("#f-err").innerHTML = `<div class="err-box">${esc(friendly(error))}</div>`; return; }
    await need("settings"); toast("Ajustes salvos. As TVs pegam em até 1 minuto.");
  });
  main.querySelector("table").addEventListener("change", async e => {
    const id = e.target.dataset.en; if (!id) return;
    const { error } = await sb.from("news_sources").update({ enabled: e.target.checked }).eq("id", id);
    if (error) { toast(friendly(error), 5000); e.target.checked = !e.target.checked; } else toast(e.target.checked ? "Fonte liberada para as TVs." : "Fonte tirada das TVs.");
  });
  const runVal = async (id, btn) => {
    const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin dark"></span>`;
    try { const r = await validateSource(id); const bad = r.filter(x => !x.ok); toast(bad.length ? `${r.length - bad.length} ok, ${bad.length} com problema: ${bad.map(x => x.nome + " " + x.secao).join(", ")}` : `${r.length === 1 ? "Fonte validada" : r.length + " fontes validadas"}: tudo certo.`, 6000); }
    catch (ex) { toast(friendly(ex), 5000); }
    btn.disabled = false; btn.innerHTML = old; PAGES.ajustes();
  };
  $$("[data-val]").forEach(b => b.addEventListener("click", () => runVal(b.dataset.val, b)));

  // avisos de TV fora do ar
  const alRow = () => {
    const ph = $("#awp").value.replace(/[^\d+]/g, ""), phone = ph ? (ph.startsWith("+") ? ph : "+55" + ph.replace(/^0+/, "")) : null;
    return { wa_on: $("#aw").checked, wa_phone: phone, wa_key: $("#awk").value.trim() || null, mail_on: $("#am").checked,
      mail_to: $("#amt").value.trim() || null, mail_key: $("#amk").value.trim() || null,
      after_min: Math.max(3, Math.min(240, parseInt($("#aa").value, 10) || 10)), notify_back: $("#ab").checked, updated_at: new Date().toISOString() };
  };
  const alErr = t => { $("#al-err").innerHTML = t ? `<div class="err-box" style="margin-top:10px">${esc(t)}</div>` : ""; };
  const saveAl = async () => {
    const r = alRow();
    if (r.wa_on && (!r.wa_phone || !/^\+\d{10,15}$/.test(r.wa_phone))) throw new Error("Confira o número do WhatsApp (ex.: +5565999999999).");
    if (r.wa_on && !r.wa_key) throw new Error("Cole a chave do CallMeBot (veja como pegar logo abaixo).");
    if (r.mail_on && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.mail_to || "")) throw new Error("Confira o e-mail.");
    if (r.mail_on && !r.mail_key) throw new Error("Cole a chave do Resend.");
    const { error } = await sb.from("alert_settings").upsert(Object.assign({ id: 1 }, r)); if (error) throw error;
  };
  $("#f-al").addEventListener("submit", async e => {
    e.preventDefault(); alErr("");
    $("#asv").disabled = true;
    try { await saveAl(); toast("Avisos salvos."); } catch (ex) { alErr(friendly(ex)); }
    $("#asv").disabled = false;
  });
  $("#atest").addEventListener("click", async () => {
    alErr("");
    const b = $("#atest"); b.disabled = true; b.innerHTML = `<span class="spin dark"></span> Enviando…`;
    try {
      await saveAl();
      if (!$("#aw").checked && !$("#am").checked) throw new Error("Ligue o WhatsApp ou o e-mail antes de testar.");
      const { data, error } = await sb.rpc("sf_alert_test"); if (error) throw error;
      if (!data || !data.length) throw new Error("Nenhum canal configurado.");
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 2500));
        const h = await sb.rpc("sf_alert_history", { p_limit: 15 }).then(r => r.data || []);
        if ($("#al-hist")) $("#al-hist").innerHTML = alertHist(h);
        const tests = h.filter(x => x.kind === "test").slice(0, data.length);
        if (tests.length && tests.every(x => x.ok !== null)) {
          const bad = tests.filter(x => !x.ok);
          if (bad.length) alErr(bad.map(x => `${x.channel === "whatsapp" ? "WhatsApp" : "E-mail"}: ${x.error || "falhou"}`).join(" · "));
          else toast("Teste enviado. Confira o WhatsApp/e-mail.", 5000);
          break;
        }
      }
    } catch (ex) { alErr(friendly(ex)); }
    b.disabled = false; b.textContent = "Enviar teste";
  });

  // conteúdo entre os anúncios
  ["#cm", "#cl"].forEach(id => $(id).addEventListener("change", e => { const l = e.target.closest("label"); if (l) l.classList.toggle("on", e.target.checked); }));
  $("#f-ct").addEventListener("submit", async e => {
    e.preventDefault();
    const c = CIDADES.find(x => x[0] === $("#cc").value) || CIDADES[0];
    const content = { city: c[0], lat: c[1], lon: c[2], coins: $$("#cm input:checked").map(i => i.value), leagues: $$("#cl input:checked").map(i => i.value) };
    if (!content.coins.length) content.coins = ["USD"];
    $("#csv").disabled = true;
    const { error } = await sb.from("settings").update({ content }).eq("id", 1);
    $("#csv").disabled = false;
    if (error) { $("#ct-err").innerHTML = `<div class="err-box">${esc(friendly(error))}</div>`; return; }
    await need("settings"); toast("Salvo. As TVs recebem os dados novos em poucos minutos.");
    sb.rpc("sf_content_status", { p_refresh: true });
  });
  $("#crf").addEventListener("click", async () => {
    const b = $("#crf"); b.disabled = true; b.innerHTML = `<span class="spin dark"></span> Buscando…`;
    try {
      const r = await sb.rpc("sf_content_status", { p_refresh: true }); if (r.error) throw r.error;
      await new Promise(x => setTimeout(x, 3500));
      const r2 = await sb.rpc("sf_content_status", { p_refresh: false });
      if ($("#ct-st")) $("#ct-st").innerHTML = contentStatus(r2.data || {});
      toast("Pedido enviado. Os dados chegam em até 1 minuto.", 4000);
    } catch (ex) { toast(friendly(ex), 5000); }
    b.disabled = false; b.innerHTML = `${icon("reload")} Atualizar agora`;
  });
  $("#vall").addEventListener("click", () => runVal("todas", $("#vall")));
};

start();
