package android.view;
public class SurfaceView extends View {
  public Holder holder = new Holder();
  public static class Holder implements SurfaceHolder { public Callback cb; public void addCallback(Callback c) { cb = c; } }
  public SurfaceView(android.content.Context c) { super(c); }
  public SurfaceHolder getHolder() { return holder; }
}
