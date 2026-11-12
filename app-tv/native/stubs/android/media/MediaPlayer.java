package android.media;
public class MediaPlayer {
  public static final int MEDIA_INFO_VIDEO_RENDERING_START = 3;
  public interface OnPreparedListener { void onPrepared(MediaPlayer mp); }
  public interface OnCompletionListener { void onCompletion(MediaPlayer mp); }
  public interface OnErrorListener { boolean onError(MediaPlayer mp, int what, int extra); }
  public interface OnInfoListener { boolean onInfo(MediaPlayer mp, int what, int extra); }
  public interface OnVideoSizeChangedListener { void onVideoSizeChanged(MediaPlayer mp, int width, int height); }
  public MediaPlayer() { throw new RuntimeException("stub"); }
  public void setOnPreparedListener(OnPreparedListener l) { }
  public void setOnCompletionListener(OnCompletionListener l) { }
  public void setOnErrorListener(OnErrorListener l) { }
  public void setOnInfoListener(OnInfoListener l) { }
  public void setOnVideoSizeChangedListener(OnVideoSizeChangedListener l) { }
  public void reset() { }
  public void release() { }
  public void setDataSource(String path) throws java.io.IOException { }
  public void setDisplay(android.view.SurfaceHolder sh) { }
  public void setVolume(float leftVolume, float rightVolume) { }
  public void prepareAsync() { }
  public void start() { }
  public int getDuration() { return 0; }
  public int getCurrentPosition() { return 0; }
}
