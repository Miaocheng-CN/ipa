'use strict';
// One cursor represents the first page of a spread, including an unpaired last page.
class SpreadReader{
 constructor(host,opts){this.host=host;this.o=opts;this.index=this.align(opts.index||0);this.start=null;this.render(0)}
 align(i){const k=this.o.count;return Math.floor(Math.max(0,Math.min(i,this.o.images.length-1))/k)*k}
 turn(d){if(this.animating)return;const n=this.index+d*this.o.count;if(n<0||n>=this.o.images.length){this.o.edge(d);return}this.index=n;this.render(d)}
 render(dir){const oldSheet=this.host.querySelector('.spread-sheet');const oldImages=oldSheet?[...oldSheet.querySelectorAll('.spread-cell img')].map(im=>im.src):[];const {images,count}=this.o, i=this.index,host=this.host;host.textContent='';const sheet=document.createElement('div');sheet.className='spread-sheet';sheet.style.setProperty('--cols',String(count));
 for(let j=i;j<Math.min(images.length,i+count);j++){const cell=document.createElement('div');cell.className='spread-cell';const im=new Image();im.alt='第 '+(j+1)+' 页';im.draggable=false;im.src=images[j];cell.append(im);im.onerror=()=>{if(cell.querySelector('button'))return;const b=document.createElement('button');b.textContent='重新加载第 '+(j+1)+' 页';b.onclick=e=>{e.stopPropagation();b.remove();im.src=images[j]};cell.append(b)};sheet.append(cell)}
 host.append(sheet);if(dir&&oldImages.length)this.flip(sheet,oldImages,dir);
 let down=null,swiped=false;sheet.ontouchstart=e=>{const t=e.touches[0];swiped=false;down=e.touches.length===1?[t.clientX,t.clientY]:null};sheet.ontouchmove=e=>{if(e.touches.length!==1)down=null};sheet.ontouchend=e=>{if(!down)return;const t=e.changedTouches[0],dx=t.clientX-down[0],dy=t.clientY-down[1];down=null;if(Math.abs(dx)>50&&Math.abs(dx)>1.5*Math.abs(dy)){swiped=true;e.preventDefault();this.turn(dx<0?1:-1)}};
 this.o.progress(i);
 }
 flip(sheet,oldImages,dir){
  if(!this.o.motion||matchMedia('(prefers-reduced-motion:reduce)').matches||!sheet.animate)return;
  const count=this.o.count,forward=dir>0;
  const layer=document.createElement('div');layer.className='page-turn-layer';layer.setAttribute('aria-hidden','true');
  const makeFace=(url,extra='')=>{
   const face=document.createElement('div');face.className='page-turn-face '+extra;
   if(url){const im=new Image();im.src=url;im.alt='';im.draggable=false;face.append(im)}return face;
  };
  // The old unturned half stays still while the opposite leaf turns about the spine.
  if(count===2){
   const still=makeFace(oldImages[forward?0:1],'page-turn-still');
   still.style.left=forward?'0':'50%';layer.append(still);
  }
  const leaf=document.createElement('div');leaf.className='page-turn-leaf';
  leaf.style.width=count===2?'50%':'100%';
  leaf.style.left=count===2&&forward?'50%':'0';
  leaf.style.transformOrigin=forward?'left center':'right center';
  const front=makeFace(oldImages[count===2?(forward?1:0):0],'page-turn-front');
  const back=makeFace(count===2?this.o.images[this.index+(forward?0:1)]:null,'page-turn-back');
  leaf.append(front,back);layer.append(leaf);sheet.append(layer);this.animating=true;
  const animation=leaf.animate([
   {transform:'rotateY(0deg)',filter:'brightness(1)'},
   {transform:'rotateY('+(forward?-90:90)+'deg)',filter:'brightness(0.72)',offset:.5},
   {transform:'rotateY('+(forward?-180:180)+'deg)',filter:'brightness(1)'}
  ],{duration:460,easing:'cubic-bezier(.35,.05,.2,1)',fill:'forwards'});
  let timer;
  const finish=()=>{clearTimeout(timer);layer.remove();this.animating=false;animation.cancel()};
  animation.onfinish=finish;timer=setTimeout(finish,650);
 }
}
if(typeof module!=='undefined')module.exports=SpreadReader;
