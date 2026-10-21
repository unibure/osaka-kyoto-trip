const cast=[
  {name:'깡이정',english:'kkangijeong',labelColor:'#a04ff4',file:'lavender'},
  {name:'나라시',english:'narashi',labelColor:'#1679ed',file:'blue'},
  {name:'우키링',english:'ukiring',labelColor:'#55aa20',file:'lime'},
  {name:'꼬니',english:'kkoni',labelColor:'#e91e91',file:'pink'}
];
const introOrder=['kkoni','kkangijeong','narashi','ukiring'];
const introCast=introOrder.map(name=>cast.find(character=>character.english===name));

function sprite(c,i,showName=false){
  return '<div class="sprite character-'+c.file+'" aria-label="'+c.name+' 캐릭터" style="--delay:'+([.15,.55,.95,1.35][i])+'s;--label-color:'+c.labelColor+'"><img src="assets/character-'+c.file+'.png" alt="'+c.name+' 캐릭터">'+(showName?'<span class="character-label">'+c.english+'</span>':'')+'</div>';
}
document.querySelector('#introCrew').innerHTML=introCast.map((c,i)=>sprite(c,i,true)).join('');
document.querySelector('#miniCrew').innerHTML=cast.map((c,i)=>sprite(c,i,false)).join('');
const intro=document.querySelector('#intro');
const screenKey='little-trip-screen-v1';
try{
  if(localStorage.getItem(screenKey)==='main')intro.classList.add('off')
}catch{}
function enter(){
  intro.classList.add('off');
  try{localStorage.setItem(screenKey,'main')}catch{}
}
document.querySelector('#go').addEventListener('click',enter);
document.querySelector('#skip').addEventListener('click',enter);
function replayIntro(){
  intro.classList.remove('off');
  try{localStorage.setItem(screenKey,'intro')}catch{}
  document.querySelectorAll('#introCrew .sprite').forEach(el=>{
    el.style.animation='none';
    void el.offsetWidth;
    el.style.animation='';
  })
}
document.querySelector('#replay').addEventListener('click',replayIntro);
document.querySelector('#brandHome')?.addEventListener('click',replayIntro);
const itinerary=[
  {place:'OSAKA',date:'10월 24일',from:'오사카',to:'오사카 투어',heading:'첫째 날 · 오사카',items:[]},
  {place:'KYOTO',date:'10월 25일',from:'오사카',to:'교토',heading:'둘째 날 · 교토',items:[]},
  {place:'OSAKA',date:'10월 26일',from:'오사카',to:'오사카 투어',heading:'셋째 날 · 오사카',items:[]}
];
const remoteMode=location.protocol==='http:'||location.protocol==='https:';
let currentDay=0;
const scheduleKey='little-trip-schedule-v1';
let customEvents={};
let packing=[];
try{
  if(!remoteMode){
    customEvents=JSON.parse(localStorage.getItem(scheduleKey)||'{}');
    if(!customEvents||typeof customEvents!=='object'||Array.isArray(customEvents))customEvents={};
    packing=JSON.parse(localStorage.getItem('little-trip-packing-v1')||'[]');
    if(!Array.isArray(packing))packing=[]
  }
}catch{
  customEvents={};packing=[]
}
function safeText(value){
  return String(value).replace(/[&<>"']/g,
    ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])
  )
}
const TAG_GROUPS=[
  {color:'lime',label:'카페',aliases:['카페','커피','디저트']},
  {color:'orange',label:'술집',aliases:['술집','이자카야','바','맥주']},
  {color:'pink',label:'맛집',aliases:['맛집','맛있는','음식','식당','밥']},
  {color:'yellow',label:'관광지',aliases:['관광','관광지','명소','사원','신사','전망대','산책']},
  {color:'lavender',label:'쇼핑',aliases:['쇼핑','상점','돈키','백화점','기념품']}
];
function normalizeTag(value){
  return String(value||'').trim().replace(/\s+/g,' ').slice(0,12)
}
function matchTagGroup(raw){
  const text=normalizeTag(raw).replace(/\s+/g,'');
  if(text.length<2)return null;
  return TAG_GROUPS.find(group=>group.aliases.some(alias=>{
    if(alias.length<2)return false;
    return text===alias||alias.startsWith(text)||text.startsWith(alias)
  }))||null
}
function canonicalTag(raw){
  return matchTagGroup(raw)?.label||''
}
function resolveTagColor(raw){
  return matchTagGroup(raw)?.color||'neutral'
}
function tagBadge(raw){
  const tag=normalizeTag(raw);
  if(!tag)return '';
  return `<span class="place-tag place-tag-${resolveTagColor(tag)}">${safeText(tag)}</span>`
}
function cleanMapUrl(value){
  const raw=String(value||'').trim().slice(0,300);
  if(!raw)return '';
  let url;
  try{url=new URL(raw)}catch{return ''}
  if(url.protocol!=='https:'&&url.protocol!=='http:')return '';
  const host=url.hostname.toLowerCase();
  const path=url.pathname;
  const allowed=
    host==='maps.app.goo.gl'||
    host==='maps.google.com'||
    host==='www.google.com'&&path.startsWith('/maps')||
    host==='google.com'&&path.startsWith('/maps')||
    host==='goo.gl'&&path.startsWith('/maps');
  return allowed?url.href.slice(0,300):''
}
function showGate(message='',tone='error'){
  const el=document.querySelector('#saveStatus');
  el.textContent=message;
  el.dataset.tone=message?tone:'';
}
function hideGate(){
  const el=document.querySelector('#saveStatus');
  el.textContent='';
  el.dataset.tone=''
}
function showSaving(message='저장 중…'){
  showGate(message,'progress')
}
async function apiCall(url,options={}){
  const response=await fetch(url,{
    credentials:'same-origin',
    ...options,
    headers:{
      ...(options.body?{'content-type':'application/json'}:{}),
      ...(options.headers||{})
    }
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok){
    const message=
      body.error==='setup_required'?'여행 데이터 저장소(Upstash) 연결을 확인해 주세요.':
      body.error==='database_unavailable'||body.error==='storage_unavailable'?'데이터 저장소 연결을 확인해 주세요.':
      body.error==='invalid_order'?'일정 순서를 다시 맞춰 주세요.':
      '저장에 실패했어요. 잠시 후 다시 시도해 주세요.';
    throw new Error(message)
  }
  return body
}
async function refreshRemote({quiet=false}={}){
  try{
    let data=await apiCall('/api/data');
    if(!(localStorage.getItem('little-trip-migration-v1'))
        &&!Object.values(data.schedule||{}).some(list=>list.length)
        &&!(data.packing||[]).length){
      let legacySchedule={};
      let legacyPacking=[];
      try{
        legacySchedule=JSON.parse(localStorage.getItem(scheduleKey)||'{}');
        legacyPacking=JSON.parse(localStorage.getItem('little-trip-packing-v1')||'[]')
      }catch{}
      for(const [day,items] of Object.entries(legacySchedule||{}))
        for(const item of (Array.isArray(items)?items:[]))await apiCall('/api/data',{
          method:'POST',
          body:JSON.stringify({kind:'schedule',action:'add',day:Number(day),time:item.time,title:item.title,tag:item.tag,mapUrl:item.mapUrl,note:item.note,transit:item.transit})
        });
      for(const item of (Array.isArray(legacyPacking)?legacyPacking:[]))
        if(item.name)
          await apiCall('/api/data',{method:'POST',body:JSON.stringify({kind:'packing',action:'add',name:item.name})});
      localStorage.setItem('little-trip-migration-v1','1');
      if(Object.keys(legacySchedule||{}).length||legacyPacking.length)
        data=await apiCall('/api/data')
    }
    customEvents=data.schedule||{};
    packing=data.packing||[];
    renderSchedule(currentDay);
    renderPacking();
    if(!quiet)hideGate()
  }catch(error){
    showGate(error.message)
  }
}
let scheduleMutationQueue=Promise.resolve();
function enqueueScheduleMutation(task){
  const run=scheduleMutationQueue.then(task,task);
  scheduleMutationQueue=run.then(()=>{},()=>{});
  return run
}
async function apiAction(payload,{pendingMessage='저장 중…'}={}){
  if(remoteMode&&(payload.kind==='schedule')){
    return enqueueScheduleMutation(async()=>{
      showSaving(pendingMessage);
      try{
        await apiCall('/api/data',{method:'POST',body:JSON.stringify(payload)});
        await refreshRemote();
        return true
      }catch(error){
        showGate(error.message);
        await refreshRemote({quiet:true});
        showGate(error.message);
        return false
      }
    })
  }
  try{
    showSaving(pendingMessage);
    await apiCall('/api/data',{method:'POST',body:JSON.stringify(payload)});
    await refreshRemote();
    return true
  }catch(error){
    showGate(error.message);
    return false
  }
}
function applyLocalScheduleOrder(day,ids){
  const items=new Map((customEvents[day]||[]).map(item=>[item.id,item]));
  customEvents[day]=ids.map((id,order)=>items.has(id)?{...items.get(id),order}:null).filter(Boolean);
}
const pendingReorderByDay={};
async function persistScheduleOrder(day,ids){
  if(remoteMode){
    const snapshot=ids.slice();
    applyLocalScheduleOrder(day,snapshot);
    pendingReorderByDay[day]=snapshot;
    return enqueueScheduleMutation(async()=>{
      const idsToSave=pendingReorderByDay[day];
      if(!idsToSave)return true;
      delete pendingReorderByDay[day];
      showSaving('순서 저장 중…');
      try{
        await apiCall('/api/data',{
          method:'POST',
          body:JSON.stringify({kind:'schedule',action:'reorder',day,ids:idsToSave})
        });
        if(pendingReorderByDay[day]){
          const latest=pendingReorderByDay[day];
          delete pendingReorderByDay[day];
          await apiCall('/api/data',{
            method:'POST',
            body:JSON.stringify({kind:'schedule',action:'reorder',day,ids:latest})
          })
        }
        await refreshRemote();
        return true
      }catch(error){
        showGate(error.message);
        await refreshRemote({quiet:true});
        showGate(error.message);
        return false
      }
    })
  }
  applyLocalScheduleOrder(day,ids);
  localStorage.setItem(scheduleKey,JSON.stringify(customEvents));
  renderSchedule(day)
}
function enableScheduleDragging(list,day){
  if(list._dragCleanup)list._dragCleanup();
  let active=null;
  const scheduleCards=()=>[...list.querySelectorAll('.schedule-stop[data-schedule-id]')];
  const saveOrder=()=>persistScheduleOrder(day,scheduleCards().map(card=>card.dataset.scheduleId));
  const finish=event=>{
    if(!active||active.pointerId!==event.pointerId)return;
    const card=active.card,dragged=active.dragging;
    active=null;
    card.classList.remove('is-dragging');
    // pointermove already placed the card; only persist the current DOM order.
    if(dragged)saveOrder()
  };
  const onPointerUp=finish;
  const onPointerCancel=finish;
  list.addEventListener('pointerup',onPointerUp);
  list.addEventListener('pointercancel',onPointerCancel);
  const handleCleanups=[];
  list.querySelectorAll('[data-drag-handle]').forEach(handle=>{
    const onDown=event=>{
      if(event.button!==undefined&&event.button!==0)return;
      active={card:handle.closest('.schedule-stop'),pointerId:event.pointerId,x:event.clientX,y:event.clientY,dragging:false};
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault()
    };
    const onMove=event=>{
      if(!active||active.pointerId!==event.pointerId)return;
      if(!active.dragging&&Math.hypot(event.clientX-active.x,event.clientY-active.y)<5)return;
      active.dragging=true;
      active.card.classList.add('is-dragging');
      const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.schedule-stop[data-schedule-id]');
      if(!target||target===active.card||target.parentElement!==list)return;
      const after=event.clientY>target.getBoundingClientRect().top+target.offsetHeight/2;
      list.insertBefore(active.card,after?target.nextSibling:target)
    };
    handle.addEventListener('pointerdown',onDown);
    handle.addEventListener('pointermove',onMove);
    handleCleanups.push(()=>{
      handle.removeEventListener('pointerdown',onDown);
      handle.removeEventListener('pointermove',onMove)
    })
  });
  list._dragCleanup=()=>{
    list.removeEventListener('pointerup',onPointerUp);
    list.removeEventListener('pointercancel',onPointerCancel);
    handleCleanups.forEach(fn=>fn());
    list._dragCleanup=null
  }
}
let editingEventId=null;
let editingEventDay=null;
function setSelectedTag(value){
  const tag=canonicalTag(value);
  document.querySelector('#eventTag').value=tag;
  document.querySelectorAll('.tag-chips [data-tag]').forEach(button=>{
    const on=button.dataset.tag===tag;
    button.classList.toggle('is-on',on);
    button.setAttribute('aria-pressed',String(on))
  })
}
function setScheduleDetailsOpen(open){
  const details=document.querySelector('#scheduleDetails');
  const toggle=document.querySelector('#scheduleDetailsToggle');
  details.hidden=!open;
  toggle.setAttribute('aria-expanded',String(open));
  toggle.textContent=open?'− 교통편 · 메모 · 지도':'＋ 교통편 · 메모 · 지도'
}
function resetScheduleEditor(){
  editingEventId=null;
  editingEventDay=null;
  const form=document.querySelector('#scheduleForm');
  form.reset();
  setSelectedTag('');
  setScheduleDetailsOpen(false);
  form.querySelector('.schedule-form-title b').textContent='＋ 일정 직접 추가';
  form.querySelector('[type="submit"]').textContent='추가하기';
  form.querySelector('[data-cancel-edit]').style.display='none'
}
function editSchedule(item){
  editingEventId=item.id;
  editingEventDay=currentDay;
  document.querySelector('#eventTime').value=item.time||'';
  document.querySelector('#eventName').value=item.title;
  setSelectedTag(item.tag||'');
  document.querySelector('#eventTransport').value=item.transit||'';
  document.querySelector('#eventMap').value=item.mapUrl||'';
  document.querySelector('#eventNote').value=item.note||'';
  setScheduleDetailsOpen(Boolean((item.transit||'').trim()||(item.note||'').trim()||(item.mapUrl||'').trim()));
  const form=document.querySelector('#scheduleForm');
  form.querySelector('.schedule-form-title b').textContent='일정 수정';
  form.querySelector('[type="submit"]').textContent='변경 저장';
  form.querySelector('[data-cancel-edit]').style.display='block';
  form.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
  document.querySelector('#eventName').focus({preventScroll:true})
}
function renderSchedule(n){
  const row=([time,title,note,transit,tag,mapUrl],custom=false,id='')=>{
    const transport=String(transit||'').trim();
    const map=cleanMapUrl(mapUrl);
    return `<article class="schedule-stop${custom?' is-custom':''}"${custom?` data-schedule-id="${safeText(id)}"`:''}><div class="schedule-meta">${custom?`<button class="drag-handle" type="button" data-drag-handle aria-label="${safeText(title)} 일정 순서 변경" title="드래그해 순서 변경">⠿</button>`:''}<time>${safeText(time)}</time></div><div class="schedule-content"><div class="schedule-title-row">${tagBadge(tag)}<h3>${safeText(title)}</h3>${map?`<a class="map-link" href="${safeText(map)}" target="_blank" rel="noopener noreferrer">지도</a>`:''}${transport?'<button class="transport-toggle" type="button" aria-expanded="false">교통편</button>':''}</div>${custom?`<div class="event-actions"><button class="edit-event" type="button" data-edit-event="${safeText(id)}" aria-label="${safeText(title)} 일정 수정">수정</button><button class="remove-event" type="button" data-event-id="${safeText(id)}" aria-label="${safeText(title)} 일정 삭제">삭제</button></div>`:''}${note?`<p>${safeText(note)}</p>`:''}${transport?`<div class="transport-content" hidden><b>교통편</b><p>${safeText(transport)}</p></div>`:''}</div></article>`
  };
  const defaults=itinerary[n].items.map(item=>row(item)).join('');
  // 시간 정렬 (기본 일정)
  const sortedCustom=(customEvents[n]||[]).slice();
  if(sortedCustom.some(item=>Number.isFinite(item.order))){
    sortedCustom.sort((a,b)=>{
      const aOrder=Number.isFinite(a.order)?a.order:Number.MAX_SAFE_INTEGER;
      const bOrder=Number.isFinite(b.order)?b.order:Number.MAX_SAFE_INTEGER;
      return aOrder-bOrder
    })
  }
  const added=sortedCustom.map(e=>{
    return row([e.time||'시간 미정',e.title,e.note,e.transit,e.tag,e.mapUrl],true,e.id)
  }).join('');
  document.querySelector('#scheduleList').innerHTML=defaults+added;
  enableScheduleDragging(document.querySelector('#scheduleList'),n);
  document.querySelectorAll('.transport-toggle').forEach(button=>button.addEventListener('click',()=>{
    const panel=button.closest('.schedule-content').querySelector('.transport-content');
    panel.hidden=!panel.hidden;
    button.setAttribute('aria-expanded',String(!panel.hidden));
    button.textContent=panel.hidden?'교통편':'닫기'
  }));
  document.querySelectorAll('[data-edit-event]').forEach(button=>button.addEventListener('click',()=>{
    const item=(customEvents[n]||[]).find(e=>e.id===button.dataset.editEvent);
    if(item) editSchedule(item)
  }));
  document.querySelectorAll('[data-event-id]').forEach(button=>button.addEventListener('click',()=>{
    if(remoteMode) apiAction({kind:'schedule',action:'remove',id:button.dataset.eventId},{pendingMessage:'일정 삭제 중…'});
    else{
      customEvents[n]=(customEvents[n]||[]).filter(e=>e.id!==button.dataset.eventId);
      localStorage.setItem(scheduleKey,JSON.stringify(customEvents));
      renderSchedule(n)
    }
  }));
}
function showDay(n){
  // Editing belongs to the day where it began. Cancel rather than silently
  // moving the event when another day tab is selected mid-edit.
  if(editingEventId!==null&&n!==currentDay)resetScheduleEditor();
  currentDay=n;
  const d=itinerary[n];
  document.querySelector('#welcome').innerHTML=`<em>${d.heading}</em>`;
  document.querySelector('#scheduleEyebrow').textContent=`DAY 0${n+1} · ${d.place}`;
  document.querySelector('#scheduleDate').textContent=d.date;
  document.querySelector('#routeStart').textContent=d.from;
  document.querySelector('#routeEnd').textContent=d.to;
  document.querySelector('#addingDay').textContent=`${n+1}일차 일정`;
  renderSchedule(n);
  document.querySelectorAll('[data-day]').forEach(b=>b.classList.toggle('active',Number(b.dataset.day)===n));
  localStorage.setItem('little-trip-selected-day',String(n))
}
document.querySelectorAll('[data-day]').forEach(b=>b.addEventListener('click',()=>showDay(Number(b.dataset.day))));
document.querySelectorAll('.tag-chips [data-tag]').forEach(button=>button.addEventListener('click',()=>{
  setSelectedTag(button.dataset.tag===document.querySelector('#eventTag').value?'':button.dataset.tag)
}));
document.querySelector('#scheduleDetailsToggle').addEventListener('click',()=>{
  setScheduleDetailsOpen(document.querySelector('#scheduleDetails').hidden)
});
setSelectedTag('');
setScheduleDetailsOpen(false);
document.querySelector('#scheduleForm').addEventListener('submit',e=>{
  e.preventDefault();
  const title=document.querySelector('#eventName').value.trim();
  if(!title)return;
  const mapRaw=document.querySelector('#eventMap').value.trim();
  const mapUrl=cleanMapUrl(mapRaw);
  if(mapRaw&&!mapUrl){
    showGate('구글 지도 공유 링크만 넣을 수 있어요.');
    setScheduleDetailsOpen(true);
    document.querySelector('#eventMap').focus();
    return
  }
  const event={
    id:editingEventId||`${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    time:document.querySelector('#eventTime').value.trim(),
    title,
    tag:normalizeTag(document.querySelector('#eventTag').value),
    mapUrl,
    transit:document.querySelector('#eventTransport').value.trim(),
    note:document.querySelector('#eventNote').value.trim()
  };
  if(editingEventId){
    const eventDay=editingEventDay??currentDay;
    const payload={
      kind:'schedule',
      action:'update',
      id:editingEventId,
      day:eventDay,
      time:event.time,
      title:event.title,
      tag:event.tag,
      mapUrl:event.mapUrl,
      transit:event.transit,
      note:event.note
    };
    resetScheduleEditor();
    if(remoteMode)apiAction(payload,{pendingMessage:'일정 저장 중…'});
    else{
      const ordered=(customEvents[eventDay]||[]).map((item,index)=>({...item,order:Number.isFinite(item.order)?item.order:index}));
      const index=ordered.findIndex(item=>item.id===event.id);
      if(index>=0){
        event.order=ordered[index].order;
        ordered[index]={...ordered[index],...event}
      }else{
        event.order=ordered.length?Math.max(...ordered.map(item=>item.order))+1:0;
        ordered.push(event)
      }
      customEvents[eventDay]=ordered;
      localStorage.setItem(scheduleKey,JSON.stringify(customEvents));
      showDay(eventDay)
    }
    return
  }
  e.currentTarget.reset();
  setSelectedTag('');
  setScheduleDetailsOpen(false);
  if(remoteMode)
    apiAction(
      {kind:'schedule',action:'add',day:currentDay,time:event.time,title:event.title,tag:event.tag,mapUrl:event.mapUrl,transit:event.transit,note:event.note},
      {pendingMessage:'일정 저장 중…'}
    );
  else{
    const existing=customEvents[currentDay]||[];
    const ordered=existing.map((item,index)=>({...item,order:Number.isFinite(item.order)?item.order:index}));
    event.order=ordered.length?Math.max(...ordered.map(item=>item.order))+1:0;
    customEvents[currentDay]=[...ordered,event];
    localStorage.setItem(scheduleKey,JSON.stringify(customEvents));
    showDay(currentDay)
  }
});
document.querySelector('#scheduleForm [data-cancel-edit]').addEventListener('click',resetScheduleEditor);
let editingPackIndex=-1;
function savePacking(){
  localStorage.setItem('little-trip-packing-v1',JSON.stringify(packing));
  renderPacking()
}
function renderPacking(){
  // packing을 이름순 정렬
  const sortedPacking = packing.slice().sort((a,b)=>
      (a.name||'').localeCompare(b.name||'','ko-KR')
  );
  const markup=sortedPacking.map((item,i)=>{
    // edit 인덱스는 packng의 오리지널 인덱스가 아닌 정렬된 인덱스에서 전달되므로 주의!
    // 편집시에는 정렬 없이 표시
    if (editingPackIndex !== -1 && packing[editingPackIndex]===item) {
      return `<li class="pack-edit-row"><input data-pack-edit-input="${editingPackIndex}" maxlength="40" value="${safeText(item.name)}" aria-label="준비물 이름 수정"><button type="button" data-save-pack="${editingPackIndex}">저장</button><button type="button" data-cancel-pack>취소</button></li>`;
    }
    const origIdx = packing.indexOf(item);
    return `<li><label><input type="checkbox" data-check="${origIdx}" ${item.done?'checked':''}><span>${safeText(item.name)}</span></label><div class="pack-actions"><button class="edit-item" type="button" data-edit-pack="${origIdx}" aria-label="${safeText(item.name)} 수정">수정</button><button class="remove-item" type="button" data-remove="${origIdx}" aria-label="${safeText(item.name)} 삭제">×</button></div></li>`;
  }).join('');
  document.querySelector('#packList').innerHTML=markup;
  const done=packing.filter(x=>x.done).length;
  document.querySelector('#packCount').textContent=`${done}/${packing.length} 완료`;
  document.querySelectorAll('[data-check]').forEach(el=>el.addEventListener('change',()=>{
    const i=Number(el.dataset.check);
    if(remoteMode)apiAction({kind:'packing',action:'toggle',id:packing[i].id,done:el.checked},{pendingMessage:'저장 중…'});
    else{packing[i].done=el.checked;savePacking()}
  }));
  document.querySelectorAll('[data-remove]').forEach(el=>el.addEventListener('click',()=>{
    const i=Number(el.dataset.remove);
    if(remoteMode)apiAction({kind:'packing',action:'remove',id:packing[i].id},{pendingMessage:'저장 중…'});
    else{packing.splice(i,1);savePacking()}
  }));
  document.querySelectorAll('[data-edit-pack]').forEach(el=>el.addEventListener('click',()=>{
    editingPackIndex=Number(el.dataset.editPack);
    renderPacking();
    const input=document.querySelector('[data-pack-edit-input]');
    input.focus();
    input.select();
  }));
  document.querySelectorAll('[data-cancel-pack]').forEach(el=>el.addEventListener('click',()=>{
    editingPackIndex=-1;
    renderPacking()
  }));
  document.querySelectorAll('[data-save-pack]').forEach(el=>el.addEventListener('click',()=>{
    const i=Number(el.dataset.savePack);
    const input=document.querySelector(`[data-pack-edit-input="${i}"]`);
    const name=input.value.trim();
    if(!name){input.focus();return}
    if(remoteMode){
      editingPackIndex=-1;
      apiAction({kind:'packing',action:'update',id:packing[i].id,name},{pendingMessage:'저장 중…'})
    }else{
      packing[i].name=name;
      editingPackIndex=-1;
      savePacking()
    }
  }));
  document.querySelectorAll('[data-pack-edit-input]').forEach(input=>
    input.addEventListener('keydown',event=>{
      if(event.key==='Enter'){
        event.preventDefault();
        document.querySelector(`[data-save-pack="${input.dataset.packEditInput}"]`).click()
      }
      if(event.key==='Escape'){
        editingPackIndex=-1;
        renderPacking()
      }
    })
  );
}
document.querySelector('#packForm').addEventListener('submit',e=>{
  e.preventDefault();
  const input=document.querySelector('#packInput');
  const name=input.value.trim();
  if(!name)return;
  input.value='';
  if(remoteMode)apiAction({kind:'packing',action:'add',name},{pendingMessage:'저장 중…'});
  else{packing.push({name,done:false});savePacking()}
});
showDay(Math.min(2,Math.max(0,Number(localStorage.getItem('little-trip-selected-day')||0))));
renderPacking();
if(remoteMode)refreshRemote()

const heartCursor=document.querySelector('#heartCursor');
const heartCursorImage=heartCursor?.querySelector('img');
if(heartCursor&&heartCursorImage&&matchMedia('(hover: hover) and (pointer: fine)').matches){
 const activateHeartCursor=()=>document.documentElement.classList.add('heart-cursor-ready');
 if(heartCursorImage.complete&&heartCursorImage.naturalWidth)activateHeartCursor();
 else heartCursorImage.addEventListener('load',activateHeartCursor,{once:true});
 const moveHeartCursor=event=>{
  if(event.pointerType==='touch')return;
  const offset=8;
  heartCursor.style.transform=`translate3d(${Math.round(event.clientX+offset)}px,${Math.round(event.clientY+offset)}px,0)`;
  heartCursor.dataset.visible='true';
 };
 window.addEventListener('pointermove',moveHeartCursor,{passive:true});
 window.addEventListener('pointerleave',()=>heartCursor.removeAttribute('data-visible'));
}
