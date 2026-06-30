import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import { getFirestore, doc, collection, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, enableIndexedDbPersistence, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyAr747TjWPeQ9CsNaj4iCxmsbjKNsDqOsE",
  authDomain: "masroofi-17e2d.firebaseapp.com",
  projectId: "masroofi-17e2d",
  storageBucket: "masroofi-17e2d.firebasestorage.app",
  messagingSenderId: "721989937914",
  appId: "1:721989937914:web:3a40a14f33cb9979c4f743",
  measurementId: "G-F5GZ90D11X"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
enableIndexedDbPersistence(db).catch(()=>{});
const provider = new GoogleAuthProvider();

const $ = (id)=>document.getElementById(id);
const state = { user:null, expenses:[], settings:{dailyLimit:0,weeklyLimit:0,monthlyBudget:0,currency:'SAR'}, unsub:[] };
const arDays = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const fmtNum = (n)=> Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2});
const money = (n)=> `${fmtNum(n)} ${state.settings.currency||'SAR'}`;
const todayISO = ()=> new Date().toISOString().slice(0,10);
const nowTime = ()=> new Date().toTimeString().slice(0,5);
const toDateObj = (date,time='00:00') => new Date(`${date}T${time || '00:00'}:00`);
const dateKey = (d)=> d.toISOString().slice(0,10);
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2600); }
function confirmAction(msg){ return window.confirm(msg); }
function dayNameFromDate(date){ const d = toDateObj(date,'12:00'); return arDays[d.getDay()]; }
function weekRange(d=new Date()){
  const x = new Date(d); x.setHours(0,0,0,0);
  const start = new Date(x); start.setDate(x.getDate()-x.getDay());
  const end = new Date(start); end.setDate(start.getDate()+6); end.setHours(23,59,59,999);
  return {start,end};
}
function monthRange(d=new Date()){
  return {start:new Date(d.getFullYear(),d.getMonth(),1), end:new Date(d.getFullYear(),d.getMonth()+1,0,23,59,59,999)};
}
function inRange(exp,start,end){ const dt = toDateObj(exp.date, exp.time); return dt>=start && dt<=end; }
function sum(list){ return list.reduce((a,b)=>a+Number(b.amount||0),0); }
function sortExpenses(list){ return [...list].sort((a,b)=> toDateObj(b.date,b.time)-toDateObj(a.date,a.time)); }
function userBase(){ return doc(db,'users',state.user.uid); }
function expensesCol(){ return collection(db,'users',state.user.uid,'expenses'); }
function settingsDoc(){ return doc(db,'users',state.user.uid,'settings','main'); }
function cleanup(){ state.unsub.forEach(u=>u&&u()); state.unsub=[]; }

getRedirectResult(auth).catch(()=>{});
$('loginBtn').onclick = async()=>{
  try { await signInWithPopup(auth, provider); }
  catch(e){ await signInWithRedirect(auth, provider); }
};
$('logoutBtn').onclick = async()=>{ if(confirmAction('هل تريد تسجيل الخروج؟')) await signOut(auth); };

onAuthStateChanged(auth, async(user)=>{
  cleanup(); state.user=user;
  $('loginBtn').classList.toggle('hidden',!!user);
  $('logoutBtn').classList.toggle('hidden',!user);
  $('syncStatus').textContent = user ? 'متصل بالسحابة' : 'غير متصل';
  if(!user){ state.expenses=[]; renderAll(); return; }
  await setDoc(userBase(), {email:user.email, displayName:user.displayName||'', updatedAt:serverTimestamp()}, {merge:true});
  state.unsub.push(onSnapshot(settingsDoc(), snap=>{
    if(snap.exists()) state.settings = {...state.settings, ...snap.data()};
    else setDoc(settingsDoc(), state.settings, {merge:true});
    fillSettings(); renderAll();
  }));
  state.unsub.push(onSnapshot(query(expensesCol(), orderBy('dateTime','desc')), snap=>{
    state.expenses = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderAll();
  }, err=>{ console.error(err); toast('تحقق من قواعد Firestore والاتصال'); }));
});

function nav(view){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  $(`view-${view}`).classList.add('active');
  document.querySelectorAll('.bottom-nav button[data-nav]').forEach(b=>b.classList.toggle('active', b.dataset.nav===view));
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>nav(b.dataset.nav));
document.querySelectorAll('[data-open-expense]').forEach(b=>b.onclick=()=>openExpense());
document.querySelectorAll('[data-close-dialog]').forEach(b=>b.onclick=()=>$('expenseDialog').close());

function openExpense(exp=null){
  if(!state.user){ toast('سجل الدخول أولاً'); return; }
  $('expenseForm').reset(); $('expenseId').value=''; $('deleteExpenseBtn').classList.add('hidden');
  $('expenseDialogTitle').textContent = exp ? 'تعديل العملية' : 'إضافة مصروف';
  const d = exp?.date || todayISO();
  $('amount').value = exp?.amount ?? '';
  $('category').value = exp?.category || '';
  $('beneficiary').value = exp?.beneficiary || '';
  $('place').value = exp?.place || '';
  $('date').value = d;
  $('time').value = exp?.time || nowTime();
  $('dayName').value = exp?.dayName || dayNameFromDate(d);
  $('notes').value = exp?.notes || '';
  if(exp){ $('expenseId').value=exp.id; $('deleteExpenseBtn').classList.remove('hidden'); }
  $('expenseDialog').showModal();
}
$('date').addEventListener('change', ()=> $('dayName').value = dayNameFromDate($('date').value));

$('expenseForm').addEventListener('submit', async(e)=>{
  e.preventDefault();
  if(!state.user){ toast('سجل الدخول أولاً'); return; }
  const id = $('expenseId').value;
  const amount = Number($('amount').value);
  const payload = {
    amount,
    category:$('category').value.trim(), beneficiary:$('beneficiary').value.trim(), place:$('place').value.trim(), notes:$('notes').value.trim(),
    date:$('date').value, time:$('time').value, dayName:$('dayName').value.trim() || dayNameFromDate($('date').value),
    dateTime: toDateObj($('date').value,$('time').value).toISOString(), updatedAt:serverTimestamp()
  };
  if(!payload.amount || !payload.category || !payload.date || !payload.time){ toast('أكمل الحقول الأساسية'); return; }
  const old = id ? state.expenses.find(x=>x.id===id) : null;
  const delta = id ? (amount - Number(old?.amount||0)) : amount;
  const mr = monthRange(toDateObj(payload.date,payload.time));
  const monthTotal = sum(state.expenses.filter(x=> inRange(x,mr.start,mr.end) && x.id!==id));
  if(state.settings.monthlyBudget > 0 && monthTotal + amount > state.settings.monthlyBudget){
    toast('الميزانية لا تكفي. عدل الميزانية من الإعدادات.'); return;
  }
  if(!confirmAction(id ? 'تأكيد حفظ التعديل؟' : 'تأكيد إضافة المصروف؟')) return;
  if(id) await updateDoc(doc(expensesCol(), id), payload); else await addDoc(expensesCol(), {...payload, createdAt:serverTimestamp()});
  $('expenseDialog').close(); toast(id?'تم تعديل العملية':'تمت إضافة المصروف');
});
$('deleteExpenseBtn').onclick = async()=>{
  const id=$('expenseId').value; if(!id) return;
  if(!confirmAction('هل أنت متأكد من حذف هذه العملية؟')) return;
  await deleteDoc(doc(expensesCol(), id)); $('expenseDialog').close(); toast('تم حذف العملية');
};

function renderAll(){ renderHome(); renderLists(); renderFilters(); renderCharts(); }
function renderHome(){
  const now = new Date(); const tkey=todayISO(); const wr=weekRange(now); const mr=monthRange(now);
  const today = state.expenses.filter(e=>e.date===tkey); const week=state.expenses.filter(e=>inRange(e,wr.start,wr.end)); const month=state.expenses.filter(e=>inRange(e,mr.start,mr.end));
  const st=sum(today), sw=sum(week), sm=sum(month); const budget = Number(state.settings.monthlyBudget||0); const remaining = budget - sm;
  $('todayTotal').textContent=money(st); $('weekTotal').textContent=money(sw); $('monthTotal').textContent=money(sm); $('countTotal').textContent=fmtNum(state.expenses.length); $('budgetRemaining').textContent=money(remaining);
  $('budgetNote').textContent = budget ? `المستخدم من الميزانية: ${money(sm)}` : 'اضبط الميزانية من الإعدادات';
  $('todayLimitText').textContent=`الحد اليومي: ${money(state.settings.dailyLimit)}`; $('weekLimitText').textContent=`الحد الأسبوعي: ${money(state.settings.weeklyLimit)}`; $('monthLimitText').textContent=`الميزانية: ${money(budget)}`;
  setCardStatus($('todayCard'),st,state.settings.dailyLimit); setCardStatus($('weekCard'),sw,state.settings.weeklyLimit); setCardStatus($('monthCard'),sm,budget);
}
function setCardStatus(el,total,limit){ el.classList.remove('ok','warn','bad'); if(!limit){el.classList.add('neutral'); return;} const r=total/limit; el.classList.add(r>=1?'bad':r>=.8?'warn':'ok'); }
function itemHtml(e){ return `<div class="item" data-id="${e.id}"><div><strong>${escapeHtml(e.category||'-')}</strong><div class="meta">${escapeHtml(e.beneficiary||'بدون مستفيد')} · ${escapeHtml(e.place||'بدون مكان')}</div><div class="meta">${e.date} · ${e.time||''} · ${escapeHtml(e.dayName||'')}</div></div><div class="amount">${money(e.amount)}</div></div>`; }
function renderLists(){
  const recent = sortExpenses(state.expenses).slice(0,5);
  $('recentList').innerHTML = recent.length ? recent.map(itemHtml).join('') : 'لا توجد عمليات بعد.';
  $('recentList').classList.toggle('empty', !recent.length);
  renderTransactions();
  document.querySelectorAll('.item').forEach(el=>el.onclick=()=>{ const e=state.expenses.find(x=>x.id===el.dataset.id); if(e) openExpense(e); });
}
function currentFiltered(){
  const txt = $('filterText')?.value.trim().toLowerCase() || ''; const useDate=$('useDateFilter')?.checked; const from=$('filterFrom')?.value; const to=$('filterTo')?.value;
  let list=[...state.expenses];
  if(useDate && from && to){ const s=toDateObj(from,'00:00'), e=toDateObj(to,'23:59'); list=list.filter(x=>inRange(x,s,e)); }
  if(txt){
    const fields=[]; if($('searchCategory').checked)fields.push('category'); if($('searchBeneficiary').checked)fields.push('beneficiary'); if($('searchPlace').checked)fields.push('place'); if($('searchNotes').checked)fields.push('notes');
    list=list.filter(x=>fields.some(f=>(x[f]||'').toLowerCase().includes(txt)));
  }
  return sortExpenses(list);
}
function renderFilters(){ if(!$('filterFrom').value) {$('filterFrom').value=todayISO(); $('filterTo').value=todayISO();} }
function renderTransactions(){
  const list=currentFiltered(); $('filteredSum').textContent=money(sum(list)); $('filteredCount').textContent=`${fmtNum(list.length)} عملية`;
  $('transactionsList').innerHTML = list.length ? list.map(itemHtml).join('') : 'لا توجد نتائج.'; $('transactionsList').classList.toggle('empty',!list.length);
}
['filterFrom','filterTo','filterText','useDateFilter','searchCategory','searchBeneficiary','searchPlace','searchNotes'].forEach(id=>setTimeout(()=>$((id))?.addEventListener('input',()=>{renderTransactions(); bindItems();}),0));
function bindItems(){ document.querySelectorAll('.item').forEach(el=>el.onclick=()=>{ const e=state.expenses.find(x=>x.id===el.dataset.id); if(e) openExpense(e); }); }

function fillSettings(){ $('dailyLimit').value=state.settings.dailyLimit||0; $('weeklyLimit').value=state.settings.weeklyLimit||0; $('monthlyBudget').value=state.settings.monthlyBudget||0; $('currency').value=state.settings.currency||'SAR'; }
$('settingsForm').addEventListener('submit', async(e)=>{ e.preventDefault(); if(!state.user)return toast('سجل الدخول أولاً'); if(!confirmAction('تأكيد حفظ الإعدادات؟'))return; await setDoc(settingsDoc(),{dailyLimit:Number($('dailyLimit').value||0),weeklyLimit:Number($('weeklyLimit').value||0),monthlyBudget:Number($('monthlyBudget').value||0),currency:$('currency').value.trim()||'SAR',updatedAt:serverTimestamp()},{merge:true}); toast('تم حفظ الإعدادات'); });

function drawLine(canvas, labels, values){
  const ctx=canvas.getContext('2d'), w=canvas.clientWidth||600, h=Number(canvas.getAttribute('height'))||145, dpr=window.devicePixelRatio||1; canvas.width=w*dpr; canvas.height=h*dpr; ctx.scale(dpr,dpr); ctx.clearRect(0,0,w,h);
  const pad=28, max=Math.max(...values,1); ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=1; for(let i=0;i<4;i++){ const y=pad+(h-pad*2)*i/3; ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(w-pad,y);ctx.stroke(); }
  const pts=values.map((v,i)=>({x:pad+(w-pad*2)*(values.length===1?0.5:i/(values.length-1)), y:h-pad-(v/max)*(h-pad*2)}));
  ctx.strokeStyle='#0f766e'; ctx.lineWidth=3; ctx.beginPath(); pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); ctx.stroke();
  ctx.fillStyle='#14b8a6'; pts.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();});
  ctx.fillStyle='#64748b'; ctx.font='11px system-ui'; ctx.textAlign='center'; labels.forEach((l,i)=>{ if(i%Math.ceil(labels.length/6)===0 || labels.length<=6) ctx.fillText(l, pts[i].x, h-8); });
}
function groupByHour(list){ const labels=Array.from({length:24},(_,i)=>String(i).padStart(2,'0')); const vals=labels.map(()=>0); list.forEach(e=>{const h=Number((e.time||'00:00').slice(0,2)); vals[h]+=Number(e.amount||0);}); return {labels,vals}; }
function groupByWeekDays(list,wr){ const labels=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; const vals=labels.map(()=>0); list.forEach(e=>{ vals[toDateObj(e.date,e.time).getDay()]+=Number(e.amount||0); }); return {labels,vals}; }
function groupByMonthDays(list,mr){ const days=new Date(mr.end).getDate(); const labels=Array.from({length:days},(_,i)=>String(i+1)); const vals=labels.map(()=>0); list.forEach(e=>{ vals[toDateObj(e.date,e.time).getDate()-1]+=Number(e.amount||0); }); return {labels,vals}; }
function renderCharts(){ const now=new Date(), wr=weekRange(now), mr=monthRange(now); const today=state.expenses.filter(e=>e.date===todayISO()), week=state.expenses.filter(e=>inRange(e,wr.start,wr.end)), month=state.expenses.filter(e=>inRange(e,mr.start,mr.end)); let g=groupByHour(today); drawLine($('chartToday'),g.labels,g.vals); g=groupByWeekDays(week,wr); drawLine($('chartWeek'),g.labels,g.vals); g=groupByMonthDays(month,mr); drawLine($('chartMonth'),g.labels,g.vals); }
window.addEventListener('resize', renderCharts);

$('exportCsvBtn').onclick=()=> exportCSV(currentFiltered(),'masroofi_search.csv');
function exportCSV(list, filename){ const rows=[['amount','category','beneficiary','place','date','time','day','notes'],...list.map(e=>[e.amount,e.category,e.beneficiary,e.place,e.date,e.time,e.dayName,e.notes])]; const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n'); downloadBlob(csv,filename,'text/csv;charset=utf-8'); }
function downloadBlob(content,filename,type){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([content],{type})); a.download=filename; a.click(); URL.revokeObjectURL(a.href); }
$('backupJsonBtn').onclick=()=> downloadBlob(JSON.stringify({settings:state.settings, expenses:state.expenses},null,2),'masroofi_backup.json','application/json');
$('restoreJsonInput').onchange=async(e)=>{ const file=e.target.files[0]; if(!file||!state.user)return; if(!confirmAction('سيتم استيراد العمليات إلى حسابك. هل تريد المتابعة؟'))return; const data=JSON.parse(await file.text()); const batch=writeBatch(db); if(data.settings) batch.set(settingsDoc(),data.settings,{merge:true}); (data.expenses||[]).forEach(x=>{const ref=doc(expensesCol()); const {id,...rest}=x; batch.set(ref,{...rest,updatedAt:serverTimestamp()});}); await batch.commit(); toast('تمت الاستعادة'); };
$('printSearchBtn').onclick=()=> printReport('تقرير البحث', currentFiltered());
document.querySelectorAll('[data-report]').forEach(btn=>btn.onclick=()=>{ const type=btn.dataset.report, now=new Date(); let title='', list=[]; if(type==='daily'){title='التقرير اليومي'; list=state.expenses.filter(e=>e.date===todayISO());} if(type==='weekly'){title='التقرير الأسبوعي'; const r=weekRange(now); list=state.expenses.filter(e=>inRange(e,r.start,r.end));} if(type==='monthly'){title='التقرير الشهري'; const r=monthRange(now); list=state.expenses.filter(e=>inRange(e,r.start,r.end));} printReport(title, sortExpenses(list)); });
function printReport(title,list){
  const rows=list.map(e=>`<tr><td>${e.date}</td><td>${e.time||''}</td><td>${escapeHtml(e.category||'')}</td><td>${escapeHtml(e.beneficiary||'')}</td><td>${escapeHtml(e.place||'')}</td><td>${money(e.amount)}</td></tr>`).join('');
  const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{margin:0 0 12px}.summary{display:flex;gap:12px;margin:16px 0}.box{border:1px solid #ddd;border-radius:12px;padding:12px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ddd;padding:8px;text-align:right}th{background:#f3f4f6}.ltr{direction:ltr;text-align:left}@media print{button{display:none}}</style></head><body><h1>${title}</h1><p>${new Date().toLocaleString('en-US')}</p><div class="summary"><div class="box">عدد العمليات: ${fmtNum(list.length)}</div><div class="box">الإجمالي: ${money(sum(list))}</div></div><table><thead><tr><th>التاريخ</th><th>الوقت</th><th>التصنيف</th><th>المستفيد</th><th>المكان</th><th>المبلغ</th></tr></thead><tbody>${rows||'<tr><td colspan="6">لا توجد عمليات</td></tr>'}</tbody></table><p>الرسوم البيانية موجودة داخل صفحة التطبيق وتتحدث تلقائيًا حسب البيانات الحالية.</p><button onclick="print()">طباعة / حفظ PDF</button></body></html>`;
  const w=window.open('','_blank'); w.document.write(html); w.document.close(); setTimeout(()=>w.print(),500);
}
function escapeHtml(s){ return String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js').catch(()=>{}); }
renderFilters(); renderAll();
