package android.widget;
public class FrameLayout extends android.view.ViewGroup {
  public FrameLayout(android.content.Context c) { super(c); }
  public static class LayoutParams extends android.view.ViewGroup.MarginLayoutParams { public int gravity; public LayoutParams(int width, int height) { super(width, height); } }
}
