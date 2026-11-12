package android.webkit;
public class WebView extends android.view.ViewGroup {
  public WebView(android.content.Context c) { super(c); }
  public void addJavascriptInterface(Object object, String name) { }
  public void evaluateJavascript(String script, ValueCallback<String> resultCallback) { }
  public void loadUrl(String u) { }
  public void reload() { }
  public String getUrl() { return null; }
}
