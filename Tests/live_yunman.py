"""Uses the actual Android adapter's headers to establish a live protocol baseline.
Does not validate Swift binary execution. No keys/cookies are stored in the report.
"""
from pathlib import Path
import json,time,uuid,subprocess,urllib.request,urllib.error,urllib.parse,os,sys
ROOT=Path(__file__).resolve().parent
report={"note":"Android reference protocol live test; Swift iOS binary not tested","requests":[],"sources":{}}
if "--retry-failed" in sys.argv and (ROOT/"live-results.json").exists():
 report=json.loads((ROOT/"live-results.json").read_text())
base="https://mangayun.com"
def request(path,payload=None):
 body="" if payload is None else json.dumps(payload,ensure_ascii=False,separators=(",",":"))
 ts=str(int(time.time()*1000));nonce=uuid.uuid4().hex[:12]
 run=subprocess.run(["java",str(ROOT/"AndroidVisitorReference.java"),path,body,ts,nonce],check=True,capture_output=True,text=True,timeout=10)
 headers=dict(line.split(": ",1) for line in run.stdout.splitlines())
 headers.update({"User-Agent":"Qingying-iPad/1.1.40","Referer":base+"/","Origin":base,"Accept":"application/json","Content-Type":"application/json; charset=UTF-8"})
 print("Request "+path,flush=True)
 row={"path":path,"method":"GET" if payload is None else "POST"};report["requests"].append(row)
 args=["curl","--connect-timeout","10","--silent","--show-error","--max-time","22","-w","\n%{http_code}",base+path]
 for k,v in headers.items():args.extend(["-H",k+": "+v])
 if payload is not None:args.extend(["--data-binary",body])
 try:
  res=subprocess.run(args,capture_output=True,text=True,timeout=26)
  content,_,status=res.stdout.rpartition("\n")
  row["status"]=int(status) if status.isdigit() else 0
  (ROOT/"live-results.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))
  print("HTTP "+str(row["status"]),flush=True)
  if res.returncode:raise RuntimeError(res.stderr.strip())
  if row["status"]!=200:row["error"]=content[:1000];raise RuntimeError("HTTP "+status)
  data=json.loads(content);row["hasData"]="data" in data
  if data.get("error") or "data" not in data:raise RuntimeError(str(data)[:240])
  return data["data"]
 except Exception as e:row.setdefault("error",str(e)[:250]);raise

try:
 groups=request("/api/search",{"keyword":"我家老婆来自一千年前"})
 request("/api/home-sections")
 for site in ["manhuazhijia","rumanhua","dumanwu"]:
  if "--retry-failed" in sys.argv and report["sources"].get(site,{}).get("passed"):continue
  result=report["sources"][site]={}
  try:
   group=next(g for g in groups if g.get("siteId")==site)
   books=[r for r in group.get("results",[]) if r.get("detailUrl")]
   book=books[min(1,len(books)-1)] if "--second-result" in sys.argv else books[0]
   result["searchResults"]=len(group["results"])
   detail=request("/api/details",{"siteId":site,"detailUrl":book["detailUrl"]})
   chapters=detail.get("chapters",[]);result["chapters"]=len(chapters)
   chapter=request("/api/chapter-images",{"siteId":site,"chapterUrl":chapters[0]["url"],"refresh":False})
   images=chapter.get("images",[]);result["images"]=len(images)
   if not images:raise RuntimeError("No images")
   u=urllib.parse.urljoin(base,images[0])
   image=subprocess.run(["curl","--silent","--show-error","--connect-timeout","10","--max-time","14","--max-filesize","24000000","-w","\n%{http_code}","-H","Referer: "+base+"/",u],capture_output=True,timeout=18)
   raw,_,status=image.stdout.rpartition(b"\n");result["imageHTTP"]=int(status) if status.isdigit() else 0
   result["imageMagic"]=raw.startswith((b"\xff\xd8",b"\x89PNG",b"RIFF",b"GIF8"))

   result["passed"]=result["imageHTTP"]==200 and result["imageMagic"]
  except Exception as e:result["error"]=str(e)[:250];result["passed"]=False
except Exception as e:report["stopped"]=str(e)[:250]
finally:
 out=ROOT/"live-results.json";out.write_text(json.dumps(report,ensure_ascii=False,indent=2));print(out.read_text())
