'use strict';
// One cursor represents the first page of a spread, including an unpaired last page.
class SpreadReader{
 constructor(host,opts){this.host=host;this.o=opts;this.index=this.align(opts.index||0);this.start=null;this.render(0)}
 align(i){const k=this.o.count;return Math.floor(Math.max(0,Math.min(i,this.o.images.length-1))/k)*k}
 turn(d){const n=this.index+d*this.o.count;if(n<0||n>=this.o.images.length){this.o.edge(d);return}this.index=n;this.render(d)}
 render(dir){const {images,count}=this.o, i=this.index,host=this.host;host.textContent='';const sheet=document.createElement('div');sheet.className='spread-sheet';sheet.style.setProperty('--cols',String(count));
 for(let j=i;j<Math.min(images.length,i+count);j++){const cell=document.createElement('div');cell.className='spread-cell';const im=new Image();im.alt='第 '+(j+1)+' 页';im.draggable=false;im.src=images[j];cell.append(im);im.onerror=()=>{if(cell.querySelector('button'))return;const b=document.createElement('button');b.textContent='重新加载第 '+(j+1)+' 页';b.onclick=e=>{e.stopPropagation();b.remove();im.src=images[j]};cell.append(b)};sheet.append(cell)}
 host.append(sheet);if(dir && this.o.motion && !matchMedia('(prefers-reduced-motion:reduce)').matches)sheet.animate([{transform:'translateX('+dir*36+'px)',opacity:0.45},{transform:'translateX(0)',opacity:1}],{duration:190,easing:'ease-out'});
 const nav=document.createElement('div');nav.className='spread-nav';for(const [caption,click] of [['‹',()=>this.turn(-1)],[count===2&&i+1<images.length?(i+1)+'–'+(i+2)+' / '+images.length:(i+1)+' / '+images.length,()=>this.o.menu()],['›',()=>this.turn(1)]]){const b=document.createElement('button');b.textContent=caption;b.setAttribute('aria-label',caption==='‹'?'上一页':caption==='›'?'下一页':'阅读菜单');b.onclick=click;nav.append(b)}host.append(nav);
 let down=null,swiped=false;sheet.ontouchstart=e=>{const t=e.touches[0];swiped=false;down=e.touches.length===1?[t.clientX,t.clientY]:null};sheet.ontouchmove=e=>{if(e.touches.length!==1)down=null};sheet.ontouchend=e=>{if(!down)return;const t=e.changedTouches[0],dx=t.clientX-down[0],dy=t.clientY-down[1];down=null;if(Math.abs(dx)>50&&Math.abs(dx)>1.5*Math.abs(dy)){swiped=true;e.preventDefault();this.turn(dx<0?1:-1)}};sheet.onclick=e=>{if(!swiped&&!e.target.closest('button'))this.o.menu()};
 this.o.progress(i);
 }}
if(typeof module!=='undefined')module.exports=SpreadReader;
