/* Shared geography, provider matching, theme and settings. No external libraries. */
'use strict';
window.JMA = (() => {
 const geo=window.JMA_REGIONS||{groups:[],prefectures:[]};
 const storeKey='jma-news-watcher-v1'; // Keep v3 selections and bookmarks.
 const defaults=['近畿地方','大阪','兵庫','京都','滋賀','和歌山','奈良','nationwide'];
 const providers=[
  {id:'yahoo',name:'Yahoo!ニュース',url:'https://news.yahoo.co.jp/',terms:['Yahoo!ニュース','Yahooニュース','Yahoo! JAPAN','news.yahoo.co.jp']},
  {id:'tenki',name:'tenki.jp',url:'https://tenki.jp/forecaster/',terms:['tenki.jp','日本気象協会']},
  {id:'weathernews',name:'ウェザーニュース',url:'https://weathernews.jp/news/',terms:['ウェザーニュース','ウェザーニューズ','weathernews']},
  {id:'nhk',name:'NHK',url:'https://news.web.nhk/',terms:['NHK','日本放送協会']},
  {id:'kyodo',name:'共同通信',url:'https://www.47news.jp/',terms:['共同通信','KYODO']},
  {id:'jiji',name:'時事通信',url:'https://www.jiji.com/',terms:['時事通信']},
  {id:'asahi',name:'朝日新聞',url:'https://www.asahi.com/',terms:['朝日新聞','朝日新聞デジタル']},
  {id:'yomiuri',name:'読売新聞',url:'https://www.yomiuri.co.jp/',terms:['読売新聞','読売新聞オンライン']},
  {id:'mainichi',name:'毎日新聞',url:'https://mainichi.jp/',terms:['毎日新聞']},
  {id:'sankei',name:'産経新聞',url:'https://www.sankei.com/',terms:['産経新聞','産経ニュース']},
  {id:'nikkei',name:'日本経済新聞',url:'https://www.nikkei.com/',terms:['日本経済新聞','日経電子版','NIKKEI']},
  {id:'fnn',name:'FNN',url:'https://www.fnn.jp/',terms:['FNN','フジテレビ']},
  {id:'tbs',name:'TBS NEWS DIG',url:'https://newsdig.tbs.co.jp/',terms:['TBS NEWS DIG','TBS NEWS']},
  {id:'ntv',name:'日テレNEWS',url:'https://news.ntv.co.jp/',terms:['日テレNEWS','日本テレビ']},
  {id:'ann',name:'テレ朝NEWS',url:'https://news.tv-asahi.co.jp/',terms:['テレ朝NEWS','テレビ朝日','ANNニュース']}
 ];
 const jstLocal=(date=new Date())=>new Date(date.getTime()+9*3600000).toISOString().slice(0,16);
 const midnight=()=>jstLocal().slice(0,10)+'T00:00';
 const settingsDefault=()=>({read:[],saved:[],popupEnabled:false,panelCount:1,panelRegions:[...defaults],notifyRegions:['近畿地方'],notifySince:midnight(),theme:'system',density:'compact',sourceMode:'all',selectedSources:['yahoo','tenki','weathernews','nhk']});
 const validRegion=id=>['all','nationwide','unknown'].includes(id)||geo.groups.some(g=>g.id===id)||geo.prefectures.includes(id);
 function loadSettings(){
  let raw={};try{raw=JSON.parse(localStorage.getItem(storeKey)||'{}')||{}}catch(e){}
  const s={...settingsDefault(),...raw};
  s.read=Array.isArray(s.read)?s.read:[];s.saved=Array.isArray(s.saved)?s.saved:[];
  s.panelRegions=Array.from({length:8},(_,i)=>Array.isArray(s.panelRegions)&&validRegion(s.panelRegions[i])?s.panelRegions[i]:defaults[i]);
  s.notifyRegions=Array.isArray(s.notifyRegions)?s.notifyRegions.filter(validRegion):['近畿地方'];
  if(!s.notifyRegions.length)s.notifyRegions=['近畿地方'];
  s.panelCount=Math.max(1,Math.min(8,Math.floor(Number(s.panelCount)||1)));
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s.notifySince||''))s.notifySince=midnight();
  if(!['system','light','dark'].includes(s.theme))s.theme='system';
  if(!['compact','comfortable'].includes(s.density))s.density='compact';
  if(!['all','major','selected'].includes(s.sourceMode))s.sourceMode='all';
  if(!Array.isArray(s.selectedSources))s.selectedSources=['yahoo','tenki','weathernews','nhk'];
  s.selectedSources=s.selectedSources.filter(x=>typeof x==='string'&&x.length<150);
  return s;
 }
 function saveSettings(s){try{localStorage.setItem(storeKey,JSON.stringify(s))}catch(e){}}
 function makeOptions(selected,{includeUnknown=true}={}){
  const choices=[['基本',[['近畿地方','近畿地方'],['nationwide','全国（地域が判定された記事）'],['all','全て（地域不明を含む）']]],
   ['近畿の府県',['滋賀','京都','大阪','兵庫','奈良','和歌山'].map(x=>[x,x])],
   ['地方',geo.groups.filter(g=>g.id!=='近畿地方').map(g=>[g.id,g.id])],
   ['都道府県',geo.prefectures.filter(x=>!['滋賀','京都','大阪','兵庫','奈良','和歌山'].includes(x)).map(x=>[x,x])]];
  if(includeUnknown)choices[0][1].push(['unknown','地域判定なし']);
  const sel=document.createElement('select');
  for(const [label,items] of choices){const group=document.createElement('optgroup');group.label=label;
   for(const [v,text] of items){const opt=document.createElement('option');opt.value=v;opt.textContent=text;group.appendChild(opt)}sel.appendChild(group)}
  sel.value=validRegion(selected)?selected:'近畿地方';return sel;
 }
 function matchesRegion(item,region){
  const areas=Array.isArray(item.areas)?item.areas:[];
  if(region==='all')return true;
  if(region==='unknown')return !areas.length;
  if(region==='nationwide')return areas.length>0;
  const group=geo.groups.find(x=>x.id===region);
  if(group)return areas.includes(region)||group.prefectures.some(x=>areas.includes(x));
  return areas.includes(region);
 }
 // Canonical story-level key: do not treat a single article in several prefectures as several stories.
 function storyFingerprint(article){
  // Region-specific leading labels may differ between feeds, while the article itself is identical.
  const title=String(article.title||'').normalize('NFKC')
   .replace(/^[\s　]*[【\[［][^】\]］]{1,28}[】\]］]\s*/u,'')
   .replace(/[\p{P}\p{S}\s　]/gu,'').toLocaleLowerCase();
  return title;
 }
 function dedupeStories(rows){
  const out=[],groups=new Map();
  for(const article of rows){
   const key=storyFingerprint(article);if(!key){out.push(article);continue}
   // Do not merge identical boilerplate headlines from different days.
   const ms=Date.parse(article.published_at||'');
   const candidates=groups.get(key)||[];
   const previous=candidates.find(x=>!Number.isFinite(ms)||!Number.isFinite(Date.parse(x.published_at||''))||Math.abs(Date.parse(x.published_at)-ms)<36*3600000);
   if(previous){
    const firstSources=previous.sources||[{source:previous.source,source_url:previous.source_url}];
    const newerSources=article.sources||[{source:article.source,source_url:article.source_url}];
    previous.sources=[...firstSources,...newerSources.filter(src=>!firstSources.some(existing=>existing.source===src.source))];
    previous.areas=[...new Set([...(previous.areas||[]),...(article.areas||[])])];
    previous.categories=[...new Set([...(previous.categories||[]),...(article.categories||[])])];
    previous.priority=Math.max(Number(previous.priority)||1,Number(article.priority)||1);
    continue;
   }
   const copy={...article,areas:[...(article.areas||[])],categories:[...(article.categories||[])]};
   out.push(copy);candidates.push(copy);groups.set(key,candidates);
  }
  return out;
 }
 const matchesAnyRegion=(item,regions)=>regions.some(r=>matchesRegion(item,r));
 const timestamp=item=>{const n=Date.parse(item.published_at||'');return Number.isFinite(n)?n:0};
 const sinceTimestamp=s=>{if(!s)return 0;const n=Date.parse(s+':00+09:00');return Number.isFinite(n)?n:0};
 function providerId(item){
  // Google News RSS source is the *publisher*, not necessarily its republishing portal.
  const label=String(item.source||'').trim();
  const url=String(item.source_url||'');
  const matched=providers.find(p=>p.terms.some(t=>label.toLowerCase().includes(t.toLowerCase())||url.toLowerCase().includes(t.toLowerCase())));
  return matched?matched.id:'source:'+label;
 }
 function matchesSource(item,settings){
  if(settings.sourceMode==='all')return true;
  const identities=Array.isArray(item.sources)&&item.sources.length?item.sources:[item];
  const ids=new Set(identities.map(providerId));
  if(settings.sourceMode==='major')return [...ids].some(id=>providers.some(p=>p.id===id));
  return settings.selectedSources.some(id=>ids.has(id));
 }
 const inNotificationScope=(item,settings)=>timestamp(item)>=sinceTimestamp(settings.notifySince)&&matchesAnyRegion(item,settings.notifyRegions)&&matchesSource(item,settings);
 const formatDate=s=>{const d=new Date(s);if(!Number.isFinite(d.getTime()))return '日時不明';return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)};
 const regionName=id=>({all:'全て',nationwide:'全国',unknown:'地域不明'})[id]||id;
 const isNew=item=>{const age=Date.now()-timestamp(item);return age>=0&&age<86400000};
 function applyTheme(settings){
  document.documentElement.dataset.theme=settings.theme;
  document.documentElement.dataset.density=settings.density;
  document.documentElement.style.colorScheme=settings.theme==='system'?'light dark':settings.theme;
 }
 return {geo,storeKey,defaults,providers,jstLocal,loadSettings,saveSettings,makeOptions,matchesRegion,matchesAnyRegion,dedupeStories,inNotificationScope,formatDate,regionName,timestamp,isNew,providerId,matchesSource,applyTheme};
})();
