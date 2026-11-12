package android.os;
public class StatFs {
  java.io.File f;
  public StatFs(String path) { f = new java.io.File("/tmp"); }
  public long getAvailableBytes() { return f.getUsableSpace(); }
  public long getTotalBytes() { return f.getTotalSpace(); }
}
