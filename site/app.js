/* JMA News Watcher — v4-based refreshed dashboard. No article HTML injection. */
'use strict';
(() => {
 const $=id=>document.getElementById(id),J=window.JMA;
 let payload={items:[],categories:[],errors:[]};
 let settings=J.loadSettings(),view='all',categoryFilter='all',inFlight=false;
 const params=new URLSearchParams(location.search),single=params.get('single')==='1';
 let singleRegion=params.get('region');
 if(!['all','nationwide','unknown',...J.geo.prefectures,...J.geo.groups.map(g=>g.id)].includes(singleRegion))singleRegion='近畿地方';
 // One-time migration for v4 installations that were configured for the old 6-panel maximum.
 // Do not change a user's subsequent selection of fewer panels.
 if(!single){
  try{
   const key='jma-news-watcher-v4.2-panel-upgrade';
   if(localStorage.getItem(key)!=='1'){
    if(settings.panelCount===6){settings.panelCount=8;J.saveSettings(settings)}
    localStorage.setItem(key,'1');
   }
  }catch(e){/* Storage may be unavailable. The settings selector remains usable. */}
 }

 const items=()=>Array.isArray(payload.items)?payload.items:[];
 const saved=a=>(a.aliases||[a.id]).some(id=>settings.saved.includes(id));
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n};
 function records(){
  const period=$('period').value,query=$('search').value.trim().toLocaleLowerCase();
  return J.dedupeStories(items()).filter(a=>{
   if(!J.matchesSource(a,settings))return false;
   if(categoryFilter!=='all'&&!(a.categories||[]).includes(categoryFilter))return false;
   if(period!=='all'&&Date.now()-J.timestamp(a)>Number(period)*3600000)return false;
   if(view==='important'&&Number(a.priority)<3)return false;
   if(view==='new'&&!J.isNew(a))return false;
   if(view==='saved'&&!saved(a))return false;
   if(query&&!([a.title,a.source,...(a.areas||[])].join(' ').toLocaleLowerCase().includes(query)))return false;
   return true;
  }).sort((a,b)=>J.timestamp(b)-J.timestamp(a));
 }
 function renderStatus(){
  const unique=J.dedupeStories(items());
  $('statAll').textContent=unique.length;
  $('statDay').textContent=unique.filter(J.isNew).length;
  $('statPanels').textContent=single?1:settings.panelCount;
  $('status').textContent=payload.generated_at?'取得 '+J.formatDate(payload.generated_at):'初回収集待機中';
  $('sourceStatus').textContent=settings.sourceMode==='all'?'全配信元':settings.sourceMode==='major'?'主要メディアのみ':'指定メディアのみ';
  $('openAlertWindow').classList.toggle('on',settings.popupEnabled);
  let warning='';
  if(!payload.generated_at)warning='まだ収集データがありません。GitHub Actionsの初回収集を実行してください。';
  else if((Date.now()-Date.parse(payload.generated_at))>35*60000)warning='最後のニュース収集から35分以上経過しています。GitHub Actionsの履歴を確認してください。';
  else if((payload.errors||[]).length)warning=`一部のRSS取得に失敗しました（${payload.errors.length}件）。取得済みの記事を表示中です。`;
  const parent=$('warnings');parent.replaceChildren();
  if(warning)parent.append(node('div','warning','⚠ '+warning));
 }
 function closeCategoryMenu(){const menu=$('categoryMenu');menu.hidden=true;$('categoryButton').setAttribute('aria-expanded','false')}
 function positionCategoryMenu(){
  const btn=$('categoryButton'),menu=$('categoryMenu'),rect=btn.getBoundingClientRect();
  const cols=innerWidth>=700?4:innerWidth>=470?3:2;
  menu.style.setProperty('--menu-cols',cols);
  const width=Math.min(innerWidth-16,cols*162+16);
  menu.style.width=width+'px';
  menu.style.left=Math.max(8,Math.min(rect.left,innerWidth-width-8))+'px';
  const expected=Math.ceil(menu.children.length/cols)*30+14;
  const above=innerHeight-rect.bottom<expected+12&&rect.top>expected+12;
  menu.style.top=(above?Math.max(8,rect.top-expected-4):Math.min(rect.bottom+4,Math.max(8,innerHeight-expected-8)))+'px';
 }
 function renderCategories(){
  const list=[{id:'all',name:'すべての分類'},...(payload.categories||[])];
  if(!list.some(c=>c.id===categoryFilter))categoryFilter='all';
  const menu=$('categoryMenu');menu.replaceChildren();
  for(const c of list){
   const b=node('button','category-option'+(c.id===categoryFilter?' active':''),(c.icon&&c.id!=='all'?c.icon+' ':'')+c.name);
   b.type='button';b.dataset.category=c.id;b.setAttribute('aria-pressed',String(c.id===categoryFilter));menu.append(b);
  }
  const chosen=list.find(c=>c.id===categoryFilter);
  $('categoryButton').textContent=(chosen.icon&&chosen.id!=='all'?chosen.icon+' ':'')+chosen.name+' ▾';
  if(!menu.hidden)positionCategoryMenu();
 }
 $('categoryButton').addEventListener('click',()=>{const m=$('categoryMenu');m.hidden=!m.hidden;$('categoryButton').setAttribute('aria-expanded',String(!m.hidden));if(!m.hidden)positionCategoryMenu()});
 $('categoryMenu').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(!b)return;categoryFilter=b.dataset.category;closeCategoryMenu();renderCategories();draw()});
 document.addEventListener('click',e=>{if(!e.target.closest('.category-control')&&!$('categoryMenu').hidden)closeCategoryMenu()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCategoryMenu()});
 function createStory(a){
  const level=Math.max(1,Math.min(3,Number(a.priority)||1));
  const article=node('article','story priority'+level),meta=node('div','story-meta');
  article.append(meta);
  meta.append(node('time','story-date',J.formatDate(a.published_at)));
  const srcNames=Array.isArray(a.sources)?a.sources.map(s=>s.source).filter(Boolean):[];
  const src=(a.source||'配信元不明')+(srcNames.length>1?' ほか'+(srcNames.length-1)+'社':'');
  const srcElement=node('span','story-source',src);srcElement.title=src;meta.append(srcElement);
  const category=(payload.categories||[]).find(c=>(a.categories||[]).includes(c.id));
  if(category){const t=node('span','story-category',(category.icon||'')+' '+category.name);t.title=category.name;meta.append(t)}
  if(J.isNew(a))meta.append(node('span','flag flag-new','NEW'));
  if(level>=3)meta.append(node('span','flag flag-urgent','重要'));
  const main=node('div','story-main'),href=J.safeArticleUrl(a.url),title=node(href?'a':'span','story-title',a.title+' ↗');
  if(href){title.href=href;title.target='_blank';title.rel='noopener noreferrer'}
  else title.title='無効な記事リンクのため開けません';
  const bookmark=node('button','bookmark'+(saved(a)?' saved':''),saved(a)?'★':'☆');
  bookmark.type='button';bookmark.dataset.action='bookmark';bookmark.dataset.id=a.id;
  bookmark.title=saved(a)?'保存を解除':'記事を保存';bookmark.setAttribute('aria-label',bookmark.title);
  main.append(title,bookmark);article.append(main);return article;
 }
 function updateGridLayout(count){
  const grid=$('areaGrid'),w=grid.clientWidth||document.documentElement.clientWidth;
  const cols=Math.max(1,Math.min(4,count,Math.floor((w+9)/305)||1));
  const rows=Math.ceil(count/cols);
  grid.style.setProperty('--cols',cols);
  const overhead=130+((document.querySelector('#warnings .warning')?.offsetHeight)||0);
  grid.style.setProperty('--panel-h',rows===1?`max(320px,calc(100dvh - ${overhead}px))`:`max(275px,calc((100dvh - ${overhead+24}px)/${rows}))`);
 }
 function draw(){
  J.applyTheme(settings);renderStatus();
  document.querySelectorAll('[data-view]').forEach(t=>{const active=t.dataset.view===view;t.classList.toggle('active',active);t.setAttribute('aria-pressed',String(active))});
  const n=single?1:settings.panelCount;
  const grid=$('areaGrid');
  const positions=[...grid.querySelectorAll('.area-body')].map(e=>e.scrollTop);
  const base=records();grid.replaceChildren();
  for(let i=0;i<n;i++){
   const region=single?singleRegion:settings.panelRegions[i];
   const matches=base.filter(a=>J.matchesRegion(a,region));
   const section=node('section','area-panel');section.setAttribute('aria-label','エリア'+(i+1)+' '+J.regionName(region));
   const head=node('div','area-head');
   head.append(node('span','area-index',String(i+1).padStart(2,'0')));
   const name=node('span','area-name',J.regionName(region));name.title=J.regionName(region);head.append(name);
   head.append(node('span','area-count',matches.length+'件'));
   const link=node('a','popout',single?'← 戻る':'↗ 別画面');
   link.href=single?'./index.html':'./index.html?single=1&region='+encodeURIComponent(region);
   link.target=single?'_self':'_blank';link.rel='noopener noreferrer';head.append(link);section.append(head);
   const body=node('div','area-body');
   if(!matches.length){const empty=node('div','empty','この地域・条件に合う記事はありません。');
    empty.append(node('small','',settings.sourceMode==='selected'?'配信元の選択も確認してください。':'設定から地域を変更できます。'));body.append(empty)}
   else for(const a of matches.slice(0,150))body.append(createStory(a));
   if(matches.length>150)body.append(node('div','empty','150件まで表示しています。条件を絞り込んでください。'));
   section.append(body);grid.append(section);body.scrollTop=positions[i]||0;
  }
  updateGridLayout(n);
 }
 const persist=()=>{J.saveSettings(settings);draw()};
 $('areaGrid').addEventListener('click',e=>{
  const b=e.target.closest('[data-action="bookmark"]');if(!b)return;
  const id=b.dataset.id,group=J.dedupeStories(items()).find(a=>a.id===id),aliases=group?.aliases||[id];
  const ids=new Set(settings.saved);if(aliases.some(x=>ids.has(x))){for(const x of aliases)ids.delete(x)}else ids.add(id);
  settings.saved=[...ids].slice(-4000);persist();
 });
 $('viewTabs').addEventListener('click',e=>{const t=e.target.closest('[data-view]');if(t){view=t.dataset.view;draw()}});
 $('period').addEventListener('change',draw);$('search').addEventListener('input',draw);
 function renderAreaSettings(){
  $('panelCountSetting').value=String(single?1:settings.panelCount);$('panelCountSetting').disabled=single;
  const parent=$('areaSettings');parent.replaceChildren();
  for(let i=0;i<(single?1:settings.panelCount);i++){
   const item=node('div','area-setting'),lab=node('label','','エリア '+(i+1));
   const sel=J.makeOptions(single?singleRegion:settings.panelRegions[i]);sel.setAttribute('aria-label',`エリア${i+1}の地域`);
   sel.addEventListener('change',()=>{
    if(single){singleRegion=sel.value;history.replaceState(null,'','?single=1&region='+encodeURIComponent(singleRegion));draw()}
    else{settings.panelRegions[i]=sel.value;persist()}
   });item.append(lab,sel);parent.append(item);
  }
 }
 $('panelCountSetting').addEventListener('change',e=>{settings.panelCount=Number(e.target.value);persist();renderAreaSettings()});
 $('showEightPanels').addEventListener('click',()=>{if(single)return;settings.panelCount=8;persist();renderAreaSettings()});
 $('themeSetting').addEventListener('change',e=>{settings.theme=e.target.value;persist()});
 $('densitySetting').addEventListener('change',e=>{settings.density=e.target.value;persist()});
 $('sourceMode').addEventListener('change',e=>{settings.sourceMode=e.target.value;persist();renderProviderChoices()});
 function renderProviderChoices(){
  const parent=$('providerChoices');parent.replaceChildren();$('providerList').hidden=settings.sourceMode!=='selected';
  const names=new Set(J.providers.map(p=>p.name));
  const extras=[...new Set(items().flatMap(a=>[a,...(a.sources||[])].map(s=>String(s.source||'').trim())).filter(s=>s&&!names.has(s)&&J.providerId({source:s})==='source:'+s))].sort((a,b)=>a.localeCompare(b,'ja')).slice(0,100);
  const all=[...J.providers.map(p=>({id:p.id,name:p.name})),...extras.map(x=>({id:'source:'+x,name:x}))];
  for(const p of all){
   const label=node('label','provider-option'),input=document.createElement('input');input.type='checkbox';input.value=p.id;input.checked=settings.selectedSources.includes(p.id);
   input.addEventListener('change',()=>{const set=new Set(settings.selectedSources);input.checked?set.add(p.id):set.delete(p.id);settings.selectedSources=[...set];persist()});
   label.append(input,node('span','',p.name));parent.append(label);
  }
 }
 function renderSourceLinks(){const holder=$('sourceLinks');holder.replaceChildren();for(const p of J.providers.filter(x=>x.url)){
  const a=node('a','',p.name+' ↗');a.href=p.url;a.target='_blank';a.rel='noopener noreferrer';holder.append(a)
 }}
 const picker=J.makeOptions('近畿地方');picker.setAttribute('aria-label','通知する地域を追加');$('notifyRegionSelectHolder').append(picker);
 function renderNotifyRegions(){const holder=$('notifyRegionChips');holder.replaceChildren();for(const r of settings.notifyRegions){
  const chip=node('span','region-chip'),remove=node('button','','×');remove.type='button';remove.setAttribute('aria-label',r+'を通知対象から外す');
  remove.addEventListener('click',()=>{if(settings.notifyRegions.length<=1)return;settings.notifyRegions=settings.notifyRegions.filter(x=>x!==r);persist();renderNotifyRegions()});
  chip.append(node('span','',J.regionName(r)),remove);holder.append(chip)
 }}
 $('addNotifyRegion').addEventListener('click',()=>{if(!settings.notifyRegions.includes(picker.value)){settings.notifyRegions.push(picker.value);persist();renderNotifyRegions()}});
 $('popupEnabled').addEventListener('change',e=>{settings.popupEnabled=e.target.checked;persist()});
 $('notifySince').addEventListener('change',e=>{if(e.target.value){settings.notifySince=e.target.value;persist()}});
 function renderSettings(){renderAreaSettings();$('themeSetting').value=settings.theme;$('densitySetting').value=settings.density;$('sourceMode').value=settings.sourceMode;renderProviderChoices();renderSourceLinks();$('popupEnabled').checked=settings.popupEnabled;$('notifySince').value=settings.notifySince;renderNotifyRegions()}
 $('settingsButton').addEventListener('click',()=>{renderSettings();$('settingsDialog').showModal()});
 for(const id of ['closeSettings','closeDialog'])$(id).addEventListener('click',()=>$('settingsDialog').close());
 $('settingsDialog').addEventListener('click',e=>{if(e.target===$('settingsDialog'))$('settingsDialog').close()});
 $('openAlertWindow').addEventListener('click',()=>{
  if(!settings.popupEnabled){settings.popupEnabled=true;persist()}
  const popup=window.open('./alerts.html','jma-news-alerts','popup,width=680,height=750,resizable=yes,scrollbars=yes');
  if(popup)popup.focus();else window.alert('新着通知が開けませんでした。ブラウザのポップアップ設定を確認してください。');
 });
 async function reload(){
  if(inFlight)return;inFlight=true;
  try{
   const res=await fetch('./data.json?time='+Date.now(),{cache:'no-store'});if(!res.ok)throw new Error('HTTP '+res.status);
   const next=await res.json();if(!next||!Array.isArray(next.items))throw new Error('invalid data');
   payload=next;renderCategories();draw();
  }catch(e){if(!payload.generated_at){$('warnings').replaceChildren(node('div','warning','⚠ ニュースデータの取得に失敗しました。GitHub Pagesの公開を確認してください。'))}
   else $('warnings').replaceChildren(node('div','warning','⚠ ニュースデータを更新できませんでした。前回の情報を表示しています。'));}
  finally{inFlight=false}
 }
 window.addEventListener('storage',e=>{if(e.key===J.storeKey){settings=J.loadSettings();if($('settingsDialog').open)renderSettings();draw()}});
 window.addEventListener('resize',()=>{updateGridLayout(single?1:settings.panelCount);if(!$('categoryMenu').hidden)positionCategoryMenu()});
 renderCategories();renderSettings();draw();reload();setInterval(reload,300000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload()});
})();
