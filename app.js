import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import { initializeAuth, browserLocalPersistence, browserPopupRedirectResolver, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
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
const auth = initializeAuth(app, {
  persistence: browserLocalPersistence,
  popupRedirectResolver: browserPopupRedirectResolver
});
const db = getFirestore(app);
enableIndexedDbPersistence(db).catch(()=>{});
const provider = new GoogleAuthProvider();

const $ = (id)=>document.getElementById(id);
const state = { user:null, expenses:[], settings:{dailyLimit:0,weeklyLimit:0,monthlyBudget:0,currency:'SAR'}, unsub:[], quickDetail:null };
const arDays = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const fmtNum = (n)=> Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2});
function displayTime(time){
  if(!time) return '';
  const [hh='0', mm='00'] = String(time).split(':');
  let h = Number(hh);
  if(!Number.isFinite(h)) return time;
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(mm).padStart(2,'0')} ${suffix}`;
}
function displayDateTime(e){
  return `${e.date || ''} · ${displayTime(e.time)} · ${escapeHtml(e.dayName||'')}`;
}
function hourLabel(i){
  const suffix = i >= 12 ? 'PM' : 'AM';
  const h = i % 12 || 12;
  return `${h}${suffix}`;
}
function setSyncStatus(isOnline){
  const el = $('syncStatus');
  if(!el) return;
  el.textContent = isOnline ? 'متصل' : 'غير متصل';
  el.classList.toggle('online', !!isOnline);
  el.classList.toggle('offline', !isOnline);
}
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

// إعداد تسجيل الدخول بحساب Google
// نسخة مستقرة: نحاول Popup أولاً لأنه أنسب مع GitHub Pages، ونستخدم Redirect كخطة بديلة.
auth.languageCode = 'ar';
provider.addScope('email');
provider.addScope('profile');
provider.setCustomParameters({ prompt: 'select_account' });

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});
window.addEventListener('error', (event) => {
  console.error('JavaScript error:', event.message, event.error);
});

function showAuthError(prefix, e) {
  console.error(prefix, e);
  const code = e?.code || '';
  const message = e?.message || e;
  alert(`${prefix}: ${code} - ${message}`);
}

async function startLogin() {
  try {
    $('loginBtn').disabled = true;
    toast('جاري فتح تسجيل الدخول...');

    // Popup يعمل بشكل أفضل مع GitHub Pages لأنه لا يعتمد على استرجاع جلسة Redirect بين نطاقين.
    try {
      await signInWithPopup(auth, provider);
      return;
    } catch (popupError) {
      console.warn('Popup sign-in failed, trying redirect...', popupError);
      const fallbackCodes = new Set([
        'auth/popup-blocked',
        'auth/popup-closed-by-user',
        'auth/cancelled-popup-request',
        'auth/operation-not-supported-in-this-environment'
      ]);

      // إذا كان الخطأ إعدادات مثل unauthorized-domain نعرضه مباشرة بدل التحويل.
      if (!fallbackCodes.has(popupError?.code)) {
        throw popupError;
      }

      toast('سيتم تحويلك إلى Google لتسجيل الدخول...');
      await signInWithRedirect(auth, provider);
    }
  } catch (e) {
    showAuthError('تعذر بدء تسجيل الدخول', e);
  } finally {
    $('loginBtn').disabled = false;
  }
}

$('loginBtn').onclick = startLogin;
$('logoutBtn').onclick = async()=>{ if(confirmAction('هل تريد تسجيل الخروج؟')) await signOut(auth); };

async function bootAuth(){
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) toast('تم تسجيل الدخول بنجاح');
  } catch (e) {
    showAuthError('خطأ في نتيجة تسجيل الدخول', e);
  }

  onAuthStateChanged(auth, async(user)=>{
    cleanup(); state.user=user;
    $('loginBtn').classList.toggle('hidden',!!user);
    $('logoutBtn').classList.toggle('hidden',!user);
    setSyncStatus(!!user);
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
}
bootAuth();

function nav(view){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  $(`view-${view}`).classList.add('active');
  document.querySelectorAll('.bottom-nav button[data-nav]').forEach(b=>b.classList.toggle('active', b.dataset.nav===view));
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>nav(b.dataset.nav));
document.querySelectorAll('[data-open-expense]').forEach(b=>b.onclick=()=>openExpense());
document.querySelectorAll('[data-close-dialog]').forEach(b=>b.onclick=()=>$('expenseDialog').close());
document.querySelectorAll('[data-quick-detail]').forEach(el=>{
  el.addEventListener('click',()=>openQuickDetails(el.dataset.quickDetail));
  el.addEventListener('keydown',(e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openQuickDetails(el.dataset.quickDetail); } });
});
document.querySelectorAll('[data-close-quick-details]').forEach(b=>b.onclick=()=>$('quickDetailsDialog').close());
$('quickDetailsCsvBtn').onclick=()=>{ const d=getQuickDetailData(state.quickDetail||'all'); exportCSV(d.list, d.filename.replace('.pdf','.csv')); };
$('quickDetailsPdfBtn').onclick=()=>{ const d=getQuickDetailData(state.quickDetail||'all'); printReport(d.title, d.list, {chartTitle:d.chartTitle, chartMode:d.group}); };

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
$('amount').addEventListener('keydown', (e)=>{
  if(['e','E','+','-'].includes(e.key)) e.preventDefault();
});
$('amount').addEventListener('input', ()=>{
  const clean = $('amount').value.replace(/[^0-9.]/g,'').replace(/(\..*)\./g,'$1');
  if($('amount').value !== clean) $('amount').value = clean;
});

$('expenseForm').addEventListener('submit', async(e)=>{
  e.preventDefault();
  if(!state.user){ toast('سجل الدخول أولاً'); return; }
  const id = $('expenseId').value;
  const rawAmount = String($('amount').value).trim();
  const amount = Number(rawAmount);
  if(!rawAmount || !Number.isFinite(amount) || amount <= 0){
    alert('حقل المبلغ يجب أن يكون رقمًا صحيحًا أكبر من صفر.');
    $('amount').focus();
    return;
  }
  const payload = {
    amount,
    category:$('category').value.trim(), beneficiary:$('beneficiary').value.trim(), place:$('place').value.trim(), notes:$('notes').value.trim(),
    date:$('date').value, time:$('time').value, dayName:$('dayName').value.trim() || dayNameFromDate($('date').value),
    dateTime: toDateObj($('date').value,$('time').value).toISOString(), updatedAt:serverTimestamp()
  };
  if(!payload.amount || !payload.category || !payload.beneficiary || !payload.place || !payload.date || !payload.time){ alert('أكمل جميع الحقول المطلوبة قبل الحفظ. الملاحظات فقط اختيارية.'); return; }
  const old = id ? state.expenses.find(x=>x.id===id) : null;
  const delta = id ? (amount - Number(old?.amount||0)) : amount;
  const mr = monthRange(toDateObj(payload.date,payload.time));
  const monthTotal = sum(state.expenses.filter(x=> inRange(x,mr.start,mr.end) && x.id!==id));
  if(state.settings.monthlyBudget > 0 && monthTotal + amount > state.settings.monthlyBudget){
    alert('الميزانية لا تكفي. عدّل الميزانية من صفحة الإعدادات ثم أعد المحاولة.');
    return;
  }
  if(!confirmAction(id ? 'تأكيد حفظ التعديل؟' : 'تأكيد إضافة المصروف؟')) return;
  try{
    if(id) await updateDoc(doc(expensesCol(), id), payload); else await addDoc(expensesCol(), {...payload, createdAt:serverTimestamp()});
    $('expenseDialog').close(); toast(id?'تم تعديل العملية':'تمت إضافة المصروف');
  }catch(err){
    console.error(err);
    alert('تعذر حفظ العملية. تحقق من الاتصال أو صلاحيات Firestore.\n' + (err?.message || err));
  }
});
$('deleteExpenseBtn').onclick = async()=>{
  const id=$('expenseId').value; if(!id) return;
  if(!confirmAction('هل أنت متأكد من حذف هذه العملية؟')) return;
  await deleteDoc(doc(expensesCol(), id)); $('expenseDialog').close(); toast('تم حذف العملية');
};


function getQuickDetailData(type){
  const now=new Date();
  const wr=weekRange(now), mr=monthRange(now);
  let title='تفاصيل العمليات', list=[], chartTitle='الرسم البياني', filename='masroofi_details.pdf', group='date';
  if(type==='today'){
    title='عمليات اليوم'; list=state.expenses.filter(e=>e.date===todayISO()); chartTitle='مصروفات اليوم حسب الساعة'; filename='masroofi_today.pdf'; group='hour';
  } else if(type==='week'){
    title='عمليات الأسبوع'; list=state.expenses.filter(e=>inRange(e,wr.start,wr.end)); chartTitle='مصروفات الأسبوع من الأحد إلى السبت'; filename='masroofi_week.pdf'; group='week';
  } else if(type==='month'){
    title='عمليات الشهر'; list=state.expenses.filter(e=>inRange(e,mr.start,mr.end)); chartTitle='مصروفات الشهر حسب الأيام'; filename='masroofi_month.pdf'; group='month';
  } else {
    title='جميع العمليات'; list=[...state.expenses]; chartTitle='جميع العمليات حسب التاريخ'; filename='masroofi_all_transactions.pdf'; group='date';
  }
  return {type,title,list:sortExpenses(list),chartTitle,filename,group};
}
function groupByDate(list){
  const map=new Map();
  sortExpenses(list).slice().reverse().forEach(e=>{ map.set(e.date,(map.get(e.date)||0)+Number(e.amount||0)); });
  const entries=[...map.entries()];
  if(!entries.length) return {labels:['-'], vals:[0]};
  const shown=entries.slice(-14);
  return {labels:shown.map(x=>x[0].slice(5)), vals:shown.map(x=>x[1])};
}
function quickChartData(detail){
  const now=new Date(); const wr=weekRange(now), mr=monthRange(now);
  if(detail.group==='hour') return groupByHour(detail.list);
  if(detail.group==='week') return groupByWeekDays(detail.list,wr);
  if(detail.group==='month') return groupByMonthDays(detail.list,mr);
  return groupByDate(detail.list);
}
function openQuickDetails(type){
  if(!state.user){ toast('سجل الدخول أولاً'); return; }
  state.quickDetail=type||'all';
  const d=getQuickDetailData(state.quickDetail);
  $('quickDetailsTitle').textContent=d.title;
  $('quickDetailsChartTitle').textContent=d.chartTitle;
  $('quickDetailsSum').textContent=money(sum(d.list));
  $('quickDetailsCount').textContent=`${fmtNum(d.list.length)} عملية`;
  $('quickDetailsList').innerHTML=d.list.length ? d.list.map(itemHtml).join('') : 'لا توجد عمليات.';
  $('quickDetailsList').classList.toggle('empty', !d.list.length);
  $('quickDetailsDialog').showModal();
  setTimeout(()=>{ const g=quickChartData(d); drawLine($('quickDetailsChart'),g.labels,g.vals); bindItems(); }, 80);
}

function renderAll(){ renderHome(); renderLists(); renderFilters(); renderCharts(); if(state.quickDetail && $('quickDetailsDialog')?.open){ const d=getQuickDetailData(state.quickDetail); $('quickDetailsSum').textContent=money(sum(d.list)); $('quickDetailsCount').textContent=`${fmtNum(d.list.length)} عملية`; $('quickDetailsList').innerHTML=d.list.length ? d.list.map(itemHtml).join('') : 'لا توجد عمليات.'; const g=quickChartData(d); drawLine($('quickDetailsChart'),g.labels,g.vals); } }
function renderHome(){
  const now = new Date(); const tkey=todayISO(); const wr=weekRange(now); const mr=monthRange(now);
  const today = state.expenses.filter(e=>e.date===tkey); const week=state.expenses.filter(e=>inRange(e,wr.start,wr.end)); const month=state.expenses.filter(e=>inRange(e,mr.start,mr.end));
  const st=sum(today), sw=sum(week), sm=sum(month); const budget = Number(state.settings.monthlyBudget||0); const remaining = budget - sm;
  $('todayTotal').textContent=money(st); $('weekTotal').textContent=money(sw); $('monthTotal').textContent=money(sm); $('countTotal').textContent=fmtNum(state.expenses.length); $('budgetRemaining').textContent=money(remaining);
  $('budgetNote').textContent = budget ? `المستخدم من الميزانية: ${money(sm)}` : 'اضبط الميزانية من الإعدادات';
  $('todayLimitText').textContent=`الحد اليومي: ${money(state.settings.dailyLimit)}`; $('weekLimitText').textContent=`الحد الأسبوعي: ${money(state.settings.weeklyLimit)}`; $('monthLimitText').textContent=`الميزانية: ${money(budget)}`;
  setCardStatus($('todayCard'),st,state.settings.dailyLimit); setCardStatus($('weekCard'),sw,state.settings.weeklyLimit); setCardStatus($('monthCard'),sm,budget);
}
function setCardStatus(el,total,limit){ el.classList.remove('ok','warn','bad','neutral'); if(!limit){el.classList.add('neutral'); return;} const r=total/limit; el.classList.add(r>1?'bad':r>=.5?'warn':'ok'); }
function itemHtml(e){ return `<div class="item" data-id="${e.id}"><div><strong>${escapeHtml(e.category||'-')}</strong><div class="meta">${escapeHtml(e.beneficiary||'بدون مستفيد')} · ${escapeHtml(e.place||'بدون مكان')}</div><div class="meta">${displayDateTime(e)}</div></div><div class="amount">${money(e.amount)}</div></div>`; }
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
  const ctx=canvas.getContext('2d');
  const w=Math.max(canvas.parentElement?.clientWidth || canvas.clientWidth || 600, 280);
  const h=145;
  const dpr=window.devicePixelRatio||1;
  canvas.style.height=h+'px';
  canvas.width=w*dpr; canvas.height=h*dpr; ctx.scale(dpr,dpr); ctx.clearRect(0,0,w,h);
  const padL=38, padR=14, padT=16, padB=26;
  const maxRaw=Math.max(...values,0);
  const max=maxRaw>0 ? maxRaw*1.18 : 1;
  ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=1;
  ctx.fillStyle='#64748b'; ctx.font='10px system-ui'; ctx.textAlign='left';
  for(let i=0;i<4;i++){
    const y=padT+(h-padT-padB)*i/3;
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(w-padR,y); ctx.stroke();
    const val=max-(max*i/3); ctx.fillText(fmtNum(val),4,y+3);
  }
  const pts=values.map((v,i)=>({
    x:padL+(w-padL-padR)*(values.length===1?0.5:i/(values.length-1)),
    y:h-padB-(Math.max(0,v)/max)*(h-padT-padB)
  }));
  ctx.strokeStyle='#0f766e'; ctx.lineWidth=3; ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.beginPath(); pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); ctx.stroke();
  ctx.fillStyle='#14b8a6'; pts.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,3.5,0,Math.PI*2);ctx.fill();});
  ctx.fillStyle='#64748b'; ctx.font='10px system-ui'; ctx.textAlign='center';
  const step=Math.max(1,Math.ceil(labels.length/6));
  labels.forEach((l,i)=>{ if(i%step===0 || labels.length<=6) ctx.fillText(l, pts[i].x, h-8); });
}

function svgLine(labels, values, title){
  const w=720, h=210, padL=54, padR=24, padT=34, padB=36;
  const maxRaw=Math.max(...values,0); const max=maxRaw>0?maxRaw*1.18:1;
  const pts=values.map((v,i)=>({x:padL+(w-padL-padR)*(values.length===1?0.5:i/(values.length-1)), y:h-padB-(Math.max(0,v)/max)*(h-padT-padB)}));
  const line=pts.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ');
  const step=Math.max(1,Math.ceil(labels.length/6));
  const xlabels=labels.map((l,i)=> (i%step===0 || labels.length<=6) ? `<text x="${pts[i].x.toFixed(1)}" y="${h-10}" text-anchor="middle" font-size="11" fill="#64748b">${escapeHtml(l)}</text>` : '').join('');
  const grids=[0,1,2,3].map(i=>{const y=padT+(h-padT-padB)*i/3; return `<line x1="${padL}" y1="${y}" x2="${w-padR}" y2="${y}" stroke="#e2e8f0"/><text x="8" y="${y+4}" font-size="11" fill="#64748b">${fmtNum(max-(max*i/3))}</text>`}).join('');
  const circles=pts.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#14b8a6"/>`).join('');
  return `<div class="chart-print"><h3>${escapeHtml(title)}</h3><svg viewBox="0 0 ${w} ${h}" width="100%" height="210" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" rx="18" fill="#ffffff" stroke="#e2e8f0"/>${grids}<path d="${line}" fill="none" stroke="#0f766e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${circles}${xlabels}</svg></div>`;
}

function groupByHour(list){ const labels=Array.from({length:24},(_,i)=>hourLabel(i)); const vals=labels.map(()=>0); list.forEach(e=>{const h=Number((e.time||'00:00').slice(0,2)); vals[h]+=Number(e.amount||0);}); return {labels,vals}; }
function groupByWeekDays(list,wr){ const labels=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; const vals=labels.map(()=>0); list.forEach(e=>{ vals[toDateObj(e.date,e.time).getDay()]+=Number(e.amount||0); }); return {labels,vals}; }
function groupByMonthDays(list,mr){ const days=new Date(mr.end).getDate(); const labels=Array.from({length:days},(_,i)=>String(i+1)); const vals=labels.map(()=>0); list.forEach(e=>{ vals[toDateObj(e.date,e.time).getDate()-1]+=Number(e.amount||0); }); return {labels,vals}; }
function renderCharts(){ const now=new Date(), wr=weekRange(now), mr=monthRange(now); const today=state.expenses.filter(e=>e.date===todayISO()), week=state.expenses.filter(e=>inRange(e,wr.start,wr.end)), month=state.expenses.filter(e=>inRange(e,mr.start,mr.end)); let g=groupByHour(today); drawLine($('chartToday'),g.labels,g.vals); g=groupByWeekDays(week,wr); drawLine($('chartWeek'),g.labels,g.vals); g=groupByMonthDays(month,mr); drawLine($('chartMonth'),g.labels,g.vals); }
window.addEventListener('resize', ()=>{ renderCharts(); if(state.quickDetail && $('quickDetailsDialog')?.open){ const d=getQuickDetailData(state.quickDetail); const g=quickChartData(d); drawLine($('quickDetailsChart'),g.labels,g.vals); } });

$('exportCsvBtn').onclick=()=> exportCSV(currentFiltered(),'masroofi_search.csv');
function exportCSV(list, filename){ const rows=[['amount','category','beneficiary','place','date','time','day','notes'],...list.map(e=>[e.amount,e.category,e.beneficiary,e.place,e.date,displayTime(e.time),e.dayName,e.notes])]; const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n'); downloadBlob(csv,filename,'text/csv;charset=utf-8'); }
function downloadBlob(content,filename,type){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([content],{type})); a.download=filename; a.click(); URL.revokeObjectURL(a.href); }
$('backupJsonBtn').onclick=()=> downloadBlob(JSON.stringify({settings:state.settings, expenses:state.expenses},null,2),'masroofi_backup.json','application/json');
$('restoreJsonInput').onchange=async(e)=>{ const file=e.target.files[0]; if(!file||!state.user)return; if(!confirmAction('سيتم استيراد العمليات إلى حسابك. هل تريد المتابعة؟'))return; const data=JSON.parse(await file.text()); const batch=writeBatch(db); if(data.settings) batch.set(settingsDoc(),data.settings,{merge:true}); (data.expenses||[]).forEach(x=>{const ref=doc(expensesCol()); const {id,...rest}=x; batch.set(ref,{...rest,updatedAt:serverTimestamp()});}); await batch.commit(); toast('تمت الاستعادة'); };
$('printSearchBtn').onclick=()=> printReport('تقرير البحث', currentFiltered(), {chartTitle:'رسم نتائج البحث', chartMode:'auto'});
document.querySelectorAll('[data-report]').forEach(btn=>btn.onclick=()=>{ const type=btn.dataset.report, now=new Date(); let title='', list=[], chartMode='auto', chartTitle='الرسم البياني'; if(type==='daily'){title='التقرير اليومي'; list=state.expenses.filter(e=>e.date===todayISO()); chartMode='hour'; chartTitle='مصروفات اليوم حسب الساعة';} if(type==='weekly'){title='التقرير الأسبوعي'; const r=weekRange(now); list=state.expenses.filter(e=>inRange(e,r.start,r.end)); chartMode='week'; chartTitle='مصروفات الأسبوع من الأحد إلى السبت';} if(type==='monthly'){title='التقرير الشهري'; const r=monthRange(now); list=state.expenses.filter(e=>inRange(e,r.start,r.end)); chartMode='month'; chartTitle='مصروفات الشهر حسب الأيام';} printReport(title, sortExpenses(list), {chartTitle, chartMode}); });
function reportChartData(list, mode='auto'){
  const sorted=sortExpenses(list);
  if(mode==='hour') return groupByHour(sorted);
  if(mode==='week') return groupByWeekDays(sorted);
  if(mode==='month') {
    const first = sorted[0] ? toDateObj(sorted[0].date, sorted[0].time) : new Date();
    return groupByMonthDays(sorted, monthRange(first));
  }
  if(mode==='date') return groupByDate(sorted);
  const uniqueDates = new Set(sorted.map(e=>e.date).filter(Boolean));
  if(uniqueDates.size === 1) return groupByHour(sorted);
  return groupByDate(sorted);
}
function printReport(title,list, options={}){
  const sorted=sortExpenses(list);
  const rows=sorted.map(e=>`<tr><td class="ltr">${e.date}</td><td>${displayTime(e.time)}</td><td>${escapeHtml(e.category||'')}</td><td>${escapeHtml(e.beneficiary||'')}</td><td>${escapeHtml(e.place||'')}</td><td class="ltr">${money(e.amount)}</td></tr>`).join('');
  const chartData=reportChartData(sorted, options.chartMode || 'auto');
  const chartTitle=options.chartTitle || 'الرسم البياني للنتائج';
  const charts = svgLine(chartData.labels, chartData.vals, chartTitle);
  const createdAt = new Date().toLocaleString('en-US',{hour12:true});
  const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111;background:#fff}h1{margin:0 0 12px}.summary{display:flex;gap:12px;margin:16px 0;flex-wrap:wrap}.box{border:1px solid #ddd;border-radius:12px;padding:12px;background:#fafafa}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ddd;padding:8px;text-align:right}th{background:#f3f4f6}.ltr{direction:ltr;text-align:center}.toolbar{display:flex;gap:10px;margin:16px 0;flex-wrap:wrap}.toolbar button{border:0;border-radius:12px;padding:10px 14px;font-weight:700;background:#0f766e;color:white}.toolbar button.secondary{background:#e6fffb;color:#0f766e}.charts{margin-top:22px;display:grid;gap:14px}.chart-print{page-break-inside:avoid;border:1px solid #e5e7eb;border-radius:14px;padding:10px}.chart-print h3{margin:0 0 8px}@media print{.toolbar{display:none}body{padding:0}.chart-print{break-inside:avoid}}</style></head><body><h1>${title}</h1><p>${createdAt}</p><div class="toolbar"><button onclick="print()">طباعة / حفظ PDF</button><button class="secondary" onclick="window.close(); if(!window.closed){history.back();}">العودة للتطبيق</button></div><div class="summary"><div class="box">عدد العمليات: ${fmtNum(sorted.length)}</div><div class="box">الإجمالي: ${money(sum(sorted))}</div></div><table><thead><tr><th>التاريخ</th><th>الوقت</th><th>التصنيف</th><th>المستفيد</th><th>المكان</th><th>المبلغ</th></tr></thead><tbody>${rows||'<tr><td colspan="6">لا توجد عمليات</td></tr>'}</tbody></table><div class="charts">${charts}</div></body></html>`;
  const w=window.open('','_blank');
  if(!w){ alert('لم يتم فتح التقرير. اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى.'); return; }
  w.document.write(html); w.document.close();
}
function escapeHtml(s){ return String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }


function formatDisplayDate(value){
  if(!value) return '';
  const parts = String(value).split('-');
  if(parts.length !== 3) return value;
  return `${parts[0]}/${parts[1]}/${parts[2]}`;
}
function nativeTimePromptLabel(value){ return displayTime(value || nowTime()); }
function promptForDate(current){
  const next = window.prompt('أدخل التاريخ بصيغة YYYY/MM/DD', formatDisplayDate(current || todayISO()));
  if(!next) return null;
  const cleaned = next.trim().replaceAll('-', '/');
  const m = cleaned.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if(!m){ alert('صيغة التاريخ غير صحيحة. استخدم YYYY/MM/DD'); return null; }
  const y=m[1], mo=String(Number(m[2])).padStart(2,'0'), d=String(Number(m[3])).padStart(2,'0');
  const iso=`${y}-${mo}-${d}`;
  if(Number(mo)<1 || Number(mo)>12 || Number(d)<1 || Number(d)>31 || Number.isNaN(new Date(`${iso}T12:00:00`).getTime())){
    alert('التاريخ غير صحيح'); return null;
  }
  return iso;
}
function promptForTime(current){
  const next = window.prompt('أدخل الوقت بصيغة HH:MM AM أو HH:MM PM', nativeTimePromptLabel(current || nowTime()));
  if(!next) return null;
  const cleaned = next.trim().toUpperCase().replace(/\s+/g,' ');
  const m = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if(!m){ alert('صيغة الوقت غير صحيحة. مثال: 10:42 PM'); return null; }
  let h=Number(m[1]), mi=Number(m[2]);
  if(h<1 || h>12 || mi<0 || mi>59){ alert('الوقت غير صحيح'); return null; }
  if(m[3]==='PM' && h!==12) h+=12;
  if(m[3]==='AM' && h===12) h=0;
  return `${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}`;
}
function refreshDateTimeDisplay(raw){
  const display = raw?._displayInput;
  if(!display) return;
  if(raw.dataset.nativeType === 'date') display.value = formatDisplayDate(raw.value);
  if(raw.dataset.nativeType === 'time') display.value = displayTime(raw.value);
}
function openNativePicker(raw){
  const type = raw.dataset.nativeType;
  const picker = document.createElement('input');
  picker.type = type;
  picker.value = raw.value || (type === 'date' ? todayISO() : nowTime());
  picker.setAttribute('dir','ltr');
  picker.setAttribute('lang','en-US');
  picker.style.position='fixed';
  picker.style.left='50%';
  picker.style.top='50%';
  picker.style.width='1px';
  picker.style.height='1px';
  picker.style.opacity='0.01';
  picker.style.pointerEvents='none';
  picker.style.zIndex='-1';
  document.body.appendChild(picker);
  const cleanupPicker=()=>setTimeout(()=>picker.remove(),250);
  picker.addEventListener('change',()=>{
    raw.value = picker.value;
    refreshDateTimeDisplay(raw);
    raw.dispatchEvent(new Event('change',{bubbles:true}));
    cleanupPicker();
  }, {once:true});
  picker.addEventListener('blur', cleanupPicker, {once:true});
  try{
    picker.focus({preventScroll:true});
    if(typeof picker.showPicker === 'function') picker.showPicker();
    else picker.click();
  }catch(e){
    picker.remove();
    const val = type === 'date' ? promptForDate(raw.value) : promptForTime(raw.value);
    if(val){ raw.value = val; refreshDateTimeDisplay(raw); raw.dispatchEvent(new Event('change',{bubbles:true})); }
  }
}
function prepareNativeDateTimeInputs(){
  document.querySelectorAll('input[type="date"], input[type="time"]').forEach(raw=>{
    if(raw.dataset.enhancedPicker === '1') return;
    const type = raw.type;
    raw.dataset.nativeType = type;
    raw.dataset.enhancedPicker = '1';

    const wrap = document.createElement('span');
    wrap.className = 'picker-wrap';
    raw.parentNode.insertBefore(wrap, raw);
    wrap.appendChild(raw);

    const display = document.createElement('input');
    display.type = 'text';
    display.readOnly = true;
    display.inputMode = 'none';
    display.className = `picker-display ${type}-display`;
    display.setAttribute('dir','ltr');
    display.setAttribute('lang','en-US');
    display.setAttribute('aria-label', type === 'date' ? 'التاريخ' : 'الوقت');
    display.placeholder = type === 'date' ? 'YYYY/MM/DD' : 'HH:MM AM';
    wrap.insertBefore(display, raw);

    raw.className = `${raw.className || ''} native-picker-input`.trim();
    raw.setAttribute('dir','ltr');
    raw.setAttribute('lang','en-US');
    raw.setAttribute('aria-label', type === 'date' ? 'اختر التاريخ' : 'اختر الوقت');
    raw.tabIndex = -1;
    raw._displayInput = display;

    const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if(originalDescriptor && !raw._valuePatched){
      Object.defineProperty(raw, 'value', {
        get(){ return originalDescriptor.get.call(raw); },
        set(v){ originalDescriptor.set.call(raw, v); setTimeout(()=>refreshDateTimeDisplay(raw),0); }
      });
      raw._valuePatched = true;
    }

    const openPicker = ()=>{
      try{
        raw.focus({preventScroll:true});
        if(typeof raw.showPicker === 'function') raw.showPicker();
        else raw.click();
      }catch(e){
        const val = type === 'date' ? promptForDate(raw.value) : promptForTime(raw.value);
        if(val){ raw.value = val; refreshDateTimeDisplay(raw); raw.dispatchEvent(new Event('change',{bubbles:true})); }
      }
    };
    display.addEventListener('click', openPicker);
    display.addEventListener('keydown',(e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openPicker(); } });
    raw.addEventListener('change',()=>refreshDateTimeDisplay(raw));
    raw.addEventListener('input',()=>refreshDateTimeDisplay(raw));
    refreshDateTimeDisplay(raw);
  });
}
prepareNativeDateTimeInputs();

if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js').catch(()=>{}); }
renderFilters(); renderAll();
