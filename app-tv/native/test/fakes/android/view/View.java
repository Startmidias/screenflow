package android.view;
public class View {
  public ViewGroup.LayoutParams lp; public int bg = -1; public int w = 1280, h = 720;
  public View(android.content.Context c) { }
  public void setLayoutParams(ViewGroup.LayoutParams p) { lp = p; }
  public void setBackgroundColor(int c) { bg = c; }
  public final int getWidth() { return w; }
  public final int getHeight() { return h; }
}
