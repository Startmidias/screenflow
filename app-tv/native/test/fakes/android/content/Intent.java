package android.content;
public class Intent {
  public static final int FLAG_ACTIVITY_NEW_TASK = 0x10000000, FLAG_ACTIVITY_CLEAR_TOP = 0x04000000;
  public int flags; public Class<?> cls;
  public Intent(Context c, Class<?> cls) { this.cls = cls; }
  public Intent addFlags(int f) { flags |= f; return this; }
}
