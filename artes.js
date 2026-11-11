/* START PLAY — criador de artes do painel.
 * Modelos prontos (oferta, destaque, lista de preços, aviso/evento, marca) em
 * 1920×1080 ou 1080×1920, com foto, logo, preço, selo e contatos.
 * O resultado vira um anúncio comum (imagem), e os dados ficam guardados no
 * anúncio para editar depois. */
(function () {
  "use strict";
  var BASE = new URL("vendor/fonts/", document.currentScript ? document.currentScript.src : location.href).href;
  var TITLE = "Anton", BODY = "Montserrat";

  var PALETAS = [
    { id: "promo", nome: "Promoção", bg1: "#E3161B", bg2: "#7E0306", acc: "#FFD400", accT: "#1A1A1A", txt: "#FFFFFF" },
    { id: "start", nome: "START PLAY", bg1: "#FC0491", bg2: "#1D02A9", acc: "#FFD23F", accT: "#1A1A1A", txt: "#FFFFFF" },
    { id: "fresco", nome: "Fresco", bg1: "#11954A", bg2: "#053B22", acc: "#FFE14D", accT: "#123018", txt: "#FFFFFF" },
    { id: "oceano", nome: "Oceano", bg1: "#0A66D8", bg2: "#02275C", acc: "#FF9500", accT: "#FFFFFF", txt: "#FFFFFF" },
    { id: "sabor", nome: "Saboroso", bg1: "#F2711C", bg2: "#8A2A08", acc: "#FFF1D6", accT: "#7A2408", txt: "#FFFFFF" },
    { id: "elegante", nome: "Elegante", bg1: "#24242A", bg2: "#060607", acc: "#D9B45A", accT: "#141414", txt: "#FFFFFF" },
    { id: "claro", nome: "Claro", bg1: "#FFFFFF", bg2: "#EEF1F6", acc: "#E4002B", accT: "#FFFFFF", txt: "#14161C" }
  ];
  var MODELOS = [
    { id: "oferta", nome: "Oferta", desc: "Foto do produto, preço grande e selo" },
    { id: "destaque", nome: "Destaque", desc: "Foto em tela cheia com o texto por cima" },
    { id: "lista", nome: "Lista de preços", desc: "Cardápio ou tabela com até 8 itens" },
    { id: "aviso", nome: "Aviso / evento", desc: "Texto grande, data e horário" },
    { id: "marca", nome: "Marca", desc: "Logo, slogan, serviços e contatos" }
  ];
  var EXEMPLO = { tpl: "oferta", orient: "h", pal: "promo", selo: "OFERTA", titulo: "Pizza grande", subtitulo: "Qualquer sabor tradicional · Massa artesanal",
                  preco: "49,90", preco_de: "69,90", itens: "Pizza grande - 49,90\nPizza média - 39,90\nRefrigerante 2 L - 12,00", info: "", whatsapp: "(65) 99999-9999", instagram: "@sualoja", endereco: "" };

  // ------------------------------------------------------------------ fontes
  var fontsP = null;
  function loadFonts() {
    if (fontsP) return fontsP;
    var list = [[TITLE, "anton.woff2", "400"], [BODY, "montserrat-500.woff2", "500"], [BODY, "montserrat-700.woff2", "700"],
                [BODY, "montserrat-800.woff2", "800"], [BODY, "montserrat-900.woff2", "900"]];
    fontsP = Promise.all(list.map(function (f) {
      var ff = new FontFace(f[0], "url(" + BASE + f[1] + ")", { weight: f[2] });
      return ff.load().then(function (x) { document.fonts.add(x); }, function () {});
    }));
    return fontsP;
  }

  // ------------------------------------------------------------------ texto
  function setFont(g, fam, w, size) { g.font = w + " " + Math.round(size) + "px \"" + fam + "\", Arial, sans-serif"; }
  function wrap(g, text, maxW) {
    var out = [];
    String(text || "").split(/\n/).forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean), line = "";
      words.forEach(function (w) {
        var t = line ? line + " " + w : w;
        if (g.measureText(t).width <= maxW || !line) line = t; else { out.push(line); line = w; }
      });
      if (line) out.push(line);
    });
    return out;
  }
  // maior tamanho em que o texto cabe em maxLines linhas de largura maxW e altura total maxH
  function fit(g, text, fam, w, maxW, maxSize, minSize, maxLines, lh, maxH) {
    lh = lh || 1.05;
    for (var size = maxSize; size >= minSize; size *= 0.94) {
      setFont(g, fam, w, size);
      var lines = wrap(g, text, maxW);
      var tooWide = lines.some(function (l) { return g.measureText(l).width > maxW; });
      if (lines.length <= maxLines && !tooWide && (!maxH || lines.length * size * lh <= maxH)) return { size: size, lines: lines, lh: lh };
    }
    setFont(g, fam, w, minSize);
    var ls = wrap(g, text, maxW).slice(0, maxLines);
    return { size: minSize, lines: ls, lh: lh };
  }
  function lines(g, f, fam, w, x, y, color, align) {
    setFont(g, fam, w, f.size); g.fillStyle = color; g.textAlign = align || "left"; g.textBaseline = "alphabetic";
    f.lines.forEach(function (l, i) { g.fillText(l, x, y + f.size * 0.86 + i * f.size * f.lh); });
    return y + f.lines.length * f.size * f.lh;
  }
  function rrect(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function pill(g, text, x, y, size, bg, color, align) {
    setFont(g, BODY, 900, size);
    var w = g.measureText(text).width + size * 1.4, h = size * 1.75, x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    rrect(g, x0, y, w, h, h / 2); g.fillStyle = bg; g.fill();
    g.fillStyle = color; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(text, x0 + size * 0.7, y + h / 2 + size * 0.04);
    g.textBaseline = "alphabetic";
    return { w: w, h: h, x: x0 };
  }

  // ------------------------------------------------------------------ preço
  function parsePrice(s) {
    var t = String(s || "").replace(/R\$\s*/i, "").trim();
    var m = /^(\d{1,3}(?:[.\s]\d{3})*|\d+)(?:[,.](\d{1,2}))?$/.exec(t);
    if (!m) return null;
    var inteiro = m[1].replace(/[.\s]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return { i: inteiro, c: m[2] ? (m[2] + "0").slice(0, 2) : "00" };
  }
  // desenha "R$ 49,90" no estilo de varejo (centavos menores, no alto); devolve a largura
  function drawPrice(g, s, x, y, h, color, align, maxW) {
    var p = parsePrice(s);
    if (!p) { var f = fit(g, s, TITLE, 400, maxW, h, h * 0.3, 1); setFont(g, TITLE, 400, f.size); var tw = g.measureText(s).width;
      var xs = align === "center" ? x - tw / 2 : align === "right" ? x - tw : x; g.fillStyle = color; g.textAlign = "left"; g.fillText(s, xs, y + f.size * 0.86); return tw; }
    for (var k = 1; k > 0.2; k *= 0.94) {
      var big = h * k, rs = big * 0.26, cs = big * 0.42;
      setFont(g, BODY, 900, rs); var wr = g.measureText("R$").width + rs * 0.35;
      setFont(g, TITLE, 400, big); var wi = g.measureText(p.i).width;
      setFont(g, TITLE, 400, cs); var wc = g.measureText("," + p.c).width;
      var total = wr + wi + wc;
      if (total <= maxW) break;
    }
    var x0 = align === "center" ? x - total / 2 : align === "right" ? x - total : x, base = y + big * 0.9;
    g.fillStyle = color; g.textAlign = "left"; g.textBaseline = "alphabetic";
    setFont(g, BODY, 900, rs); g.fillText("R$", x0, base - big * 0.62);
    setFont(g, TITLE, 400, big); g.fillText(p.i, x0 + wr, base);
    setFont(g, TITLE, 400, cs); g.fillText("," + p.c, x0 + wr + wi, base - big * 0.45);
    return total;
  }
  function oldPrice(g, s, x, y, size, color, align) {
    var p = parsePrice(s), t = "De R$ " + (p ? p.i + "," + p.c : s);
    setFont(g, BODY, 700, size); g.fillStyle = color; g.textAlign = align || "left"; g.globalAlpha = 0.85;
    g.fillText(t, x, y + size * 0.86);
    var w = g.measureText(t).width, x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    setFont(g, BODY, 700, size); var dw = g.measureText("De ").width;
    g.fillRect(x0 + dw, y + size * 0.52, w - dw, Math.max(2, size * 0.09));
    g.globalAlpha = 1;
    return w;
  }

  // ------------------------------------------------------------------ imagens
  function cover(g, img, x, y, w, h, r) {
    var iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight; if (!iw || !ih) return;
    var s = Math.max(w / iw, h / ih), dw = iw * s, dh = ih * s;
    g.save(); rrect(g, x, y, w, h, r || 0); g.clip(); g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); g.restore();
  }
  function contain(g, img, x, y, w, h, align) {
    var iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight; if (!iw || !ih) return { w: 0, h: 0 };
    var s = Math.min(w / iw, h / ih), dw = iw * s, dh = ih * s;
    var dx = align === "left" ? x : align === "right" ? x + w - dw : x + (w - dw) / 2;
    g.drawImage(img, dx, y + (h - dh) / 2, dw, dh);
    return { w: dw, h: dh, x: dx };
  }
  function grad(g, x0, y0, x1, y1, a, b) { var gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; }
  function hexA(hex, a) { var h = String(hex).replace("#", ""); if (h.length === 3) h = h.replace(/./g, "$&$&");
    return "rgba(" + parseInt(h.slice(0, 2), 16) + "," + parseInt(h.slice(2, 4), 16) + "," + parseInt(h.slice(4, 6), 16) + "," + a + ")"; }

  // ------------------------------------------------------------------ partes comuns
  function background(g, W, H, P) {
    g.fillStyle = grad(g, 0, 0, W, H, P.bg1, P.bg2); g.fillRect(0, 0, W, H);
    var m = Math.max(W, H);
    g.fillStyle = hexA(P.acc, P.id === "claro" ? 0.08 : 0.12);
    g.beginPath(); g.arc(W * 0.95, H * 0.05, m * 0.32, 0, 7); g.fill();
    g.fillStyle = hexA("#000000", P.id === "claro" ? 0.03 : 0.12);
    g.beginPath(); g.arc(W * 0.02, H * 1.0, m * 0.38, 0, 7); g.fill();
  }
  function contacts(d) {
    var out = [];
    if (d.whatsapp) out.push(["wa", d.whatsapp]);
    if (d.instagram) out.push(["ig", d.instagram.charAt(0) === "@" ? d.instagram : "@" + d.instagram]);
    if (d.endereco) out.push(["pin", d.endereco]);
    return out;
  }
  function glyph(g, kind, x, cy, s, color) {
    g.save(); g.strokeStyle = color; g.fillStyle = color; g.lineWidth = Math.max(2, s * 0.11); g.lineCap = "round"; g.lineJoin = "round";
    if (kind === "wa") {      // balão com telefone
      g.beginPath(); g.arc(x + s / 2, cy, s * 0.45, 0.65 * Math.PI, 2.6 * Math.PI); g.lineTo(x + s * 0.08, cy + s * 0.48); g.closePath(); g.stroke();
      g.beginPath(); g.arc(x + s / 2, cy, s * 0.17, 0, 7); g.fill();
    } else if (kind === "ig") {
      rrect(g, x + s * 0.06, cy - s * 0.44, s * 0.88, s * 0.88, s * 0.26); g.stroke();
      g.beginPath(); g.arc(x + s / 2, cy, s * 0.2, 0, 7); g.stroke();
      g.beginPath(); g.arc(x + s * 0.73, cy - s * 0.23, s * 0.05, 0, 7); g.fill();
    } else {                   // marcador de local
      g.beginPath(); g.arc(x + s / 2, cy - s * 0.12, s * 0.3, Math.PI * 0.85, Math.PI * 2.15); g.lineTo(x + s / 2, cy + s * 0.46); g.closePath(); g.stroke();
      g.beginPath(); g.arc(x + s / 2, cy - s * 0.12, s * 0.1, 0, 7); g.fill();
    }
    g.restore();
  }
  // linha de contatos; devolve a largura
  function contactRow(g, list, x, cy, size, color, maxW, align) {
    if (!list.length) return 0;
    setFont(g, BODY, 700, size);
    var gap = size * 1.4, ic = size * 1.15, parts = list.map(function (c) { return { k: c[0], t: c[1], w: ic + size * 0.45 + g.measureText(c[1]).width }; });
    var total = parts.reduce(function (a, p) { return a + p.w; }, 0) + gap * (parts.length - 1);
    if (total > maxW && size > 12) return contactRow(g, list, x, cy, size * 0.92, color, maxW, align);
    var px = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
    parts.forEach(function (p) {
      glyph(g, p.k, px, cy, ic, color);
      setFont(g, BODY, 700, size); g.fillStyle = color; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(p.t, px + ic + size * 0.45, cy + size * 0.03);
      px += p.w + gap;
    });
    g.textBaseline = "alphabetic";
    return total;
  }
  function placeLogo(g, logo, x, y, w, h, align, P) {
    if (!logo) return null;
    return contain(g, logo, x, y, w, h, align);
  }

  // ------------------------------------------------------------------ modelos
  function tOferta(g, W, H, d, P, img) {
    var v = H > W, u = Math.min(W, H) / 100, m = 6 * u;
    background(g, W, H, P);
    var foto = img.foto, logo = img.logo;
    var tx, ty, tw, bottom = H - m;
    if (!v) {
      if (foto) {
        g.fillStyle = hexA(P.acc, 0.9); g.beginPath(); g.arc(W * 0.27, H * 0.52, H * 0.44, 0, 7); g.fill();
        cover(g, foto, m, m, W * 0.48 - m, H - 2 * m, 4 * u);
        tx = W * 0.53; tw = W - tx - m;
      } else { tx = m; tw = W - 2 * m; }
      ty = m;
    } else {
      if (foto) { cover(g, foto, m, m, W - 2 * m, H * 0.44, 4 * u); ty = H * 0.44 + m * 1.6; } else ty = m * 1.4;
      tx = m; tw = W - 2 * m;
    }
    // rodapé: logo + contatos
    var cts = contacts(d), footH = (logo || cts.length) ? 9 * u : 0;
    var footY = bottom - footH;
    if (logo || cts.length) {
      var lw = logo ? placeLogo(g, logo, tx, footY + u, (v ? 26 : 18) * u, footH - 2 * u, "left", P) : null;
      contactRow(g, cts, tx + tw, footY + footH / 2, 3.1 * u, P.txt, tw - (lw ? lw.w + 3 * u : 0), "right");
    }
    var y = ty;
    if (d.selo) { var pl = pill(g, d.selo.toUpperCase(), tx, y, 3.6 * u, P.acc, P.accT); y += pl.h + 2.4 * u; }
    var avail = footY - y - 2 * u;
    var hasPrice = !!d.preco, priceH = hasPrice ? Math.min(avail * 0.42, (v ? 22 : 24) * u) : 0, oldH = d.preco_de ? 4.4 * u : 0;
    var tf = fit(g, d.titulo || "", TITLE, 400, tw, (v ? 15 : 13) * u, 5 * u, 3, 1.0, avail - priceH - oldH - (d.subtitulo ? 10 * u : 0));
    y = lines(g, tf, TITLE, 400, tx, y, P.txt) + 1.6 * u;
    if (d.subtitulo) { var sf = fit(g, d.subtitulo, BODY, 500, tw, 4 * u, 2.4 * u, 3, 1.3, avail - priceH - oldH - (y - ty)); y = lines(g, sf, BODY, 500, tx, y, hexA(P.txt, 0.88)) + 2 * u; }
    if (hasPrice) {
      var py = Math.max(y, footY - 2.4 * u - priceH - oldH);
      if (d.preco_de) { oldPrice(g, d.preco_de, tx, py, 3.6 * u, P.txt); py += oldH; }
      drawPrice(g, d.preco, tx, py, priceH, P.acc, "left", tw);
    }
  }

  function tDestaque(g, W, H, d, P, img) {
    var v = H > W, u = Math.min(W, H) / 100, m = 6 * u;
    background(g, W, H, P);
    if (img.foto) cover(g, img.foto, 0, 0, W, H, 0);
    var sh = g.createLinearGradient(0, v ? H * 0.32 : H * 0.18, 0, H);
    sh.addColorStop(0, hexA(P.bg2, 0)); sh.addColorStop(0.55, hexA(P.bg2, 0.82)); sh.addColorStop(1, hexA(P.bg2, 0.97));
    g.fillStyle = sh; g.fillRect(0, 0, W, H);
    if (img.logo) {
      g.save(); g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = 2 * u;
      contain(g, img.logo, m, m, (v ? 30 : 22) * u, (v ? 12 : 13) * u, "left"); g.restore();
    }
    if (d.selo) pill(g, d.selo.toUpperCase(), W - m, m, 3.6 * u, P.acc, P.accT, "right");
    var cts = contacts(d), bottom = H - m - (cts.length ? 7 * u : 0);
    if (cts.length) contactRow(g, cts, v ? W / 2 : m, H - m - 2.4 * u, 3.1 * u, "#FFFFFF", W - 2 * m, v ? "center" : "left");
    var priceW = d.preco && !v ? W * 0.34 : 0, tw = W - 2 * m - (priceW ? priceW + 4 * u : 0);
    var priceH = d.preco ? (v ? 20 : 22) * u : 0;
    var subF = d.subtitulo ? fit(g, d.subtitulo, BODY, 500, tw, 4 * u, 2.4 * u, 2, 1.3) : null;
    var subH = subF ? subF.lines.length * subF.size * subF.lh + 1.6 * u : 0;
    var tf = fit(g, d.titulo || "", TITLE, 400, tw, (v ? 15 : 14) * u, 5 * u, 3, 1.0, (v ? 34 : 34) * u);
    var titleH = tf.lines.length * tf.size * tf.lh;
    var yTitle = bottom - (v ? priceH + (d.preco_de ? 5 * u : 0) + 2 * u : 0) - subH - titleH;
    var y = lines(g, tf, TITLE, 400, m, yTitle, "#FFFFFF") + 1.6 * u;
    if (subF) lines(g, subF, BODY, 500, m, y, "rgba(255,255,255,.9)");
    if (d.preco) {
      if (!v) {
        var px = W - m, py = bottom - priceH;
        if (d.preco_de) oldPrice(g, d.preco_de, px, py - 5 * u, 3.6 * u, "#FFFFFF", "right");
        drawPrice(g, d.preco, px, py, priceH, P.acc, "right", priceW);
      } else {
        var py2 = bottom - priceH;
        if (d.preco_de) oldPrice(g, d.preco_de, m, py2 - 5 * u, 3.6 * u, "#FFFFFF");
        drawPrice(g, d.preco, m, py2, priceH, P.acc, "left", W - 2 * m);
      }
    }
  }

  function parseItems(s) {
    return String(s || "").split(/\n/).map(function (l) {
      l = l.trim(); if (!l) return null;
      var m = /^(.*?)[\s.]*(?:[-–—:|]\s*)?(?:R\$\s*)?(\d[\d.]*(?:,\d{1,2})?)\s*$/.exec(l);
      return m && m[1] ? { n: m[1].replace(/[\s\-–—:|.]+$/, ""), p: m[2] } : { n: l, p: "" };
    }).filter(Boolean).slice(0, 8);
  }
  function tLista(g, W, H, d, P, img) {
    var v = H > W, u = Math.min(W, H) / 100, m = 6 * u;
    background(g, W, H, P);
    var items = parseItems(d.itens), logo = img.logo, foto = img.foto;
    var x = m, w = W - 2 * m, y = m;
    if (foto && !v) { var fw = W * 0.34; cover(g, foto, W - m - fw, m, fw, H - 2 * m, 4 * u); w = W - 3 * m - fw; }
    if (foto && v) { cover(g, foto, m, m, W - 2 * m, H * 0.26, 4 * u); y = m + H * 0.26 + 3 * u; }
    if (logo) { var lg = contain(g, logo, x, y, (v ? 28 : 20) * u, 10 * u, "left"); y += 12 * u; }
    if (d.selo) { var pl = pill(g, d.selo.toUpperCase(), x, y, 3.2 * u, P.acc, P.accT); y += pl.h + 2 * u; }
    var tf = fit(g, d.titulo || "", TITLE, 400, w, (v ? 12 : 10) * u, 5 * u, 2, 1.0);
    y = lines(g, tf, TITLE, 400, x, y, P.txt) + 1 * u;
    if (d.subtitulo) { var sf = fit(g, d.subtitulo, BODY, 500, w, 3.4 * u, 2.2 * u, 2, 1.3); y = lines(g, sf, BODY, 500, x, y, hexA(P.txt, 0.85)) + 2 * u; }
    var cts = contacts(d), footH = cts.length ? 8 * u : 0, end = H - m - footH;
    var n = Math.max(1, items.length), rowH = Math.min((end - y) / n, 11 * u), fs = Math.min(rowH * 0.42, 4.6 * u);
    items.forEach(function (it, i) {
      var cy = y + rowH * i + rowH / 2;
      rrect(g, x, cy - rowH * 0.44, w, rowH * 0.88, 2 * u); g.fillStyle = hexA(P.id === "claro" ? "#000000" : "#FFFFFF", i % 2 ? 0.06 : 0.11); g.fill();
      var pw = 0;
      if (it.p) {
        var pp = parsePrice(it.p), pt = pp ? "R$ " + pp.i + "," + pp.c : it.p;
        setFont(g, TITLE, 400, fs * 1.25); pw = g.measureText(pt).width;
        g.fillStyle = P.acc; g.textAlign = "right"; g.textBaseline = "middle"; g.fillText(pt, x + w - 2.4 * u, cy);
      }
      var nf = fit(g, it.n, BODY, 800, w - pw - 8 * u, fs, fs * 0.6, 1);
      setFont(g, BODY, 800, nf.size); g.fillStyle = P.txt; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(nf.lines[0] || "", x + 2.4 * u, cy);
      g.textBaseline = "alphabetic";
    });
    if (cts.length) contactRow(g, cts, x, H - m - footH / 2 + u, 3 * u, P.txt, w, "left");
  }

  function tAviso(g, W, H, d, P, img) {
    var v = H > W, u = Math.min(W, H) / 100, m = 7 * u;
    background(g, W, H, P);
    var cx = W / 2, y = m, logo = img.logo, foto = img.foto;
    if (logo) { contain(g, logo, cx - 20 * u, y, 40 * u, 12 * u); y += 15 * u; }
    var cts = contacts(d), bottom = H - m - (cts.length ? 8 * u : 0);
    if (foto) {
      var r = v ? W * 0.26 : H * 0.2, fy = v ? y + r : H / 2;
      if (!v) { g.fillStyle = hexA(P.acc, 0.9); g.beginPath(); g.arc(W - m - r, fy, r + 1.2 * u, 0, 7); g.fill(); g.save(); g.beginPath(); g.arc(W - m - r, fy, r, 0, 7); g.clip(); cover(g, foto, W - m - 2 * r, fy - r, 2 * r, 2 * r); g.restore(); }
      else { g.fillStyle = hexA(P.acc, 0.9); g.beginPath(); g.arc(cx, fy, r + 1.2 * u, 0, 7); g.fill(); g.save(); g.beginPath(); g.arc(cx, fy, r, 0, 7); g.clip(); cover(g, foto, cx - r, fy - r, 2 * r, 2 * r); g.restore(); y = fy + r + 4 * u; }
    }
    var tw = (foto && !v) ? W - 2 * m - H * 0.44 - 4 * u : W - 2 * m, tcx = (foto && !v) ? m + tw / 2 : cx;
    var blocks = [];
    var sf = d.subtitulo ? fit(g, d.subtitulo, BODY, 500, tw, (v ? 4.4 : 4) * u, 2.4 * u, 3, 1.3) : null;
    var tf = fit(g, d.titulo || "", TITLE, 400, tw, (v ? 17 : 16) * u, 6 * u, 3, 1.0, (bottom - y) * 0.55);
    var seloH = d.selo ? 6.5 * u : 0, infoH = d.info ? 9 * u : 0;
    var total = seloH + tf.lines.length * tf.size * tf.lh + 2 * u + (sf ? sf.lines.length * sf.size * sf.lh + 3 * u : 0) + infoH;
    var yy = Math.max(y, y + (bottom - y - total) / 2);
    if (d.selo) { pill(g, d.selo.toUpperCase(), tcx, yy, 3.4 * u, P.acc, P.accT, "center"); yy += seloH; }
    yy = lines(g, tf, TITLE, 400, tcx, yy, P.txt, "center") + 2 * u;
    if (sf) yy = lines(g, sf, BODY, 500, tcx, yy, hexA(P.txt, 0.9), "center") + 3 * u;
    if (d.info) {
      setFont(g, BODY, 800, 4 * u); var iw = Math.min(tw, g.measureText(d.info).width + 6 * u);
      rrect(g, tcx - iw / 2, yy, iw, 7.5 * u, 3.75 * u); g.fillStyle = P.acc; g.fill();
      var inf = fit(g, d.info, BODY, 800, iw - 4 * u, 4 * u, 2 * u, 1);
      setFont(g, BODY, 800, inf.size); g.fillStyle = P.accT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(inf.lines[0] || "", tcx, yy + 3.85 * u); g.textBaseline = "alphabetic";
    }
    if (cts.length) contactRow(g, cts, cx, H - m - 2 * u, 3.1 * u, P.txt, W - 2 * m, "center");
  }

  function tMarca(g, W, H, d, P, img) {
    var v = H > W, u = Math.min(W, H) / 100, m = 7 * u;
    background(g, W, H, P);
    var cx = W / 2, cts = contacts(d), items = parseItems(d.itens).map(function (x) { return x.n; }).slice(0, 4);
    var logoH = v ? 22 * u : 22 * u, y = v ? H * 0.16 : H * 0.12;
    if (img.logo) { contain(g, img.logo, cx - (v ? 40 : 45) * u, y, (v ? 80 : 90) * u, logoH); y += logoH + 4 * u; }
    else if (d.empresa) { var ef = fit(g, d.empresa, TITLE, 400, W - 2 * m, 14 * u, 6 * u, 1); y = lines(g, ef, TITLE, 400, cx, y, P.txt, "center") + 3 * u; }
    if (d.titulo) { var tf = fit(g, d.titulo, TITLE, 400, W - 2 * m, (v ? 10 : 9) * u, 4 * u, 2, 1.05); y = lines(g, tf, TITLE, 400, cx, y, P.txt, "center") + 2 * u; }
    if (d.subtitulo) { var sf = fit(g, d.subtitulo, BODY, 500, W - 2 * m, 3.8 * u, 2.4 * u, 2, 1.3); y = lines(g, sf, BODY, 500, cx, y, hexA(P.txt, 0.88), "center") + 4 * u; }
    if (items.length) {
      setFont(g, BODY, 800, 3.2 * u);
      var rows = v ? items.map(function (x) { return [x]; }) : [items];
      rows.forEach(function (row) {
        var ws = row.map(function (t) { return g.measureText(t).width + 4.4 * u; }), gap = 2 * u, tot = ws.reduce(function (a, b) { return a + b; }, 0) + gap * (row.length - 1);
        var sc = Math.min(1, (W - 2 * m) / tot), px = cx - tot * sc / 2;
        row.forEach(function (t, i) {
          var w = ws[i] * sc, h = 6.6 * u;
          rrect(g, px, y, w, h, h / 2); g.fillStyle = hexA(P.acc, 0.95); g.fill();
          setFont(g, BODY, 800, 3.2 * u * sc); g.fillStyle = P.accT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(t, px + w / 2, y + h / 2); g.textBaseline = "alphabetic";
          px += w + gap * sc;
        });
        y += 8.6 * u;
      });
    }
    if (cts.length) {
      if (v) cts.forEach(function (c, i) { contactRow(g, [c], cx, H - m - (cts.length - 1 - i) * 7 * u - 3 * u, 3.6 * u, P.txt, W - 2 * m, "center"); });
      else contactRow(g, cts, cx, H - m - 3 * u, 3.4 * u, P.txt, W - 2 * m, "center");
    }
  }

  var DRAW = { oferta: tOferta, destaque: tDestaque, lista: tLista, aviso: tAviso, marca: tMarca };
  function paleta(d) {
    var P = PALETAS.filter(function (p) { return p.id === d.pal; })[0] || PALETAS[0];
    if (d.pal === "custom" && d.cor1) P = { id: "custom", nome: "Minhas cores", bg1: d.cor1, bg2: d.cor2 || d.cor1, acc: d.cor3 || "#FFD400", accT: d.cor4 || "#1A1A1A", txt: d.corTxt || "#FFFFFF" };
    return P;
  }
  function render(canvas, d, img) {
    var W = d.orient === "v" ? 1080 : 1920, H = d.orient === "v" ? 1920 : 1080;
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    var g = canvas.getContext("2d");
    g.clearRect(0, 0, W, H);
    (DRAW[d.tpl] || tOferta)(g, W, H, d, paleta(d), img || {});
  }

  // ------------------------------------------------------------------ tela do criador
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  async function loadImg(src) {
    if (!src) return null;
    if (src instanceof Blob) return window.SPConv ? SPConv.decode(src) : createImageBitmap(src);
    var r = await fetch(src, { cache: "force-cache" }); if (!r.ok) throw new Error("HTTP " + r.status);
    var b = await r.blob(); return window.SPConv ? SPConv.decode(b) : createImageBitmap(b);
  }
  // guarda uma cópia leve da foto/logo para poder editar a arte depois
  function asset(bm, max, type) {
    var s = Math.min(1, max / Math.max(bm.width, bm.height)), c = document.createElement("canvas");
    c.width = Math.round(bm.width * s); c.height = Math.round(bm.height * s);
    c.getContext("2d").drawImage(bm, 0, 0, c.width, c.height);
    return new Promise(function (res) { c.toBlob(function (b) { res(b); }, type, 0.86); });
  }

  /* open({ design, onDone(result), modal, closeModal, toast, clients, clientDesign(clientId) })
     result = { file: File(png), title, design, assets: { foto: Blob|null, logo: Blob|null } } */
  async function open(o) {
    var d = Object.assign({}, EXEMPLO, o.design || {});
    if (!d.empresa && o.company) d.empresa = o.company;
    var img = { foto: null, logo: null }, blobs = { foto: null, logo: null };
    o.modal('<h2>Criar arte</h2><div class="cols art"><form id="f-art" autocomplete="off">' +
      '<div class="field"><span class="lbl">Modelo</span><div class="tpls" id="atpl">' + MODELOS.map(function (t) {
        return '<button type="button" data-t="' + t.id + '" class="' + (d.tpl === t.id ? "on" : "") + '"><canvas width="192" height="108"></canvas><b>' + esc(t.nome) + '</b><span>' + esc(t.desc) + '</span></button>'; }).join("") + '</div></div>' +
      '<div class="grid2"><div class="field"><span class="lbl">Formato</span><div class="seg" id="aori"><button type="button" data-v="h" class="' + (d.orient !== "v" ? "on" : "") + '">Horizontal</button><button type="button" data-v="v" class="' + (d.orient === "v" ? "on" : "") + '">Vertical</button></div></div>' +
      (o.clients && o.clients.length ? '<div class="field"><label for="acli">Cliente (traz logo, cores e contatos da última arte)</label><select class="in" id="acli"><option value="">—</option>' + o.clients.map(function (c) { return '<option value="' + esc(c.id) + '"' + (d.client_id === c.id ? " selected" : "") + '>' + esc(c.name) + '</option>'; }).join("") + '</select></div>' : '') + '</div>' +
      '<div class="field"><span class="lbl">Cores</span><div class="pals" id="apal">' + PALETAS.map(function (p) {
        return '<button type="button" data-p="' + p.id + '" class="' + (d.pal === p.id ? "on" : "") + '" title="' + esc(p.nome) + '" style="background:linear-gradient(135deg,' + p.bg1 + ',' + p.bg2 + ')"><i style="background:' + p.acc + '"></i></button>'; }).join("") +
        '<label class="pcustom" title="Minhas cores"><input type="color" id="ac1" value="' + esc(d.cor1 || "#1D02A9") + '"><input type="color" id="ac3" value="' + esc(d.cor3 || "#FFD400") + '"></label></div></div>' +
      '<div class="grid2"><div class="field"><label>Foto do produto</label><input type="file" id="afoto" accept="image/*,.heic,.heif,application/pdf" class="in"><div class="hint" id="afoto-h">' + (d.foto_url ? "Usando a foto atual." : "Opcional. Qualquer formato (até HEIC do iPhone).") + '</div></div>' +
      '<div class="field"><label>Logo</label><input type="file" id="alogo" accept="image/*,.svg,application/pdf" class="in"><div class="hint" id="alogo-h">' + (d.logo_url ? "Usando o logo atual." : "Opcional. PNG com fundo transparente fica melhor.") + '</div></div></div>' +
      '<div class="grid2"><div class="field"><label for="aselo">Selo</label><input class="in" id="aselo" maxlength="24" value="' + esc(d.selo) + '" placeholder="OFERTA, NOVIDADE, SÓ HOJE…"></div>' +
      '<div class="field"><label for="atit">Título</label><input class="in" id="atit" maxlength="70" value="' + esc(d.titulo) + '"></div></div>' +
      '<div class="field"><label for="asub">Texto de apoio</label><input class="in" id="asub" maxlength="140" value="' + esc(d.subtitulo) + '"></div>' +
      '<div class="grid2" id="aprecos"><div class="field"><label for="apr">Preço</label><input class="in" id="apr" maxlength="20" value="' + esc(d.preco) + '" placeholder="49,90"></div>' +
      '<div class="field"><label for="ade">Preço antigo (opcional)</label><input class="in" id="ade" maxlength="20" value="' + esc(d.preco_de) + '" placeholder="69,90"></div></div>' +
      '<div class="field" id="aitw"><label for="ait">Itens <span class="sub small" id="ait-h">(um por linha: Nome - preço)</span></label><textarea class="in" id="ait" rows="4">' + esc(d.itens) + '</textarea></div>' +
      '<div class="field" id="ainw"><label for="ain">Data / horário / informação</label><input class="in" id="ain" maxlength="60" value="' + esc(d.info) + '" placeholder="Sábado, 15/11 · 19h"></div>' +
      '<div class="grid2"><div class="field"><label for="awa">WhatsApp</label><input class="in" id="awa" maxlength="24" value="' + esc(d.whatsapp) + '"></div>' +
      '<div class="field"><label for="aig">Instagram</label><input class="in" id="aig" maxlength="40" value="' + esc(d.instagram) + '"></div></div>' +
      '<div class="field"><label for="aend">Endereço (opcional)</label><input class="in" id="aend" maxlength="80" value="' + esc(d.endereco) + '"></div>' +
      '<div id="art-err"></div>' +
      '<div class="modal-foot"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn ghost" id="adl">Baixar imagem</button><button class="btn" type="submit" id="ause">Usar esta arte</button></div>' +
      '</form><div class="sticky"><div class="lbl">Como fica na TV</div><div class="artprev"><canvas id="acv"></canvas></div><div class="sub small" style="margin-top:8px">A arte vira um anúncio comum: na próxima tela você escolhe as TVs, os dias e os horários.</div></div></div>', "wide");
    var $ = function (s) { return document.querySelector(s); }, $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
    var cv = $("#acv");
    await loadFonts();
    try { if (d.foto_url) img.foto = await loadImg(d.foto_url); } catch (e) {}
    try { if (d.logo_url) img.logo = await loadImg(d.logo_url); } catch (e) {}
    var read = function () {
      d.selo = $("#aselo").value.trim(); d.titulo = $("#atit").value.trim(); d.subtitulo = $("#asub").value.trim();
      d.preco = $("#apr").value.trim(); d.preco_de = $("#ade").value.trim(); d.itens = $("#ait").value; d.info = $("#ain").value.trim();
      d.whatsapp = $("#awa").value.trim(); d.instagram = $("#aig").value.trim(); d.endereco = $("#aend").value.trim();
      if (d.pal === "custom") { d.cor1 = $("#ac1").value; d.cor2 = shade(d.cor1, -0.45); d.cor3 = $("#ac3").value; d.cor4 = contrast(d.cor3); d.corTxt = contrast(d.cor1, true); }
    };
    var showFields = function () {
      $("#aprecos").style.display = d.tpl === "oferta" || d.tpl === "destaque" ? "" : "none";
      $("#aitw").style.display = d.tpl === "lista" || d.tpl === "marca" ? "" : "none";
      $("#ait-h").textContent = d.tpl === "marca" ? "(serviços ou produtos, um por linha)" : "(um por linha: Nome - preço)";
      $("#ainw").style.display = d.tpl === "aviso" ? "" : "none";
    };
    var raf = 0;
    var draw = function () {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        if (!document.body.contains(cv)) return;
        read(); render(cv, d, img);
        $$("#atpl button").forEach(function (b) { var c = b.querySelector("canvas"), big = document.createElement("canvas");
          render(big, Object.assign({}, d, { tpl: b.dataset.t, orient: "h" }), img);
          c.getContext("2d").drawImage(big, 0, 0, c.width, c.height); });
      });
    };
    showFields(); draw();
    $("#f-art").addEventListener("input", draw);
    $("#atpl").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; d.tpl = b.dataset.t; $$("#atpl button").forEach(function (x) { x.classList.toggle("on", x === b); }); showFields(); draw(); });
    $("#aori").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; d.orient = b.dataset.v; $$("#aori button").forEach(function (x) { x.classList.toggle("on", x === b); }); draw(); });
    $("#apal").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; d.pal = b.dataset.p; $$("#apal button").forEach(function (x) { x.classList.toggle("on", x === b); }); draw(); });
    ["#ac1", "#ac3"].forEach(function (id) { $(id).addEventListener("input", function () { d.pal = "custom"; $$("#apal button").forEach(function (x) { x.classList.remove("on"); }); draw(); }); });
    var pickImg = function (key, input, hint) {
      $(input).addEventListener("change", async function (e) {
        var f = e.target.files[0]; if (!f) return;
        $(hint).textContent = "Abrindo…";
        try {
          var bm = await loadImg(f);
          img[key] = bm; blobs[key] = await asset(bm, key === "foto" ? 1600 : 800, key === "foto" ? "image/webp" : "image/png");
          $(hint).textContent = (bm.width || bm.naturalWidth) + "×" + (bm.height || bm.naturalHeight) + " · ok";
          draw();
        } catch (ex) { $(hint).textContent = "Não consegui abrir esse arquivo. Tente JPG ou PNG."; }
      });
    };
    pickImg("foto", "#afoto", "#afoto-h"); pickImg("logo", "#alogo", "#alogo-h");
    $("#acli") && $("#acli").addEventListener("change", async function () {
      d.client_id = $("#acli").value || null;
      var prev = d.client_id && o.clientDesign ? o.clientDesign(d.client_id) : null;
      if (!prev) { draw(); return; }
      ["pal", "cor1", "cor2", "cor3", "cor4", "corTxt", "whatsapp", "instagram", "endereco", "logo_url"].forEach(function (k) { if (prev[k] != null) d[k] = prev[k]; });
      $("#awa").value = d.whatsapp || ""; $("#aig").value = d.instagram || ""; $("#aend").value = d.endereco || "";
      $$("#apal button").forEach(function (x) { x.classList.toggle("on", x.dataset.p === d.pal); });
      try { if (d.logo_url) { img.logo = await loadImg(d.logo_url); blobs.logo = null; $("#alogo-h").textContent = "Logo do cliente."; } } catch (e) {}
      draw();
    });
    var png = function () { read(); render(cv, d, img); return new Promise(function (res) { cv.toBlob(function (b) { res(b); }, "image/png"); }); };
    $("#adl").addEventListener("click", async function () {
      var b = await png(), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = (d.titulo || "arte") + ".png"; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    });
    $("#f-art").addEventListener("submit", async function (e) {
      e.preventDefault(); read();
      if (!d.titulo && d.tpl !== "marca") { $("#art-err").innerHTML = '<div class="err-box">Escreva o título da arte.</div>'; return; }
      var b = await png();
      var name = (d.titulo || "arte").replace(/[\\/:*?"<>|]+/g, " ").slice(0, 60) + ".png";
      var design = {}; Object.keys(d).forEach(function (k) { if (d[k] !== "" && d[k] != null) design[k] = d[k]; });
      o.onDone({ file: new File([b], name, { type: "image/png" }), title: d.titulo || "Arte", design: design, assets: { foto: blobs.foto, logo: blobs.logo } });
    });
  }
  function shade(hex, k) {
    var h = String(hex).replace("#", ""), r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    var f = function (c) { return Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k))); };
    return "#" + [f(r), f(g), f(b)].map(function (c) { return (c < 16 ? "0" : "") + c.toString(16); }).join("");
  }
  function contrast(hex, forBg) {
    var h = String(hex).replace("#", ""), r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    var l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return l > 0.62 ? "#14161C" : "#FFFFFF";
  }

  window.SPArtes = { open: open, render: render, loadFonts: loadFonts, MODELOS: MODELOS, PALETAS: PALETAS, parsePrice: parsePrice, parseItems: parseItems };
})();
