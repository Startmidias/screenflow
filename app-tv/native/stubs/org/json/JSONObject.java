package org.json;
public class JSONObject {
  public JSONObject() { }
  public JSONObject(String json) throws JSONException { }
  public JSONObject put(String name, boolean value) throws JSONException { return this; }
  public JSONObject put(String name, double value) throws JSONException { return this; }
  public JSONObject put(String name, int value) throws JSONException { return this; }
  public JSONObject put(String name, long value) throws JSONException { return this; }
  public JSONObject put(String name, Object value) throws JSONException { return this; }
  public static String quote(String data) { return ""; }
}
