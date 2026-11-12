package android.view;
public abstract class ViewGroup extends View {
  public ViewGroup(android.content.Context c) { super(c); }
  public static class LayoutParams { public int width, height; public LayoutParams(int width, int height) { } }
  public static class MarginLayoutParams extends LayoutParams { public int leftMargin, topMargin, rightMargin, bottomMargin; public MarginLayoutParams(int w, int h) { super(w, h); } }
  public void addView(View child, int index, LayoutParams params) { }
}
