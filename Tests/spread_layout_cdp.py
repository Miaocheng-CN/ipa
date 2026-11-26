# Requires Chromium CDP on port 9260.
import json,time,urllib.request
from pathlib import Path
from websockets.sync.client import connect
for _ in range(75):
 try:
  tab=next(x for x in json.load(urllib.request.urlopen('http://127.0.0.1:9260/json/list',timeout=1)) if x['type']=='page');break
 except (OSError,StopIteration):time.sleep(.4)
else:raise RuntimeError('Browser did not start')
ws=connect(tab['webSocketDebuggerUrl'],proxy=None);seq=0
def cmd(method,params={}):
 global seq
 seq+=1;ws.send(json.dumps(dict(id=seq,method=method,params=params)))
 while True:
  r=json.loads(ws.recv(timeout=5))
  if r.get('id')==seq:
   assert 'error' not in r,r
   return r['result']
def ev(s):return cmd('Runtime.evaluate',{'expression':s,'returnByValue':True})['result'].get('value')
cmd('Page.enable');cmd('Page.navigate',{'url':(Path(__file__).resolve().parent/'spread_layout.html').resolve().as_uri()})
for _ in range(60):
 if ev('!!window.viewer'):break
 time.sleep(.1)
results=[]
for vw,vh,w,h,count in [(1536,1073,720,1600,2),(1024,768,720,1600,2),(768,1024,720,1600,2),(1366,1024,1600,720,2),(768,1024,720,1600,1)]:
 cmd('Emulation.setDeviceMetricsOverride',{'width':vw,'height':vh,'deviceScaleFactor':1,'mobile':False})
 ev(f'fixture({w},{h},{count})')
 for _ in range(60):
  if ev('[...document.querySelectorAll(".spread-cell img")].every(im=>im.naturalWidth>0)'):break
  time.sleep(.05)
 check=ev('''(()=>{
 const m=document.querySelector('main'),s=document.querySelector('#spread'),sheet=document.querySelector('.spread-sheet'),nav=document.querySelector('.spread-nav');
 const r=sheet.getBoundingClientRect(),b=m.getBoundingClientRect();
 return {ok: !nav&&r.top<1&&Math.abs(r.bottom-innerHeight)<=1&&m.scrollHeight<=m.clientHeight+1,
 cells:[...document.querySelectorAll('.spread-cell img')].map(im=>{
 const c=getComputedStyle(im),r=im.getBoundingClientRect();return {fit:c.objectFit,position:c.objectPosition,height:r.height,width:r.width};
 }),viewport:[innerWidth,innerHeight],sheet:[r.top,r.bottom],main:[b.top,b.bottom]};
 })()''')
 assert check['ok'],check
 assert all(c['fit']=='contain' and c['position']=='50% 0%' and c['height']>0 for c in check['cells']),check
 # Controls do not shift the page height.
 before=check['sheet'];ev("document.body.classList.add('reader-controls')")
 assert ev('[document.querySelector(".spread-sheet").getBoundingClientRect().top,document.querySelector(".spread-sheet").getBoundingClientRect().bottom]')==before
 ev("document.body.classList.remove('reader-controls')")
 results.append(check)
# Actual animation: direction, duplicate-turn lock, cleanup, and disabled motion.
ev("window.originalAnimate=Element.prototype.animate;Element.prototype.animate=function(frames,options){window.latestFrames=JSON.stringify(frames);return window.originalAnimate.call(this,frames,options)};fixture(720,1600,2);viewer.o.motion=true;viewer.turn(1)")
assert ev('viewer.index===2 && viewer.animating && !!document.querySelector(".page-turn-back img")')
frames=ev('window.latestFrames');assert '-180' in str(frames)
ev('viewer.turn(1)');assert ev('viewer.index')==2
for _ in range(30):
 if ev('!viewer.animating'):break
 time.sleep(.05)
assert ev('!viewer.animating && !document.querySelector(".page-turn-layer")')
ev('viewer.turn(-1)')
assert ev('viewer.index===0 && viewer.animating')
frames=ev('window.latestFrames');assert '180' in str(frames)
for _ in range(30):
 if ev('!viewer.animating'):break
 time.sleep(.05)
ev('viewer.o.motion=false;viewer.turn(1)')
assert ev('viewer.index===2 && !document.querySelector(".page-turn-layer")')
print('PASS: forward/backward 3D leaf animation, turn lock, cleanup and motion off')
print('PASS: top-aligned, no viewport overflow or navigation overlap; controls do not shift content; 5 viewport/layout cases')
(Path(__file__).resolve().parent/'spread-layout-results.json').write_text(json.dumps(results,indent=2))

# Full reader with mocked native documents; verifies gesture wiring, not network.
mock=(Path(__file__).resolve().parent/'reader_fixture.py').read_text().split('add_init_script("""')[1].split('""")')[0]
cmd('Page.addScriptToEvaluateOnNewDocument',{'source':mock})
cmd('Page.navigate',{'url':(Path(__file__).resolve().parents[1]/'App/Comics/index.html').resolve().as_uri()})
def until(expression):
 for _ in range(100):
  if ev(expression):return
  time.sleep(.05)
 raise AssertionError(expression)
until('!!document.querySelector("[data-do=detail]")')
ev('document.querySelector("[data-do=detail]").click()')
until('!!document.querySelector("[data-do=chapter]")')
ev('document.querySelector("[data-do=chapter]").click()')
until('!!document.querySelector(".reader-chapter")')
ev("window.gestureTarget=()=>document.querySelector('.spread-sheet,.reader-chapter');window.touch=(type,x=100,y=100,n=1)=>{const e=new Event(type,{bubbles:true,cancelable:true});const t={clientX:x,clientY:y};Object.defineProperties(e,{touches:{value:type==='touchend'||type==='touchcancel'?[]:Array(n).fill(t)},changedTouches:{value:[t]}});gestureTarget().dispatchEvent(e)};window.tap=()=>{touch('touchstart');touch('touchend')}")
checks=[]
for layout in ['scroll','single','double']:
 ev("state.layout="+json.dumps(layout)+";openChapter(currentChapter,false)")
 until('!!document.querySelector(".reader-chapter")' if layout=='scroll' else '!!spreadView')
 ev('showReaderControls(false);lastReaderTap=null;lastReaderTouchAt=-10000;gestureTarget().click()')
 assert ev('!readerControls'),layout
 ev("gestureTarget().dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true}))")
 assert ev('readerControls'),layout
 ev('showReaderControls(false);tap()');assert ev('!readerControls'),layout
 time.sleep(.08);ev('tap()');assert ev('readerControls'),layout
 # Synthetic mouse event following touch must not toggle back.
 ev("gestureTarget().dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true}))");assert ev('readerControls'),layout
 ev("lastReaderTap=null;showReaderControls(false);touch('touchstart');touch('touchmove',200);touch('touchend',200);tap()")
 assert ev('!readerControls'),layout
 ev("lastReaderTap=null;touch('touchstart',100,100,2);touch('touchend');tap()")
 assert ev('!readerControls'),layout
 assert ev('!document.querySelector(".spread-nav,#pageProgress")'),layout
 checks.append({'layout':layout,'singleTapIgnored':True,'doubleTapControls':True,'syntheticClickSuppressed':True,'swipeAndPinchIgnored':True,'bottomPageCounterAbsent':True})
(Path(__file__).resolve().parent/'reader-gesture-results.json').write_text(json.dumps(checks,indent=2))
print('PASS: single/double/continuous reader double-tap controls, single-tap ignored, swipe/pinch rejection, no bottom page counter')
