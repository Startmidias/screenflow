package android.os;
import java.util.*;
public class Handler {
  static class T { long at; long seq; Runnable r; }
  public static final List<T> Q = new ArrayList<T>(); static long seq;
  public Handler(Looper l) { }
  public final boolean post(Runnable r) { return postDelayed(r, 0); }
  public final synchronized boolean postDelayed(Runnable r, long d) { synchronized (Q) { T t = new T(); t.at = SystemClock.now + d; t.seq = seq++; t.r = r; Q.add(t); } return true; }
  public final void removeCallbacks(Runnable r) { synchronized (Q) { for (Iterator<T> i = Q.iterator(); i.hasNext();) if (i.next().r == r) i.remove(); } }
  /** avança o relógio de mentira executando o que vence */
  public static void pump(long ms) {
    long end = SystemClock.now + ms;
    for (;;) {
      T best = null;
      synchronized (Q) { for (T t : Q) if (t.at <= end && (best == null || t.at < best.at || (t.at == best.at && t.seq < best.seq))) best = t; if (best != null) Q.remove(best); }
      if (best == null) break;
      if (best.at > SystemClock.now) SystemClock.now = best.at;
      best.r.run();
    }
    SystemClock.now = end;
  }
}
