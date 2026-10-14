'use strict';
(() => {
 const $=id=>document.getElementById(id), J=window.JMA;
 let payload=window.NEWS_PAYLOAD||{items:[],new_ids:[],categories:[],errors:[]};
 let settings=J.loadSettings(), view='all', inFlight=false, alertWindow=null;
 const urlParams=new URLSearchParams(location.search);
 const single=urlParams.get('single')==='1';
 let singleRegion=urlParams.get('region');
 if(!['all','nationwide','unknown',...J.geo.prefectures,...J.geo.groups.map(g=>g.id)].includes(singleRegion))singleRegion='近畿地方';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const items=()=>payload.items||[];
 const isNew=a=>(payload.new_ids||[]).includes(a.id);
 const isRead=a=>settings.read.includes(a.id);
 const isSaved=a=>settings.saved.includes(a.id);
 function stamp(){
  $('status').textContent=payload.generated_at?'最終収集 '+J.formatDate(payload.generated_at):'データ待機中';
  $('statAll').textContent=items().length;
  $('statDay').textContent=items().filter(a=>Date.now()-J.timestamp(a)<86400000).length;
  $('statNew').textContent=(payload.new_ids||[]).length;
  $('statKinki').textContent=items().filter(a=>J.matchesRegion(a,'近畿地方')).length;
  let msg='';if(!payload.generated_at)msg='初回収集を待っています。GitHub版は「Actions」の収集ワークフローを実行してください。';
  else if((payload.errors||[]).length)msg=`一部のRSS取得に失敗しました（${payload.errors.length}件）。取得済みの記事を表示しています。`;
  $('warnings').innerHTML=msg?`<div class="notice">⚠ ${esc(msg)}</div>`:'';
 }
 function filterBase(){
  const q=$('search').value.trim().toLowerCase(), cat=$('category').value, period=$('period').value;
  return items().filter(a=>{
   if(cat!=='all'&&!(a.categories||[]).includes(cat))return false;
   if(period!=='all'&&Date.now()-J.timestamp(a)>Number(period)*3600000)return false;
   if(view==='important'&&Number(a.priority)<3)return false;
   if(view==='new'&&!isNew(a))return false;
   if(view==='unread'&&isRead(a))return false;
   if(view==='saved'&&!isSaved(a))return false;
   if(q&&!([a.title,a.source,...(a.areas||[])].join(' ').toLowerCase().includes(q)))return false;
   return true;
  }).sort((a,b)=>J.timestamp(b)-J.timestamp(a));
 }
 function regionValue(index){return single?singleRegion:settings.panelRegions[index]}
 function filteredPanel(index){const r=regionValue(index);return filterBase().filter(a=>J.matchesRegion(a,r))}
 function articleHtml(a){
  const cats=(a.categories||[]).slice(0,2).map(id=>(payload.categories||[]).find(c=>c.id===id)).filter(Boolean);
  const tags=cats.map(c=>`<span class="tag subject">${esc(c.icon)} ${esc(c.name)}</span>`).join('');
  const level=a.priority>=3?'<span class="tag urgent">重要</span>':'';
  return `<article class="news p${Number(a.priority)||1} ${isRead(a)?'read':''}"><div class="newstags">${isNew(a)?'<span class="tag justnew">NEW</span>':''}${level}${tags}</div><a class="newstitle" data-action="article" data-id="${esc(a.id)}" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)} ↗</a><div class="meta"><span>${esc(a.source)}</span><span>・${J.formatDate(a.published_at)}</span><span>・${esc((a.areas||[]).join('、')||'地域不明')}</span></div><div class="newsactions"><button type="button" data-action="save" data-id="${esc(a.id)}">${isSaved(a)?'★ 保存済み':'☆ 保存'}</button><button type="button" data-action="read" data-id="${esc(a.id)}">${isRead(a)?'未読に戻す':'既読にする'}</button></div></article>`;
 }
 function rebuildCategory(){
  const v=$('category').value,sel=$('category');sel.replaceChildren(new Option('すべての分類','all'));
  for(const c of payload.categories||[])sel.add(new Option(`${c.icon} ${c.name}`,c.id));
  if([...sel.options].some(x=>x.value===v))sel.value=v;
 }
 function draw(){
  stamp();
  $('panelCount').value=String(single?1:settings.panelCount);
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const number=single?1:settings.panelCount;
  const cols=number<=3?number:number===4?2:3;
  const rows=Math.ceil(number/cols);
  const grid=$('areaGrid');grid.style.setProperty('--cols',cols);grid.style.setProperty('--panel-h',rows>1?'max(330px,calc((100vh - 240px)/2))':'max(420px,calc(100vh - 250px))');
  const previous=[...grid.querySelectorAll('.area-body')].map(x=>x.scrollTop);
  grid.replaceChildren();
  for(let i=0;i<number;i++){
   const r=regionValue(i),list=filteredPanel(i),section=document.createElement('section');section.className='panel area-panel';
   section.setAttribute('aria-label','ニュース '+J.regionName(r));section.innerHTML=`<div class="area-head"><b>エリア ${i+1}</b><span class="region-select-holder"></span><span class="area-count">${list.length}件</span><a class="popout" target="_blank" rel="noopener" href="${esc('index.html?single=1&region='+encodeURIComponent(r))}" title="このエリアを独立した画面で表示">↗ 別画面</a></div><div class="area-body">${list.length?list.slice(0,100).map(articleHtml).join(''):'<div class="empty">この地域・条件に該当する記事はありません。<br>地域を変更するか「全て」を選択してください。</div>'}${list.length>100?'<div class="empty">表示は上位100件までです。期間や分類で絞り込んでください。</div>':''}</div>`;
   const sel=J.makeOptions(r);sel.className='area-select';sel.setAttribute('aria-label',`エリア${i+1}の対象地域`);
   sel.addEventListener('change',()=>{
    if(single){singleRegion=sel.value;const params=new URLSearchParams({single:'1',region:singleRegion});history.replaceState(null,'','?'+params)}
    else{settings.panelRegions[i]=sel.value;J.saveSettings(settings)}
    draw();
   });
   section.querySelector('.region-select-holder').replaceWith(sel);
   grid.appendChild(section);
   section.querySelector('.area-body').scrollTop=previous[i]||0;
  }
 }
 function toggleId(key,id){const set=new Set(settings[key]);set.has(id)?set.delete(id):set.add(id);settings[key]=[...set].slice(-4000);J.saveSettings(settings);draw()}
 $('areaGrid').addEventListener('click',e=>{
  const control=e.target.closest('[data-action]');if(!control)return;
  const {action,id}=control.dataset;
  if(action==='read'||action==='save'){toggleId(action==='read'?'read':'saved',id)}
  else if(action==='article'&&!settings.read.includes(id)){settings.read.push(id);J.saveSettings(settings);setTimeout(draw,100)}
 });
 $('panelCount').addEventListener('change',e=>{settings.panelCount=Number(e.target.value);J.saveSettings(settings);draw()});
 if(single){$('panelCount').disabled=true;const btn=document.createElement('a');btn.className='smallbtn';btn.href='./index.html';btn.textContent='← 全エリア画面に戻る';$('panelCount').after(btn)}
 $('search').addEventListener('input',draw);$('category').addEventListener('change',draw);$('period').addEventListener('change',draw);
 $('viewTabs').addEventListener('click',e=>{const tab=e.target.closest('[data-view]');if(tab){view=tab.dataset.view;draw()}});
 $('resetFilters').addEventListener('click',()=>{$('search').value='';$('category').value='all';$('period').value='all';view='all';draw()});
 $('markRead').addEventListener('click',()=>{settings.read=[...new Set([...settings.read,...Array.from({length:single?1:settings.panelCount},(_,i)=>filteredPanel(i)).flat().map(a=>a.id)])].slice(-4000);J.saveSettings(settings);draw()});
 $('export').addEventListener('click',()=>{
  const seen=new Map();for(let i=0;i<(single?1:settings.panelCount);i++)for(const a of filteredPanel(i))seen.set(a.id,a);
  const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const rows=[['公開日時(JST)','見出し','報道機関','地域','分類','URL'],...[...seen.values()].map(a=>[J.formatDate(a.published_at),a.title,a.source,(a.areas||[]).join('・'),(a.categories||[]).join('・'),a.url])];
  const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='jma-news-'+new Date().toISOString().slice(0,10)+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
 });
 // Notification settings are independent of the dashboard region selection.
 const picker=J.makeOptions('近畿地方',{includeUnknown:true});picker.id='notifyRegionSelect';picker.setAttribute('aria-label','追加する通知地域');picker.style.width='100%';
 $('notifyRegionSelectHolder').appendChild(picker);
 function renderNotifySettings(){
  $('popupEnabled').checked=!!settings.popupEnabled;$('notifySince').value=settings.notifySince;
  const group=$('notifyRegionChips');group.replaceChildren();
  for(const r of settings.notifyRegions){const chip=document.createElement('span');chip.className='region-chip';
   const name=document.createElement('span');name.textContent=J.regionName(r);
   const b=document.createElement('button');b.textContent='×';b.title=r+'を通知対象から外す';b.setAttribute('aria-label',b.title);
   b.addEventListener('click',()=>{if(settings.notifyRegions.length<=1)return;settings.notifyRegions=settings.notifyRegions.filter(x=>x!==r);J.saveSettings(settings);renderNotifySettings()});
   chip.append(name,b);group.appendChild(chip);
  }
  $('popupStatus').textContent=settings.popupEnabled?'通知ON：通知画面を開いてください（条件は自動保存されます）':'通知OFF：条件の設定は保存できます';
 }
 $('addNotifyRegion').addEventListener('click',()=>{const id=picker.value;
  if(!settings.notifyRegions.includes(id)){settings.notifyRegions.push(id);J.saveSettings(settings)}renderNotifySettings()});
 $('notifySince').addEventListener('change',e=>{if(e.target.value){settings.notifySince=e.target.value;J.saveSettings(settings)}});
 let alertClosed=()=>{try{return !alertWindow||alertWindow.closed}catch(e){return true}};
 function openAlert(){
  if(!settings.popupEnabled){settings.popupEnabled=true;J.saveSettings(settings)}
  try{alertWindow=window.open('./alerts.html','jma-news-alerts','popup,width=670,height=740,resizable=yes,scrollbars=yes');
   if(alertWindow)alertWindow.focus();else $('popupStatus').textContent='ポップアップがブロックされました。ブラウザで許可してください。';
  }catch(e){$('popupStatus').textContent='ウィンドウを開けませんでした。ポップアップを許可してください。'}
  if(!alertClosed())renderNotifySettings();
 }
 $('settingsButton').addEventListener('click',()=>{renderNotifySettings();$('settingsDialog').showModal()});
 for(const id of ['closeSettings','closeDialog'])$(id).addEventListener('click',()=>$('settingsDialog').close());
 $('settingsDialog').addEventListener('click',e=>{if(e.target===$('settingsDialog'))$('settingsDialog').close()});
 $('popupEnabled').addEventListener('change',e=>{settings.popupEnabled=e.target.checked;J.saveSettings(settings);if(settings.popupEnabled)openAlert();else if(!alertClosed()){alertWindow.close();alertWindow=null}renderNotifySettings()});
 $('openAlertWindow').addEventListener('click',openAlert);
 $('browserNotify').addEventListener('click',async()=>{
  if(!('Notification' in window)){alert('ブラウザ通知が使えません。専用ウィンドウをご利用ください。');return}
  try{const p=await Notification.requestPermission();alert(p==='granted'?'ブラウザ通知を許可しました。設定した地域と日時に一致する新着のみ通知します。':'通知が許可されませんでした。ブラウザ設定を確認してください。')}catch(e){alert('通知を有効にできませんでした。')}
 });
 let knownIds=new Set(items().map(a=>a.id)),hasBaseline=!!payload.generated_at;
 function updated(next){
  const newer=hasBaseline?(next.items||[]).filter(a=>!knownIds.has(a.id)):[];
  knownIds=new Set((next.items||[]).map(a=>a.id));hasBaseline=!!next.generated_at||hasBaseline;
  payload=next;rebuildCategory();draw();
  const scoped=newer.filter(a=>J.inNotificationScope(a,settings));
  if(settings.popupEnabled&&scoped.length&&'Notification' in window&&Notification.permission==='granted'){
   try{new Notification(`気象・防災ニュース：対象地域の新着${scoped.length}件`,{body:scoped.slice(0,2).map(a=>a.title).join(' / ').slice(0,190),tag:'jma-news-updates'})}catch(e){}
  }
 }
 function reload(){if(inFlight)return;inFlight=true;const script=document.createElement('script');script.src='./data.js?nocache='+Date.now();
  script.onload=()=>{inFlight=false;updated(window.NEWS_PAYLOAD||payload);script.remove()};
  script.onerror=()=>{inFlight=false;$('warnings').innerHTML='<div class="notice">データ読み込みに失敗しました。通信状態を確認してください。</div>';script.remove()};document.head.appendChild(script)
 }
 $('refresh').addEventListener('click',reload);
 window.addEventListener('storage',e=>{if(e.key===J.storeKey){settings=J.loadSettings();renderNotifySettings();draw()}});
 rebuildCategory();draw();renderNotifySettings();setInterval(reload,60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload()});
})();
