package com.screenflow.tv.nv;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.MediaPlayer;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.Gravity;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.LinkedList;

/**
 * START PLAY TV 2.0 — vídeo nativo.
 *
 * O player (página na WebView "player") continua sendo o cérebro: agenda, rodapé,
 * cartões, relatórios. Só o vídeo sai do navegador e toca direto no decodificador do
 * aparelho (MediaPlayer + SurfaceView), por baixo da página, que fica transparente
 * onde o vídeo aparece. Um MediaPlayer só, reaproveitado: nunca dois decodificadores.
 *
 * Também: guarda os vídeos no aparelho, vigia o player (recarrega se a página parar
 * de responder) e reabre o app se ele fechar sozinho.
 *
 * Tudo aqui é defensivo: qualquer falha vira "error" para a página, que volta a tocar
 * o vídeo pelo navegador. Nada daqui pode derrubar o app.
 */
public class NativeVideo implements SurfaceHolder.Callback, MediaPlayer.OnPreparedListener,
        MediaPlayer.OnCompletionListener, MediaPlayer.OnErrorListener, MediaPlayer.OnInfoListener,
        MediaPlayer.OnVideoSizeChangedListener {

    public static final String VERSION = "2.0.1";
    static final String TAG = "StartPlayNV";
    static final int PING_LIMIT_MS = 150000;      // página sem dar sinal por 2,5 min: recarrega
    static final int STALL_MS = 12000;            // vídeo parado no mesmo ponto por 12 s: travou
    static final int OPEN_MS = 25000;             // vídeo que não começa em 25 s: não abriu
    static final int WATCH_MS = 2000;

    static NativeVideo inst;

    final Activity act;
    final FrameLayout root;
    final WebView web;
    final Handler ui;
    final File dir;
    SurfaceView sv;
    SurfaceHolder holder;
    boolean surfaceOk;

    MediaPlayer mp;
    int cur;                 // id do vídeo pedido pela página (0 = nenhum)
    boolean prepared, started, rendered;
    boolean muted;
    long openAt, lastPos = -1, lastMove;
    int vw, vh;
    int sx, sy, sw, sh;      // área do anúncio (pixels da tela)

    volatile long lastPing;  // último sinal da página
    int reloads;
    boolean resumed;

    final LinkedList<String> queue = new LinkedList<String>();
    String prevLife = "";        // como estava o aparelho no último sinal antes de desligar/reiniciar
    int beats;
    String nowUrl = "";
    Thread loader;
    String loading;

    // ------------------------------------------------------------------
    // ligação com o app (chamado pela MainActivity)
    // ------------------------------------------------------------------
    public static void attach(Activity a, FrameLayout root, WebView player) {
        // tela antiga do app (o Android recriou a tela): solta o vídeo e desliga a página dela,
        // senão dois players tocam ao mesmo tempo e a TV Box trava
        NativeVideo old = inst;
        if (old != null && old.web != player) {
            try { old.ui.removeCallbacks(old.watch); old.ui.removeCallbacks(old.alarm); old.dropPlayer(); old.cur = 0; } catch (Throwable t) { Log.e(TAG, "old", t); }
            try { old.web.loadUrl("about:blank"); } catch (Throwable t) { Log.e(TAG, "old web", t); }
        }
        try {
            inst = new NativeVideo(a, root, player);
        } catch (Throwable t) {
            Log.e(TAG, "attach", t);
            inst = null;
        }
    }

    public static void onResume() {
        try { if (inst != null) inst.setResumed(true); } catch (Throwable t) { Log.e(TAG, "resume", t); }
    }

    public static void onPause() {
        try { if (inst != null) inst.setResumed(false); } catch (Throwable t) { Log.e(TAG, "pause", t); }
    }

    NativeVideo(Activity a, FrameLayout r, WebView w) {
        act = a; root = r; web = w;
        ui = new Handler(Looper.getMainLooper());
        File d = new File(a.getFilesDir(), "videos");
        if (!d.isDirectory()) d.mkdirs();
        dir = d;
        prevLife = readFile(new File(a.getFilesDir(), "vida.json"));
        web.addJavascriptInterface(new Js(this), "SPVideo");
        ui.postDelayed(watch, WATCH_MS);
        resumed = true;
        ui.post(alarm);
        Log.i(TAG, "vídeo nativo " + VERSION + " pronto");
    }

    // ------------------------------------------------------------------
    // o que a página pode chamar (window.SPVideo.*), em outra thread
    // ------------------------------------------------------------------
    public static class Js {
        final NativeVideo n;
        Js(NativeVideo n) { this.n = n; }

        @JavascriptInterface public String version() { return VERSION; }

        /** toca um vídeo na área (x, y, w, h) em pixels da tela; responde por onVideo(id, ...) */
        @JavascriptInterface public void play(final int id, final String url, final int x, final int y, final int w, final int h, final boolean mute) {
            n.ui.post(new Runnable() { public void run() { n.doPlay(id, url, x, y, w, h, mute); } });
        }

        @JavascriptInterface public void stop() {
            n.ui.post(new Runnable() { public void run() { n.doStop(); } });
        }

        @JavascriptInterface public void area(final int x, final int y, final int w, final int h) {
            n.ui.post(new Runnable() { public void run() { n.sx = x; n.sy = y; n.sw = w; n.sh = h; n.fit(); } });
        }

        @JavascriptInterface public void mute(final boolean m) {
            n.ui.post(new Runnable() { public void run() { n.muted = m; n.volume(); } });
        }

        /** lista (JSON) dos vídeos da programação: baixa os que faltam, apaga os que saíram */
        @JavascriptInterface public void prefetch(String json) { n.prefetch(json); }

        @JavascriptInterface public boolean has(String url) { return n.local(url) != null; }

        /** a página está viva */
        @JavascriptInterface public void ping() { n.lastPing = SystemClock.elapsedRealtime(); }

        /** dados do aparelho para o painel: temperatura, memória, tempo ligado */
        @JavascriptInterface public String info() { return n.info(); }
    }

    // ------------------------------------------------------------------
    // reprodução
    // ------------------------------------------------------------------
    /** a superfície do vídeo só entra na tela no 1º vídeo (TV sem vídeo fica igual ao app 1.x) */
    void ensureSurface() {
        if (sv != null) return;
        sv = new SurfaceView(act);
        holder = sv.getHolder();
        holder.addCallback(this);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-1, -1);
        lp.gravity = Gravity.TOP | Gravity.LEFT;
        root.addView(sv, 0, lp);                 // por baixo das duas WebViews
        web.setBackgroundColor(0);               // a página pinta o próprio fundo preto; onde há vídeo, fica transparente
    }

    void doPlay(int id, String url, int x, int y, int w, int h, boolean mute) {
        try {
            ensureSurface();
            cur = id; sx = x; sy = y; sw = w; sh = h; muted = mute; nowUrl = url;
            prepared = false; started = false; rendered = false; vw = 0; vh = 0;
            lastPos = -1; lastMove = SystemClock.elapsedRealtime(); openAt = lastMove;
            String src = local(url);
            if (src == null) { src = url; want(url); }
            if (mp == null) {
                mp = new MediaPlayer();
                mp.setOnPreparedListener(this);
                mp.setOnCompletionListener(this);
                mp.setOnErrorListener(this);
                mp.setOnInfoListener(this);
                mp.setOnVideoSizeChangedListener(this);
            } else {
                mp.reset();                       // solta o decodificador do vídeo anterior
            }
            mp.setDataSource(src);
            if (surfaceOk) mp.setDisplay(holder);
            volume();
            mp.prepareAsync();
            fit();
        } catch (Throwable t) {
            Log.e(TAG, "play", t);
            fail(id, "abrir: " + t.getClass().getSimpleName());
        }
    }

    void doStop() {
        cur = 0; prepared = false; started = false; rendered = false;
        try { if (mp != null) mp.reset(); } catch (Throwable t) { dropPlayer(); }
    }

    void dropPlayer() {
        try { if (mp != null) mp.release(); } catch (Throwable t) { /* nada */ }
        mp = null;
    }

    void volume() {
        try { if (mp != null) { float v = muted ? 0f : 1f; mp.setVolume(v, v); } } catch (Throwable t) { /* nada */ }
    }

    void fail(int id, String why) {
        if (id != cur) return;
        cur = 0;
        try { if (mp != null) mp.reset(); } catch (Throwable t) { dropPlayer(); }
        send(id, "error", 0, why);
    }

    public void onPrepared(MediaPlayer p) {
        if (p != mp || cur == 0) return;
        try {
            prepared = true;
            if (!surfaceOk) return;              // começa quando a superfície existir
            begin();
        } catch (Throwable t) { fail(cur, "começar: " + t.getClass().getSimpleName()); }
    }

    void begin() {
        if (started || !prepared || mp == null) return;
        mp.start();
        started = true;
        lastMove = SystemClock.elapsedRealtime();
        final int id = cur;
        // nem todo aparelho avisa o primeiro quadro: libera a tela em 400 ms de qualquer jeito
        ui.postDelayed(new Runnable() { public void run() { if (id == cur && started && !rendered) shown(); } }, 400);
    }

    void shown() {
        rendered = true;
        int d = 0;
        try { d = mp.getDuration(); } catch (Throwable t) { /* nada */ }
        send(cur, "playing", d, vw + "x" + vh);
    }

    public boolean onInfo(MediaPlayer p, int what, int extra) {
        if (p == mp && what == MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START && cur != 0 && !rendered) shown();
        return false;
    }

    public void onCompletion(MediaPlayer p) {
        if (p != mp || cur == 0) return;
        int id = cur; cur = 0; started = false;
        send(id, "ended", 0, "");
    }

    public boolean onError(MediaPlayer p, int what, int extra) {
        if (p != mp) return true;
        int id = cur;
        dropPlayer();                             // depois de erro o MediaPlayer não serve mais
        if (id != 0) { cur = 0; send(id, "error", what, "decodificador " + what + "/" + extra); }
        return true;
    }

    public void onVideoSizeChanged(MediaPlayer p, int w, int h) {
        if (p != mp) return;
        vw = w; vh = h;
        fit();
    }

    /** mesma regra do player: formato parecido com a tela preenche tudo; muito diferente aparece inteiro */
    void fit() {
        if (sv == null) return;
        try {
            int w = sw > 0 ? sw : root.getWidth(), h = sh > 0 ? sh : root.getHeight();
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-1, -1);
            lp.gravity = Gravity.TOP | Gravity.LEFT;
            if (vw > 0 && vh > 0 && w > 0 && h > 0) {
                int[] r = place(vw, vh, sx, sy, w, h);
                lp.width = r[2]; lp.height = r[3]; lp.leftMargin = r[0]; lp.topMargin = r[1];
            } else if (w > 0 && h > 0) {
                lp.width = w; lp.height = h; lp.leftMargin = sx; lp.topMargin = sy;
            }
            sv.setLayoutParams(lp);
        } catch (Throwable t) { Log.e(TAG, "fit", t); }
    }

    public static int[] place(int vw, int vh, int x, int y, int w, int h) {
        double r = (double) vw / vh, s = (double) w / h;
        boolean fill = 1 - Math.min(r, s) / Math.max(r, s) <= 0.2;
        double k = fill ? Math.max((double) w / vw, (double) h / vh) : Math.min((double) w / vw, (double) h / vh);
        int dw = (int) Math.round(vw * k), dh = (int) Math.round(vh * k);
        return new int[] { x + (w - dw) / 2, y + (h - dh) / 2, dw, dh };
    }

    // superfície do vídeo
    public void surfaceCreated(SurfaceHolder h) {
        surfaceOk = true;
        try { if (mp != null && cur != 0) { mp.setDisplay(h); if (prepared) begin(); } } catch (Throwable t) { fail(cur, "superfície"); }
    }
    public void surfaceChanged(SurfaceHolder h, int f, int w, int hh) { }
    public void surfaceDestroyed(SurfaceHolder h) {
        surfaceOk = false;
        try { if (mp != null) mp.setDisplay(null); } catch (Throwable t) { /* nada */ }
    }

    // vigia: vídeo travado, vídeo que não abre, página que parou de responder
    final Runnable watch = new Runnable() {
        public void run() {
            try {
                long now = SystemClock.elapsedRealtime();
                if (cur != 0 && mp != null) {
                    if (!started && now - openAt > OPEN_MS) fail(cur, "não abriu em " + OPEN_MS / 1000 + " s");
                    else if (started) {
                        int pos = mp.getCurrentPosition();
                        if (pos != lastPos) { lastPos = pos; lastMove = now; }
                        else if (now - lastMove > STALL_MS) fail(cur, "travou");
                    }
                }
                String u = web.getUrl();
                if (resumed && lastPing > 0 && now - lastPing > PING_LIMIT_MS && u != null && u.startsWith("http")) {
                    lastPing = now; reloads++;
                    Log.w(TAG, "página parou de responder: recarregando");
                    doStop();
                    web.reload();
                }
                if (++beats % 5 == 0) life();
            } catch (Throwable t) { Log.e(TAG, "watch", t); }
            ui.postDelayed(this, WATCH_MS);
        }
    };

    void send(int id, String ev, int a, String b) {
        final String js = "window.SPNative&&SPNative.onVideo(" + id + ",'" + ev + "'," + a + "," + JSONObject.quote(b == null ? "" : b) + ")";
        ui.post(new Runnable() {
            public void run() {
                try { web.evaluateJavascript(js, null); } catch (Throwable t) { Log.e(TAG, "send", t); }
            }
        });
    }

    // ------------------------------------------------------------------
    // app sempre na tela: se o processo cair, o Android reabre em ~2 min
    // ------------------------------------------------------------------
    void setResumed(boolean r) {
        resumed = r;
        ui.removeCallbacks(alarm);
        if (r) ui.post(alarm);
        else cancelAlarm();
        if (!r) lastPing = 0;               // menu ou outro app aberto: não recarrega a página
    }

    PendingIntent pending() {
        Intent i = new Intent(act, act.getClass());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(act, 7321, i, PendingIntent.FLAG_UPDATE_CURRENT);
    }

    final Runnable alarm = new Runnable() {
        public void run() {
            try {
                AlarmManager am = (AlarmManager) act.getSystemService(Context.ALARM_SERVICE);
                if (am != null && resumed) am.set(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + 120000, pending());
            } catch (Throwable t) { Log.e(TAG, "alarm", t); }
            if (resumed) ui.postDelayed(this, 45000);
        }
    };

    void cancelAlarm() {
        try {
            AlarmManager am = (AlarmManager) act.getSystemService(Context.ALARM_SERVICE);
            if (am != null) am.cancel(pending());
        } catch (Throwable t) { Log.e(TAG, "cancel", t); }
    }

    // ------------------------------------------------------------------
    // vídeos guardados no aparelho
    // ------------------------------------------------------------------
    static String key(String url) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] b = md.digest(url.getBytes("UTF-8"));
            StringBuilder s = new StringBuilder();
            for (int i = 0; i < 12; i++) s.append(String.format("%02x", b[i] & 0xff));
            return s.toString() + ".mp4";
        } catch (Exception e) {
            return Integer.toHexString(url.hashCode()) + ".mp4";
        }
    }

    String local(String url) {
        if (url == null || !url.startsWith("http")) return null;
        File f = new File(dir, key(url));
        return f.isFile() && f.length() > 0 ? f.getAbsolutePath() : null;
    }

    void prefetch(String json) {
        try {
            JSONArray a = new JSONArray(json);
            HashSet<String> keep = new HashSet<String>();
            for (int i = 0; i < a.length(); i++) {
                String u = a.optString(i, "");
                if (!u.startsWith("http")) continue;
                keep.add(key(u));
                if (local(u) == null) want(u);
            }
            File[] fs = dir.listFiles();
            if (fs != null) for (File f : fs) {
                String n = f.getName();
                if (n.endsWith(".part") ? !keep.contains(n.substring(0, n.length() - 5)) : !keep.contains(n)) f.delete();
            }
        } catch (Throwable t) { Log.e(TAG, "prefetch", t); }
    }

    void want(String url) {
        synchronized (queue) {
            if (url.equals(loading) || queue.contains(url)) return;
            queue.add(url);
            if (loader == null) {
                loader = new Thread(new Runnable() { public void run() { loadAll(); } }, "sp-videos");
                loader.setPriority(Thread.MIN_PRIORITY);
                loader.start();
            }
        }
    }

    void loadAll() {
        for (;;) {
            String url;
            synchronized (queue) {
                url = queue.poll();
                loading = url;
                if (url == null) { loader = null; return; }
            }
            for (int tries = 0; tries < 3 && local(url) == null; tries++) {
                if (!download(url)) SystemClock.sleep(15000);
            }
        }
    }

    boolean download(String url) {
        File out = new File(dir, key(url)), part = new File(dir, key(url) + ".part");
        HttpURLConnection c = null;
        try {
            long have = part.isFile() ? part.length() : 0;
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setInstanceFollowRedirects(true);
            if (have > 0) c.setRequestProperty("Range", "bytes=" + have + "-");
            int code = c.getResponseCode();
            if (code != 200 && code != 206) return false;
            boolean append = code == 206 && have > 0;      // continua o que já tinha baixado
            InputStream in = c.getInputStream();
            OutputStream os = new FileOutputStream(part, append);
            byte[] buf = new byte[65536];
            int n;
            try {
                while ((n = in.read(buf)) > 0) { os.write(buf, 0, n); if (n < buf.length) SystemClock.sleep(2); }
            } finally { os.close(); in.close(); }
            long want = c.getContentLength();
            if (want > 0 && part.length() != want + (append ? have : 0)) return false;   // incompleto: continua na próxima
            return part.renameTo(out);
        } catch (Throwable t) {
            Log.w(TAG, "download " + url + ": " + t);
            return false;                          // o pedaço baixado fica para continuar depois
        } finally {
            if (c != null) c.disconnect();
        }
    }

    // ------------------------------------------------------------------
    // saúde do aparelho
    // ------------------------------------------------------------------
    JSONObject devInfo;

    String info() {
        try {
            JSONObject o = new JSONObject();
            o.put("nv", VERSION);
            o.put("uptime", SystemClock.elapsedRealtime() / 1000);
            int t = temperature();
            if (t > 0) o.put("temp", t);
            ActivityManager am = (ActivityManager) act.getSystemService(Context.ACTIVITY_SERVICE);
            if (am != null) {
                ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
                am.getMemoryInfo(mi);
                o.put("memFreeMB", mi.availMem / 1048576);
                o.put("memMB", mi.totalMem / 1048576);
                o.put("lowMem", mi.lowMemory);
            }
            o.put("reloads", reloads);
            o.put("memAvailMB", meminfo("MemAvailable:"));
            o.put("load", firstLine("/proc/loadavg"));
            if (prevLife.length() > 0) o.put("prev", new JSONObject(prevLife));
            if (devInfo == null) devInfo = device();
            o.put("hw", devInfo);
            File[] fs = dir.listFiles();
            long bytes = 0; int n = 0;
            if (fs != null) for (File f : fs) if (f.getName().endsWith(".mp4")) { bytes += f.length(); n++; }
            o.put("videos", n);
            o.put("videosMB", bytes / 1048576);
            return o.toString();
        } catch (Throwable t) {
            return "{\"nv\":\"" + VERSION + "\"}";
        }
    }

    /** a cada 10 s: tempo ligado, o que toca, memória e temperatura (lido no próximo início) */
    void life() {
        try {
            JSONObject o = new JSONObject();
            o.put("up", SystemClock.elapsedRealtime() / 1000);
            o.put("at", System.currentTimeMillis() / 1000);
            o.put("video", cur != 0 ? nowUrl.substring(nowUrl.lastIndexOf('/') + 1) : "");
            o.put("temp", temperature());
            o.put("memAvailMB", meminfo("MemAvailable:"));
            o.put("load", firstLine("/proc/loadavg"));
            File f = new File(act.getFilesDir(), "vida.json"), t = new File(act.getFilesDir(), "vida.tmp");
            FileOutputStream os = new FileOutputStream(t);
            try { os.write(o.toString().getBytes("UTF-8")); os.getFD().sync(); } finally { os.close(); }
            t.renameTo(f);
        } catch (Throwable t) { Log.e(TAG, "life", t); }
    }

    static String readFile(File f) {
        if (!f.isFile()) return "";
        BufferedReader r = null;
        try {
            r = new BufferedReader(new FileReader(f));
            StringBuilder b = new StringBuilder(); String l;
            while ((l = r.readLine()) != null && b.length() < 4000) b.append(l);
            return b.toString();
        } catch (Throwable t) { return ""; }
        finally { try { if (r != null) r.close(); } catch (Throwable t) { /* nada */ } }
    }

    static String firstLine(String path) {
        BufferedReader r = null;
        try { r = new BufferedReader(new FileReader(path)); String l = r.readLine(); return l == null ? "" : l.trim(); }
        catch (Throwable t) { return ""; }
        finally { try { if (r != null) r.close(); } catch (Throwable t) { /* nada */ } }
    }

    /** valor (MB) de uma linha do /proc/meminfo — a memória de verdade, mesmo em aparelho que mostra números falsos */
    static long meminfo(String key) {
        BufferedReader r = null;
        try {
            r = new BufferedReader(new FileReader("/proc/meminfo"));
            String l;
            while ((l = r.readLine()) != null) if (l.startsWith(key)) {
                String[] p = l.substring(key.length()).trim().split("\\s+");
                return Long.parseLong(p[0]) / 1024;
            }
        } catch (Throwable t) { /* nada */ }
        finally { try { if (r != null) r.close(); } catch (Throwable t) { /* nada */ } }
        return -1;
    }

    static String prop(String name) {
        try {
            Process pr = Runtime.getRuntime().exec(new String[] { "getprop", name });
            BufferedReader r = new BufferedReader(new java.io.InputStreamReader(pr.getInputStream()));
            String l = r.readLine(); r.close(); pr.destroy();
            return l == null ? "" : l.trim();
        } catch (Throwable t) { return ""; }
    }

    /** por que o aparelho reiniciou e o que ele é de verdade (chip, Android real) */
    static JSONObject device() {
        JSONObject o = new JSONObject();
        String[] keys = { "sys.boot.reason", "ro.boot.bootreason", "persist.sys.boot.reason", "ro.boot.reboot_mode", "ro.boot.reboot_reason",
                          "ro.board.platform", "ro.hardware", "ro.product.board", "ro.build.version.release", "ro.build.version.sdk", "ro.product.cpu.abi" };
        for (String k : keys) {
            String v = prop(k);
            try { if (v.length() > 0) o.put(k, v.length() > 60 ? v.substring(0, 60) : v); } catch (Throwable t) { /* nada */ }
        }
        try {
            String c = firstLine("/proc/cmdline");
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("(\\S*(?:boot_?reason|reboot_mode|bootmode)\\S*)").matcher(c);
            StringBuilder b = new StringBuilder();
            while (m.find() && b.length() < 160) b.append(m.group(1)).append(' ');
            if (b.length() > 0) o.put("cmdline", b.toString().trim());
            o.put("memRealMB", meminfo("MemTotal:"));
            android.os.StatFs st = new android.os.StatFs("/data");
            o.put("dataFreeMB", st.getAvailableBytes() / 1048576);
            o.put("dataMB", st.getTotalBytes() / 1048576);
        } catch (Throwable t) { /* nada */ }
        return o;
    }

    /** maior temperatura informada pelo aparelho, em °C (0 se não informar) */
    static int temperature() {
        int best = 0;
        String[] extra = { "/sys/devices/virtual/thermal/thermal_zone0/temp", "/sys/class/hwmon/hwmon0/temp1_input",
                           "/sys/devices/system/cpu/cpu0/cpufreq/cpu_temp", "/sys/class/thermal/thermal_zone0/temp" };
        for (int i = 0; i < 10 + extra.length; i++) {
            File f = i < extra.length ? new File(extra[i]) : new File("/sys/class/thermal/thermal_zone" + (i - extra.length) + "/temp");
            if (!f.exists()) continue;
            BufferedReader r = null;
            try {
                r = new BufferedReader(new FileReader(f));
                String s = r.readLine();
                if (s == null) continue;
                int v = Integer.parseInt(s.trim());
                if (v > 1000) v = v / 1000;      // miligraus
                if (v > best && v < 150) best = v;
            } catch (Throwable t) {
                /* nada */
            } finally {
                try { if (r != null) r.close(); } catch (Throwable t) { /* nada */ }
            }
        }
        return best;
    }
}
