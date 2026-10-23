/* Notification view: read JSON, never execute collected news as script. */
'use strict';
(() => {
 const $=id=>document.getElementById(id),J=window.JMA;
 let settings=J.loadSettings(),payload={items:[]},baseline=false,busy=false;
 let known=new Set();
 const fresh=new Set(),dismissed=new Set();
 const candidates=()=>J.dedupeStories(payload.items||[]).filter(a=>settings.popupEnabled&&J.inNotificationScope(a,settings)&&!(a.aliases||[a.id]).some(id=>dismissed.has(id))).sort((a,b)=>J.timestamp(b)-J.timestamp(a));
 function render(){
  J.applyTheme(settings);
  $('state').textContent=settings.popupEnabled?'監視ON':'監視OFF';$('state').classList.toggle('off',!settings.popupEnabled);
  $('scope').textContent=`対象地域：${settings.notifyRegions.map(J.regionName).join('、')} ／ ${settings.notifySince.replace('T',' ')}以降（JST） ／ ${settings.sourceMode==='all'?'全配信元':settings.sourceMode==='major'?'主要メディアのみ':'指定メディアのみ'}`;
  const list=candidates(),parent=$('articles');$('count').textContent=list.length+'件';parent.replaceChildren();
  if(!list.length){const n=document.createElement('div');n.className='empty';n.textContent=settings.popupEnabled?'通知条件に合う記事はありません。':'通知の監視はOFFです。メイン画面の設定からONにできます。';parent.append(n);return}
  for(const a of list.slice(0,150)){
   const card=document.createElement('article');card.className='alert-story'+(fresh.has(a.id)&&J.isNew(a)?' fresh':'');
   const url=J.safeArticleUrl(a.url),link=document.createElement(url?'a':'span');
   if(url){link.href=url;link.target='_blank';link.rel='noopener noreferrer'}
   link.textContent=a.title+(url?' ↗':'');
   const meta=document.createElement('div');meta.className='alert-meta';meta.textContent=J.formatDate(a.published_at)+' ／ '+(a.source||'配信元不明')+' ／ '+((a.areas||[]).join('・')||'地域判定なし');
   card.append(link,meta);parent.append(card);
  }
 }
 function receive(next){
  const entries=J.dedupeStories(next.items||[]);
  const arriving=baseline?entries.filter(a=>!(a.aliases||[a.id]).some(x=>known.has(x))):[];
  known=new Set(entries.flatMap(a=>a.aliases||[a.id]));baseline=!!next.generated_at||baseline;payload=next;
  const scoped=settings.popupEnabled?arriving.filter(a=>J.inNotificationScope(a,settings)):[];
  for(const a of scoped)fresh.add(a.id);
  if(scoped.length){
   $('count').classList.remove('pulse');void $('count').offsetWidth;$('count').classList.add('pulse');
   document.title=`🔴 新着${scoped.length}件 | 気象・防災ニュース`;
   window.focus();
  }
  $('lastCheck').textContent='最終確認 '+J.formatDate(new Date().toISOString());render();
 }
 async function reload(){
  if(busy)return;busy=true;
  try{
   const response=await fetch('./data.json?time='+Date.now(),{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);
   const data=await response.json();if(!Array.isArray(data.items))throw Error('invalid data');receive(data);
  }catch(e){$('lastCheck').textContent='取得失敗 — 前回の情報を表示'}
  finally{busy=false}
 }
 $('clear').addEventListener('click',()=>{for(const a of candidates())for(const id of a.aliases||[a.id])dismissed.add(id);fresh.clear();document.title='新着通知 | 気象・防災ニュース';render()});
 window.addEventListener('storage',e=>{if(e.key===J.storeKey){settings=J.loadSettings();render()}});
 render();reload();setInterval(reload,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload()});
})();
