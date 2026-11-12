package com.screenflow.tv.nv;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.AlarmManager;
import android.content.ContextWrapper;
import android.media.MediaPlayer;
import android.os.Handler;
import android.os.SystemClock;
import android.view.SurfaceView;
import android.webkit.WebView;
import android.widget.FrameLayout;

import com.sun.net.httpserver.HttpServer;

import java.io.File;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.file.Files;

/** Testa a lógica do vídeo nativo (NativeVideo) na JVM, com um Android de mentira. */
public class NVTest {
    static int pass, fail;
    static void ok(String name, boolean c, Object extra) {
        if (c) pass++; else fail++;
        System.out.println((c ? "  ✓ " : "  ✗ ") + name + (extra != null ? "  [" + extra + "]" : ""));
    }
    static String last(WebView w) { return w.js.isEmpty() ? "" : w.js.get(w.js.size() - 1); }
    static int count(WebView w, String s) { int n = 0; for (String j : w.js) if (j.contains(s)) n++; return n; }

    public static void main(String[] a) throws Exception {
        File files = Files.createTempDirectory("nv").toFile();
        ContextWrapper.FILES = files;
        AlarmManager alarm = new AlarmManager(); ContextWrapper.ALARM = alarm; ContextWrapper.AM = new ActivityManager();
        byte[] video = new byte[300000]; for (int i = 0; i < video.length; i++) video[i] = (byte) i;
        HttpServer http = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        final byte[] body = video;
        final java.util.List<String> ranges = new java.util.ArrayList<String>();
        http.createContext("/", ex -> {
            if (ex.getRequestURI().getPath().contains("404")) { ex.sendResponseHeaders(404, -1); ex.close(); return; }
            String r = ex.getRequestHeaders().getFirst("Range");
            int from = 0;
            if (r != null) { ranges.add(r); from = Integer.parseInt(r.replaceAll("\\D*(\\d+)-.*", "$1")); ex.getResponseHeaders().add("Content-Range", "bytes " + from + "-" + (body.length - 1) + "/" + body.length); }
            ex.sendResponseHeaders(r != null ? 206 : 200, body.length - from);
            OutputStream os = ex.getResponseBody(); os.write(body, from, body.length - from); os.close(); ex.close(); });
        http.start();
        String base = "http://127.0.0.1:" + http.getAddress().getPort() + "/";

        System.out.println("1) Ligação com o app");
        Activity act = new Activity();
        FrameLayout root = new FrameLayout(act);
        WebView player = new WebView(act); player.bg = 0xff000000; root.addView(player, 0, null);
        NativeVideo.attach(act, root, player);
        NativeVideo n = NativeVideo.inst;
        ok("sem vídeo, nada muda na tela (superfície só no 1º vídeo)", n != null && root.kids.size() == 1 && player.bg == 0xff000000, root.kids.size());
        ok("ponte SPVideo disponível para a página", "SPVideo".equals(player.ifaceName), player.ifaceName);
        NativeVideo.Js js = (NativeVideo.Js) player.iface;
        ok("versão 2.0.1", "2.0.1".equals(js.version()), js.version());
        Handler.pump(10);
        ok("vigia do app armado (reabre se o app cair)", alarm.sets >= 1 && alarm.type == AlarmManager.ELAPSED_REALTIME && alarm.at > SystemClock.now, alarm.sets);

        System.out.println("2) Tocar um vídeo (ainda não guardado: toca pela internet e baixa)");
        String u1 = base + "a.mp4";
        js.play(1, u1, 0, 0, 1280, 668, false);
        Handler.pump(1);
        ok("1º vídeo: superfície entra por baixo das páginas e o player fica transparente", root.kids.get(0) instanceof SurfaceView && root.kids.get(1) == player && player.bg == 0, root.kids.size());
        SurfaceView sv = (SurfaceView) root.kids.get(0);
        MediaPlayer mp = MediaPlayer.last;
        ok("espera a superfície existir para mostrar", mp.display == null, null);
        sv.holder.cb.surfaceCreated(sv.holder);
        ok("um MediaPlayer, com a superfície e o endereço", MediaPlayer.created == 1 && u1.equals(mp.src) && mp.display != null && mp.log.contains("prepare"), mp.log);
        ok("com som", mp.vol == 1f, mp.vol);
        mp.prep.onPrepared(mp);
        ok("começa assim que fica pronto", mp.log.contains("start"), null);
        mp.info.onInfo(mp, MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START, 0);
        Handler.pump(1);
        ok("avisa a página quando o 1º quadro aparece", last(player).contains("onVideo(1,'playing',50000"), last(player));
        Handler.pump(500);
        ok("avisa só uma vez", count(player, "'playing'") == 1, count(player, "'playing'"));
        mp.size.onVideoSizeChanged(mp, 1920, 1080);
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) sv.lp;
        ok("16:9 numa área 1280×668 preenche a área (corta uma faixa fina)", lp.width == 1280 && lp.height == 720 && lp.leftMargin == 0 && lp.topMargin == -26,
           lp.width + "x" + lp.height + " @" + lp.leftMargin + "," + lp.topMargin);
        int[] v = NativeVideo.place(1080, 1920, 0, 0, 1280, 720);
        ok("vídeo em pé numa TV deitada aparece inteiro, centralizado", v[2] == 405 && v[3] == 720 && v[0] == 437 && v[1] == 0, v[0] + "," + v[1] + " " + v[2] + "x" + v[3]);
        for (int i = 0; i < 100 && js.has(u1) == false; i++) Thread.sleep(20);
        ok("o vídeo fica guardado no aparelho", js.has(u1) && new File(n.local(u1)).length() == video.length, n.local(u1));

        System.out.println("3) Vídeo terminou e o próximo (mesmo MediaPlayer, decodificador solto antes)");
        mp.pos = 1000; Handler.pump(2000); mp.pos = 3000; Handler.pump(2000);
        mp.comp.onCompletion(mp);
        Handler.pump(1);
        ok("avisa o fim", last(player).contains("onVideo(1,'ended'"), last(player));
        js.play(2, u1, 0, 0, 1280, 720, true);
        Handler.pump(1);
        ok("reaproveita o MediaPlayer (nunca 2 decodificadores)", MediaPlayer.created == 1 && mp.log.lastIndexOf("reset") > mp.log.indexOf("start"), mp.log);
        ok("agora toca o arquivo guardado, sem internet", mp.src != null && mp.src.startsWith(files.getAbsolutePath()), mp.src);
        ok("mudo quando a página pede", mp.vol == 0f, mp.vol);

        System.out.println("4) Vídeo travado");
        mp.prep.onPrepared(mp); Handler.pump(450);
        mp.pos = 5000; Handler.pump(2000);
        Handler.pump(14000);
        ok("parado no mesmo ponto por 12 s: avisa 'error' e solta o decodificador", last(player).contains("onVideo(2,'error'") && last(player).contains("travou"), last(player));

        System.out.println("5) Vídeo que não abre / erro do decodificador");
        js.play(3, base + "b.mp4", 0, 0, 1280, 720, false);
        Handler.pump(26000);
        ok("não começou em 25 s: avisa a página", last(player).contains("onVideo(3,'error'") && last(player).contains("não abriu"), last(player));
        js.play(4, base + "c.mp4", 0, 0, 1280, 720, false);
        Handler.pump(1);
        mp.prep.onPrepared(mp); Handler.pump(1);
        mp.err.onError(mp, 1, -1004);
        Handler.pump(1);
        ok("erro do decodificador: avisa e descarta o MediaPlayer", last(player).contains("onVideo(4,'error',1") && mp.released, last(player));
        js.play(5, base + "c.mp4", 0, 0, 1280, 720, false);
        Handler.pump(1);
        ok("o próximo vídeo cria um MediaPlayer novo", MediaPlayer.created == 2 && MediaPlayer.last != mp, MediaPlayer.created);
        mp = MediaPlayer.last;
        js.stop(); Handler.pump(1);
        ok("parar solta o decodificador", mp.log.get(mp.log.size() - 1).equals("reset"), mp.log);
        int before = player.js.size();
        mp.comp.onCompletion(mp); Handler.pump(1);
        ok("evento atrasado de um vídeo já parado é ignorado", player.js.size() == before, null);

        System.out.println("6) Guardar só o que está na programação");
        js.prefetch("[\"" + base + "d.mp4\",\"" + base + "a.mp4\"]");
        for (int i = 0; i < 150 && !js.has(base + "d.mp4"); i++) Thread.sleep(20);
        ok("baixa o que falta", js.has(base + "d.mp4"), null);
        js.prefetch("[\"" + base + "d.mp4\"]");
        ok("apaga o que saiu da programação", !js.has(u1) && js.has(base + "d.mp4"), null);
        js.prefetch("[\"" + base + "404.mp4\"]");
        Thread.sleep(300);
        ok("arquivo que não existe não trava nada", !js.has(base + "404.mp4"), null);

        System.out.println("7) Página travada e app em segundo plano");
        js.ping(); Handler.pump(60000);
        ok("página dando sinal: nada acontece", player.reloads == 0, player.reloads);
        Handler.pump(100000);
        ok("2,5 min sem sinal: recarrega a página do player", player.reloads == 1, player.reloads);
        Handler.pump(10000);
        ok("não fica recarregando em sequência", player.reloads == 1, player.reloads);
        NativeVideo.onPause();
        ok("menu/outro app aberto: o vigia sai (não puxa a TV de volta)", alarm.at == -1 && alarm.cancels >= 1, alarm.cancels);
        Handler.pump(400000);
        ok("e não recarrega a página enquanto isso", player.reloads == 1, player.reloads);
        NativeVideo.onResume(); Handler.pump(10);
        ok("voltou: vigia armado de novo", alarm.at > SystemClock.now, null);

        System.out.println("8) Saúde do aparelho");
        String info = js.info();
        ok("informa versão, tempo ligado e memória", info.contains("\"nv\":\"2.0.1\"") && info.contains("\"uptime\":") && info.contains("\"memFreeMB\":300"), info);
        ok("informa a memória de verdade (/proc/meminfo) e o espaço livre", info.contains("\"memRealMB\":") && info.contains("\"dataFreeMB\":") && !info.contains("\"memRealMB\":-1"), null);
        File vida = new File(files, "vida.json");
        ok("guarda o último sinal de vida a cada 10 s (sobrevive ao reinício)", vida.isFile() && NativeVideo.readFile(vida).contains("\"up\":"), NativeVideo.readFile(vida));

        System.out.println("9) Download que continua de onde parou");
        String u9 = base + "parcial.mp4";
        File part = new File(new File(files, "videos"), NativeVideo.key(u9) + ".part");
        java.io.FileOutputStream fo = new java.io.FileOutputStream(part); fo.write(video, 0, 100000); fo.close();
        js.prefetch("[\"" + u9 + "\"]");
        for (int i = 0; i < 150 && !js.has(u9); i++) Thread.sleep(20);
        byte[] got = js.has(u9) ? Files.readAllBytes(new File(n.local(u9)).toPath()) : new byte[0];
        ok("pede só o que falta (Range) e o arquivo fica inteiro", ranges.contains("bytes=100000-") && java.util.Arrays.equals(got, video), ranges + " " + got.length);

        System.out.println("10) O Android recriou a tela do app");
        MediaPlayer before2 = MediaPlayer.last;
        FrameLayout root2 = new FrameLayout(act);
        WebView player2 = new WebView(act); player2.bg = 0xff000000; root2.addView(player2, 0, null);
        NativeVideo.attach(act, root2, player2);
        ok("a página da tela antiga é desligada (não fica tocando escondida)", player.loads.contains("about:blank"), player.loads);
        ok("o vídeo da tela antiga é solto", n.mp == null && n.cur == 0, null);
        ok("a tela nova assume", NativeVideo.inst != n && NativeVideo.inst.web == player2, null);
        String info2 = ((NativeVideo.Js) player2.iface).info();
        ok("lê como o aparelho estava antes (último sinal de vida)", info2.contains("\"prev\":{\"up\":"), info2);

        http.stop(0);
        System.out.println("\n" + pass + " de " + (pass + fail) + " verificações passaram");
        System.exit(fail == 0 ? 0 : 1);
    }
}
