// Standalone renderer. No Obsidian application or internal code required.
const $=id=>document.getElementById(id),ko=navigator.language.startsWith('ko');
if(ko){document.documentElement.lang='ko';for(const [id,value]of Object.entries({'title':'그래프 옵션','documents-label':'문서만 표시','colors-label':'색상 범례 표시','weights-label':'가중치로 선 두께 표시',reload:'추적관계 새로고침',copy:'경로 복사'}))$(id).textContent=value;}
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
const fileList = new FileList($('files'), select);
let data,nodes=[],edges=[],simulation,hover,selected,scale=1,pan=[0,0],drag;
let disabled=new Set();
let topology=null;
function plotArea(){
 const panel=document.querySelector('aside').getBoundingClientRect();
 const header=document.querySelector('header').getBoundingClientRect();
 const left=16,top=header.bottom+16;
 const right=innerWidth>700?panel.left-16:innerWidth-16;
 const bottom=innerWidth>700?innerHeight-16:panel.top-16;
 return {x:(left+right)/2,y:(top+bottom)/2,width:Math.max(1,right-left),height:Math.max(1,bottom-top)};
}
function fitGraph(){const fit=graphFit(nodes,plotArea());scale=fit.scale;pan=fit.pan;}
try{const s=JSON.parse(localStorage.getItem('dd-graph')||'{}');disabled=new Set(s.disabled||[]);for(const id of ['documents','colors','weights'])if(id in s)$(id).checked=s[id];}catch{}
function save(){try{localStorage.setItem('dd-graph',JSON.stringify({disabled:[...disabled],...Object.fromEntries(['documents','colors','weights'].map(id=>[id,$(id).checked]))}));}catch{}}
function rebuild(){
 const filtered=selectTraceability(data,{documentsOnly:$('documents').checked,disabledRelations:[...disabled]});
 const ids=new Set(filtered.paths), incoming=data.nodes.filter(n=>ids.has(n.id));
 const nextTopology=layoutKey(incoming,filtered.edges);
 if(topology===nextTopology){
  const updates=new Map(incoming.map(n=>[n.id,n]));
  nodes.forEach(n=>Object.assign(n,updates.get(n.id)));
  const byId=new Map(nodes.map(n=>[n.id,n]));
  edges=filtered.edges.map(e=>({...e,source:byId.get(e.source),target:byId.get(e.target)}));
 }else{
 const previous=new Map(nodes.map(n=>[n.id,n]));
 simulation?.stop();
 nodes=incoming.map(n=>({...n,x:previous.get(n.id)?.x,y:previous.get(n.id)?.y}));
 edges=filtered.edges.map(e=>({...e}));
 simulation=createGraphLayout(d3,nodes,edges);
 simulation.stop();for(let i=0;i<240;i++)simulation.tick();
 fitGraph();
 simulation.on('tick',draw).restart();
 topology=nextTopology;
 }
 $('legend').replaceChildren();for(const t of data.types){const b=document.createElement('button');b.setAttribute('aria-pressed',String(!disabled.has(t.relation)));const s=document.createElement('span');s.className='swatch';s.style.background=t.color;b.append(s,document.createTextNode(t.label));b.onclick=()=>{disabled.has(t.relation)?disabled.delete(t.relation):disabled.add(t.relation);save();rebuild();};$('legend').append(b);}
 for(const [group,color]of new Map(data.nodes.filter(n=>n.group).map(n=>[n.group,n.color]))){const s=document.createElement('span');s.textContent='● '+group;s.style.color=color;$('legend').append(s);}
 $('legend').hidden=!$('colors').checked;hover=null;$('tooltip').hidden=true;selected=null;$('copy').disabled=true;$('path').textContent='';list();$('status').textContent=`${nodes.length} files · ${edges.length} connections`;draw();
}
function select(n){selected=n;$('path').textContent=n.id;$('copy').disabled=false;fileList.setSelected(n.id);draw();}
function list(){if(!data)return;fileList.setItems(nodes.filter(n=>n.id.toLowerCase().includes($('search').value.toLowerCase())));fileList.setSelected(selected?.id);}
function draw(){const w=innerWidth,h=innerHeight,d=devicePixelRatio||1;if(canvas.width!==w*d||canvas.height!==h*d){canvas.width=w*d;canvas.height=h*d;}ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);const area=plotArea();ctx.translate(area.x+pan[0],area.y+pan[1]);ctx.scale(scale,scale);
 for(const e of edges){const a=e.source,b=e.target;ctx.strokeStyle=ctx.fillStyle=e.color;ctx.lineWidth=($('weights').checked?Math.max(1,Math.min(6,e.weight)):1)/scale;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();const angle=Math.atan2(b.y-a.y,b.x-a.x),x=b.x-Math.cos(angle)*8,y=b.y-Math.sin(angle)*8;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-Math.cos(angle-.45)*8,y-Math.sin(angle-.45)*8);ctx.lineTo(x-Math.cos(angle+.45)*8,y-Math.sin(angle+.45)*8);ctx.fill();}
 for(const n of nodes){ctx.fillStyle=n.color||'#c6ccd8';ctx.beginPath();ctx.arc(n.x,n.y,n===hover||n===selected?8:5,0,Math.PI*2);ctx.fill();if((scale>1.5&&nodes.length<60)||n===hover||n===selected){ctx.font=`${12/scale}px monospace`;ctx.textAlign='center';ctx.fillStyle='#d8dee9';ctx.fillText(n.label,n.x,n.y+20/scale);}}}
function point(e){const area=plotArea();return[(e.clientX-area.x-pan[0])/scale,(e.clientY-area.y-pan[1])/scale];}
function hit(e){const[x,y]=point(e);return nodes.find(n=>Math.hypot(n.x-x,n.y-y)<12/scale);}
canvas.onpointerdown=e=>{drag={node:hit(e),x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);};
canvas.onpointermove=e=>{if(drag){if(drag.node){const[x,y]=point(e);drag.node.fx=x;drag.node.fy=y;simulation.alpha(.2).restart();}else{pan[0]+=e.clientX-drag.x;pan[1]+=e.clientY-drag.y;}drag.x=e.clientX;drag.y=e.clientY;}hover=hit(e);const t=$('tooltip');t.hidden=!hover||!!drag;if(hover){t.textContent=hover.label;t.style.left=Math.max(8,Math.min(e.clientX+12,innerWidth-t.offsetWidth-8))+'px';t.style.top=Math.max(8,Math.min(e.clientY+18,innerHeight-t.offsetHeight-8))+'px';}draw();};
canvas.onpointerup=()=>{if(drag?.node){select(drag.node);drag.node.fx=null;drag.node.fy=null;}drag=null;};canvas.onpointercancel=()=>{if(drag?.node){drag.node.fx=null;drag.node.fy=null;}drag=null;};canvas.onpointerleave=()=>{$('tooltip').hidden=true;hover=null;draw();};
canvas.addEventListener('wheel',e=>{
 e.preventDefault();
 const [x,y]=point(e),area=plotArea(),fit=graphFit(nodes,area);
 const minScale=Math.min(.01,fit.scale/10);
 scale=Math.max(minScale,Math.min(6,scale*Math.exp(-e.deltaY*.001)));
 pan=[e.clientX-area.x-x*scale,e.clientY-area.y-y*scale];
 if(e.deltaY>0&&scale<=fit.scale)pan=keepGraphInView(nodes,area,scale,pan);
 draw();
},{passive:false});
for(const id of ['documents','colors','weights'])$(id).onchange=()=>{save();if(data)rebuild();};$('search').oninput=list;$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(selected.id);}catch{$('status').textContent=selected.id;}};
async function load(){
 if($('reload').disabled)return;
 $('reload').disabled=true;
 const previous=data;
 try{data=await fetchGraph();rebuild();}
 catch(error){
  data=previous;
  $('status').textContent=(ko?'새로고침 실패. 서버를 확인한 뒤 다시 시도하세요. ':'Reload failed. Check the server and try again. ')+error.message;
  console.error(error);
 }finally{$('reload').disabled=false;}
}
$('reload').onclick=load;addEventListener('resize',()=>{fitGraph();draw();});load();
