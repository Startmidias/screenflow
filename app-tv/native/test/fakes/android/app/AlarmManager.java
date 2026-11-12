package android.app;
public class AlarmManager {
  public static final int RTC_WAKEUP = 0, RTC = 1, ELAPSED_REALTIME_WAKEUP = 2, ELAPSED_REALTIME = 3;
  public int sets, cancels; public long at = -1; public int type = -1;
  public void set(int type, long t, PendingIntent op) { sets++; at = t; this.type = type; }
  public void cancel(PendingIntent op) { cancels++; at = -1; }
}
