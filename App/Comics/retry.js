/* Bounded per-page retries. A chapter owns one controller and disposes it on exit. */
(function(root){
 class ImageRetryController {
  constructor(options){this.o=options;this.rows=new Map();this.queue=[];this.active=0;this.disposed=false;this.timer=options.setTimeout||((fn,ms)=>setTimeout(fn,ms));this.clear=options.clearTimeout||((id)=>clearTimeout(id));this.delays=options.delays||[1000,3000,6000];this.limit=options.concurrency||2;this.refreshPromise=null;this.refreshAt=0;this.revision=0;}
  row(index){if(!this.rows.has(index))this.rows.set(index,{index,attempt:0,failed:false,busy:false,queued:false,timer:null,refreshed:false,token:0});return this.rows.get(index)}
  state(r,phase){if(!this.disposed&&this.o.state)this.o.state(r.index,phase,r.attempt)}
  failure(index){if(this.disposed)return;let r=this.row(index);if(r.busy||r.queued||r.timer!==null)return;r.failed=true;this.schedule(r)}
  success(index){if(this.disposed)return;let r=this.row(index);r.failed=false;if(r.timer!==null){this.clear(r.timer);r.timer=null}r.queued=false;r.token++;this.state(r,'loaded')}
  schedule(r,immediate=false){if(this.disposed||!r.failed||r.busy||r.queued||r.timer!==null)return;
   if(r.attempt<this.delays.length){this.state(r,'waiting');r.timer=this.timer(()=>{r.timer=null;if(!r.failed||this.disposed)return;r.queued=true;this.queue.push(r);this.drain()},immediate?0:this.delays[r.attempt]);}
   else if(!r.refreshed){r.queued=true;this.queue.push(r);this.drain()}
   else this.state(r,'failed');
  }
  sharedRefresh(){const now=Date.now();if(!this.refreshPromise||now-this.refreshAt>30000){this.refreshAt=now;this.refreshPromise=Promise.resolve().then(()=>this.o.refresh());}return this.refreshPromise;}
  drain(){if(this.disposed)return;while(this.active<this.limit&&this.queue.length){let r=this.queue.shift();if(!r.queued||!r.failed||r.busy)continue;r.queued=false;r.busy=true;this.active++;const token=++r.token;
   const run=async()=>{try{if(r.attempt>=this.delays.length){r.refreshed=true;this.state(r,'refreshing');await this.sharedRefresh();if(this.disposed||token!==r.token)return;}
     r.attempt++;this.state(r,'loading');await this.o.load(r.index);if(this.disposed||token!==r.token)return;r.failed=false;this.state(r,'loaded');
    }catch(e){if(this.disposed||token!==r.token)return;r.failed=true;}
    finally{r.busy=false;this.active--;if(!this.disposed&&token===r.token&&r.failed)this.schedule(r);this.drain();}};run();
  }}
  retry(index){if(this.disposed)return;let r=this.row(index);if(!r.failed||r.busy)return;if(r.timer!==null){this.clear(r.timer);r.timer=null}r.queued=false;r.attempt=0;r.refreshed=false;this.schedule(r,true)}
  retryFailed(){for(let r of this.rows.values())if(r.failed)this.retry(r.index)}
  dispose(){this.disposed=true;this.queue=[];for(let r of this.rows.values()){r.token++;if(r.timer!==null)this.clear(r.timer);r.timer=null}}
 }
 root.ImageRetryController=ImageRetryController;
})(typeof window==='undefined'?globalThis:window);
