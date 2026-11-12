package android.view;
import java.util.*;
public abstract class ViewGroup extends View {
  public List<View> kids = new ArrayList<View>();
  public ViewGroup(android.content.Context c) { super(c); }
  public static class LayoutParams { public int width, height; public LayoutParams(int w, int h) { width = w; height = h; } }
  public static class MarginLayoutParams extends LayoutParams { public int leftMargin, topMargin, rightMargin, bottomMargin; public MarginLayoutParams(int w, int h) { super(w, h); } }
  public void addView(View child, int index, LayoutParams params) { kids.add(index, child); child.lp = params; }
}
