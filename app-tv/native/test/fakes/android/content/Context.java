package android.content;
public abstract class Context {
  public static final String ALARM_SERVICE = "alarm";
  public static final String ACTIVITY_SERVICE = "activity";
  public abstract Object getSystemService(String name);
  public abstract java.io.File getFilesDir();
}
