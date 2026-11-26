(function(root){'use strict';
const M=typeof module!=='undefined'&&module.exports?require('./model.js'):root.QingyueModel;
const uuid=()=>{if(root.crypto?.randomUUID)return root.crypto.randomUUID();return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=Math.random()*16|0;return(c==='x'?n:(n&3|8)).toString(16)});};
const map=rows=>Object.fromEntries(rows.map(r=>[M.id(r.collection,r.key),r]));
const equal=(a,b)=>!!a===!!b&&(!a||M.stable(a.value)===M.stable(b.value));
class Engine {
 constructor(adapter){this.a=adapter;this.running=false;this.lastError='';this.lastSync=0;this.journal=null;}
 async load(){if(this.journal)return;const saved=await this.a.readJournal();this.journal=saved?.version===1?saved:{version:1,cursor:0,initialized:false,shadow:{},baseline:{},pending:{},conflicts:{}};}
 async save(){await this.a.writeJournal(this.journal);}
 async status(){await this.load();return {running:this.running,lastError:this.lastError,lastSync:this.lastSync,pending:Object.keys(this.journal.pending).length,conflicts:Object.values(this.journal.conflicts),initialized:this.journal.initialized,cursor:this.journal.cursor};}
 enqueue(row,baseRev){const key=M.id(row.collection,row.key);this.journal.pending[key]={...row,deleted:!!row.deleted,baseRev,opId:uuid()};}
 async cycle(){if(this.running)return this.status();this.running=true;this.lastError='';try{await this.load();const j=this.journal;let snapshot=await this.a.snapshot(),start=map(M.capture(snapshot));
  if(!j.initialized){await this.a.backupBeforeConnect();let cursor=0,incoming=[],seedDeviceId='';for(let page=0;page<100;page++){const response=await this.a.request('/api/state?cursor='+cursor);if(!response.initialized)throw Error('请先在服务器导入手机备份');seedDeviceId=response.seedDeviceId||seedDeviceId;incoming.push(...response.records);cursor=response.cursor;if(!response.more)break;if(page===99)throw Error('服务器记录过多，请联系维护');}
   for(const r of incoming)j.shadow[M.id(r.collection,r.key)]=r;
   for(const [key,row]of Object.entries(start))if(!Object.hasOwn(j.shadow,key))this.enqueue(row,0);
   // First connection uses the imported phone copy for overlaps; the original local snapshot is backed up first.
   const newer=new Set();if(seedDeviceId&&seedDeviceId===snapshot.deviceId)for(const r of incoming){const key=M.id(r.collection,r.key),local=start[key];if(r.deviceId==='phone-import'&&!r.deleted&&r.collection==='film.progress'&&local&&local.value.at>r.value.at){this.enqueue(local,r.rev);newer.add(key);}}await this.a.apply(incoming.filter(r=>!newer.has(M.id(r.collection,r.key))));j.cursor=cursor;j.initialized=true;j.baseline=map(M.capture(await this.a.snapshot()));start=j.baseline;await this.save();
  }else{
   for(const key of new Set([...Object.keys(j.baseline),...Object.keys(start)])){if(j.conflicts[key])continue;const before=j.baseline[key],now=start[key];if(equal(before,now))continue;if(now)this.enqueue(now,j.pending[key]?.baseRev??j.shadow[key]?.rev??0);else if(before)this.enqueue({...before,value:null,deleted:true},j.pending[key]?.baseRev??j.shadow[key]?.rev??0);}
   // Persist the outbox before the network, so a crash after a commit replays the same operation id.
   j.baseline=start;await this.save();
  }
  const sent=Object.entries(j.pending).slice(0,200),acknowledged={};
  if(sent.length){const answer=await this.a.request('/api/sync',{ops:sent.map(([,op])=>op)});for(const result of answer.results){const match=sent.find(([,op])=>op.opId===result.opId);if(!match)continue;const [key,op]=match;if(j.pending[key]?.opId!==op.opId)continue;if(result.status==='applied'){delete j.pending[key];j.shadow[key]=result.record;acknowledged[key]=result.record;}
    else if(result.status==='conflict'){delete j.pending[key];j.conflicts[key]={key,local:op,remote:result.current};if(result.current)j.shadow[key]=result.current;}}
   await this.save();
  }
  let cursor=j.cursor,incoming=[];for(let page=0;page<100;page++){const response=await this.a.request('/api/state?cursor='+cursor);incoming.push(...response.records);cursor=response.cursor;if(!response.more)break;if(page===99)throw Error('服务器记录过多');}
  const current=map(M.capture(await this.a.snapshot())),applicable=[];
  for(const r of incoming){const key=M.id(r.collection,r.key),changed=!equal(start[key],current[key]);const previous=j.shadow[key];j.shadow[key]=r;if(j.pending[key]||j.conflicts[key])continue;
   if(changed){if(current[key])this.enqueue(current[key],acknowledged[key]?.rev??previous?.rev??0);else if(start[key])this.enqueue({...start[key],value:null,deleted:true},acknowledged[key]?.rev??previous?.rev??0);continue;}applicable.push(r);
  }
  if(applicable.length)await this.a.apply(applicable);j.cursor=cursor;j.baseline=map(M.capture(await this.a.snapshot()));await this.save();this.lastSync=Date.now();return this.status();
 }catch(e){this.lastError=e.message;throw e;}finally{this.running=false;}}
 async resolve(key,choice){await this.load();const j=this.journal,conflict=j.conflicts[key];if(!conflict)throw Error('冲突已处理');if(choice==='server'){await this.a.apply([{...conflict.local,...conflict.remote,deleted:conflict.remote?conflict.remote.deleted:true,value:conflict.remote?.value??null}]);delete j.pending[key];}else if(choice==='local'){this.enqueue(conflict.local,conflict.remote?.rev||0);}else throw Error('请选择保留哪份记录');delete j.conflicts[key];j.baseline=map(M.capture(await this.a.snapshot()));await this.save();return this.cycle();}
}
const api={Engine};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.QingyueSync=api;
})(typeof globalThis==='undefined'?this:globalThis);
