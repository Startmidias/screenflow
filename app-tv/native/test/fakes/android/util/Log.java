package android.util;
public final class Log {
  public static int i(String t, String m) { System.out.println("    [i] " + m); return 0; }
  public static int w(String t, String m) { System.out.println("    [w] " + m); return 0; }
  public static int e(String t, String m, Throwable tr) { System.out.println("    [e] " + m + " " + tr); return 0; }
}
