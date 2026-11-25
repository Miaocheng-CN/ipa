'use strict';
const msg=(action,params={})=>window.webkit.messageHandlers.comics.postMessage({action,...params});
const ipError=e=>String(e?.message||e);
const asURL=(s,base)=>{try{const u=new URL(s,base);return s&&u.protocol==='https:'?u.href:''}catch{return ''}};
const comicImage=(raw,base)=>{const u=asURL(raw,base);return u?'qcomic://image?u='+encodeURIComponent(u):''};
const apiBase='https://mangayun.com',portal='https://m.wmh1234.com',sites={manhuazhijia:'漫画之家',dumanwu:'读漫屋',rumanhua:'如漫画'};
const wrapped=(kind,id,raw)=>apiBase+'/'+kind+'?'+new URLSearchParams({siteId:id,url:raw});
async function viaAPI(action,value,query){
 const u=new URL(query?apiBase:value),site=query?.source||u.searchParams.get('siteId'),raw=u.searchParams.get('url');
 if(site!=='all'&&!sites[site])throw Error('未知来源');
 const route=query?'search':action==='list'?'home-sections':action.toLowerCase().includes('detail')?'details':'chapter-images';
 const payload=query?{keyword:query.keyword}:route==='details'?{siteId:site,detailUrl:raw}:route==='chapter-images'?{siteId:site,chapterUrl:raw,refresh:action==='refreshChapter'}:null;
 const response=await msg('document',{url:apiBase+'/api/'+route,...(payload?{body:JSON.stringify(payload)}:{})});
 const envelope=JSON.parse(response.text);if(envelope.error||!envelope.data)throw Error(envelope.error||'来源没有返回数据');
 const d=envelope.data,img=x=>comicImage(x,apiBase),name=sites[site]||'全部来源';
 if(query||route==='home-sections'){
 const groups=query?d:[{results:[...(d.popular||[]),...(d.recent||[])]}],seen=new Set(),items=[],sourceErrors=[];
 for(const g of groups){if(g.error)sourceErrors.push(String(g.error));for(const r of g.results||[]){const id=r.siteId||g.siteId;if(!sites[id]||(site!=='all'&&id!==site)||!r.detailUrl)continue;const url=wrapped('book',id,r.detailUrl);if(seen.has(url))continue;seen.add(url);items.push({url,title:r.title,cover:img(r.coverUrl),sourceId:id,sourceName:sites[id],latest:r.latestChapter||''})}}return {items,filters:[],sourceErrors};}
 if(route==='details'){const chapters=(d.chapters||[]).filter(c=>c.url).map(c=>({url:wrapped('chapter',site,c.url),title:c.name}));if(!chapters.length)throw Error('本来源没有可读章节');return {title:d.title,url:value,cover:img(d.coverUrl),intro:d.description||'',sourceId:site,sourceName:name,chapters}}
 return {url:value,images:(d.images||[]).map(img).filter(Boolean),pageIds:d.images||[]};
}
async function viaPage(action,value,q){
 let url=q?portal+'/search?key='+encodeURIComponent(q.keyword):value;
 for(let i=0;i<5;i++){
 const r=await msg('document',{url}),base=r.url;
 const doc=new DOMParser().parseFromString(r.text,'text/html'),all=(s,node=doc)=>[...node.querySelectorAll(s)],href=e=>asURL(e.getAttribute('href'),base),txt=(s,n=doc)=>n.querySelector(s)?.textContent.trim()||'',img=e=>e?comicImage(e.dataset.src||e.getAttribute('src'),base):'';
 if(action==='list'||q){const seen=new Set();const items=all('#comicGrid a[href*="/comic/"],.comic-grid a[href*="/comic/"]').flatMap(e=>{const url=href(e),pic=e.querySelector('img'),title=txt('.comic-card__title',e)||pic?.alt;if(!url||!title||seen.has(url))return [];seen.add(url);return [{url,title,cover:img(pic),latest:txt('.comic-card__chapter',e),sourceId:'wmh1234',sourceName:'漫画1234'}]});const nav=all('.pagination-wrapper a,.pagination a');return {items,filters:[],prev:hrefOr('上一页'),next:hrefOr('下一页')};function hrefOr(t){const a=nav.find(e=>e.textContent.includes(t));return a?href(a):''}}
 if(action.toLowerCase().includes('detail')){const seen=new Set();const chapters=all('[data-mint-chapters] a[data-chapter-id],.mint-chapter-grid a[href]').flatMap(e=>{const url=href(e);if(!url||seen.has(url))return [];seen.add(url);return [{url,title:e.textContent.trim()}]}).reverse();if(!chapters.length)throw Error('未读到章节目录');return {url:value,title:txt('#mintWorkTitle')||txt('h1'),cover:img(doc.querySelector('#mintWorkCover')),intro:txt('#mintIntroPanel'),chapters,sourceId:'wmh1234'}}
 const pics=all('img.reader-image'),images=pics.map(img).filter(Boolean);if(images.length)return {url:value,images,pageIds:pics.map(e=>e.dataset.picId||'')};
 const dest=r.text.match(/location\.(?:assign|replace)\(\s*["']([^"']+)["']/)?.[1]||doc.querySelector('meta[http-equiv="refresh" i]')?.content.match(/url\s*=\s*(.*)/i)?.[1];if(!dest)break;url=asURL(dest,base);
 }throw Error('未读到漫画图片，请尝试其他章节或来源');
}
let lastDiagnostic='';
async function readComic(action,value){
 const q=action==='search'?JSON.parse(value):null,key='doc:'+value,canCache=!q&&action!=='list';
 let cached;try{cached=JSON.parse(localStorage.getItem(key))}catch{}
 if(canCache&&cached&&!action.startsWith('refresh')&&Date.now()-cached.at<1800000)return cached.data;
 try{const data=await ((q?q.source!=='wmh1234':new URL(value).hostname==='mangayun.com')?viaAPI(action,value,q):viaPage(action,value,q));
 if(canCache)try{localStorage.setItem(key,JSON.stringify({at:Date.now(),data}))}catch{}
 return data;}catch(e){lastDiagnostic=action+' · '+ipError(e);if(canCache&&cached&&!action.startsWith('refresh'))return {...cached.data,offline:true};throw e}
}
window.Native={
 read:()=>localStorage.getItem('comicState')||'{}',save:value=>localStorage.setItem('comicState',value),
 request:(id,action,v)=>readComic(action,v).then(data=>nativeResult(id,JSON.stringify(data)),e=>nativeResult(id,JSON.stringify({error:ipError(e)}))),
 cacheChapter:async(id,v)=>{const urls=JSON.parse(v);let ok=0;for(const url of urls){ok+=await new Promise(r=>{const im=new Image();im.onload=()=>r(1);im.onerror=()=>r(0);im.src=url})}nativeResult(id,JSON.stringify({ok,total:urls.length}))},
 clearCache:async id=>{try{await msg('clear');for(const k of Object.keys(localStorage))if(k.startsWith('doc:'))localStorage.removeItem(k);nativeResult(id,'{}')}catch(e){nativeResult(id,JSON.stringify({error:ipError(e)}))}},
 copyDiagnostics:()=>{navigator.clipboard?.writeText(lastDiagnostic).catch(()=>{});toast(lastDiagnostic||'暂无错误')},
 exit:()=>msg('exit')
};
