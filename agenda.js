/* START PLAY — regras de horário usadas pelo player (TV) e pelo painel.
   Expediente da tela, feriados/exceções por data, agenda de cada anúncio
   (dias, horário e vigência) e estimativa de inserções por dia. */
(function(root){
  "use strict";
  var ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

  function two(n){ return (n < 10 ? "0" : "") + n }
  function hm2m(s){ var m = /^(\d{1,2}):(\d{2})/.exec(s || ""); return m ? (+m[1]) * 60 + (+m[2]) : null }
  function m2hm(m){ m = ((m % 1440) + 1440) % 1440; return two(Math.floor(m / 60)) + ":" + two(m % 60) }
  function ymdParts(ymd){ var p = String(ymd).split("-"); return [+p[0], +p[1] - 1, +p[2]] }
  function ymdAdd(ymd, n){
    var p = ymdParts(ymd), d = new Date(Date.UTC(p[0], p[1], p[2] + n));
    return d.getUTCFullYear() + "-" + two(d.getUTCMonth() + 1) + "-" + two(d.getUTCDate());
  }
  function dowOf(ymd){ var p = ymdParts(ymd); return new Date(Date.UTC(p[0], p[1], p[2])).getUTCDay() }

  // data, dia da semana e minuto do dia no fuso configurado (a TV Box pode estar com a hora errada)
  var fmts = {};
  function nowParts(tz, ms){
    ms = ms == null ? Date.now() : ms;
    tz = tz || "America/Cuiaba";
    try {
      var f = fmts[tz] || (fmts[tz] = new Intl.DateTimeFormat("en-US", { timeZone:tz, hour12:false,
        year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }));
      var p = {}; f.formatToParts(new Date(ms)).forEach(function(x){ p[x.type] = x.value });
      var h = parseInt(p.hour, 10) % 24, mi = parseInt(p.minute, 10), ymd = p.year + "-" + p.month + "-" + p.day;
      if(isNaN(h) || isNaN(mi) || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error("fuso");
      return { ymd:ymd, dow:dowOf(ymd), min:h * 60 + mi, hm:two(h) + ":" + two(mi) };
    } catch(e){
      var d = new Date(ms), y = d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
      return { ymd:y, dow:d.getDay(), min:d.getHours() * 60 + d.getMinutes(), hm:two(d.getHours()) + ":" + two(d.getMinutes()) };
    }
  }

  // exceção do dia: a da própria tela vale mais que a geral
  function exceptionFor(exceptions, ymd){
    var own = null, all = null, list = exceptions || [];
    for(var i = 0; i < list.length; i++){
      var e = list[i]; if(!e || String(e.day).slice(0, 10) !== ymd) continue;
      if(e.own || e.screen_id) own = e; else all = e;
    }
    return own || all;
  }

  // janela de funcionamento que COMEÇA no dia ymd:
  // null = fechado · "all" = o dia todo · {f, t} em minutos (t < f atravessa a meia-noite)
  function dayWindow(hours, exceptions, ymd){
    var e = exceptionFor(exceptions, ymd);
    if(e){
      if(e.closed) return null;
      var ef = hm2m(e.open || e.open_at), et = hm2m(e.close || e.close_at);
      return ef == null || et == null || ef === et ? "all" : { f:ef, t:et };
    }
    if(!hours || !hours.on) return "all";
    var days = hours.days && hours.days.length ? hours.days : ALL_DAYS;
    if(days.indexOf(dowOf(ymd)) < 0) return null;
    var f = hm2m(hours.open), t = hm2m(hours.close);
    return f == null || t == null || f === t ? "all" : { f:f, t:t };
  }

  // a tela está no expediente agora? (p = { ymd, min })
  function isOpen(hours, exceptions, p){
    var w = dayWindow(hours, exceptions, p.ymd);
    if(w === "all") return true;
    if(w && (w.f < w.t ? p.min >= w.f && p.min < w.t : p.min >= w.f)) return true;
    var y = dayWindow(hours, exceptions, ymdAdd(p.ymd, -1));   // continuação da noite anterior
    return !!(y && y !== "all" && y.f > y.t && p.min < y.t);
  }

  // o anúncio pode passar agora? (vigência, dias da semana e horário; "22:00 às 02:00" atravessa a meia-noite)
  function itemOn(it, p){
    if(it.starts_on && String(it.starts_on).slice(0, 10) > p.ymd) return false;
    if(it.ends_on && String(it.ends_on).slice(0, 10) < p.ymd) return false;
    var d = it.days && it.days.length ? it.days : null, dow = p.dow != null ? p.dow : dowOf(p.ymd);
    var f = hm2m(it.from || it.time_from), t = hm2m(it.to || it.time_to);
    function dayOk(x){ return !d || d.indexOf(x) >= 0 }
    if(f == null || t == null || f === t) return dayOk(dow);
    if(f < t) return dayOk(dow) && p.min >= f && p.min < t;
    if(p.min >= f) return dayOk(dow);
    if(p.min < t){
      // depois da meia-noite vale a vigência e o dia em que a janela começou
      var y = ymdAdd(p.ymd, -1);
      if(it.starts_on && String(it.starts_on).slice(0, 10) > y) return false;
      return dayOk((dow + 6) % 7);
    }
    return false;
  }

  // Estimativa de um dia numa tela, em fatias de 15 minutos:
  // cada anúncio passa uma vez por ciclo; o ciclo é a soma das durações no ar naquele horário.
  // ads: [{ id, duration, days, from, to, starts_on, ends_on }]
  function estimateDay(screen, exceptions, ads, ymd, loopMax){
    var dow = dowOf(ymd), per = {}, peak = 0, openMin = 0, over = 0, slots = 96;
    for(var i = 0; i < ads.length; i++) per[ads[i].id] = 0;
    for(var s = 0; s < slots; s++){
      var p = { ymd:ymd, dow:dow, min:s * 15 + 7 };
      if(!isOpen(screen && screen.hours, exceptions, p)) continue;
      openMin += 15;
      var loop = 0, on = [];
      for(var j = 0; j < ads.length; j++) if(itemOn(ads[j], p)){ loop += Math.max(1, +ads[j].duration || 10); on.push(ads[j]) }
      if(!loop) continue;
      if(loop > peak) peak = loop;
      if(loopMax && loop > loopMax) over += 15;
      for(var k = 0; k < on.length; k++) per[on[k].id] += 900 / loop;
    }
    for(var id in per) per[id] = Math.floor(per[id]);
    return { perAd:per, peakLoop:peak, openMinutes:openMin, overMinutes:over,
             occupancy:loopMax ? peak / loopMax : null };
  }

  root.SPAgenda = { hm2m:hm2m, m2hm:m2hm, ymdAdd:ymdAdd, dowOf:dowOf, nowParts:nowParts, exceptionFor:exceptionFor,
                    dayWindow:dayWindow, isOpen:isOpen, itemOn:itemOn, estimateDay:estimateDay };
})(typeof window !== "undefined" ? window : globalThis);
