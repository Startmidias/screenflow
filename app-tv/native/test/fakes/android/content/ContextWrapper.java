package android.content;
public class ContextWrapper extends Context {
  public static java.io.File FILES; public static Object ALARM, AM;
  public Object getSystemService(String name) { return "alarm".equals(name) ? ALARM : "activity".equals(name) ? AM : null; }
  public java.io.File getFilesDir() { return FILES; }
}
