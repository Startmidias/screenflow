package org.json;
import java.util.*;
public class JSONObject {
  LinkedHashMap<String, Object> m = new LinkedHashMap<String, Object>();
  public JSONObject() { }
  String raw;
  public JSONObject(String json) throws JSONException { if (!json.trim().startsWith("{")) throw new JSONException("x"); raw = json.trim(); }
  public JSONObject put(String n, boolean v) throws JSONException { m.put(n, v); return this; }
  public JSONObject put(String n, double v) throws JSONException { m.put(n, v); return this; }
  public JSONObject put(String n, int v) throws JSONException { m.put(n, v); return this; }
  public JSONObject put(String n, long v) throws JSONException { m.put(n, v); return this; }
  public JSONObject put(String n, Object v) throws JSONException { m.put(n, v); return this; }
  public static String quote(String d) { return "\"" + d.replace("\\", "\\\\").replace("\"", "\\\"") + "\""; }
  public String toString() { if (raw != null) return raw;
    return str(); }
  String str() { StringBuilder b = new StringBuilder("{"); for (Map.Entry<String, Object> e : m.entrySet()) { if (b.length() > 1) b.append(','); b.append(quote(e.getKey())).append(':'); Object v = e.getValue(); b.append(v instanceof String ? quote((String) v) : String.valueOf(v)); } return b.append('}').toString(); }
}
