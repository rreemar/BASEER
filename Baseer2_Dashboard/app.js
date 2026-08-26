/* BASEER 2 dashboard — ROS 2 via rosbridge + roslibjs */
const CONFIG = { url: `ws://${location.hostname || 'localhost'}:9090` };
const state = { ros:null, connected:false, demoMode:false, alerts:[], gas:{ppm:null,score:0,state:'NORMAL',confirmed:false}, fall:{score:0,state:'NORMAL'}, gps:null, lastScada:'NO ACTION', history:{gas:[],fall:[],alertRate:[]} };
const SPARK_COLOR = { gas:'#5aa9ff', fall:'#ff5f67', alertRate:'#f2b84b' };
const $ = id => document.getElementById(id);
const now = () => new Date().toLocaleTimeString([], {hour12:false});

/* --- trend sparklines (gas ppm, fall score, alert rate) --- */
function drawSpark(canvas, data, color){
  if(!canvas) return;
  const dpr = window.devicePixelRatio||1;
  const cw = canvas.clientWidth||120, ch = canvas.clientHeight||26;
  canvas.width = cw*dpr; canvas.height = ch*dpr;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
  if(data.length<2) return;
  const max = Math.max(...data), min = Math.min(...data,0), range=(max-min)||1;
  ctx.lineWidth=2*dpr; ctx.strokeStyle=color; ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.beginPath();
  data.forEach((v,i)=>{
    const x=(i/(data.length-1))*canvas.width;
    const y=canvas.height-((v-min)/range)*(canvas.height*0.8)-canvas.height*0.1;
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  });
  ctx.stroke();
  const lastY=canvas.height-((data[data.length-1]-min)/range)*(canvas.height*0.8)-canvas.height*0.1;
  ctx.beginPath(); ctx.arc(canvas.width-2*dpr,lastY,3*dpr,0,Math.PI*2); ctx.fillStyle=color; ctx.fill();
}
function pushHistory(key, value){
  const arr=state.history[key]; arr.push(Number(value)||0); if(arr.length>60) arr.shift();
  drawSpark($(key==='gas'?'gasSpark':key==='fall'?'fallSpark':'alertRateSpark'), arr, SPARK_COLOR[key]);
}

/* --- alert timeline scatter (severity lanes over time) --- */
function drawAlertChart(){
  const canvas=$('alertChart'); if(!canvas) return;
  const dpr=window.devicePixelRatio||1;
  const cw=canvas.clientWidth||400, ch=canvas.clientHeight||60;
  canvas.width=cw*dpr; canvas.height=ch*dpr;
  const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
  const lanes={critical:0.22,warning:0.52,normal:0.82};
  ctx.strokeStyle='#1c252d'; ctx.lineWidth=1*dpr;
  Object.values(lanes).forEach(ry=>{ctx.beginPath();ctx.moveTo(30*dpr,ch*ry*dpr);ctx.lineTo(canvas.width,ch*ry*dpr);ctx.stroke();});
  ctx.font=`${8*dpr}px sans-serif`; ctx.fillStyle='#5f6e7b'; ctx.textBaseline='middle';
  ctx.fillText('CRIT',2*dpr,ch*lanes.critical*dpr); ctx.fillText('WARN',2*dpr,ch*lanes.warning*dpr); ctx.fillText('INFO',2*dpr,ch*lanes.normal*dpr);
  const data=state.alerts.slice(0,40).slice().reverse();
  const colors={critical:'#ff5f67',warning:'#f2b84b',normal:'#45d483'};
  data.forEach((a,i)=>{
    const x = data.length>1 ? (i/(data.length-1))*(canvas.width-40*dpr)+34*dpr : canvas.width/2;
    const y = ch*lanes[a.level]*dpr;
    ctx.beginPath(); ctx.arc(x,y,3*dpr,0,Math.PI*2); ctx.fillStyle=colors[a.level]; ctx.fill();
  });
}

/* --- live map (Leaflet), fed by the same /baseer2/gps updates as real ROS or demo mode --- */
let gpsMap=null, droneMarker=null, droneTrail=null, trailPoints=[], mapCentered=false;
function initMap(){
  if(typeof L==='undefined' || !$('gpsMap')) return;
  gpsMap = L.map('gpsMap', {attributionControl:true, zoomControl:true}).setView([24.7136,46.6753], 3);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution:'&copy; OpenStreetMap contributors &copy; CARTO', subdomains:'abcd', maxZoom:20
  }).addTo(gpsMap);
  droneMarker = L.circleMarker([24.7136,46.6753], {radius:8,color:'#5aa9ff',weight:2,fillColor:'#5aa9ff',fillOpacity:0.9}).addTo(gpsMap);
  droneTrail = L.polyline([], {color:'#5aa9ff',weight:2,opacity:0.5}).addTo(gpsMap);
}

function setConnection(ok, text){ $('connectionDot').className=`status-dot ${ok?'online':'offline'}`; $('connectionText').textContent=text; $('connectionSub').textContent=ok?'ROS bridge connected':'Waiting for rosbridge'; }
function badge(el, level){ el.className=`badge ${level}`; el.textContent=level.toUpperCase(); }
function levelFromSeverity(s){ return Number(s)===2?'critical':Number(s)===1?'warning':'normal'; }
function drawImage(canvas, msg){
  const w=Number(msg.width), h=Number(msg.height); if(!w||!h||!msg.data) return;
  canvas.width=w; canvas.height=h; const ctx=canvas.getContext('2d'); const out=ctx.createImageData(w,h); let raw;
  try { raw=Uint8Array.from(atob(msg.data), c=>c.charCodeAt(0)); } catch(e){ return; }
  const enc=(msg.encoding||'').toLowerCase();
  for(let i=0,p=0;i<w*h;i++){
    if(enc==='rgb8'){out.data[p++]=raw[i*3];out.data[p++]=raw[i*3+1];out.data[p++]=raw[i*3+2];}
    else if(enc==='bgr8'){out.data[p++]=raw[i*3+2];out.data[p++]=raw[i*3+1];out.data[p++]=raw[i*3];}
    else if(enc==='rgba8'){out.data[p++]=raw[i*4];out.data[p++]=raw[i*4+1];out.data[p++]=raw[i*4+2];out.data[p++]=raw[i*4+3];continue;}
    else if(enc==='bgra8'){out.data[p++]=raw[i*4+2];out.data[p++]=raw[i*4+1];out.data[p++]=raw[i*4];out.data[p++]=raw[i*4+3];continue;}
    else { const v=raw[i]||0; out.data[p++]=v;out.data[p++]=v;out.data[p++]=v; }
    out.data[p++]=255;
  }
  ctx.putImageData(out,0,0);
}
function addTimeline(a){
  state.alerts.unshift(a); if(state.alerts.length>30) state.alerts.pop(); $('alertCount').textContent=state.alerts.length;
  const t=$('timeline'); t.innerHTML=state.alerts.map(x=>`<div class="timeline-item"><time>${x.time}</time><span class="timeline-dot ${x.level}"></span><div><div class="event-title">${x.type} · ${x.severity}</div><div class="event-reason">${escapeHtml(x.reason)}</div></div></div>`).join('');
  renderLatest(a); pushHistory('alertRate', state.alerts.length); drawAlertChart();
}
function renderLatest(a){
  badge($('latestAlertBadge'),a.level); $('latestAlertBadge').textContent=`${a.type} ${a.severity}`;
  const confirmed=a.sensor_confirmed?'YES':'NO';
  $('alertDetails').innerHTML=`<div class="detail-grid"><div class="detail"><span>Type</span><strong>${a.type}</strong></div><div class="detail"><span>Severity</span><strong>${a.severity}</strong></div><div class="detail"><span>Confidence</span><strong>${(Number(a.confidence||0)*100).toFixed(1)}%</strong></div><div class="detail"><span>Sensor confirmed</span><strong>${confirmed}</strong></div><div class="detail"><span>Latitude</span><strong>${Number(a.latitude||0).toFixed(6)}</strong></div><div class="detail"><span>Longitude</span><strong>${Number(a.longitude||0).toFixed(6)}</strong></div><div class="detail"><span>Altitude</span><strong>${Number(a.altitude||0).toFixed(1)} m</strong></div><div class="detail"><span>Received</span><strong>${a.time}</strong></div></div><div class="reason-box ${a.level==='critical'?'critical-box':''}">${escapeHtml(a.reason)}</div>`;
}
function escapeHtml(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function updateGas(){ $('gasPpm').textContent=state.gas.ppm==null?'-- ppm':`${state.gas.ppm.toFixed(1)} ppm`; $('gasSensorInline').textContent=state.gas.ppm==null?'-- ppm':`${state.gas.ppm.toFixed(1)} ppm`; $('gasScore').textContent=Number(state.gas.score||0).toFixed(2); $('gasFusion').textContent=state.gas.confirmed?'SENSOR CONFIRMED':'NOT CONFIRMED'; const l=state.gas.state==='CONFIRMED'?'critical':state.gas.state==='SUSPECT'?'warning':'normal'; badge($('gasStateBadge'),l); $('gasStateBadge').textContent=state.gas.state; $('gasPpmState').textContent=state.gas.ppm==null?'NO DATA':'LIVE'; $('gasPpmState').style.color=state.gas.ppm!=null?'var(--green)':'var(--muted)'; }
function updateFall(){ $('fallScore').textContent=Number(state.fall.score||0).toFixed(2); $('fallMetric').textContent=state.fall.state; $('fallLastEvent').textContent=state.fall.state==='CONFIRMED'?'CONFIRMED':'NONE'; $('sosState').textContent=state.fall.state==='CONFIRMED'?'TRIGGERED':'STANDBY'; const l=state.fall.state==='CONFIRMED'?'critical':state.fall.state==='SUSPECT'?'warning':'normal'; badge($('fallStateBadge'),l); }
function updateGps(msg){
  state.gps=msg; const lat=Number(msg.latitude||0), lon=Number(msg.longitude||0);
  $('latitude').textContent=lat.toFixed(6); $('longitude').textContent=lon.toFixed(6); $('altitude').textContent=`${Number(msg.altitude||0).toFixed(1)} m`;
  $('gpsLabel').textContent=`GPS ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  if(gpsMap && droneMarker){
    droneMarker.setLatLng([lat,lon]);
    trailPoints.push([lat,lon]); if(trailPoints.length>200) trailPoints.shift();
    droneTrail.setLatLngs(trailPoints);
    if(!mapCentered){ gpsMap.setView([lat,lon],17); mapCentered=true; } else { gpsMap.panTo([lat,lon]); }
  }
}
function connect(){ if(state.demoMode) stopDemo(); if(state.connected) return; const ros=new ROSLIB.Ros({url:CONFIG.url}); state.ros=ros; ros.on('connection',()=>{state.connected=true;setConnection(true,'ROS CONNECTED');subscribe(ros);}); ros.on('error',()=>{setConnection(false,'ROS ERROR');}); ros.on('close',()=>{state.connected=false;setConnection(false,'ROS DISCONNECTED');}); }

/* --- demo/simulated data mode: fabricates plausible readings and feeds them through the SAME
   render functions (updateGas/updateFall/updateGps/addTimeline) used by real ROS messages, so the
   whole UI — including the map and charts — behaves identically to a live feed. Clearly labeled
   in the UI (status dot, connection text, and an on-canvas watermark) so it is never mistaken for
   real sensor data. --- */
let demoTimer=null, demoTick=0;
function makeAlert(type, severityNum, confidence, reason, lat, lon){
  const level=levelFromSeverity(severityNum);
  return {type, severity:level==='critical'?'CRITICAL':level==='warning'?'WARNING':'INFO', confidence, reason, latitude:lat, longitude:lon, altitude:35+Math.sin(demoTick/15)*3, sensor_confirmed:severityNum===2, level, time:now()};
}
function drawDemoFrame(canvas, tint, severityNum){
  if(!canvas) return;
  const w=canvas.width=canvas.clientWidth||480, h=canvas.height=canvas.clientHeight||330;
  const ctx=canvas.getContext('2d'); ctx.fillStyle='#050708'; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle=tint+'33'; ctx.lineWidth=1;
  for(let x=0;x<w;x+=24){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  for(let y=0;y<h;y+=24){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  if(severityNum>0){ ctx.strokeStyle=severityNum===2?'#ff5f67':'#f2b84b'; ctx.lineWidth=3; ctx.strokeRect(w*0.28,h*0.22,w*0.44,h*0.56); }
  ctx.fillStyle='#4a5a68'; ctx.font='bold 11px monospace'; ctx.textAlign='center'; ctx.fillText('SIMULATED FEED — DEMO MODE', w/2, h-16);
}
function startDemo(){
  if(demoTimer) return;
  if(state.ros){ try{state.ros.close();}catch(e){} }
  state.connected=false; state.demoMode=true; demoTick=0;
  document.body.classList.add('demo-active');
  setConnection(true,'DEMO MODE'); $('connectionSub').textContent='Simulated data — not live ROS';
  $('demoBtn').textContent='STOP DEMO';
  const baseLat=24.7136, baseLon=46.6753;
  demoTimer=setInterval(()=>{
    demoTick++;
    const gasSpike=Math.random()<0.1;
    const gasPpm=Math.max(0,380+Math.sin(demoTick/8)*15+(gasSpike?300*Math.random():0)+(Math.random()*6-3));
    state.gas.ppm=gasPpm; const gasSeverity=gasPpm>700?2:gasPpm>550?1:0;
    state.gas.state=gasSeverity===2?'CONFIRMED':gasSeverity===1?'SUSPECT':'NORMAL'; state.gas.score=Math.min(1,gasPpm/900); state.gas.confirmed=gasSeverity===2;
    updateGas(); pushHistory('gas',gasPpm);

    const fallSpike=Math.random()<0.08;
    const fallScore=fallSpike?0.8+Math.random()*0.2:Math.random()*0.15;
    state.fall.score=fallScore; const fallSeverity=fallScore>0.75?2:fallScore>0.4?1:0;
    state.fall.state=fallSeverity===2?'CONFIRMED':fallSeverity===1?'SUSPECT':'NORMAL';
    updateFall(); pushHistory('fall',fallScore*100);

    const lat=baseLat+Math.sin(demoTick/40)*0.0009, lon=baseLon+Math.cos(demoTick/40)*0.0009;
    updateGps({latitude:lat,longitude:lon,altitude:35+Math.sin(demoTick/15)*3});

    drawDemoFrame($('gasCanvas'),'#5aa9ff',gasSeverity); drawDemoFrame($('fallCanvas'),'#ff5f67',fallSeverity);
    $('gasCameraTime').textContent=now(); $('fallCameraTime').textContent=now();

    if(gasSeverity>0 && (gasSpike||Math.random()<0.25)) addTimeline(makeAlert('GAS',gasSeverity,gasPpm/900,`Simulated gas concentration ${gasPpm.toFixed(0)} ppm`,lat,lon));
    if(fallSeverity>0 && (fallSpike||Math.random()<0.25)) addTimeline(makeAlert('FALL',fallSeverity,fallScore,'Simulated fall event detected',lat,lon));
    $('alertState').textContent = state.alerts.length ? $('alertState').textContent : 'DEMO';
  },1000);
}
function stopDemo(){
  if(demoTimer){ clearInterval(demoTimer); demoTimer=null; }
  state.demoMode=false; document.body.classList.remove('demo-active');
  $('demoBtn').textContent='DEMO MODE';
  if(!state.connected) setConnection(false,'ROS DISCONNECTED'), $('connectionSub').textContent='Waiting for rosbridge';
}
function subscribe(ros){
  new ROSLIB.Topic({ros,name:'/baseer2/gas_vision/annotated',messageType:'sensor_msgs/msg/Image',queue_length:1,throttle_rate:150}).subscribe(m=>{drawImage($('gasCanvas'),m);$('gasCameraTime').textContent=now();});
  new ROSLIB.Topic({ros,name:'/baseer2/fall_detection/annotated',messageType:'sensor_msgs/msg/Image',queue_length:1,throttle_rate:150}).subscribe(m=>{drawImage($('fallCanvas'),m);$('fallCameraTime').textContent=now();});
  new ROSLIB.Topic({ros,name:'/baseer2/gas_ppm',messageType:'std_msgs/msg/Float32',queue_length:1}).subscribe(m=>{state.gas.ppm=Number(m.data);updateGas();pushHistory('gas',state.gas.ppm);});
  new ROSLIB.Topic({ros,name:'/baseer2/gps',messageType:'sensor_msgs/msg/NavSatFix',queue_length:1}).subscribe(updateGps);
  new ROSLIB.Topic({ros,name:'/baseer2/scada_event',messageType:'std_msgs/msg/String',queue_length:10}).subscribe(m=>{state.lastScada=m.data||'NO ACTION';$('scadaMetric').textContent=state.lastScada.includes('shutoff')?'SHUTOFF REQUESTED':'NO ACTION';$('scadaState').textContent=state.lastScada.includes('shutoff')?'CRITICAL':'STANDBY';});
  new ROSLIB.Topic({ros,name:'/baseer2/sos_alert',messageType:'std_msgs/msg/String',queue_length:10}).subscribe(m=>{if(m.data){$('sosState').textContent='ALERT RECEIVED';}});
  new ROSLIB.Topic({ros,name:'/baseer2/alerts',messageType:'baseer2_interfaces/msg/Alert',queue_length:20}).subscribe(m=>{
    const level=levelFromSeverity(m.severity); const type=String(m.type||'SYSTEM'); const alert={type,severity:level==='critical'?'CRITICAL':level==='warning'?'WARNING':'INFO',confidence:Number(m.confidence||0),reason:m.reason||'',latitude:m.latitude,longitude:m.longitude,altitude:m.altitude,sensor_confirmed:!!m.sensor_confirmed,level,time:now()};
    addTimeline(alert); if(type==='GAS'){state.gas.state=Number(m.severity)===2?'CONFIRMED':Number(m.severity)===1?'SUSPECT':'NORMAL';state.gas.score=Number(m.confidence||0);state.gas.confirmed=!!m.sensor_confirmed;updateGas();} if(type==='FALL'){state.fall.state=Number(m.severity)===2?'CONFIRMED':Number(m.severity)===1?'SUSPECT':'NORMAL';state.fall.score=Number(m.confidence||0);updateFall();pushHistory('fall',state.fall.score*100);}
    $('alertState').textContent=level==='critical'?'CRITICAL':level==='warning'?'WARNING':'EVENT'; $('alertState').style.color=level==='critical'?'var(--red)':level==='warning'?'var(--orange)':'var(--muted)';
  });
}
$('connectBtn').addEventListener('click',connect);
$('demoBtn').addEventListener('click',()=>{ state.demoMode?stopDemo():startDemo(); });
$('clearEvents').addEventListener('click',()=>{state.alerts=[];$('alertCount').textContent='0';$('timeline').innerHTML='<div class="empty">No alerts received yet.</div>';badge($('latestAlertBadge'),'normal');$('latestAlertBadge').textContent='SYSTEM CLEAR';$('alertDetails').className='alert-details empty-details';$('alertDetails').textContent='Waiting for a decision from the detection nodes.';drawAlertChart();});
initMap();
updateGas();updateFall();
