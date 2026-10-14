'use strict';
(() => {
 const $=id=>document.getElementById(id),J=window.JMA;
 let settings=J.loadSettings();
 let payload=window.NEWS_PAYLOAD||{items:[]},known=new Set((payload.items||[]).map(a=>a.id)),baseline=!!payload.generated_at;
 let inFlight=false,unreadNew=new Set(),dismissed=new Set();
 // Past matching articles are included in the window without a popup flash.
 // Only newly *collected* matching articles change the window title / request focus.
 function candidates(){return (payload.items||[]).filter(a=>J.inNotificationScope(a,settings)&&!dismissed.has(a.id)).sort((a,b)=>J.timestamp(b)-J.timestamp(a))}
 function render(){
  const active=!!settings.popupEnabled;
  $('state').textContent=active?'監視中':'通知OFF';$('state').className='pill'+(active?'':' off');
  $('scope').textContent='対象地域：'+settings.notifyRegions.map(J.regionName).join('、')+' ／ 記事公開日時：'+settings.notifySince.replace('T',' ')+'以降（JST）';
  const articles=candidates();$('count').textContent=articles.length+'件';
  const area=$('articles');area.replaceChildren();
  if(!articles.length){const e=document.createElement('div');e.className='empty';e.textContent=active?'対象条件に合う記事はまだありません。':'通知OFFです。設定画面でONにしてください。';area.appendChild(e);return}
  for(const a of articles.slice(0,100)){
   const card=document.createElement('article');card.className='news'+(unreadNew.has(a.id)?' new':'');
   if(unreadNew.has(a.id)){const flag=document.createElement('span');flag.className='flag';flag.textContent='新着';card.appendChild(flag)}
   const link=document.createElement('a');link.textContent=a.title+' ↗';link.href=a.url;link.target='_blank';link.rel='noopener noreferrer';
   const meta=document.createElement('div');meta.className='meta';meta.textContent=J.formatDate(a.published_at)+' ／ '+(a.source||'配信元不明')+' ／ '+((a.areas||[]).join('・')||'地域判定なし');
   card.append(link,meta);area.appendChild(card);
  }
  if(articles.length>100){const e=document.createElement('div');e.className='empty';e.textContent='上位100件まで表示中。開始日時を変更すると絞り込めます。';area.appendChild(e)}
 }
 function receive(next){
  const arriving=baseline?(next.items||[]).filter(a=>!known.has(a.id)):[];
  known=new Set((next.items||[]).map(a=>a.id));baseline=!!next.generated_at||baseline;payload=next;
  const matched=settings.popupEnabled?arriving.filter(a=>J.inNotificationScope(a,settings)):[];
  for(const a of matched)unreadNew.add(a.id);
  if(matched.length){
   const count=$('count');count.classList.remove('pulse');void count.offsetWidth;count.classList.add('pulse');
   document.title=`🔴 新着${matched.length}件 | 気象・防災ニュース`;
   try{window.focus()}catch(e){}
  }
  $('lastCheck').textContent=' ／ 最終確認 '+J.formatDate(new Date().toISOString());render();
 }
 function reload(){if(inFlight)return;inFlight=true;const script=document.createElement('script');script.src='./data.js?v='+Date.now();
  script.onload=()=>{inFlight=false;receive(window.NEWS_PAYLOAD||payload);script.remove()};
  script.onerror=()=>{inFlight=false;$('lastCheck').textContent=' ／ 取得失敗';script.remove()};document.head.appendChild(script);
 }
 $('clear').addEventListener('click',()=>{for(const a of candidates())dismissed.add(a.id);unreadNew.clear();document.title='新着通知 | 気象・防災ニュース';render()});
 window.addEventListener('storage',e=>{if(e.key===J.storeKey){settings=J.loadSettings();render()}});
 render();setInterval(reload,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload()});
})();
