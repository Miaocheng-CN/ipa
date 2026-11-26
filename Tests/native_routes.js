const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const code=fs.readFileSync(path.join(__dirname,'../App/Comics/bridge.js'),'utf8');
const requests=[];
const ctx=vm.createContext({URL,URLSearchParams,localStorage:{getItem(){return null},setItem(){}},window:{webkit:{messageHandlers:{comics:{postMessage:async m=>{
 requests.push(m);
 const data=m.url.endsWith('/search')?[]:m.url.endsWith('/home-sections')?{popular:[],recent:[]}:m.url.endsWith('/details')?{title:'测试',chapters:[{name:'1',url:'https://www.rumanhua.com/chapter/1'}]}:{images:['https://images.example.org/1.jpg']};
 return {text:JSON.stringify({data})};
}}}}}});
vm.runInContext(code+'\nglobalThis.read=readComic',ctx);
(async()=>{
 for(const id of ['manhuazhijia','rumanhua','dumanwu']){
  const book='https://mangayun.com/book?siteId='+id+'&url='+encodeURIComponent('https://www.example.org/book/1');
  const chapter=book.replace('/book?','/chapter?');
  for(const [action,value,route] of [
   ['search',JSON.stringify({source:id,keyword:'测试'}),'search'],
   ['list','https://mangayun.com/catalog?siteId='+id,'home-sections'],
   ['detail',book,'details'],['chapter',chapter,'chapter-images']]){
   await ctx.read(action,value);
   const req=requests.at(-1);assert.equal(req.url,'https://mangayun.com/api/'+route);
   if(action==='search')assert.equal(JSON.parse(req.body).keyword,'测试');
   if(action==='detail'||action==='chapter')assert.equal(JSON.parse(req.body).siteId,id);
  }
 }
 assert.equal(requests.length,12);
 assert.equal(ctx.window.Native.openMangaYun,undefined);
 console.log('PASS: 3 sources × 4 native request routes; no external handoff. Mock responses only; authentication not tested.');
})().catch(e=>{console.error(e);process.exitCode=1});
