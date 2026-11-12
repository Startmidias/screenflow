package android.webkit;
import java.util.*;
public class WebView extends android.view.ViewGroup {
  public List<String> js = new ArrayList<String>(); public Object iface; public String ifaceName; public int reloads; public String url = "https://startmidias.github.io/screenflow/";
  public WebView(android.content.Context c) { super(c); }
  public void addJavascriptInterface(Object o, String n) { iface = o; ifaceName = n; }
  public void evaluateJavascript(String s, ValueCallback<String> cb) { js.add(s); }
  public void reload() { reloads++; }
  public String getUrl() { return url; }
}
