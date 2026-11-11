/* START PLAY — cartões que passam entre os anúncios (clima, cotação, futebol).
 * Desenhados num <canvas> do tamanho da área do anúncio: leve para o TV Box e
 * fácil de copiar para a miniatura que o painel mostra.
 * Os dados chegam prontos do servidor (content_cache); aqui só se desenha. */
(function (root) {
  "use strict";
  var FONT = "Roboto, 'Helvetica Neue', Arial, sans-serif";
  var PINK = "#FC0491", BLUE = "#1D02A9", UP = "#2BD576", DOWN = "#FF5A5F", MUTED = "rgba(255,255,255,.62)";
  var DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  var DIAS3 = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  var LIGAS = { "bra.1": "Brasileirão Série A", "bra.2": "Brasileirão Série B", "bra.copa_do_brazil": "Copa do Brasil",
                "conmebol.libertadores": "Libertadores", "conmebol.sudamericana": "Sul-Americana" };
  var MOEDAS = { USD: ["Dólar", "US$"], EUR: ["Euro", "€"], GBP: ["Libra", "£"], ARS: ["Peso argentino", "$"], BTC: ["Bitcoin", "₿"], ETH: ["Ethereum", "Ξ"] };
  var logo = null;
  try { logo = new Image(); logo.src = "logo.png"; } catch (e) {}

  // ---------------------------------------------------------------- dados
  var MAX_AGE = { clima: 6 * 3600e3, cotacao: 4 * 86400e3, jogos: 8 * 3600e3, tabela: 4 * 86400e3 };
  function fresh(d, kind, now) {
    if (!d || !d.ok_at) return false;
    var t = Date.parse(d.ok_at);
    return isFinite(t) && now - t < MAX_AGE[kind];
  }
  // quais cartões dá para mostrar agora, na ordem escolhida para a tela
  function available(content, items, now) {
    content = content || {}; now = now || Date.now();
    var out = [];
    (items || []).forEach(function (it) {
      if (it === "clima" && fresh(content.clima, "clima", now) && content.clima.now) out.push({ kind: "clima", key: "clima" });
      if (it === "cotacao" && fresh(content.cotacao, "cotacao", now) && (content.cotacao.items || []).length) out.push({ kind: "cotacao", key: "cotacao" });
      if (it === "futebol") {
        Object.keys(content).sort().forEach(function (k) {
          var d = content[k];
          if (k.indexOf("jogos:") === 0 && fresh(d, "jogos", now) && (d.games || []).length) out.push({ kind: "jogos", key: k });
        });
        Object.keys(content).sort().forEach(function (k) {
          var d = content[k];
          if (k.indexOf("tabela:") === 0 && fresh(d, "tabela", now) && (d.rows || []).length) out.push({ kind: "tabela", key: k });
        });
      }
    });
    return out;
  }
  function title(spec, content) {
    if (spec.kind === "clima") return "Clima";
    if (spec.kind === "cotacao") return "Cotação";
    var d = (content || {})[spec.key] || {};
    var liga = LIGAS[d.slug || spec.key.split(":")[1]] || "Futebol";
    return (spec.kind === "jogos" ? "Jogos · " : "Classificação · ") + liga;
  }

  // ---------------------------------------------------------------- datas no fuso da loja
  var fmtCache = {};
  function partsAt(ms, tz) {
    var key = tz || "America/Cuiaba";
    try {
      var f = fmtCache[key] || (fmtCache[key] = new Intl.DateTimeFormat("en-US", { timeZone: key, hour12: false,
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" }));
      var p = {}; f.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
      var ymd = p.year + "-" + p.month + "-" + p.day, wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
      return { ymd: ymd, dow: wd, d: +p.day, m: +p.month - 1, hm: (+p.hour % 24 < 10 ? "0" : "") + (+p.hour % 24) + ":" + p.minute };
    } catch (e) {
      var d = new Date(ms);
      return { ymd: d.toISOString().slice(0, 10), dow: d.getDay(), d: d.getDate(), m: d.getMonth(), hm: d.toTimeString().slice(0, 5) };
    }
  }
  function dowOfYmd(ymd) { var p = String(ymd).split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); }

  // ---------------------------------------------------------------- desenho básico
  function font(g, size, weight) { g.font = (weight || 400) + " " + Math.round(size) + "px " + FONT; }
  function text(g, s, x, y, size, weight, color, align, maxW) {
    font(g, size, weight);
    if (maxW) { var w = g.measureText(s).width; if (w > maxW) { size = Math.max(8, size * maxW / w); font(g, size, weight); } }
    g.fillStyle = color || "#fff"; g.textAlign = align || "left"; g.textBaseline = "alphabetic";
    g.fillText(s, x, y);
    return size;
  }
  function rrect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function grad(g, x0, y0, x1, y1, a, b) { var gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; }
  function background(g, W, H) {
    g.fillStyle = grad(g, 0, 0, W, H, "#170A36", "#05050F"); g.fillRect(0, 0, W, H);
    var r1 = g.createRadialGradient(W * 0.92, H * 0.05, 0, W * 0.92, H * 0.05, Math.max(W, H) * 0.6);
    r1.addColorStop(0, "rgba(252,4,145,.30)"); r1.addColorStop(1, "rgba(252,4,145,0)");
    g.fillStyle = r1; g.fillRect(0, 0, W, H);
    var r2 = g.createRadialGradient(W * 0.05, H * 1.0, 0, W * 0.05, H * 1.0, Math.max(W, H) * 0.7);
    r2.addColorStop(0, "rgba(40,20,220,.40)"); r2.addColorStop(1, "rgba(40,20,220,0)");
    g.fillStyle = r2; g.fillRect(0, 0, W, H);
  }
  // cabeçalho: selo colorido + subtítulo; rodapé: fonte e logo
  function header(g, W, u, label, sub, right, rightColor) {
    var x = u * 1.6, y = u * 1.4, h = u * 1.5, narrow = W < u * 30;
    font(g, u * 0.78, 800);
    var lw = g.measureText(label).width + u * 1.4;
    rrect(g, x, y, lw, h, h / 2); g.fillStyle = grad(g, x, 0, x + lw, 0, PINK, "#6A0BC4"); g.fill();
    text(g, label, x + u * 0.7, y + h * 0.7, u * 0.78, 800, "#fff");
    var rw = 0;
    if (right && !narrow) { font(g, u * 0.85, 500); rw = g.measureText(right).width + u * 1.2; }
    if (sub) text(g, sub, x + lw + u * 0.7, y + h * 0.72, u * 0.85, 500, MUTED, "left", W - (x + lw + u * 0.7) - u * 1.6 - rw);
    if (right && !narrow) text(g, right, W - u * 1.6, y + h * 0.72, u * 0.85, 500, rightColor || MUTED, "right");
    if (right && narrow) { text(g, right, x, y + h + u * 1.15, u * 0.8, 600, rightColor || MUTED, "left", W - u * 3.2); return y + h + u * 1.3; }
    return y + h;
  }
  function footer(g, W, H, u, src) {
    if (src) text(g, src, u * 1.6, H - u * 1.0, u * 0.6, 400, "rgba(255,255,255,.45)", "left", W * 0.6);
    if (logo && logo.complete && logo.naturalWidth) {
      var lh = u * 0.95, lw = lh * logo.naturalWidth / logo.naturalHeight;
      g.globalAlpha = 0.85; g.drawImage(logo, W - u * 1.6 - lw, H - u * 1.0 - lh * 0.82, lw, lh); g.globalAlpha = 1;
    }
  }
  function money(v, dec) {
    var s = Number(v).toFixed(dec), p = s.split(".");
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return p.length > 1 ? p[0] + "," + p[1] : p[0];
  }

  // ---------------------------------------------------------------- ícones do tempo
  function sun(g, x, y, r) {
    var gl = g.createRadialGradient(x, y, r * 0.2, x, y, r * 1.6); gl.addColorStop(0, "rgba(255,200,61,.55)"); gl.addColorStop(1, "rgba(255,200,61,0)");
    g.fillStyle = gl; g.beginPath(); g.arc(x, y, r * 1.6, 0, 7); g.fill();
    g.strokeStyle = "#FFC83D"; g.lineWidth = r * 0.16; g.lineCap = "round";
    for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 1.25, y + Math.sin(a) * r * 1.25); g.lineTo(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.6); g.stroke(); }
    g.fillStyle = grad(g, x - r, y - r, x + r, y + r, "#FFE07A", "#FFAA1F"); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  function moon(g, x, y, r) {
    g.fillStyle = "#E9E6FF"; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.globalCompositeOperation = "destination-out"; g.beginPath(); g.arc(x + r * 0.55, y - r * 0.35, r * 0.85, 0, 7); g.fill();
    g.globalCompositeOperation = "source-over";
  }
  function cloud(g, x, y, w, dark) {
    var h = w * 0.55;
    g.fillStyle = dark ? grad(g, 0, y - h, 0, y + h * 0.4, "#B9C1D9", "#7F89A8") : grad(g, 0, y - h, 0, y + h * 0.4, "#FFFFFF", "#D5DBEA");
    g.beginPath();
    g.arc(x - w * 0.25, y, h * 0.42, 0, 7); g.arc(x + w * 0.02, y - h * 0.28, h * 0.55, 0, 7); g.arc(x + w * 0.28, y - h * 0.02, h * 0.42, 0, 7);
    g.fill();
    rrect(g, x - w * 0.45, y - h * 0.05, w * 0.9, h * 0.45, h * 0.22); g.fill();
  }
  function weatherIcon(g, code, x, y, s) {
    code = String(code || "cloudy");
    var night = /_night$/.test(code), base = code.replace(/_(day|night|polartwilight)$/, "");
    var celestial = function (cx, cy, r) { if (night) moon(g, cx, cy, r); else sun(g, cx, cy, r); };
    if (base === "clearsky") { celestial(x, y, s * 0.32); return; }
    if (base === "fair") { celestial(x - s * 0.08, y - s * 0.08, s * 0.28); cloud(g, x + s * 0.16, y + s * 0.2, s * 0.5); return; }
    if (base === "partlycloudy") { celestial(x - s * 0.14, y - s * 0.14, s * 0.26); cloud(g, x + s * 0.06, y + s * 0.12, s * 0.75); return; }
    if (base === "fog") {
      cloud(g, x, y - s * 0.1, s * 0.8, true);
      g.strokeStyle = "rgba(220,226,240,.85)"; g.lineWidth = s * 0.05; g.lineCap = "round";
      for (var f = 0; f < 3; f++) { g.beginPath(); g.moveTo(x - s * 0.36 + f * s * 0.05, y + s * 0.2 + f * s * 0.1); g.lineTo(x + s * 0.36 - f * s * 0.05, y + s * 0.2 + f * s * 0.1); g.stroke(); }
      return;
    }
    var rain = /rain|sleet|snow/.test(base), thunder = /thunder/.test(base), heavy = /heavy/.test(base), light = /light/.test(base), showers = /showers/.test(base);
    if (showers && !thunder) celestial(x - s * 0.22, y - s * 0.24, s * 0.2);
    cloud(g, x, y - s * 0.08, s * 0.85, rain || thunder || base === "cloudy");
    if (base === "cloudy") { cloud(g, x + s * 0.18, y + s * 0.06, s * 0.6, false); return; }
    if (rain) {
      var n = heavy ? 5 : light ? 2 : 3;
      g.strokeStyle = /snow/.test(base) ? "#FFFFFF" : "#5DB8FF"; g.lineWidth = s * 0.055; g.lineCap = "round";
      for (var i = 0; i < n; i++) {
        var dx = x - s * 0.24 + i * (s * 0.48 / Math.max(1, n - 1)) - (n === 1 ? 0 : 0);
        g.beginPath(); g.moveTo(dx, y + s * 0.2); g.lineTo(dx - s * 0.06, y + s * 0.36); g.stroke();
      }
    }
    if (thunder) {
      g.fillStyle = "#FFD23F"; g.beginPath();
      g.moveTo(x + s * 0.02, y + s * 0.12); g.lineTo(x - s * 0.1, y + s * 0.32); g.lineTo(x, y + s * 0.32);
      g.lineTo(x - s * 0.06, y + s * 0.48); g.lineTo(x + s * 0.14, y + s * 0.24); g.lineTo(x + s * 0.03, y + s * 0.24); g.lineTo(x + s * 0.1, y + s * 0.12);
      g.closePath(); g.fill();
    }
  }
  function weatherText(code) {
    var b = String(code || "").replace(/_(day|night|polartwilight)$/, "");
    var t = { clearsky: "Céu limpo", fair: "Poucas nuvens", partlycloudy: "Parcialmente nublado", cloudy: "Nublado", fog: "Neblina",
              lightrain: "Chuva fraca", rain: "Chuva", heavyrain: "Chuva forte",
              lightrainshowers: "Pancadas de chuva fraca", rainshowers: "Pancadas de chuva", heavyrainshowers: "Pancadas de chuva forte",
              lightrainandthunder: "Chuva fraca com trovoadas", rainandthunder: "Chuva com trovoadas", heavyrainandthunder: "Chuva forte com trovoadas",
              lightrainshowersandthunder: "Pancadas com trovoadas", rainshowersandthunder: "Pancadas com trovoadas", heavyrainshowersandthunder: "Temporal com trovoadas" }[b];
    if (t) return t;
    if (/thunder/.test(b)) return "Trovoadas";
    if (/snow|sleet/.test(b)) return "Neve";
    if (/rain/.test(b)) return "Chuva";
    return "Tempo nublado";
  }

  // ---------------------------------------------------------------- cartões
  function drawClima(g, W, H, u, d, o) {
    var now = d.now || {}, days = d.days || [], p = partsAt(Date.now(), o.tz);
    var today = days.filter(function (x) { return x.d === p.ymd; })[0] || days[0] || {};
    var top = header(g, W, u, "CLIMA", (o.city || "Cuiabá") + " · agora", DIAS[p.dow] + ", " + p.d + " de " + MESES[p.m]);
    var vertical = H > W;
    var nextDays = days.filter(function (x) { return x.d > p.ymd; }).slice(0, 3);
    if (!vertical) {
      var cy = top + (H - top - u * 2.2) * 0.48, iconS = Math.min(H * 0.42, W * 0.22);
      weatherIcon(g, now.sym, u * 1.6 + iconS * 0.55, cy, iconS);
      var tx = u * 1.6 + iconS * 1.12;
      var big = Math.min(H * 0.30, W * 0.13);
      text(g, (now.t != null ? now.t : "–") + "°", tx, cy + big * 0.32, big, 900, "#fff");
      text(g, weatherText(now.sym), tx, cy + big * 0.32 + u * 1.6, u * 1.15, 700, "#fff", "left", W * 0.5 - tx);
      text(g, "Máx " + (today.max != null ? today.max : "–") + "°  ·  Mín " + (today.min != null ? today.min : "–") + "°" +
              (now.hum != null ? "  ·  Umidade " + now.hum + "%" : ""), tx, cy + big * 0.32 + u * 2.8, u * 0.85, 500, MUTED, "left", W * 0.5 - tx);
      // próximos dias
      var x0 = W * 0.54, cw = (W - x0 - u * 1.6 - u * 0.8 * 2) / 3, ch = (H - top) * 0.62, y0 = top + (H - top - ch) / 2 - u * 0.4;
      nextDays.forEach(function (x, i) {
        var cx = x0 + i * (cw + u * 0.8);
        rrect(g, cx, y0, cw, ch, u * 0.8); g.fillStyle = "rgba(255,255,255,.07)"; g.fill();
        text(g, DIAS3[dowOfYmd(x.d)], cx + cw / 2, y0 + u * 1.7, u * 1.0, 700, MUTED, "center");
        weatherIcon(g, x.sym, cx + cw / 2, y0 + ch * 0.45, Math.min(cw * 0.62, ch * 0.36));
        text(g, x.max + "°", cx + cw / 2, y0 + ch - u * 1.6, u * 1.6, 900, "#fff", "center");
        text(g, x.min + "°", cx + cw / 2, y0 + ch - u * 0.55, u * 0.95, 500, MUTED, "center");
      });
    } else {
      var iconV = W * 0.42, cyv = top + iconV * 0.75;
      weatherIcon(g, now.sym, W * 0.5, cyv, iconV);
      var bigV = W * 0.28;
      text(g, (now.t != null ? now.t : "–") + "°", W * 0.5, cyv + iconV * 0.55 + bigV * 0.7, bigV, 900, "#fff", "center");
      var ty = cyv + iconV * 0.55 + bigV * 0.7 + u * 2;
      text(g, weatherText(now.sym), W * 0.5, ty, u * 1.3, 700, "#fff", "center", W - u * 3);
      text(g, "Máx " + today.max + "°  ·  Mín " + today.min + "°", W * 0.5, ty + u * 1.6, u * 0.95, 500, MUTED, "center");
      var cwv = (W - u * 3.2 - u * 1.6) / 3, chv = Math.min(H * 0.24, cwv * 1.6), y0v = ty + u * 2.8;
      nextDays.forEach(function (x, i) {
        var cx = u * 1.6 + i * (cwv + u * 0.8);
        rrect(g, cx, y0v, cwv, chv, u * 0.8); g.fillStyle = "rgba(255,255,255,.07)"; g.fill();
        text(g, DIAS3[dowOfYmd(x.d)], cx + cwv / 2, y0v + u * 1.6, u * 0.95, 700, MUTED, "center");
        weatherIcon(g, x.sym, cx + cwv / 2, y0v + chv * 0.45, cwv * 0.55);
        text(g, x.max + "° / " + x.min + "°", cx + cwv / 2, y0v + chv - u * 0.8, u * 1.0, 800, "#fff", "center");
      });
    }
    footer(g, W, H, u, "Previsão: MET Norway (CC BY 4.0)" + (d.ok_at ? " · atualizado às " + partsAt(Date.parse(d.ok_at), o.tz).hm : ""));
  }

  function drawCotacao(g, W, H, u, d, o) {
    var items = (d.items || []).slice(0, 4), p = partsAt(Date.now(), o.tz);
    var top = header(g, W, u, "COTAÇÃO", "Valor em reais", DIAS[p.dow] + ", " + p.d + " de " + MESES[p.m]);
    var vertical = H > W, n = items.length || 1;
    var areaH = H - top - u * 3.2, rowH = Math.min(areaH / n - u * 0.6, vertical ? H * 0.16 : H * 0.22);
    var y = top + u * 1.0 + (areaH - n * (rowH + u * 0.6)) / 2, x = u * 1.6, w = W - u * 3.2;
    items.forEach(function (it) {
      rrect(g, x, y, w, rowH, u * 0.9); g.fillStyle = "rgba(255,255,255,.07)"; g.fill();
      var m = MOEDAS[it.code] || [it.name || it.code, it.code], r = rowH * 0.34, cx = x + u * 1.0 + r, cy = y + rowH / 2;
      g.fillStyle = grad(g, cx - r, cy - r, cx + r, cy + r, PINK, BLUE); g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
      text(g, m[1], cx, cy + r * 0.32, r * (m[1].length > 2 ? 0.7 : 0.95), 800, "#fff", "center");
      var nx = cx + r + u * 1.0, dec = it.bid >= 1000 ? 0 : 2;
      var up = (it.pct || 0) >= 0, pct = it.pct == null ? "" : (up ? "▲ " : "▼ ") + money(Math.abs(it.pct || 0), 2) + "%";
      if (!vertical) {
        text(g, m[0], nx, cy - rowH * 0.04, Math.min(rowH * 0.3, u * 1.5), 800, "#fff", "left", x + w * 0.42 - nx);
        text(g, it.code + " → BRL", nx, cy + rowH * 0.26, Math.min(rowH * 0.17, u * 0.8), 500, MUTED);
        text(g, "R$ " + money(it.bid, dec), x + w - u * 9.5, cy + rowH * 0.12, Math.min(rowH * 0.42, u * 2.2), 900, "#fff", "right", w * 0.36);
        text(g, pct, x + w - u * 1.0, cy + rowH * 0.1, Math.min(rowH * 0.24, u * 1.2), 800, up ? UP : DOWN, "right");
      } else {
        text(g, m[0], nx, cy - rowH * 0.06, Math.min(rowH * 0.26, u * 1.3), 800, "#fff", "left", x + w * 0.5 - nx - u * 0.6);
        text(g, it.code + " → BRL", nx, cy + rowH * 0.22, Math.min(rowH * 0.15, u * 0.75), 500, MUTED, "left", x + w * 0.5 - nx - u * 0.6);
        text(g, "R$ " + money(it.bid, dec), x + w - u * 1.0, cy + rowH * 0.02, Math.min(rowH * 0.3, u * 1.6), 900, "#fff", "right", w * 0.42);
        text(g, pct, x + w - u * 1.0, cy + rowH * 0.3, Math.min(rowH * 0.17, u * 0.85), 800, up ? UP : DOWN, "right");
      }
      y += rowH + u * 0.6;
    });
    var at0 = items[0] && items[0].at ? String(items[0].at) : "";
    if (d.src === "frankfurter") footer(g, W, H, u, "Fonte: Banco Central Europeu (Frankfurter)" + (at0 ? " · fechamento de " + at0.slice(8, 10) + "/" + at0.slice(5, 7) : ""));
    else footer(g, W, H, u, "Fonte: AwesomeAPI" + (at0.length > 15 ? " · cotação das " + at0.slice(11, 16) : ""));
  }

  function hexColor(c) { return /^[0-9a-f]{6}$/i.test(c || "") && !/^(000000|ffffff)$/i.test(c) ? "#" + c : "rgba(255,255,255,.35)"; }
  function drawJogos(g, W, H, u, d, o) {
    var games = (d.games || []).slice(0, H > W ? 8 : 6), liga = LIGAS[d.slug] || d.league || "Futebol";
    var dayTxt = "";
    if (games.length) { var p0 = partsAt(Date.parse(games[0].at), o.tz); dayTxt = DIAS[p0.dow] + ", " + (p0.d < 10 ? "0" : "") + p0.d + "/" + (p0.m < 9 ? "0" : "") + (p0.m + 1); }
    var live = games.some(function (x) { return x.state === "in"; });
    var top = header(g, W, u, "FUTEBOL", liga, live ? "● AO VIVO" : dayTxt, live ? "#FF5AA8" : null);
    var vertical = H > W;
    var n = Math.max(1, games.length), areaH = H - top - u * 3.0, rowH = Math.min(areaH / n - u * 0.4, u * (vertical ? 4.2 : 3.2));
    var y = top + u * 0.9 + (areaH - n * (rowH + u * 0.4)) / 2, x = u * 1.6, w = W - u * 3.2, mid = x + w * 0.58;
    games.forEach(function (gm) {
      rrect(g, x, y, w, rowH, u * 0.7); g.fillStyle = gm.state === "in" ? "rgba(252,4,145,.16)" : "rgba(255,255,255,.07)"; g.fill();
      var cy = y + rowH / 2, fs = Math.min(rowH * 0.36, u * 1.25);
      if (vertical) { cy = y + rowH * 0.62; fs = Math.min(rowH * 0.26, u * 1.15); }
      // situação
      var st, stc = MUTED;
      if (gm.state === "in") { st = gm.clock && gm.clock !== "0'" ? gm.clock : "AO VIVO"; stc = "#FF5AA8"; }
      else if (gm.state === "post") st = "Fim";
      else { var pt = partsAt(Date.parse(gm.at), o.tz); st = (pt.ymd !== partsAt(Date.now(), o.tz).ymd ? DIAS3[pt.dow] + " " : "") + pt.hm; }
      if (vertical) text(g, st, x + w / 2, y + rowH * 0.27, fs * 0.72, 800, stc, "center", w * 0.6);
      else text(g, st, x + u * 1.0, cy + fs * 0.36, fs * 0.85, 800, stc, "left", w * 0.17);
      var h = gm.home || {}, a = gm.away || {}, sw = w * (vertical ? 0.2 : 0.11);
      if (vertical) mid = x + w / 2;
      var sx = mid - sw / 2, left0 = vertical ? x + u * 0.8 : x + w * 0.2;
      var showScore = gm.state !== "pre";
      // placar
      rrect(g, sx, cy - Math.min(rowH * 0.32, fs * 1.0), sw, Math.min(rowH * 0.64, fs * 2.0), u * 0.5); g.fillStyle = showScore ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.06)"; g.fill();
      text(g, showScore ? (h.score || "0") + " × " + (a.score || "0") : "×", mid, cy + fs * 0.4, fs * 1.1, 900, "#fff", "center", sw * 0.9);
      // times
      g.fillStyle = hexColor(h.color); g.beginPath(); g.arc(sx - u * 0.9, cy, Math.min(rowH * 0.12, u * 0.4), 0, 7); g.fill();
      text(g, h.name || h.abbr || "", sx - u * 1.6, cy + fs * 0.36, fs, 700, "#fff", "right", sx - u * 1.6 - left0);
      g.fillStyle = hexColor(a.color); g.beginPath(); g.arc(sx + sw + u * 0.9, cy, Math.min(rowH * 0.12, u * 0.4), 0, 7); g.fill();
      text(g, a.name || a.abbr || "", sx + sw + u * 1.6, cy + fs * 0.36, fs, 700, "#fff", "left", x + w - u * 1.0 - (sx + sw + u * 1.6));
      y += rowH + u * 0.4;
    });
    footer(g, W, H, u, "Placar: ESPN" + (d.ok_at ? " · atualizado às " + partsAt(Date.parse(d.ok_at), o.tz).hm : ""));
  }

  function drawTabela(g, W, H, u, d, o) {
    var vertical = H > W, rows = (d.rows || []).slice(0, vertical ? 12 : 10), liga = LIGAS[(o.key || "").split(":")[1]] || "Brasileirão";
    var top = header(g, W, u, "CLASSIFICAÇÃO", liga + (d.league && /^\d{4}$/.test(d.league) ? " " + d.league : ""), "");
    var cols = vertical ? 1 : 2, per = Math.ceil(rows.length / cols), areaH = H - top - u * 3.4;
    var rowH = Math.min(areaH / (per + 1), u * 2.6), colW = (W - u * 3.2 - (cols - 1) * u * 1.2) / cols;
    for (var c = 0; c < cols; c++) {
      var x = u * 1.6 + c * (colW + u * 1.2), y = top + u * 1.2, fs = Math.min(rowH * 0.42, u * 1.1);
      text(g, "P", x + colW - colW * 0.30, y + fs, fs * 0.8, 700, MUTED, "center");
      text(g, "J", x + colW - colW * 0.18, y + fs, fs * 0.8, 700, MUTED, "center");
      text(g, "SG", x + colW - colW * 0.06, y + fs, fs * 0.8, 700, MUTED, "center");
      y += rowH * 0.9;
      rows.slice(c * per, (c + 1) * per).forEach(function (r) {
        rrect(g, x, y, colW, rowH * 0.86, u * 0.5); g.fillStyle = r.pos <= 4 ? "rgba(70,90,255,.20)" : r.pos >= 17 ? "rgba(255,80,80,.14)" : "rgba(255,255,255,.06)"; g.fill();
        var cy = y + rowH * 0.43 + fs * 0.36;
        text(g, String(r.pos), x + u * 1.1, cy, fs, 900, r.pos <= 4 ? "#9DB0FF" : "#fff", "center");
        text(g, r.name || r.abbr, x + u * 2.2, cy, fs, 700, "#fff", "left", colW * 0.56);
        text(g, String(r.pts), x + colW - colW * 0.30, cy, fs, 900, "#fff", "center");
        text(g, String(r.pj), x + colW - colW * 0.18, cy, fs * 0.9, 500, MUTED, "center");
        text(g, (r.sg > 0 ? "+" : "") + r.sg, x + colW - colW * 0.06, cy, fs * 0.9, 500, MUTED, "center");
        y += rowH;
      });
    }
    footer(g, W, H, u, "Fonte: ESPN" + (d.ok_at ? " · atualizado às " + partsAt(Date.parse(d.ok_at), o.tz).hm : ""));
  }

  // desenha o cartão no canvas (já com largura/altura definidas)
  function draw(canvas, spec, content, o) {
    o = o || {}; o.key = spec.key;
    var g = canvas.getContext("2d"), W = canvas.width, H = canvas.height, u = Math.min(W, H) / 20;
    if (H > W) u = W / 22;
    background(g, W, H);
    var d = (content || {})[spec.key] || {};
    if (spec.kind === "clima") drawClima(g, W, H, u, d, o);
    else if (spec.kind === "cotacao") drawCotacao(g, W, H, u, d, o);
    else if (spec.kind === "jogos") drawJogos(g, W, H, u, d, o);
    else if (spec.kind === "tabela") drawTabela(g, W, H, u, d, o);
  }

  root.SPCards = { available: available, draw: draw, title: title, weatherText: weatherText };
})(typeof window !== "undefined" ? window : globalThis);
