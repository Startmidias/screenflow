package org.json;
import java.util.*;
public class JSONArray {
  List<String> v = new ArrayList<String>();
  public JSONArray(String json) throws JSONException {
    String s = json.trim(); if (!s.startsWith("[") || !s.endsWith("]")) throw new JSONException("not array");
    java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"((?:[^\"\\\\]|\\\\.)*)\"").matcher(s); while (m.find()) v.add(m.group(1).replace("\\/", "/"));
  }
  public int length() { return v.size(); }
  public String optString(int i, String f) { return i < v.size() ? v.get(i) : f; }
}
