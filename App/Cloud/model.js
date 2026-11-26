(function(root){'use strict';
const parse=(x,f={})=>{if(x===null||x===undefined)return f;if(typeof x!=='string')return x;try{return JSON.parse(x)}catch{return f}};
const url=s=>{try{const u=new URL(String(s));u.hash='';u.search='';if(/^(www\.)?kkys16\.com$/.test(u.hostname)){u.protocol='https:';u.hostname='www.kkys16.com';}return u.href}catch{return String(s||'')}};
const episodeKey=(film,episode,page)=>{const m=String(episode||'').trim().match(/^第?\s*(\d+)\s*(集|话|期)$/);return m&&film?url(film)+'|'+m[2]+':'+Number(m[1]):url(page)};
const id=(c,k)=>c+'\n'+k;
const stable=o=>JSON.stringify(o,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().reduce((r,k)=>(Object.defineProperty(r,k,{value:v[k],enumerable:true}),r),{}):v);
function capture(s){const rows=new Map(),put=(c,k,v)=>{if(k)rows.set(id(c,k),{collection:c,key:k,value:v})};
 const progress=(film,episode,position,duration,completed,at)=>{if(!film?.url||!episode?.url)return;const key=episodeKey(film.url,episode.title,episode.url),row={film:{url:url(film.url),title:film.title||'',cover:cleanCover(film.cover)},episode:{...episode,url:url(episode.url)},position:Math.max(0,Number(position)||0),duration:Math.max(0,Number(duration)||0),completed:!!completed,at:Number(at)||0};const old=rows.get(id('film.progress',key));if(!old||row.at>=old.value.at)put('film.progress',key,row);};
 let film={},comic={},games={};
 if(s.platform==='android'){
  const p=s.preferences||{};film=p['qingying-site']||{};comic=parse(p.reader?.state,{});games=p.game||{};
  const cover=new Map(parse(film.history,[]).map(h=>[url(h.url),h.cover]));
  for(const raw of [...parse(film.history,[]),...Object.values(p['episode-progress-v1']||{}).map(v=>parse(v,null)).filter(Boolean)])progress({url:raw.url,title:raw.title,cover:raw.cover||cover.get(url(raw.url))},{url:raw.episodeUrl,title:raw.episode},Number(raw.position||0)/1000,Number(raw.duration||0)/1000,raw.ended,raw.time);
  for(const f of parse(film.favorites,[]))put('film.favorites',url(f.url),{...f,url:url(f.url),cover:cleanCover(f.cover)});
  const skips=p['film-skip-v1']||{},byFilm={};for(const [key,value]of Object.entries(skips)){const m=key.match(/^(.*)\|(intro|outro)$/);if(m){const k=url(m[1]);byFilm[k]||={intro:0,outro:0};byFilm[k][m[2]]=Math.max(0,Number(value)||0)/1000;}}for(const [k,v]of Object.entries(byFilm))put('film.skip',k,v);
  for(const [key,out]of [['autoNext','autoNext'],['backgroundPlay','background']])if(Object.hasOwn(film,key))put('settings',out,film[key]);if(Object.hasOwn(p['ad-filter']||{},'enabled'))put('settings','adFilter',p['ad-filter'].enabled);
  for(const [native,key]of [['save','2048'],['fruit','fruit'],['slide','slide'],['mode','mode']])if(Object.hasOwn(games,native))put('games',key,key==='mode'?games[native]:parse(games[native],null));
 }else if(s.platform==='windows'){
  film=s.film||{};comic=s.comic||{};games=s.games||{};
  for(const h of Object.values(film.history||{}))progress({url:h.filmURL,title:h.title,cover:h.cover},h.episode,h.time,h.duration,h.completed,h.at);
  for(const h of Object.values(film.syncedProgress||{}))progress(h.film,h.episode,h.position,h.duration,h.completed,h.at);
  for(const f of Object.values(film.favorites||{}))if(f?.url)put('film.favorites',url(f.url),{...f,url:url(f.url),cover:cleanCover(f.cover)});
  for(const [k,v]of Object.entries(film.skip||{}))put('film.skip',url(k),v);
  for(const key of ['autoNext','background','speed','adFilter'])if(Object.hasOwn(film,key))put('settings',key,film[key]);
  for(const [native,key]of [['miao2048-10-v1','2048'],['miao-fruit-v1','fruit'],['miao-slide-v1','slide'],['miao-suite-mode','mode']])if(games[native]!=null)put('games',key,key==='mode'?games[native]:parse(games[native],null));
 }else if(s.platform==='ios'){
  const values=s.values||{};for(const h of values.history||[])progress(h.film,h.episode,h.position,h.duration,h.completed,h.at??((Number(h.date)||0)+978307200)*1000);
  for(const v of Object.values(values.syncedProgress||{}))progress(v.film,v.episode,v.position,v.duration,v.completed,v.at);
  for(const f of values.favorites||[])if(f?.url)put('film.favorites',url(f.url),f);
  for(const [k,v]of Object.entries(values.syncedSkips||{}))put('film.skip',url(k),v);
  for(const key of ['autoNext','background','speed','adFilter'])if(Object.hasOwn(values,key))put('settings',key,values[key]);
 }
 for(const f of comic.shelf||[])if(f?.url)put('comic.shelf',url(f.url),{...f,url:url(f.url),cover:cleanCover(f.cover)});
 for(const h of comic.history||[])if(h?.url)put('comic.history',url(h.url),{...h,url:url(h.url),cover:cleanCover(h.cover)});
 for(const key of ['dark','desc'])if(Object.hasOwn(comic,key))put('comic.settings',key,comic[key]);
 for(const d of s.downloads||[])put('downloads',String(s.deviceId||s.platform)+':'+String(d.id||d.url||d.title),{title:d.title||'',source:s.deviceId||s.platform,url:d.original||d.url||'',status:d.status||d.state||'记录',bytes:Number(d.bytes||d.downloadedBytes)||0});
 return [...rows.values()];
}
function cleanCover(s){try{const u=new URL(s);return u.hostname==='127.0.0.1'&&u.searchParams.has('source')?u.searchParams.get('source'):String(s||'')}catch{return String(s||'')}}
function apply(snapshot,changes){const s=JSON.parse(JSON.stringify(snapshot)),p=s.preferences||{},a=s.platform==='android',w=s.platform==='windows',ios=s.platform==='ios';let film=w?(s.film||={}):a?(p['qingying-site']||={}):(s.values||={}),comic=w?(s.comic||={}):a?parse((p.reader||={}).state,{}):null;let history=a?parse(film.history,[]):w?Object.values(film.history||{}):film.history||[];let favorites=a?parse(film.favorites,[]):w?Object.values(film.favorites||{}):film.favorites||[];
 for(const r of changes){const v=r.value,del=r.deleted,k=r.key;
  if(r.collection==='film.progress'){
   history=history.filter(h=>episodeKey(a?h.url:w?h.filmURL:h.film?.url,a?h.episode:h.episode?.title,a?h.episodeUrl:h.episode?.url)!==k);
   if(a){const ns=p['episode-progress-v1']||={};delete ns[k];if(!del){const row={url:v.film.url,title:v.film.title,cover:v.film.cover,episode:v.episode.title,episodeUrl:v.episode.url,position:Math.round(v.position*1000),duration:Math.round(v.duration*1000),ended:v.completed,time:v.at};ns[k]=JSON.stringify(row);history.push(row);delete (p['episode-cleared-v1']||={})[k];}else(p['episode-cleared-v1']||={})[k]=true;
   }else{const all=film.syncedProgress||={};delete all[k];if(!del){all[k]=v;if(w)history.push({filmURL:v.film.url,title:v.film.title,cover:v.film.cover,episode:v.episode,time:v.position,duration:v.duration,completed:v.completed,at:v.at});else history.push({film:v.film,episode:{...v.episode,group:v.episode.group||'线路1'},position:v.position,duration:v.duration,completed:v.completed,date:v.at/1000-978307200});}}
  }else if(r.collection==='film.favorites'){favorites=favorites.filter(f=>url(f.url)!==k);if(!del)favorites.push(v);
  }else if(r.collection==='film.skip'){if(a){const ns=p['film-skip-v1']||={};if(del){delete ns[k+'|intro'];delete ns[k+'|outro'];}else{ns[k+'|intro']=Math.round(v.intro*1000);ns[k+'|outro']=Math.round(v.outro*1000);}}else{const ns=w?(film.skip||={}):(film.syncedSkips||={});if(del)delete ns[k];else ns[k]=v;}
  }else if(r.collection==='settings'){const mapping=a?{autoNext:'autoNext',background:'backgroundPlay'}:{autoNext:'autoNext',background:'background',speed:'speed',adFilter:'adFilter'};if(a&&k==='adFilter'){const ns=p['ad-filter']||={};if(del)delete ns.enabled;else ns.enabled=v;}else if(mapping[k]){if(del)delete film[mapping[k]];else film[mapping[k]]=v;}
  }else if(comic&&['comic.shelf','comic.history'].includes(r.collection)){const prop=r.collection==='comic.shelf'?'shelf':'history';comic[prop]=(comic[prop]||[]).filter(x=>url(x.url)!==k);if(!del)comic[prop].push(v);
  }else if(comic&&r.collection==='comic.settings'&&['dark','desc'].includes(k)){if(del)delete comic[k];else comic[k]=v;
  }else if(r.collection==='games'&&['2048','fruit','slide','mode'].includes(k)&&!ios){const g=a?(p.game||={}):(s.games||={}),key=a?({'2048':'save',fruit:'fruit',slide:'slide',mode:'mode'})[k]:({'2048':'miao2048-10-v1',fruit:'miao-fruit-v1',slide:'miao-slide-v1',mode:'miao-suite-mode'})[k];if(del)delete g[key];else g[key]=k==='mode'?v:JSON.stringify(v);}
 }
 if(a){history.sort((x,y)=>(y.time||0)-(x.time||0));const seen=new Set();film.history=JSON.stringify(history.filter(h=>!seen.has(h.url)&&seen.add(h.url)).slice(0,150));film.favorites=JSON.stringify(favorites);p.reader.state=JSON.stringify(comic);s.preferences=p;}
 else if(w){film.history=Object.fromEntries(history.map(h=>[h.filmURL+'|'+h.episode.url,h]));film.favorites=Object.fromEntries(favorites.map(f=>[f.url,f]));}
 else{film.history=history;film.favorites=favorites;}
 if(comic?.history)comic.history.sort((x,y)=>(y.at||0)-(x.at||0));return s;
}
function normalizeBackup(backup){if(backup.format!=='qingyue-backup'||backup.version!==1)throw Error('不是可识别的清阅备份文件');const rows=backup.records||capture(backup.data||backup);if(!Array.isArray(rows)||rows.length>30000)throw Error('备份记录数量异常');const map=new Map();for(const row of rows){if(!row||typeof row.collection!=='string'||typeof row.key!=='string')throw Error('备份记录格式异常');map.set(id(row.collection,row.key),row);}return [...map.values()];}
const api={parse,url,episodeKey,id,stable,capture,apply,normalizeBackup,cleanCover};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.QingyueModel=api;
})(typeof globalThis==='undefined'?this:globalThis);
