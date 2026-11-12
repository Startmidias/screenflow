package android.os;
public final class SystemClock {
  public static long now = 100000;
  public static long elapsedRealtime() { return now; }
  public static void sleep(long ms) { try { Thread.sleep(Math.min(ms, 20)); } catch (InterruptedException e) { } }
}
