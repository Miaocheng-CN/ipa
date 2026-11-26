'use strict';
const BASE='https://m.wmh1234.com',MAIN=BASE+'/comic/23102.html',OLD=BASE+'/comic/12188.html';
const main=document.getElementById('main'),header=document.getElementById('header'),bottom=document.getElementById('bottom');
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state;try{state=JSON.parse(Native.read())}catch(_){state={}}
let spreadView=null;state.layout=state.layout||"scroll";
state.shelf=Array.isArray(state.shelf)?state.shelf:[];state.history=Array.isArray(state.history)?state.history:[];
const COMIC_SOURCES=[{id:'all',name:'全部来源'},{id:'manhuazhijia',name:'漫画之家'},{id:'rumanhua',name:'如漫画'},{id:'dumanwu',name:'读漫屋'},{id:'wmh1234',name:'漫画1234'}];
let comicSource=COMIC_SOURCES.some(s=>s.id===state.comicSource)?state.comicSource:'wmh1234';
function sourceHome(){return {action:'list',value:comicSource==='wmh1234'?BASE+'/category/':'https://mangayun.com/catalog?siteId='+encodeURIComponent(comicSource),source:comicSource}}
function sourceNameOf(c){if(c?.sourceName)return c.sourceName;const u=c?.url||'';const match=u.match(/[?&]siteId=([^&]+)/);return COMIC_SOURCES.find(s=>s.id===(match?decodeURIComponent(match[1]):'wmh1234'))?.name||'漫画来源'}
function sourcePicker(){return `<div class="source-picker" role="group" aria-label="漫画来源">${COMIC_SOURCES.map(s=>`<button class="small ${comicSource===s.id?'selected':''}" data-do="comicSource" data-source="${s.id}" aria-pressed="${comicSource===s.id}">${E(s.name)}</button>`).join('')}</div>`}

let view='home',detailOrigin=null,seq=0,pending={},book=null,chapterData=null,currentChapter=null,generation=0,listContext=sourceHome(),listData=null,chapterLimit=80,desc=false,filter='',restoreIndex=0,restoreActive=false;
function persist(){Native.save(JSON.stringify(state))}
function theme(){document.body.classList.toggle('dark',!!state.dark)}theme();
function call(action,value){let id=String(++seq);return new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{const p=pending[id];if(!p)return;delete pending[id];if(typeof Native.cancelRequest==='function')Native.cancelRequest(id);reject(new Error('本次加载等待过久，请重新加载；可复制加载诊断反馈'));},32000);
 pending[id]={resolve,reject,request:true,timer};try{Native.request(id,action,value)}catch(e){clearTimeout(timer);delete pending[id];reject(e)}
})}
window.nativeResult=(id,json)=>{const p=pending[id];if(!p)return;delete pending[id];if(p.timer)clearTimeout(p.timer);try{const d=JSON.parse(json);d.error?p.reject(new Error(d.error)):p.resolve(d)}catch(e){p.reject(e)}};
function nativeOp(name,arg){let id=String(++seq);return new Promise((resolve,reject)=>{pending[id]={resolve,reject};if(arg===undefined)Native[name](id);else Native[name](id,arg)})}
let toastTimer;function toast(t){let x=document.getElementById('toast');x.textContent=t;x.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>x.classList.remove('show'),3200)}
function headerFor(title,sub='',back=false){header.innerHTML=`${back?'<button class="flat back" data-do="back" aria-label="返回">‹</button>':''}<div class="wordmark"><div class="${back?'title':'brand'}">${E(title)}</div>${sub?`<small>${E(sub)}</small>`:''}</div><button class="flat small" data-do="exit">返回影视</button><button class="flat small" data-do="theme"  aria-label="切换夜间模式">${state.dark?'日间':'夜间'}</button>`}
function tabs(active){bottom.className='';bottom.innerHTML=[['home','发现'],['shelf','书架'],['history','历史'],['settings','设置']].map(([v,t])=>`<button data-do="tab" data-tab="${v}" class="${v===active?'active':''}">${t}</button>`).join('')}
function rememberView(){return {view,ctx:{...listContext},book,scroll:main.scrollTop}}
let readerControls=false;
function pinReaderViewport(){if(view!=='reader')return;const outer=document.scrollingElement;if(outer){outer.scrollTop=0;outer.scrollLeft=0;}window.scrollTo(0,0);}
function showReaderControls(show){readerControls=view==='reader'&&show;const focused=document.activeElement;if(!readerControls&&focused&&(header.contains(focused)||bottom.contains(focused)))focused.blur();document.body.classList.toggle('reader-controls',readerControls);if(view==='reader'){header.inert=!readerControls;bottom.inert=!readerControls;header.setAttribute('aria-hidden',String(!readerControls));bottom.setAttribute('aria-hidden',String(!readerControls));pinReaderViewport();if(typeof Native.setReaderControls==='function')Native.setReaderControls(readerControls,!!state.dark);}}
function readerMode(reading){document.body.classList.toggle('reader-mode',reading);showReaderControls(false);if(!reading){header.inert=false;bottom.inert=false;header.removeAttribute('aria-hidden');bottom.removeAttribute('aria-hidden');}if(typeof Native.setReadingMode==='function')Native.setReadingMode(reading);}
window.readerInsets=(top,right,bottom,left)=>{for(const [side,size] of Object.entries({top,right,bottom,left}))document.documentElement.style.setProperty('--reader-safe-'+side,Math.max(0,size)+'px');pinReaderViewport();};
window.addEventListener('resize',pinReaderViewport);
function begin(v){lastReaderTap=null;spreadView=null;stopImageRetries();readerSession=null;restoreActive=false;generation++;if(typeof Native.cancelRequests==='function')Native.cancelRequests();for(const [id,p] of Object.entries(pending)){if(p.request){delete pending[id];if(p.timer)clearTimeout(p.timer);p.reject(new Error('已切换页面'));}}view=v;main.className=v==='reader'?'reading':'';main.scrollTop=0;readerMode(v==='reader');return generation}
function loading(text){main.innerHTML=`<div class="message"><div class="spinner"></div><p>${E(text)}</p></div>`}
function searchForm(value=''){return `<form class="search" id="searchForm"><input id="searchInput" type="search" placeholder="搜索漫画名称" value="${E(value)}" aria-label="漫画名称"><button class="primary">搜索</button></form>`}
function bindSearchForm(){document.getElementById('searchForm').onsubmit=e=>{e.preventDefault();let value=document.getElementById('searchInput').value.trim();if(value)showList({action:'search',value},true)};}
function failed(e,retry){main.innerHTML=`${view==='home'?sourcePicker()+searchForm(listContext.action==='search'?listContext.value:''):''}<div class="message"><h2>暂时没有加载成功</h2><p>${E(e.message)}</p><button class="primary" id="retryMain">重新加载</button><button class="small" data-do="diagnostics">复制加载诊断</button></div>`;document.getElementById('retryMain').onclick=retry;if(view==='home')bindSearchForm();if(view==='reader')showReaderControls(true);}
function comicCard(c){return `<button class="comic" data-do="detail" data-url="${E(c.url)}"><img class="cover" src="${E(c.cover)}" alt="封面" loading="lazy"><strong>${E(c.title)}</strong><small class="source-label">${E(sourceNameOf(c))}</small><small>${E(c.latest||'查看目录')}</small></button>`}
async function showList(ctx=sourceHome(),save=false){saveProgress();if(COMIC_SOURCES.some(s=>s.id===ctx.source))comicSource=ctx.source;let gen=begin('home');book=null;listContext={...ctx,source:comicSource};headerFor('清阅漫画','多源搜索 · 连续阅读');tabs('home');loading(ctx.action==='search'?'正在搜索漫画…':'正在加载漫画列表…');
 if(ctx.action==='search'){await searchComics(ctx,gen);return}
 try{const data=await call(ctx.action,ctx.value);if(gen!==generation)return;listData=data;renderList()}catch(e){if(gen===generation)failed(e,()=>showList(ctx))}}
async function searchComics(ctx,gen){
 const preferred=listContext.source,ordered=preferred==='all'?['all','wmh1234']:[preferred];
 const results=new Map(),errors=new Map(),pending=new Set();
 const apply=()=>{
  if(gen!==generation)return;
  const data=ordered.map(id=>results.get(id)).filter(Boolean),seen=new Set();
  const items=data.flatMap(d=>d.items).filter(c=>!seen.has(c.url)&&seen.add(c.url));
  const sourceErrors=[...errors.values(),...data.flatMap(d=>d.sourceErrors||[])];
  Native.setSearchDiagnostics?.(sourceErrors.length?'漫画搜索 · '+sourceErrors.join('；'):'');
  listData={items,filters:[],prev:'',next:'',sourceErrors,searching:pending.size>0,
   fallback:preferred!=='all'&&ordered.length>1,searchUnavailable:!items.length&&!pending.size&&sourceErrors.length>0};
  renderList();
 };
 const request=async id=>{
  pending.add(id);
  try{const d=await call('search',JSON.stringify({source:id,keyword:ctx.value}));results.set(id,d)}
  catch(e){errors.set(id,(id==='all'?'云漫':COMIC_SOURCES.find(s=>s.id===id).name)+'：'+e.message)}
  finally{pending.delete(id)}
 };
 if(preferred==='all'){
  const tasks=ordered.map(async id=>{await request(id);apply()});
  apply();await Promise.all(tasks);return;
 }
 const task=request(preferred);apply();await task;if(gen!==generation)return;

 apply();
}
function renderList(){const previousInput=document.getElementById('searchInput'),typing=previousInput&&document.activeElement===previousInput?{value:previousInput.value,start:previousInput.selectionStart,end:previousInput.selectionEnd}:null,scroll=main.scrollTop;const isSearch=listContext.action==='search',data=listData;main.innerHTML=`${sourcePicker()}${searchForm(isSearch?listContext.value:'')}${!isSearch?`<section class="hero"><div class="eyebrow">更多来源，接着往下读</div><h2>找到更合适的漫画版本</h2><p>漫画之家、如漫画、读漫屋与原来的漫画1234合并搜索。图片质量随来源而异，可在目录或阅读菜单里换源。</p><div class="row"><button data-do="focusSearch">搜索漫画 →</button></div></section>`:''}<div class="row between"><h2>${isSearch?'搜索结果':'发现漫画'}</h2><span class="muted" style="font-size:12px">本页 ${data.items.length} 部</span></div>${data.filters?.length?`<details style="margin-top:15px"><summary>分类 · 状态 · 排序</summary>${data.filters.map(g=>`<div class="filter-group"><small class="muted">${E(g.title)}</small><div class="row">${g.options.map(o=>`<button class="small ${o.active?'selected':''}" data-do="listurl" data-url="${E(o.url)}">${E(o.title)}</button>`).join('')}</div></div>`).join('')}</details>`:''}<div class="grid">${data.items.map(comicCard).join('')}</div>${data.searching?`<p class="source-note" role="status">${data.fallback?'已选来源不可用，正在搜索其他来源…':data.items.length?'其余来源仍在搜索，已有结果可先打开…':'正在搜索漫画…'}</p>`:data.fallback&&data.items.length?'<p class="source-note">已选来源不可用，以下为其他来源的结果。</p>':''}${data.sourceErrors?.length?`<details class="source-note"><summary>部分来源暂不可用（${data.sourceErrors.length}）</summary><p>${data.sourceErrors.map(E).join('<br>')}</p></details>`:''}${!isSearch&&!data.items.length&&comicSource!=='wmh1234'?'<p class="source-note">此来源暂未提供首页推荐，请在上方搜索漫画名称。</p>':''}${!data.items.length&&isSearch&&!data.searching?'<div class="message"><p>'+(data.searchUnavailable?'部分来源没有完成搜索，暂未取得结果。':'没有找到结果，试试更短的名称或切换其他来源。')+'</p>'+(data.searchUnavailable?'<button data-do="retrySearch">重试搜索</button><button data-do="diagnostics">加载诊断</button>':'')+'</div>':''}<div class="pagination">${data.prev?`<button data-do="listurl" data-url="${E(data.prev)}">上一页</button>`:''}${data.next?`<button data-do="listurl" data-url="${E(data.next)}">下一页</button>`:''}</div>`;
 bindSearchForm();
 if(typing){const input=document.getElementById('searchInput');input.value=typing.value;input.focus({preventScroll:true});try{input.setSelectionRange(typing.start,typing.end)}catch(_){}}main.scrollTop=scroll;
}
function hist(url){return state.history.find(x=>x.url===url)}
async function showDetail(url,save=true,fresh=false){saveProgress();if(save&&view!=='detail'&&view!=='reader')detailOrigin=rememberView();let gen=begin('detail');headerFor('漫画目录','',true);tabs('');loading('正在取得完整章节目录…');
 try{let d=await call(fresh?'refreshDetail':'detail',url);if(gen!==generation)return;book=d;filter='';chapterLimit=80;renderDetail();if(d.offline)toast('网络不可用，已显示本地缓存目录')}catch(e){if(gen===generation)failed(e,()=>showDetail(url,false))}}
function renderDetail(){headerFor(book.title,`${sourceNameOf(book)} · ${book.chapters.length} 个章节条目`,true);const h=hist(book.url),saved=state.shelf.some(x=>x.url===book.url);main.innerHTML=`<div class="book-hero"><img class="cover" src="${E(book.cover)}" alt="漫画封面"><div class="book-info"><h1>${E(book.title)}</h1><p class="muted" style="font-size:13px">目录来自${E(sourceNameOf(book))}</p></div></div><div class="book-actions"><button class="primary" data-do="start">${h?'继续阅读':'开始阅读'}</button><button data-do="favorite">${saved?'已加入书架 ✓':'加入书架'}</button><button class="small" data-do="refreshDetail">刷新</button><button class="small" data-do="findSources">同名换源</button></div>${h?`<p class="muted" style="font-size:12px;margin-bottom:20px">上次：${E(h.chapterTitle)} · 第 ${1+(h.page||0)} 页</p>`:''}${book.intro?`<details><summary>作品简介</summary><p class="intro">${E(book.intro)}</p></details>`:''}<div class="row between" style="margin-bottom:13px"><h2>章节目录</h2><button class="small" data-do="sort">${desc?'倒序 ↓':'正序 ↑'}</button></div><input id="chapterFilter" class="filter-input" placeholder="查找章节，例如 1、500、天才" aria-label="查找章节"><div id="chapterGrid"></div>`;
 document.getElementById('chapterFilter').value=filter;document.getElementById('chapterFilter').oninput=e=>{filter=e.target.value.trim();chapterLimit=80;renderChapters()};renderChapters()}
function renderChapters(){let rows=book.chapters.map((c,i)=>({...c,i})).filter(c=>!filter||c.title.includes(filter));if(desc)rows.reverse();let h=hist(book.url);document.getElementById('chapterGrid').innerHTML=`<div class="chapters">${rows.slice(0,chapterLimit).map(c=>`<button class="chapter ${h?.chapterURL===c.url?'current':''}" data-do="chapter" data-index="${c.i}">${E(c.title)}</button>`).join('')}</div>${rows.length>chapterLimit?`<button class="wide" data-do="more">显示更多（${Math.min(chapterLimit,rows.length)}/${rows.length}）</button>`:!rows.length?'<p class="muted" style="padding:22px 0">没有匹配章节</p>':''}`}
function addHistory(c){let old=hist(book.url);const record={url:book.url,title:book.title,cover:book.cover,chapterURL:c.url,chapterTitle:c.title,sourceId:book.sourceId||'wmh1234',sourceName:sourceNameOf(book),page:old?.chapterURL===c.url?old.page||0:0,at:Date.now()};state.history=[record,...state.history.filter(x=>x.url!==book.url)].slice(0,200);persist();return record}
// Appended chapters share a reader session, but retain their own image retry state.
let readerSession=null,readerPageId=0,readerFrame=0;
function readerAlive(session){return !!session&&view==='reader'&&readerSession===session&&session.gen===generation}
function chapterAfter(c){const i=book.chapters.findIndex(x=>x.url===c.url);return i<0?null:book.chapters.slice(i+1).find(x=>x.url!==c.url)||null}
async function openChapter(c,resume=false,landing=null){if(!book||!c)return;saveProgress();let gen=begin('reader');currentChapter=c;chapterData=null;headerFor(c.title,book.title+' · '+sourceNameOf(book),true);readerNav();loading('正在解析阅读页和图片地址…');
 const session=readerSession={gen,entries:[],pages:new Map(),next:null};
 try{let data=await call('chapter',c.url);if(!readerAlive(session))return;validateChapter(data);chapterData=data;const h=addHistory(c);restoreIndex=resume?Math.max(0,Math.min(h.page||0,data.images.length-1)):0;if(landing==='last')restoreIndex=data.images.length-1;else if(Number.isInteger(landing))restoreIndex=Math.min(landing,data.images.length-1);h.page=restoreIndex;restoreActive=(resume||landing!==null)&&restoreIndex>0;persist();renderReader();if(data.offline)toast('正在使用缓存，未缓存图片可能无法打开')}catch(e){if(readerAlive(session))failed(e,()=>openChapter(c,resume))}}
function validateChapter(data){if(!data||!Array.isArray(data.images)||!data.images.length)throw new Error('本章没有可用图片，请重试')}
function currentIndex(){return book?book.chapters.findIndex(c=>c.url===currentChapter?.url):-1}
function adjacent(delta){const idx=currentIndex();if(idx<0)return null;return book.chapters[idx+delta]||null}
function readerNav(){bottom.className='reader-nav';bottom.innerHTML=`${chapterData?`<div class="read-settings"><button class="small" data-do="layout">阅读设置</button><button class="small" data-do="cache">缓存本章</button><button class="small" data-do="findSources">换源</button><button class="small" data-do="refreshChapter">刷新失败图片</button><button class="small" id="retrySummary" data-do="retryAll" hidden>重试失败页</button></div>`:''}<div class="reader-actions"><button data-do="prev" ${!adjacent(-1)?'disabled':''}>上一章</button><button data-do="directory">目录</button><button data-do="next" ${!adjacent(1)?'disabled':''}>下一章</button></div>`;updateRetrySummary()}
function renderReader(){if(state.layout!=='scroll'){openSpread();return}main.innerHTML='<div id="chapterTail" class="read-end" role="status"></div>';appendReaderChapter(currentChapter,chapterData,true);readerNav();if(restoreActive)restoreReaderPosition();prepareNextChapter();scheduleReaderTick()}
function appendReaderChapter(c,data,first=false){const session=readerSession;if(!readerAlive(session)||session.entries.some(e=>e.chapter.url===c.url))return;validateChapter(data);
 const entry={chapter:c,data,pages:[],retry:null};const section=document.createElement('section');section.className='reader-chapter';entry.element=section;
 section.setAttribute('aria-label',c.title);section.innerHTML=(first?'':`<div class="chapter-divider">${E(c.title)}</div>`)+data.images.map((url,i)=>{const id=++readerPageId;entry.pages.push(id);session.pages.set(id,{entry,index:i});return `<div class="page" id="page-${id}" data-page="${i}" data-key="${id}"><img src="${E(url)}" alt="${E(c.title)} · 第 ${i+1} 页" loading="${first&&Math.abs(i-restoreIndex)<=1?'eager':'lazy'}"><span class="page-num">${i+1}</span><div class="retry"><p>第 ${i+1} 页加载失败</p><button class="small" data-do="retryImage" data-key="${id}">重试这一页</button></div></div>`}).join('');
 main.insertBefore(section,document.getElementById('chapterTail'));session.entries.push(entry);startImageRetries(entry);return entry;
}
function tailStatus(){const session=readerSession,tail=document.getElementById('chapterTail');if(!session||!tail)return;const next=session.next;
 if(!next){tail.innerHTML='<span>已到目录末尾</span>';return}
 tail.innerHTML=next.error?'<p>下一章暂未加载成功，本章仍可阅读</p><button class="small" data-do="retryNext">重试加载下一章</button>':next.data?'<span>继续下滑，接着阅读下一章</span>':'<span>正在预加载下一章…</span>';
}
function prepareNextChapter(retry=false){const session=readerSession;if(!readerAlive(session))return;const tail=session.entries[session.entries.length-1];if(!tail)return;
 const c=chapterAfter(tail.chapter);if(!c||session.entries.some(e=>e.chapter.url===c.url)){session.next=null;tailStatus();return}
 if(session.next?.chapter.url===c.url&&!retry)return;
 const next=session.next={chapter:c,data:null,error:false};tailStatus();
 next.promise=call('chapter',c.url).then(data=>{if(!readerAlive(session)||session.next!==next)return;validateChapter(data);next.data=data;
 // Warm only the first two images; the remaining pages stay lazy-loaded.
 next.warm=data.images.slice(0,2).map(url=>{const im=new Image();im.src=url;return im});tailStatus();scheduleReaderTick();
 }).catch(()=>{if(readerAlive(session)&&session.next===next){next.error=true;tailStatus()}});
}
function maybeAppendChapter(){const session=readerSession;if(!readerAlive(session)||restoreActive)return;const tail=session.entries[session.entries.length-1],next=session.next;
 // Keep at most one chapter ahead of the reader, even with very short chapters.
 if(!tail||currentChapter.url!==tail.chapter.url||!next?.data)return;
 const pages=tail.element.querySelectorAll('.page'),nearEnd=pages[Math.max(0,pages.length-3)];
 if(!nearEnd||nearEnd.getBoundingClientRect().top>main.getBoundingClientRect().bottom+main.clientHeight)return;
 if(main.scrollHeight-main.scrollTop-main.clientHeight>main.clientHeight*2)return;
 appendReaderChapter(next.chapter,next.data);session.next=null;prepareNextChapter();
}
function restoreReaderPosition(){const entry=readerSession?.entries[0],target=entry&&document.getElementById('page-'+entry.pages[restoreIndex]);if(!target)return;main.scrollTop+=target.getBoundingClientRect().top-main.getBoundingClientRect().top;
 if((()=>{const im=target.querySelector('img');return im.complete||target.classList.contains('failed')})()){restoreActive=false;captureReaderAnchor()}}
function visibleReaderPage(){const session=readerSession;if(!readerAlive(session))return null;const line=main.getBoundingClientRect().top+main.clientHeight*.35;let found=null;
 for(const el of main.querySelectorAll('.page')){if(!found||el.getBoundingClientRect().top<=line)found=el;else break}return found?{...session.pages.get(Number(found.dataset.key)),element:found}:null}
function updateReaderPosition(save=false){if(spreadView)return;if(view!=='reader'||!book||!chapterData||restoreActive)return;const page=visibleReaderPage();if(!page)return;const changed=currentChapter.url!==page.entry.chapter.url;
 if(changed){currentChapter=page.entry.chapter;chapterData=page.entry.data;restoreIndex=page.index;headerFor(currentChapter.title,book.title+' · '+sourceNameOf(book),true);readerNav()}
 restoreIndex=page.index;const h=hist(book.url);if(save||changed){if(!h||h.chapterURL!==currentChapter.url)addHistory(currentChapter);const record=hist(book.url);record.page=page.index;record.at=Date.now();persist()}
 const x=document.getElementById('pageProgress');if(x)x.textContent=`${page.index+1} / ${chapterData.images.length} 页`;
}
window.saveProgress=function(){updateReaderPosition(true)};
function scheduleReaderTick(){if(readerFrame)return;readerFrame=requestAnimationFrame(()=>{readerFrame=0;if(view!=='reader')return;updateReaderPosition();maybeAppendChapter()})}
function goReaderChapter(c){saveProgress();const entry=readerSession?.entries.find(e=>e.chapter.url===c.url);if(entry){restoreActive=false;main.scrollTop+=document.getElementById('page-'+entry.pages[0]).getBoundingClientRect().top-main.getBoundingClientRect().top;captureReaderAnchor();updateReaderPosition(true);scheduleReaderTick()}else openChapter(c)}
let scrollTimer;main.addEventListener('scroll',()=>{captureReaderAnchor();scheduleReaderTick();clearTimeout(scrollTimer);scrollTimer=setTimeout(saveProgress,300)},{passive:true});main.addEventListener('touchstart',()=>{restoreActive=false},{passive:true});
function localTab(v){saveProgress();begin(v);book=null;chapterData=null;tabs(v);headerFor(v==='shelf'?'我的书架':v==='history'?'阅读历史':'阅读设置');
 if(v==='shelf'){main.innerHTML=`<div class="row between"><h2>${state.shelf.length} 部收藏</h2><span class="muted" style="font-size:12px">保存在本机</span></div>${state.shelf.length?`<div class="grid">${state.shelf.map(comicCard).join('')}</div>`:'<div class="message"><p>打开漫画目录，点“加入书架”，下次就能直接找到。</p><button data-do="tab" data-tab="home">去发现漫画</button></div>'}`}
 else if(v==='history'){main.innerHTML=state.history.length?state.history.map((h,i)=>`<div class="history-item"><img class="cover" src="${E(h.cover)}" alt="封面"><div class="history-info"><strong>${E(h.title)}</strong><p>${E(sourceNameOf(h))} · ${E(h.chapterTitle)} · 第 ${h.page+1} 页</p></div><button class="small" data-do="resume" data-index="${i}">继续</button></div>`).join(''):'<div class="message"><p>读过的漫画会自动出现在这里。</p></div>'}
 else{main.innerHTML=`<h1>阅读设置</h1><button class="primary" data-do="layout">页面布局与翻页动效</button><div class="settings-card"><div class="row between"><strong>阅读配色</strong><button class="small" data-do="theme">${state.dark?'切换日间':'切换夜间'}</button></div><p>跟随你的选择保存在本机。</p></div><div class="settings-card"><strong>图片缓存</strong><p>目录和有效章节地址优先从本机读取，连续向下阅读会自动接上下一章，并提前获取下一章地址和前两张图片；已读图片自动缓存，可在阅读页缓存整章。缓存最多约 180 MB，超出后清理较早的图片。</p><button class="small" data-do="clearCache">清理缓存</button></div><div class="settings-card"><strong>使用说明</strong><p>本应用保留漫画1234，并接入云漫的漫画之家、如漫画、读漫屋三个来源。使用统一阅读界面，不加载来源站的广告脚本。支持分类、搜索、书架、历史、章节筛选、阅读进度和本章缓存。</p><p>源站缺图或限制访问的章节会明确报错。失败页会自动重试3次，之后刷新地址再试一次；也可以点“刷新失败图片”。漫画书架、历史和阅读布局保存在本机。</p><p>清阅漫画 · 1.1.40 · iPadOS 17+</p></div>`}}
async function resumeHistory(i){let h=state.history[i];await showDetail(h.url);if(book&&book.url===h.url){let c=book.chapters.find(c=>c.url===h.chapterURL);if(c)openChapter(c,true);else toast('原章节已变化，请从目录重新选择')}}
window.goBack=function(){saveProgress();if(view==='reader'){begin('detail');chapterData=null;tabs('');renderDetail();return true}
 if(view==='detail'){const parent=detailOrigin;detailOrigin=null;if(parent?.view==='home')showList(parent.ctx);else if(parent?.view==='shelf'||parent?.view==='history'||parent?.view==='settings')localTab(parent.view);else showList();return true}
 if(view==='home'){if(listContext.action!=='list'||listContext.value!==sourceHome().value){showList();return true}return false}
 showList();return true};
let readerTap=null,readerTapCancelled=false,lastReaderTap=null,lastReaderTouchAt=0;
function readerControlTarget(e){return view==='reader'&&main.contains(e.target)&&!e.target.closest('button,a,input,select,textarea,[data-do]')}
main.addEventListener('touchstart',e=>{lastReaderTouchAt=performance.now();readerTapCancelled=e.touches.length!==1;const t=e.touches[0];readerTap=t?{x:t.clientX,y:t.clientY,time:lastReaderTouchAt}:null;if(readerTapCancelled)lastReaderTap=null;},{passive:true});
main.addEventListener('touchmove',e=>{const t=e.touches[0];if(!readerTap||!t||e.touches.length!==1||Math.hypot(t.clientX-readerTap.x,t.clientY-readerTap.y)>10){readerTapCancelled=true;lastReaderTap=null;}},{passive:true});
main.addEventListener('touchcancel',()=>{readerTap=null;readerTapCancelled=true;lastReaderTap=null;},{passive:true});
main.addEventListener('touchend',e=>{
 const t=e.changedTouches[0],now=performance.now();lastReaderTouchAt=now;
 if(!readerControlTarget(e)||readerTapCancelled||!readerTap||!t||e.touches.length||now-readerTap.time>400||Math.hypot(t.clientX-readerTap.x,t.clientY-readerTap.y)>10){lastReaderTap=null;readerTap=null;return;}
 readerTap=null;
 if(lastReaderTap&&now-lastReaderTap.time<=320&&Math.hypot(t.clientX-lastReaderTap.x,t.clientY-lastReaderTap.y)<=32){e.preventDefault();lastReaderTap=null;showReaderControls(!readerControls);}
 else lastReaderTap={x:t.clientX,y:t.clientY,time:now};
},{passive:false});
main.addEventListener('dblclick',e=>{if(readerControlTarget(e)&&performance.now()-lastReaderTouchAt>650){e.preventDefault();lastReaderTap=null;showReaderControls(!readerControls);}});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-do]');if(!b)return;if(b.disabled)return;let a=b.dataset.do;try{
 if(a==='comicSource'){const source=b.dataset.source;if(!COMIC_SOURCES.some(s=>s.id===source))return;comicSource=source;state.comicSource=source;persist();showList(listContext.action==='search'?{action:'search',value:listContext.value,source}:sourceHome());return}
 if(a==='retrySearch'){showList(listContext);return}
 if(a==='focusSearch'){document.getElementById('searchInput')?.focus();return}
 if(a==='findSources'&&book){const title=book.title;saveProgress();comicSource='all';state.comicSource='all';persist();showList({action:'search',value:title,source:'all'});return}

 if(a==='diagnostics'&&typeof Native.copyDiagnostics==='function')Native.copyDiagnostics();
 if(a==='exit'){saveProgress();Native.exit();return}
 if(a==='layout'){readSettings();return}
 if(a==='theme'){state.dark=!state.dark;theme();persist();if(view==='settings')localTab('settings');else if(view==='reader'){headerFor(currentChapter.title,book.title+' · '+sourceNameOf(book),true);showReaderControls(readerControls);}else if(view==='detail')headerFor(book.title,`${sourceNameOf(book)} · ${book.chapters.length} 个章节条目`,true);else headerFor(view==='home'?'清阅漫画':view==='shelf'?'我的书架':'阅读历史',view==='home'?'多源搜索 · 连续阅读':'');}
 if(a==='tab'){if(b.dataset.tab==='home')showList();else localTab(b.dataset.tab)}
 if(a==='back')goBack();if(a==='detail')showDetail(b.dataset.url);if(a==='listurl')showList({action:'list',value:b.dataset.url},true);
 if(a==='refreshDetail')showDetail(book.url,false,true);
 if(a==='favorite'){let idx=state.shelf.findIndex(c=>c.url===book.url);if(idx>=0){state.shelf.splice(idx,1);toast('已从书架移除')}else{state.shelf.unshift({url:book.url,title:book.title,cover:book.cover,sourceId:book.sourceId||'wmh1234',sourceName:sourceNameOf(book)});toast('已加入书架')}persist();b.textContent=idx>=0?'加入书架':'已加入书架 ✓'}
 if(a==='sort'){desc=!desc;b.textContent=desc?'倒序 ↓':'正序 ↑';renderChapters()}
 if(a==='more'){chapterLimit+=100;renderChapters()}
 if(a==='chapter')openChapter(book.chapters[Number(b.dataset.index)]);
 if(a==='start'){let h=hist(book.url),c=h?book.chapters.find(x=>x.url===h.chapterURL):null;openChapter(c||book.chapters.find(x=>/^(?:第\s*1\s*[话回章]|0?1$)/.test(x.title))||book.chapters[0],!!c)}
 if(a==='directory'){if(view==='reader')goBack()}
 if(a==='prev'||a==='next'){let c=adjacent(a==='next'?1:-1);if(c)goReaderChapter(c)}
 if(a==='refreshChapter'){if(!failedPageCount()){toast('当前没有加载失败的图片');return}const gen=generation,entry=readerSession.entries.find(e=>e.chapter.url===currentChapter.url);b.disabled=true;b.textContent='正在刷新…';try{await renewChapterImages(entry);if(gen===generation&&readerSession){entry.retry.refreshPromise=Promise.resolve();entry.retry.refreshAt=Date.now();entry.retry.retryFailed();toast('地址已刷新，正在重试失败图片')}}finally{if(b.isConnected){b.disabled=false;b.textContent='刷新失败图片'}}}
 if(a==='retryImage'){const key=Number(b.dataset.key),page=readerSession?.pages.get(key);if(page)page.entry.retry.retry(key)};
 if(a==='retryNext')prepareNextChapter(true);
 if(a==='retryAll'&&readerSession){for(const entry of readerSession.entries)entry.retry.retryFailed();toast('正在重试失败图片')}
 if(a==='cache'){b.disabled=true;b.textContent='正在缓存…';let d=await nativeOp('cacheChapter',JSON.stringify(chapterData.images));toast(`已缓存 ${d.ok}/${d.total} 页`);if(b.isConnected){b.disabled=false;b.textContent='缓存本章'}}
 if(a==='clearCache'){if(await askClear()){await nativeOp('clearCache');toast('缓存已清理')}}
 if(a==='resume')resumeHistory(Number(b.dataset.index));
 }catch(err){toast(err.message);b.disabled=false}});
let pageLoads=new Map(),readerAnchor=null,lastNetworkRetry=0;
function stopImageRetries(){if(readerSession){for(const e of readerSession.entries)e.retry?.dispose();if(readerSession.next)readerSession.next.warm=null;}for(const load of pageLoads.values())load.reject(new Error('已离开章节'));pageLoads.clear();readerAnchor=null;if(readerFrame){cancelAnimationFrame(readerFrame);readerFrame=0}clearTimeout(scrollTimer)}
function captureReaderAnchor(){if(view!=='reader')return;const top=main.getBoundingClientRect().top;let anchor=null;for(const el of main.querySelectorAll('.page')){if(el.getBoundingClientRect().top<=top+2)anchor={key:Number(el.dataset.key),offset:el.getBoundingClientRect().top-top};else break}readerAnchor=anchor}
function preserveReaderAnchor(){if(!readerAnchor)return;const el=document.getElementById('page-'+readerAnchor.key);if(el){const diff=el.getBoundingClientRect().top-main.getBoundingClientRect().top-readerAnchor.offset;if(Math.abs(diff)>1)main.scrollTop+=diff}}
function failedPageCount(){return main.querySelectorAll('.page.failed').length}
function updateRetrySummary(){const x=document.getElementById('retrySummary');if(x){const n=failedPageCount();x.hidden=!n;x.textContent=n?`重试失败页（${n}）`:''}}
async function renewChapterImages(entry){const session=readerSession;entry=entry||session?.entries.find(e=>e.chapter.url===currentChapter?.url);if(!entry)throw new Error('章节已关闭');const oldData=entry.data,data=await call('refreshChapter',entry.chapter.url);if(!readerAlive(session))throw new Error('章节已切换');validateChapter(data);
 let mapping;if(oldData.pageIds?.length&&oldData.pageIds.every(Boolean)&&data.pageIds?.length){const byId=new Map(data.pageIds.map((id,i)=>[id,data.images[i]]));mapping=oldData.pageIds.map(id=>byId.get(id));if(mapping.some(x=>!x))throw new Error('章节图片数量已变化，请重新打开目录')}
 else{if(data.images.length!==oldData.images.length)throw new Error('章节图片数量已变化，请重新打开目录');mapping=data.images}
 oldData.images=mapping;oldData.offline=false;return data;
}
function retryState(key,phase,attempt){const wrap=document.getElementById('page-'+key);if(!wrap||view!=='reader')return;const index=Number(wrap.dataset.page),label=wrap.querySelector('.retry p'),button=wrap.querySelector('.retry button');
 if(phase==='loaded'){wrap.classList.add('loaded');wrap.classList.remove('failed','recovering');wrap.style.minHeight='';wrap.querySelector('img').classList.add('loaded');preserveReaderAnchor();updateRetrySummary();return}
 wrap.classList.add('failed');wrap.classList.toggle('recovering',phase!=='failed');button.disabled=phase!=='failed';button.textContent=phase==='failed'?'再试这一页':'正在自动处理';
 if(phase==='waiting')label.textContent=`第 ${index+1} 页暂未加载，${[1,3,6][attempt]} 秒后自动重试（${attempt+1}/3）`;
 else if(phase==='refreshing')label.textContent=`第 ${index+1} 页：正在重新获取图片地址…`;
 else if(phase==='loading')label.textContent=`第 ${index+1} 页：正在重试…`;
 else label.textContent=`第 ${index+1} 页多次重试未成功，可稍后再试`;
 preserveReaderAnchor();updateRetrySummary();
}
function startImageRetries(entry){const session=readerSession;entry.retry=new ImageRetryController({
 state:(key,phase,n)=>{if(readerAlive(session))retryState(key,phase,n)},refresh:()=>renewChapterImages(entry),
 load:key=>new Promise((resolve,reject)=>{if(!readerAlive(session)){reject(new Error('章节已切换'));return}const wrap=document.getElementById('page-'+key),im=wrap.querySelector('img'),index=session.pages.get(key).index;pageLoads.set(key,{resolve,reject});im.loading='eager';const url=entry.data.images[index];im.src=url+(url.includes('?')?'&':'?')+'fresh=1&retry='+Date.now();})
 });
 for(const im of entry.element.querySelectorAll('.page img')){const key=Number(im.parentElement.dataset.key);
 im.onload=()=>{if(!readerAlive(session))return;const request=pageLoads.get(key);im.parentElement.classList.add('loaded');im.classList.add('loaded');if(request){pageLoads.delete(key);request.resolve()}else entry.retry.success(key);
 if(restoreActive)restoreReaderPosition();else preserveReaderAnchor();scheduleReaderTick();};
 im.onerror=()=>{if(!readerAlive(session))return;const wrap=im.parentElement;wrap.style.minHeight=Math.max(180,wrap.getBoundingClientRect().height)+'px';wrap.classList.add('failed');const request=pageLoads.get(key);if(request){pageLoads.delete(key);request.reject(new Error('图片加载失败'))}else entry.retry.failure(key);if(restoreActive)restoreReaderPosition();else preserveReaderAnchor();updateRetrySummary()};
 if(im.complete){if(im.naturalWidth>0)im.onload();else if(im.getAttribute('src'))im.onerror()}
 }
}
window.networkRecovered=function(){if(view!=='reader'||!readerSession||Date.now()-lastNetworkRetry<15000)return;lastNetworkRetry=Date.now();if(failedPageCount()){for(const e of readerSession.entries)e.retry.retryFailed();toast('网络已恢复，正在重试失败图片')}if(readerSession.next?.error)prepareNextChapter(true)};
window.addEventListener('online',window.networkRecovered);

function askClear(){return new Promise(resolve=>{const d=document.createElement('dialog');d.className='read-config';d.innerHTML='<p>清理图片和目录缓存？书架与历史会保留。</p><button value="no">取消</button> <button value="yes">清理</button>';document.body.append(d);d.onclick=e=>{if(e.target.tagName==='BUTTON')d.close(e.target.value)};d.onclose=()=>{d.remove();resolve(d.returnValue==='yes')};d.showModal()})}
function openSpread(){main.classList.add('paged');restoreActive=false;main.innerHTML='<div id="spread"></div>';const chapter=currentChapter,data=chapterData;spreadView=new SpreadReader(main.firstChild,{images:data.images,index:restoreIndex,count:state.layout==='double'?2:1,motion:state.motion!==false,
 edge:d=>{const c=adjacent(d);if(c)openChapter(c,false,d<0?'last':0);else toast(d<0?'已到第一章':'已到最后一章')},menu:()=>showReaderControls(!readerControls),
 progress:i=>{restoreIndex=i;const h=hist(book.url);if(h&&h.chapterURL===chapter.url){h.page=i;h.at=Date.now();persist()}readerNav()}});
}
function readSettings(){const reading=view==='reader'&&!!chapterData;if(reading&&!spreadView)updateReaderPosition(true);
 const d=document.createElement('dialog');d.className='read-config';d.innerHTML='<strong>阅读设置</strong>'+[['scroll','连续下滑'],['single','单页翻页'],['double','双页并排']].map(([v,n])=>'<label><input type="radio" name="layout" value="'+v+'" '+(state.layout===v?'checked':'')+'> '+n+'</label>').join('')+'<label><input type="checkbox" id="motion" '+(state.motion!==false?'checked':'')+'> 仿真翻书（纸张、书脊与阴影）</label><button>完成</button>';document.body.append(d);d.querySelector('button').onclick=()=>{const mode=d.querySelector('input[name=layout]:checked').value;state.motion=d.querySelector('#motion').checked;const page=restoreIndex;state.layout=mode;persist();d.close();if(reading)openChapter(currentChapter,false,page)};d.onclose=()=>d.remove();d.showModal()}
showList();

window.cloudStateChanged=value=>{try{const remote=typeof value==='string'?JSON.parse(value):value;state.shelf=remote.shelf||[];state.history=remote.history||[];if(typeof remote.dark==='boolean')state.dark=remote.dark;theme();if(view==='shelf'||view==='history')localTab(view);else if(view==='detail'&&book)renderDetail();}catch{}};
