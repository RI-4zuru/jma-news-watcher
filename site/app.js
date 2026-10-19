/* Compact dashboard for JMA News Watcher v4. */
'use strict';
(() => {
 const $=id=>document.getElementById(id),J=window.JMA;
 let payload=window.NEWS_PAYLOAD||{items:[],categories:[],errors:[]};
 let settings=J.loadSettings(),view='all',busy=false,alertWindow=null;
 const params=new URLSearchParams(location.search),single=params.get('single')==='1';
 let singleRegion=params.get('region');
 if(!['all','nationwide','unknown',...J.geo.prefectures,...J.geo.groups.map(g=>g.id)].includes(singleRegion))singleRegion='近畿地方';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const items=()=>payload.items||[];
 const saved=a=>settings.saved.includes(a.id);
 const filtered=()=>{
  const category=$('category').value,period=$('period').value,query=$('search').value.trim().toLocaleLowerCase();
  return items().filter(a=>{
   if(!J.matchesSource(a,settings))return false;
   if(category!=='all'&&!(a.categories||[]).includes(category))return false;
   if(period!=='all'&&Date.now()-J.timestamp(a)>Number(period)*3600000)return false;
   if(view==='important'&&Number(a.priority)<3)return false;
   if(view==='new'&&!J.isNew(a))return false;
   if(view==='saved'&&!saved(a))return false;
   if(query&&!([a.title,a.source,...(a.areas||[])].join(' ').toLocaleLowerCase().includes(query)))return false;
   return true;
  }).sort((a,b)=>J.timestamp(b)-J.timestamp(a));
 };
 function renderStatus(){
  $('statAll').textContent=items().length;
  $('statDay').textContent=items().filter(J.isNew).length;
  $('status').textContent=payload.generated_at?'取得 '+J.formatDate(payload.generated_at):'初回収集待機中';
  $('sourceStatus').textContent=settings.sourceMode==='all'?'全配信元':settings.sourceMode==='major'?'主要メディアのみ':'指定メディアのみ';
  $('openAlertWindow').classList.toggle('on',settings.popupEnabled);
  let warning='';
  if(!payload.generated_at)warning='まだ収集データがありません。GitHub Actionsの初回収集を実行してください。';
  else if((payload.errors||[]).length)warning=`一部のRSS取得に失敗しました（${payload.errors.length}件）。取得済みの記事を表示中です。`;
  const e=$('warnings');e.replaceChildren();if(warning){const n=document.createElement('div');n.className='warning';n.textContent='⚠ '+warning;e.appendChild(n)}
 }
 function renderCategories(){
  const select=$('category'),old=select.value;select.replaceChildren(new Option('すべての分類','all'));
  for(const c of payload.categories||[])select.add(new Option(`${c.icon} ${c.name}`,c.id));
  if([...select.options].some(o=>o.value===old))select.value=old;
 }
 function story(a){
  const c=(payload.categories||[]).find(x=>(a.categories||[]).includes(x.id));
  const level=Number(a.priority)||1,flag=J.isNew(a)?'<span class="flag flag-new">NEW</span>':'';
  const priority=level>=3?'<span class="flag flag-urgent">重要</span>':'';
  const source=a.source||'配信元不明';
  const date=J.formatDate(a.published_at);
  return `<article class="story priority${level}" data-id="${esc(a.id)}">
   <div class="story-meta"><time class="story-date">${esc(date)}</time><span class="story-source" title="${esc(source)}">${esc(source)}</span>${c?`<span class="story-category" title="${esc(c.name)}">${esc(c.icon)} ${esc(c.name)}</span>`:''}${flag}${priority}</div>
   <div class="story-main"><a class="story-title" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)} ↗</a><button class="bookmark ${saved(a)?'saved':''}" type="button" data-action="bookmark" data-id="${esc(a.id)}" title="${saved(a)?'保存を解除':'記事を保存'}" aria-label="${saved(a)?'保存を解除':'記事を保存'}">${saved(a)?'★':'☆'}</button></div>
   </article>`;
 }
 function draw(){
  J.applyTheme(settings);renderStatus();
  document.querySelectorAll('[data-view]').forEach(x=>{const active=x.dataset.view===view;x.classList.toggle('active',active);x.setAttribute('aria-pressed',String(active))});
  const n=single?1:settings.panelCount,cols=n<=3?n:n===4?2:3,rows=Math.ceil(n/cols);
  const grid=$('areaGrid');grid.style.setProperty('--cols',cols);
  grid.style.setProperty('--panel-h',rows===1?'calc(100dvh - 125px)':'max(280px,calc((100dvh - 147px)/2))');
  const positions=[...grid.querySelectorAll('.area-body')].map(e=>e.scrollTop);
  const base=filtered();grid.replaceChildren();
  for(let i=0;i<n;i++){
   const r=single?singleRegion:settings.panelRegions[i];
   const matches=base.filter(a=>J.matchesRegion(a,r));
   const section=document.createElement('section');section.className='area-panel';section.setAttribute('aria-label','エリア'+(i+1)+' '+J.regionName(r));
   const url='./index.html?single=1&region='+encodeURIComponent(r);
   section.innerHTML=`<div class="area-head"><span class="area-index">${String(i+1).padStart(2,'0')}</span><span class="area-name" title="${esc(J.regionName(r))}">${esc(J.regionName(r))}</span><span class="area-count">${matches.length}件</span><a class="popout" href="${esc(single?'./index.html':url)}" target="${single?'_self':'_blank'}" rel="noopener" aria-label="${single?'全エリアに戻る':J.regionName(r)+'を別ウィンドウで表示'}">${single?'← 戻る':'↗ 別画面'}</a></div><div class="area-body">${matches.length?matches.slice(0,150).map(story).join(''):`<div class="empty">この地域・条件に合う記事はありません。<small>${settings.sourceMode==='selected'?'配信元の選択も確認してください。':'設定から地域を変更できます。'}</small></div>`}${matches.length>150?'<div class="empty">150件まで表示。期間・分類で絞り込んでください。</div>':''}</div>`;
   grid.appendChild(section);section.querySelector('.area-body').scrollTop=positions[i]||0;
  }
 }
 function persist(){J.saveSettings(settings);draw()}
 $('areaGrid').addEventListener('click',e=>{
  const b=e.target.closest('[data-action="bookmark"]');if(!b)return;
  const id=b.dataset.id,ids=new Set(settings.saved);ids.has(id)?ids.delete(id):ids.add(id);settings.saved=[...ids].slice(-4000);persist();
 });
 $('viewTabs').addEventListener('click',e=>{const t=e.target.closest('[data-view]');if(t){view=t.dataset.view;draw()}});
 for(const id of ['category','period'])$(id).addEventListener('change',draw);
 $('search').addEventListener('input',draw);
 // Area selection is only in Settings. Each pop-out still has its own URL region.
 function renderAreaSettings(){
  $('panelCountSetting').value=String(single?1:settings.panelCount);
  $('panelCountSetting').disabled=single;
  const parent=$('areaSettings');parent.replaceChildren();
  for(let i=0;i<(single?1:settings.panelCount);i++){
   const item=document.createElement('div');item.className='area-setting';
   const lab=document.createElement('label');lab.textContent=`エリア ${i+1}`;
   const sel=J.makeOptions(single?singleRegion:settings.panelRegions[i]);sel.setAttribute('aria-label',`エリア${i+1}の地域`);
   sel.addEventListener('change',()=>{
    if(single){singleRegion=sel.value;history.replaceState(null,'','?single=1&region='+encodeURIComponent(singleRegion));draw()}
    else{settings.panelRegions[i]=sel.value;persist()}
   });item.append(lab,sel);parent.appendChild(item);
  }
 }
 $('panelCountSetting').addEventListener('change',e=>{settings.panelCount=Number(e.target.value);persist();renderAreaSettings()});
 $('themeSetting').addEventListener('change',e=>{settings.theme=e.target.value;persist()});
 $('densitySetting').addEventListener('change',e=>{settings.density=e.target.value;persist()});
 $('sourceMode').addEventListener('change',e=>{settings.sourceMode=e.target.value;persist();renderProviderChoices()});
 function renderProviderChoices(){
  const parent=$('providerChoices');parent.replaceChildren();
  $('providerList').hidden=settings.sourceMode!=='selected';
  const knownNames=new Set(J.providers.map(p=>p.name));
  const extras=[...new Set(items().map(a=>String(a.source||'').trim()).filter(s=>s&&!knownNames.has(s)&&J.providerId({source:s})==='source:'+s))].sort((a,b)=>a.localeCompare(b,'ja')).slice(0,100);
  const all=[...J.providers.map(p=>({id:p.id,name:p.name})),...extras.map(x=>({id:'source:'+x,name:x}))];
  for(const provider of all){
   const lab=document.createElement('label');lab.className='provider-option';
   const input=document.createElement('input');input.type='checkbox';input.value=provider.id;input.checked=settings.selectedSources.includes(provider.id);
   input.addEventListener('change',()=>{const set=new Set(settings.selectedSources);input.checked?set.add(provider.id):set.delete(provider.id);settings.selectedSources=[...set];persist()});
   const label=document.createElement('span');label.textContent=provider.name;
   lab.append(input,label);parent.append(lab);
  }
 }
 function renderSourceLinks(){
  const sourceLinks=$('sourceLinks');sourceLinks.replaceChildren();
  for(const {name,url} of J.providers.filter(p=>p.url)){
   const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=name+' ↗';sourceLinks.append(a);
  }
 }
 const picker=J.makeOptions('近畿地方');picker.setAttribute('aria-label','通知する地域を追加');$('notifyRegionSelectHolder').appendChild(picker);
 function renderNotifyRegions(){
  const parent=$('notifyRegionChips');parent.replaceChildren();
  for(const r of settings.notifyRegions){
   const chip=document.createElement('span');chip.className='region-chip';
   const text=document.createElement('span');text.textContent=J.regionName(r);
   const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',r+'を通知対象から外す');
   remove.addEventListener('click',()=>{if(settings.notifyRegions.length<=1)return;settings.notifyRegions=settings.notifyRegions.filter(x=>x!==r);persist();renderNotifyRegions()});
   chip.append(text,remove);parent.append(chip);
  }
 }
 $('addNotifyRegion').addEventListener('click',()=>{if(!settings.notifyRegions.includes(picker.value)){settings.notifyRegions.push(picker.value);persist();renderNotifyRegions()}});
 $('popupEnabled').addEventListener('change',e=>{settings.popupEnabled=e.target.checked;persist()});
 $('notifySince').addEventListener('change',e=>{if(e.target.value){settings.notifySince=e.target.value;persist()}});
 function renderSettings(){
  renderAreaSettings();$('themeSetting').value=settings.theme;$('densitySetting').value=settings.density;
  $('sourceMode').value=settings.sourceMode;renderProviderChoices();renderSourceLinks();
  $('popupEnabled').checked=settings.popupEnabled;$('notifySince').value=settings.notifySince;renderNotifyRegions();
 }
 $('settingsButton').addEventListener('click',()=>{renderSettings();$('settingsDialog').showModal()});
 for(const id of ['closeSettings','closeDialog'])$(id).addEventListener('click',()=>$('settingsDialog').close());
 $('settingsDialog').addEventListener('click',e=>{if(e.target===$('settingsDialog'))$('settingsDialog').close()});
 $('openAlertWindow').addEventListener('click',()=>{
  if(!settings.popupEnabled){settings.popupEnabled=true;persist()}
  try{alertWindow=window.open('./alerts.html','jma-news-alerts','popup,width=680,height=750,resizable=yes,scrollbars=yes');if(alertWindow)alertWindow.focus();else alert('ポップアップがブロックされました。ブラウザでこのサイトのポップアップを許可してください。')}
  catch(e){alert('新着通知ウィンドウを開けませんでした。ポップアップ許可を確認してください。')}
 });
 let inFlight=false;
 function reload(){if(inFlight)return;inFlight=true;const s=document.createElement('script');s.src='./data.js?ts='+Date.now();
  s.onload=()=>{inFlight=false;payload=window.NEWS_PAYLOAD||payload;renderCategories();draw();s.remove()};
  s.onerror=()=>{inFlight=false;const n=document.createElement('div');n.className='warning';n.textContent='ニュースデータの取得に失敗しました。前回の情報を表示しています。';$('warnings').replaceChildren(n);s.remove()};
  document.head.appendChild(s);
 }
 window.addEventListener('storage',e=>{if(e.key===J.storeKey){settings=J.loadSettings();if($('settingsDialog').open)renderSettings();draw()}});
 renderCategories();renderSettings();draw();setInterval(reload,60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload()});
})();
