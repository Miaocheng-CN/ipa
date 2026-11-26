import java.security.*;import java.nio.charset.StandardCharsets;import java.util.*;
class AndroidVisitorReference {
 public static String sha(String text)throws Exception {byte[] b=MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));StringBuilder out=new StringBuilder();for(byte v:b){out.append("0123456789abcdef".charAt((v&255)>>>4));out.append("0123456789abcdef".charAt(v&15));}return out.toString();}
 static Map<String,String> visitorHeaders(String path,String body,String ts,String nonce,long deadline)throws Exception {
  String feature="1",seed=sha("ym-cloud_ream-2026_v9-aegis_"+Integer.toHexString((2026*7^90)&255)+"|"+(Long.parseLong(ts)/300000)+"|"+path.substring(0,Math.min(12,path.length())));int proof=0;
  while(proof<4096){if(sha(seed+":"+ts+":"+nonce+":"+feature+":"+proof).startsWith("00"))break;proof++;}
  Map<String,String> h=new LinkedHashMap<>();h.put("x-ym-ts",ts);h.put("x-ym-nonce",nonce);h.put("x-ym-feat",feature);h.put("x-ym-pow",String.valueOf(proof));h.put("x-ym-sign",sha(path+"|"+(body.isEmpty()?"":sha(body))+"|"+ts+"|"+nonce+"|"+feature+"|"+proof+"|"+seed));return h;
 }

 public static void main(String[] args)throws Exception{
  for(var e: visitorHeaders(args[0],args[1],args[2],args[3],0).entrySet())
   System.out.println(e.getKey()+": "+e.getValue());
 }
}
