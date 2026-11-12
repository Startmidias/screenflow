package android.app;
public class ActivityManager {
  public static class MemoryInfo { public long availMem, totalMem; public boolean lowMemory; public MemoryInfo() { } }
  public void getMemoryInfo(MemoryInfo o) { o.availMem = 300L << 20; o.totalMem = 1024L << 20; o.lowMemory = false; }
}
