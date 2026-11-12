package android.app;
public class AlarmManager {
  public static final int RTC_WAKEUP = 0, RTC = 1, ELAPSED_REALTIME_WAKEUP = 2, ELAPSED_REALTIME = 3;
  public void set(int type, long triggerAtMillis, PendingIntent operation) { throw new RuntimeException("stub"); }
  public void cancel(PendingIntent operation) { throw new RuntimeException("stub"); }
}
