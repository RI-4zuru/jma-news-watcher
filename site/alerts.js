'use strict';
(() => {
 const $=id=>document.getElementById(id),J=window.JMA;
 let settings=J.loadSettings(),payload=window.NEWS_PAYLOAD||{items:[]},baseline=!!payload.generated_at;
 let known=new Set((payload.items||[]).map(a=>a.id)),busy=false;
 const fresh=new Set(),dismissed=new Set();
 const candidates=()=>(payload.items||[]).filter(a=>J.inNotificationScope(a,settings)&&!dismissed.has(a.id)).sort((a,b)=>J.timestamp(b)-J.timestamp(a));
 function render(){
  J.applyTheme(settings);
  $('state').textContent=settings.popupEnabled?'監視ON':'監視OFF';$('state').classList.toggle('off',!settings.popupEnabled);
  $('scope').textContent=`対象地域：${settings.notifyRegions.map(J.regionName).join('、')} ／ ${settings.notifySince.replace('T',' ')}以降（JST） ／ ${settings.sourceMode==='all'?'全配信元':settings.sourceMode==='major'?'主要メディアのみ':'指定メディアのみ'}`;
  const list=candidates(),parent=$('articles');$('count').textContent=list.length+'件';parent.replaceChildren();
  if(!list.length){const n=document.createElement('div');n.className='empty';n.textContent=settings.popupEnabled?'通知条件に合う記事はありません。':'通知の監視はOFFです。メイン画面の設定からONにできます。';parent.append(n);return}
  for(const a of list.slice(0,150)){
   const card=document.createElement('article');card.className='alert-story'+(fresh.has(a.id)&&J.isNew(a)?' fresh':'');
   const link=document.createElement('a');link.href=a.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=a.title+' ↗';
   const meta=document.createElement('div');meta.className='alert-meta';meta.textContent=J.formatDate(a.published_at)+' ／ '+(a.source||'配信元不明')+' ／ '+((a.areas||[]).join('・')||'地域判定なし');
   card.append(link,meta);parent.append(card);
  }
 }
 function receive(next){
  const arriving=baseline?(next.items||[]).filter(a=>!known.has(a.id)):[];
  known=new Set((next.items||[]).map(a=>a.id));baseline=!!next.generated_at||baseline;payload=next;
  const scoped=settings.popupEnabled?arriving.filter(a=>J.inNotificationScope(a,settings)):[];
  for(const a of scoped)fresh.add(a.id);
  if(scoped.length){
   $('count').classList.remove('pulse');void $('count').offsetWidth;$('count').classList.add('pulse');
   document.title=`🔴 新着${scoped.length}件 | 気象・防災ニュース`;
   try{window.focus()}catch(e){}
  }
  $('lastCheck').textContent='最終確認 '+J.formatDate(new Date().toISOString());render();
 }
 function reload(){if(busy)return;busy=true;const script=document.createElement('script');script.src='./data.js?t='+Date.now();
  script.onload=()=>{busy=false;receive(window.NEWS_PAYLOAD||payload);script.remove()};
  script.onerror=()=>{busy=false;$('lastCheck').textContent='取得失敗';script.remove()};document.head.append(script);
 }
 $('clear').addEventListener('click',()=>{for(const a of candidates())dismissed.add(a.id);fresh.clear();document.title='新着通知 | 気象・防災ニュース';render()});
 window.addEventListener('storage',e=>{if(e.key===J.storeKey){settings=J.loadSettings();render()}});
 render();setInterval(reload,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload()});
})();
