package android.app;
public final class PendingIntent {
  public static final int FLAG_UPDATE_CURRENT = 0x08000000;
  public android.content.Intent intent; public int flags;
  public static PendingIntent getActivity(android.content.Context c, int rc, android.content.Intent i, int f) { PendingIntent p = new PendingIntent(); p.intent = i; p.flags = f; return p; }
}
