package android.media;
import java.util.*;
public class MediaPlayer {
  public static final int MEDIA_INFO_VIDEO_RENDERING_START = 3;
  public interface OnPreparedListener { void onPrepared(MediaPlayer mp); }
  public interface OnCompletionListener { void onCompletion(MediaPlayer mp); }
  public interface OnErrorListener { boolean onError(MediaPlayer mp, int what, int extra); }
  public interface OnInfoListener { boolean onInfo(MediaPlayer mp, int what, int extra); }
  public interface OnVideoSizeChangedListener { void onVideoSizeChanged(MediaPlayer mp, int width, int height); }
  public static int created; public static MediaPlayer last;
  public List<String> log = new ArrayList<String>();
  public OnPreparedListener prep; public OnCompletionListener comp; public OnErrorListener err; public OnInfoListener info; public OnVideoSizeChangedListener size;
  public String src; public int pos, dur = 50000; public float vol = -1; public Object display; public boolean released;
  public MediaPlayer() { created++; last = this; }
  public void setOnPreparedListener(OnPreparedListener l) { prep = l; }
  public void setOnCompletionListener(OnCompletionListener l) { comp = l; }
  public void setOnErrorListener(OnErrorListener l) { err = l; }
  public void setOnInfoListener(OnInfoListener l) { info = l; }
  public void setOnVideoSizeChangedListener(OnVideoSizeChangedListener l) { size = l; }
  public void reset() { log.add("reset"); src = null; pos = 0; }
  public void release() { log.add("release"); released = true; }
  public void setDataSource(String p) throws java.io.IOException { if (released) throw new IllegalStateException(); log.add("src " + p); src = p; }
  public void setDisplay(android.view.SurfaceHolder sh) { log.add("display " + (sh != null)); display = sh; }
  public void setVolume(float l, float r) { vol = l; }
  public void prepareAsync() { log.add("prepare"); }
  public void start() { log.add("start"); }
  public int getDuration() { return dur; }
  public int getCurrentPosition() { return pos; }
}
