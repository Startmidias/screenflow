/* START PLAY — conversor automático de anúncios.
 * Roda no navegador de quem usa o painel. Recebe qualquer foto, vídeo ou PDF
 * e entrega um arquivo que o TV Box abre:
 *   - fotos (JPEG, PNG, WEBP, GIF, HEIC do iPhone, BMP, TIFF, AVIF, SVG, ICO) e
 *     PDF (1ª página) viram PNG/WEBP/JPEG conforme o que as TVs abrem, até 1920 px;
 *   - vídeos (MOV, AVI, MKV, WMV, WEBM, FLV, MPG, 3GP, MP4 em outro codec) e GIF
 *     animado viram MP4 H.264 + AAC, até 1920 px, até 30 quadros por segundo.
 * As bibliotecas pesadas só são baixadas quando o arquivo precisa delas.
 */
(function () {
  "use strict";
  const BASE = new URL("vendor/conv/", document.currentScript ? document.currentScript.src : location.href).href;
  const CORE = ["https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/",
                "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/"];
  const NAMES = { jpeg: "JPEG", png: "PNG", webp: "WEBP", gif: "GIF", bmp: "BMP", tiff: "TIFF", heic: "HEIC",
    avif: "AVIF", svg: "SVG", ico: "ICO", pdf: "PDF", mp4: "MP4", mov: "MOV", webm: "WEBM", mkv: "MKV",
    avi: "AVI", wmv: "WMV", flv: "FLV", mpeg: "MPEG", ts: "TS", "3gp": "3GP" };
  const IMG_EXT = /\.(jpe?g|jfif|png|gif|webp|bmp|dib|tiff?|heic|heif|avif|svg|ico)$/i;
  const VID_EXT = /\.(mp4|m4v|mov|qt|webm|mkv|avi|wmv|asf|flv|mpe?g|ts|mts|m2ts|3gp|3g2|ogv)$/i;

  const loaded = {};
  function script(src) {
    return loaded[src] = loaded[src] || new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = src; s.onload = res;
      s.onerror = () => { delete loaded[src]; rej(new Error("Não consegui carregar o conversor. Confira a internet e tente de novo.")); };
      document.head.appendChild(s);
    });
  }
  const str = (b, i, n) => String.fromCharCode.apply(null, b.subarray(i, i + n));

  // ---------------------------------------------------------------------
  // Que arquivo é esse? (pelo conteúdo; nome e tipo só como último recurso)
  // ---------------------------------------------------------------------
  async function sniff(file) {
    const b = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    const r = (kind, fmt) => ({ kind, fmt, name: NAMES[fmt] || fmt.toUpperCase() });
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return r("image", "jpeg");
    if (b[0] === 0x89 && str(b, 1, 3) === "PNG") return r("image", "png");
    if (str(b, 0, 4) === "GIF8") return r("image", "gif");
    if (str(b, 0, 4) === "RIFF" && str(b, 8, 4) === "WEBP") return r("image", "webp");
    if (str(b, 0, 4) === "RIFF" && str(b, 8, 4) === "AVI ") return r("video", "avi");
    if (str(b, 0, 2) === "BM" && b.length > 26) return r("image", "bmp");
    if ((str(b, 0, 4) === "II*\0") || (str(b, 0, 4) === "MM\0*")) return r("image", "tiff");
    if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return r("image", "ico");
    if (str(b, 0, 5) === "%PDF-") return r("pdf", "pdf");
    if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return r("video", str(b, 0, 64).indexOf("webm") >= 0 ? "webm" : "mkv");
    if (b[0] === 0x30 && b[1] === 0x26 && b[2] === 0xB2 && b[3] === 0x75) return r("video", "wmv");
    if (str(b, 0, 3) === "FLV") return r("video", "flv");
    if (b[0] === 0 && b[1] === 0 && b[2] === 1 && (b[3] === 0xBA || b[3] === 0xB3)) return r("video", "mpeg");
    if (b[0] === 0x47 && b[188] === 0x47) return r("video", "ts");
    if (str(b, 4, 4) === "ftyp") {
      const size = Math.min(b.length, (b[0] << 24 | b[1] << 16 | b[2] << 8 | b[3]) >>> 0);
      const brands = [str(b, 8, 4)];
      for (let i = 16; i + 4 <= size; i += 4) brands.push(str(b, i, 4));
      const has = list => brands.some(x => list.indexOf(x) >= 0);
      if (has(["avif", "avis"])) return r("image", "avif");
      if (has(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"])) return r("image", "heic");
      if (brands[0] === "qt  ") return r("video", "mov");
      if (/^3g/.test(brands[0])) return r("video", "3gp");
      if (brands[0] === "M4A " || brands[0] === "M4B ") return { kind: null, fmt: "audio", name: "áudio" };
      return r("video", "mp4");
    }
    if (str(b, 4, 4) === "moov" || str(b, 4, 4) === "mdat" || str(b, 4, 4) === "wide") return r("video", "mov");
    const head = new TextDecoder().decode(b).replace(/^\uFEFF/, "").trimStart().slice(0, 4096);
    if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return r("image", "svg");
    const n = file.name || "", t = file.type || "";
    if (/^image\//.test(t) || IMG_EXT.test(n)) return r("image", (n.match(/\.([a-z0-9]+)$/i) || [, t.split("/")[1] || "img"])[1].toLowerCase());
    if (/^video\//.test(t) || VID_EXT.test(n)) return r("video", (n.match(/\.([a-z0-9]+)$/i) || [, t.split("/")[1] || "video"])[1].toLowerCase());
    return { kind: null, fmt: "desconhecido", name: "desconhecido" };
  }

  // GIF: quantos quadros e quanto dura (para saber se é animado)
  async function gifInfo(file) {
    const b = new Uint8Array(await file.arrayBuffer());
    let i = 13, frames = 0, delay = 0, d = 0;
    if (b[10] & 0x80) i += 3 * (1 << ((b[10] & 7) + 1));
    const skip = () => { while (i < b.length && b[i] !== 0) i += b[i] + 1; i++; };
    while (i < b.length && frames < 5000) {
      const t = b[i++];
      if (t === 0x21) {
        const label = b[i++];
        if (label === 0xF9 && b[i] === 4) d = b[i + 2] | (b[i + 3] << 8);
        skip();
      } else if (t === 0x2C) {
        frames++; delay += d < 2 ? 10 : d; d = 0;
        const flags = b[i + 8]; i += 9;
        if (flags & 0x80) i += 3 * (1 << ((flags & 7) + 1));
        i++; skip();
      } else break;
    }
    return { frames, seconds: delay / 100 };
  }

  // ---------------------------------------------------------------------
  // Fotos e PDF
  // ---------------------------------------------------------------------
  function fromImg(blob) {
    return new Promise((res, rej) => {
      const u = URL.createObjectURL(blob), i = new Image();
      i.onload = () => { URL.revokeObjectURL(u); res(i); };
      i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("Não consegui abrir essa imagem.")); };
      i.src = u;
    });
  }
  function rgbaCanvas(w, h, rgba) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), d = g.createImageData(w, h);
    d.data.set(rgba.subarray ? rgba.subarray(0, w * h * 4) : rgba); g.putImageData(d, 0, 0);
    return c;
  }
  async function decodeHeic(blob) {
    await script(BASE + "heic-to.js");
    const fn = typeof window.HeicTo === "function" ? window.HeicTo : window.HeicTo.heicTo;   // a versão "iife" exporta a própria função
    return await fn({ blob, type: "bitmap" });
  }
  async function decodeTiff(blob) {
    await script(BASE + "pako_inflate.min.js"); await script(BASE + "UTIF.js");
    const buf = await blob.arrayBuffer(), U = window.UTIF;
    const ifds = U.decode(buf);
    const pics = ifds.filter(x => x.t256 && x.t257);
    const ifd = pics.sort((a, b) => b.t256[0] * b.t257[0] - a.t256[0] * a.t257[0])[0] || ifds[0];
    U.decodeImage(buf, ifd, ifds);
    return rgbaCanvas(ifd.width, ifd.height, U.toRGBA8(ifd));
  }
  let pdfLib = null;
  async function decodePdf(blob, maxSide) {
    if (!pdfLib) {
      pdfLib = await import(BASE + "pdf.min.mjs");
      pdfLib.GlobalWorkerOptions.workerSrc = BASE + "pdf.worker.min.mjs";
    }
    const doc = await pdfLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
    try {
      const page = await doc.getPage(1);
      const v1 = page.getViewport({ scale: 1 });
      const scale = maxSide / Math.max(v1.width, v1.height);
      const vp = page.getViewport({ scale });
      const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      c.pages = doc.numPages;
      return c;
    } finally { doc.destroy(); }
  }
  async function decodeSvg(blob, maxSide) {
    const i = await fromImg(new Blob([await blob.arrayBuffer()], { type: "image/svg+xml" }));
    let w = i.naturalWidth || 1920, h = i.naturalHeight || 1080;
    const s = maxSide / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(i, 0, 0, w, h);
    return c;
  }
  // abre qualquer foto/PDF e devolve algo desenhável num canvas
  async function decode(blob, info, maxSide) {
    info = info || await sniff(blob);
    maxSide = maxSide || 1920;
    if (info.fmt === "pdf") return decodePdf(blob, maxSide);
    if (info.fmt === "svg") return decodeSvg(blob, maxSide);
    if (info.fmt === "tiff") return decodeTiff(blob);
    if (window.createImageBitmap) { try { return await createImageBitmap(blob, { imageOrientation: "from-image" }); } catch (e) {} }
    try { return await fromImg(blob); } catch (e) {
      if (info.fmt === "heic") return decodeHeic(blob);
      if (info.fmt === "jpeg" || info.fmt === "png" || info.fmt === "webp" || info.fmt === "gif") throw new Error("Essa imagem parece estar corrompida. Exporte de novo e envie.");
      throw new Error(`Não consegui abrir essa imagem (${info.name}). Envie como JPG, PNG ou PDF.`);
    }
  }
  const sizeOf = x => ({ w: x.width || x.naturalWidth, h: x.height || x.naturalHeight });

  const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  // opts: { target: "image/jpeg"|"image/webp"|"image/png", maxSide, heavy }
  async function image(file, opts) {
    opts = opts || {};
    const info = opts.info || await sniff(file);
    const target = opts.target || "image/jpeg", maxSide = opts.maxSide || 1920, heavy = opts.heavy || 1.2 * 1048576;
    const src = await decode(file, info, maxSide);
    const { w: w0, h: h0 } = sizeOf(src);
    if (!w0 || !h0) throw new Error("Essa imagem está vazia.");
    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    // já está num formato que todas as TVs abrem?
    const tvOk = info.fmt === "png" || (info.fmt === "webp" && !!opts.webpOk) || (info.fmt === "jpeg" && target === "image/jpeg");
    const notes = [];
    if (info.fmt === "pdf" && src.pages > 1) notes.push(`O PDF tem ${src.pages} páginas: usei a primeira.`);
    if (tvOk && scale === 1 && file.size <= heavy) {
      if (src.close) src.close();
      return { file, w: w0, h: h0, w0, h0, changed: false, from: info.name, notes };
    }
    const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"); g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
    g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, w, h);
    if (src.close) src.close();
    let blob = await new Promise(r => c.toBlob(r, target, 0.88));
    if (!blob || (target !== "image/png" && blob.type !== target)) blob = await new Promise(r => c.toBlob(r, "image/png"));
    if (!blob) throw new Error("Não consegui converter essa imagem.");
    const outT = blob.type || "image/png";
    const name = (file.name || "imagem").replace(/\.[^.]+$/, "") + "." + (EXT[outT] || "png");
    return { file: new File([blob], name, { type: outT }), w, h, w0, h0, changed: true, before: file.size,
             from: info.name, to: (EXT[outT] || "png").toUpperCase(), converted: info.fmt !== (EXT[outT] === "jpg" ? "jpeg" : EXT[outT]), notes };
  }

  // ---------------------------------------------------------------------
  // Vídeos
  // ---------------------------------------------------------------------
  // lê a estrutura de um MP4/MOV sem carregar o arquivo inteiro
  async function probeMp4(file) {
    const rd = async (o, n) => new DataView(await file.slice(o, o + n).arrayBuffer());
    let off = 0, moov = null, mdatAt = -1, moovAt = -1;
    while (off + 8 <= file.size) {
      const h = await rd(off, 16);
      let size = h.getUint32(0); const type = String.fromCharCode(h.getUint8(4), h.getUint8(5), h.getUint8(6), h.getUint8(7));
      if (size === 1) size = Number(h.getBigUint64(8)); else if (size === 0) size = file.size - off;
      if (size < 8) break;
      if (type === "moov") { moovAt = off; if (size > 64 * 1048576) return null; moov = new Uint8Array(await file.slice(off, off + size).arrayBuffer()); }
      if (type === "mdat" && mdatAt < 0) mdatAt = off;
      off += size;
    }
    if (!moov) return null;
    const out = { vcodec: null, acodec: null, w: 0, h: 0, duration: 0, faststart: moovAt >= 0 && (mdatAt < 0 || moovAt < mdatAt) };
    const dv = new DataView(moov.buffer);
    (function walk(start, end) {
      let p = start;
      while (p + 8 <= end) {
        let size = dv.getUint32(p); const type = str(moov, p + 4, 4);
        if (size === 1) size = Number(dv.getBigUint64(p + 8)); else if (size === 0) size = end - p;
        if (size < 8 || p + size > end) break;
        if (["moov", "trak", "mdia", "minf", "stbl"].indexOf(type) >= 0) walk(p + 8, p + size);
        else if (type === "mvhd") {
          const v = moov[p + 8];
          const ts = v === 1 ? dv.getUint32(p + 28) : dv.getUint32(p + 20);
          const du = v === 1 ? Number(dv.getBigUint64(p + 32)) : dv.getUint32(p + 24);
          if (ts) out.duration = du / ts;
        } else if (type === "tkhd") {
          const v = moov[p + 8], q = p + (v === 1 ? 96 : 84);
          const w = dv.getUint32(q) / 65536, h = dv.getUint32(q + 4) / 65536;
          if (w * h > out.w * out.h) { out.w = Math.round(w); out.h = Math.round(h); }
        } else if (type === "stsd") {
          const code = str(moov, p + 20, 4);
          if (["avc1", "avc3", "hvc1", "hev1", "mp4v", "av01", "vp09", "vp08", "jpeg", "mjpa", "apcn", "apch", "apcs", "apco", "ap4h", "s263", "dvh1", "dvhe"].indexOf(code) >= 0) out.vcodec = out.vcodec || code;
          else out.acodec = out.acodec || code;
        }
        p += size;
      }
    })(0, moov.length);
    return out;
  }
  function metaDuration(file) {
    return new Promise(res => {
      const v = document.createElement("video"); v.preload = "metadata"; v.muted = true;
      const done = d => { URL.revokeObjectURL(v.src); res(d); };
      v.onloadedmetadata = () => done(isFinite(v.duration) ? v.duration : 0);
      v.onerror = () => done(0);
      setTimeout(() => done(0), 8000);
      v.src = URL.createObjectURL(file);
    });
  }

  async function cachedURL(url, type, onBytes) {
    let res = null, cache = null;
    try { cache = await caches.open("sp-conversor-v1"); res = await cache.match(url); } catch (e) {}
    if (!res) {
      res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      if (cache) { try { await cache.put(url, res.clone()); } catch (e) {} }
    }
    const total = +res.headers.get("content-length") || 0;
    if (onBytes && res.body && total) {
      const rd = res.body.getReader(), parts = []; let got = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onBytes(got, total); }
      return URL.createObjectURL(new Blob(parts, { type }));
    }
    return URL.createObjectURL(new Blob([await res.arrayBuffer()], { type }));
  }
  async function loadFF(onStage) {
    await script(BASE + "ffmpeg/ffmpeg.js");
    const ff = new window.FFmpegWASM.FFmpeg();
    const errs = [];
    for (const base of CORE) {
      try {
        onStage && onStage("Baixando o conversor de vídeo (só na primeira vez)…", 0);
        const coreURL = await cachedURL(base + "ffmpeg-core.js", "text/javascript");
        const wasmURL = await cachedURL(base + "ffmpeg-core.wasm", "application/wasm",
          (g, t) => onStage && onStage(`Baixando o conversor de vídeo (só na primeira vez)… ${Math.round(g / t * 100)}%`, g / t));
        onStage && onStage("Preparando o conversor…", 1);
        // sem classWorkerURL: com ele a versão UMD abre um "module worker", que não carrega o núcleo;
        // sem ele, o 814.ffmpeg.js é achado ao lado do ffmpeg.js
        await ff.load({ coreURL, wasmURL });
        return ff;
      } catch (e) { errs.push((e && e.message) || String(e)); if (window.console) console.warn("[conversor]", base, e); }
    }
    throw new Error("Não consegui baixar o conversor de vídeo. Confira a internet e tente de novo." + (errs.length ? ` (${errs.join(" · ").slice(0, 200)})` : ""));
  }

  // opts: { onProgress(fração 0..1, texto), maxMB }
  async function video(file, opts) {
    opts = opts || {};
    const say = (t, f) => opts.onProgress && opts.onProgress(f == null ? null : Math.max(0, Math.min(1, f)), t);
    const info = opts.info || await sniff(file);
    const maxMB = opts.maxMB || 50;
    let mode = "transcode", probe = null, loopTo = 0;
    if (info.fmt === "gif") {
      const g = await gifInfo(file);
      if (g.seconds && g.seconds < 8) loopTo = Math.ceil(10 / g.seconds);
    } else if (info.fmt === "mp4" || info.fmt === "mov" || info.fmt === "3gp") {
      probe = await probeMp4(file).catch(() => null);
      if (probe) {
        const vOk = probe.vcodec === "avc1" || probe.vcodec === "avc3";
        const aOk = !probe.acodec || probe.acodec === "mp4a";
        const small = Math.max(probe.w, probe.h) <= 1920 && Math.min(probe.w, probe.h) <= 1088;
        const rate = probe.duration ? file.size * 8 / probe.duration : 0;
        if (vOk && aOk && small && rate <= 12e6 && file.size <= maxMB * 1048576) {
          if (info.fmt === "mp4" && probe.faststart) return { file, changed: false, from: "MP4 (H.264)", duration: probe.duration, notes: [] };
          mode = "remux";
        }
      }
    }
    const duration = (probe && probe.duration) || (info.fmt === "gif" ? 0 : await metaDuration(file));
    const ff = await loadFF(say);
    const ext = (file.name.match(/\.([a-z0-9]{1,5})$/i) || [, info.fmt])[1].toLowerCase();
    const inName = "entrada." + ext, outName = "saida.mp4";
    let logDur = 0; const log = [];
    ff.on("log", ({ message }) => {
      log.push(message); if (log.length > 40) log.shift();
      const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(message);
      if (m && !logDur) logDur = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
    });
    const total = () => (loopTo ? 0 : (duration || logDur));
    ff.on("progress", ({ progress, time }) => {
      const t = total(); const f = t ? (time / 1e6) / t : progress;
      say(mode === "remux" ? "Ajustando o vídeo para a TV…" : `Convertendo o vídeo para a TV… ${Math.round(Math.max(0, Math.min(1, f || 0)) * 100)}%`, f);
    });
    try {
      let input = inName;
      try {
        await ff.createDir("/in");
        await ff.mount("WORKERFS", { files: [new File([file], inName)] }, "/in");
        input = "/in/" + inName;
      } catch (e) {
        await ff.writeFile(inName, new Uint8Array(await file.arrayBuffer()));
      }
      const secs = duration || 30;
      const vbr = Math.max(800, Math.min(5000, Math.floor(((maxMB * 0.9 * 8 * 1048576) / Math.max(secs * (loopTo || 1), 1) - 160e3) / 1000)));
      let args;
      if (mode === "remux") args = ["-i", input, "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-movflags", "+faststart", "-y", outName];
      else {
        args = (loopTo ? ["-stream_loop", String(loopTo - 1)] : []).concat(["-i", input, "-map", "0:v:0", "-map", "0:a:0?",
          "-vf", "scale=w='if(gt(iw,ih),min(1920,iw),-2)':h='if(gt(iw,ih),-2,min(1920,ih))',scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
          "-fpsmax", "30", "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main", "-level:v", "4.1",
          "-crf", "23", "-maxrate", vbr + "k", "-bufsize", (vbr * 2) + "k",
          "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "44100", "-movflags", "+faststart", "-y", outName]);
      }
      say(mode === "remux" ? "Ajustando o vídeo para a TV…" : "Convertendo o vídeo para a TV… 0%", 0);
      const code = await ff.exec(args);
      if (code !== 0) {
        const why = log.filter(l => /error|invalid|not supported|unknown|could not/i.test(l)).slice(-2).join(" · ");
        throw new Error("Não consegui converter esse vídeo." + (why ? ` (${why.slice(0, 160)})` : ""));
      }
      const data = await ff.readFile(outName);
      const out = new File([data], (file.name || "video").replace(/\.[^.]+$/, "") + ".mp4", { type: "video/mp4" });
      if (out.size > maxMB * 1048576) throw new Error(`O vídeo convertido ficou com ${(out.size / 1048576).toFixed(1)} MB (máximo ${maxMB} MB). Envie um vídeo mais curto.`);
      const notes = [];
      if (loopTo) notes.push("GIF animado curto: repeti a animação para durar cerca de 10 segundos.");
      say("Pronto", 1);
      const codec = probe && probe.vcodec ? ({ avc1: "H.264", avc3: "H.264", hvc1: "HEVC", hev1: "HEVC", mp4v: "MPEG-4", av01: "AV1", vp09: "VP9" })[probe.vcodec] || probe.vcodec : "";
      return { file: out, changed: true, remux: mode === "remux", before: file.size, from: info.name + (codec ? ` (${codec})` : ""),
               duration: await metaDuration(out) || duration, notes };
    } finally {
      try { ff.terminate(); } catch (e) {}
    }
  }

  window.SPConv = { sniff, decode, image, video, gifInfo, probeMp4 };
})();
