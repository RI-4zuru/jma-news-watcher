/* Shared geography and local settings. No external libraries or APIs. */
'use strict';
window.JMA = (() => {
 const geo = window.JMA_REGIONS || {groups:[],prefectures:[]};
 const storeKey='jma-news-watcher-v1';
 const defaults=['近畿地方','大阪','兵庫','京都','滋賀','和歌山'];
 const jstLocal=(date=new Date())=>new Date(date.getTime()+9*3600000).toISOString().slice(0,16);
 const midnight=()=>jstLocal().slice(0,10)+'T00:00';
 const settingsDefault=()=>({read:[],saved:[],popupEnabled:false,panelCount:1,panelRegions:[...defaults],notifyRegions:['近畿地方'],notifySince:midnight()});
 function loadSettings(){
  let raw={};try{raw=JSON.parse(localStorage.getItem(storeKey)||'{}')||{}}catch(e){}
  const s={...settingsDefault(),...raw};
  s.read=Array.isArray(s.read)?s.read:[];s.saved=Array.isArray(s.saved)?s.saved:[];
  s.panelRegions=Array.isArray(s.panelRegions)?Array.from({length:6},(_,i)=>validRegion(s.panelRegions[i])?s.panelRegions[i]:defaults[i]):[...defaults];
  s.notifyRegions=Array.isArray(s.notifyRegions)?s.notifyRegions.filter(validRegion):['近畿地方'];
  if(!s.notifyRegions.length)s.notifyRegions=['近畿地方'];
  s.panelCount=Math.max(1,Math.min(6,Number(s.panelCount)||1));
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s.notifySince||''))s.notifySince=midnight();
  return s;
 }
 function saveSettings(s){try{localStorage.setItem(storeKey,JSON.stringify(s))}catch(e){}}
 function validRegion(id){return ['all','nationwide','unknown'].includes(id)||geo.groups.some(g=>g.id===id)||geo.prefectures.includes(id)}
 function makeOptions(selected,{includeUnknown=true}={}){
  const choices=[['基本',[['近畿地方','近畿地方'],['nationwide','全国（地域が判定された記事）'],['all','全て（地域不明を含む）']]],
    ['近畿の府県（優先表示）',['滋賀','京都','大阪','兵庫','奈良','和歌山'].map(x=>[x,x])],
    ['各地方',geo.groups.filter(g=>g.id!=='近畿地方').map(g=>[g.id,g.id])],
    ['47都道府県',geo.prefectures.filter(x=>!['滋賀','京都','大阪','兵庫','奈良','和歌山'].includes(x)).map(x=>[x,x])]];
  if(includeUnknown)choices[0][1].push(['unknown','地域判定なし']);
  const sel=document.createElement('select');
  for(const [label,items] of choices){const group=document.createElement('optgroup');group.label=label;
   for(const [v,text] of items){const opt=document.createElement('option');opt.value=v;opt.textContent=text;group.appendChild(opt)}
   sel.appendChild(group)}
  sel.value=validRegion(selected)?selected:'近畿地方';return sel;
 }
 function matchesRegion(item,region){
  const areas=Array.isArray(item.areas)?item.areas:[];
  if(region==='all')return true;
  if(region==='unknown')return !areas.length;
  if(region==='nationwide')return areas.length>0;
  const group=geo.groups.find(x=>x.id===region);
  if(group)return areas.includes(region)||group.prefectures.some(x=>areas.includes(x));
  // Never assign a regional-only headline to an individual prefecture.
  return areas.includes(region);
 }
 function matchesAnyRegion(item,regions){return regions.some(r=>matchesRegion(item,r))}
 function timestamp(item){const n=Date.parse(item.published_at||'');return Number.isFinite(n)?n:0}
 function sinceTimestamp(s){if(!s)return 0;const n=Date.parse(s+':00+09:00');return Number.isFinite(n)?n:0}
 function inNotificationScope(item,settings){return timestamp(item)>=sinceTimestamp(settings.notifySince)&&matchesAnyRegion(item,settings.notifyRegions)}
 function formatDate(s){const d=new Date(s);if(!Number.isFinite(d.getTime()))return '日時不明';return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d)}
 function regionName(id){return ({all:'全て',nationwide:'全国',unknown:'地域不明'})[id]||id}
 return {geo,storeKey,defaults,jstLocal,loadSettings,saveSettings,makeOptions,matchesRegion,matchesAnyRegion,inNotificationScope,formatDate,regionName,timestamp};
})();
