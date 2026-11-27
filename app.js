{
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const REPS=['Özgür Firat','Gökhan Genç','Mehmet Halici','Lütfi Kaplan','Baran Sengül'];
const DAYS=['Pazartesi','Salı','Çarşamba','Perşembe','Cuma'];
// ziyaret sıklığı ve o sıklıkta seçilebilecek haftalar (veritabanındaki set_visit() aynı listeleri doğrular)
const FREQS=['Haftalık','2 haftada 1','4 haftada 1'];
const WEEKS_OF={'Haftalık':['1, 2, 3, 4'],'2 haftada 1':['1, 3','2, 4'],'4 haftada 1':['1','2','3','4']};
const VY=['Var','Yok'];
const TYPES=['Ziyaret','Telefon','WhatsApp','Sipariş','Şikayet','Not'];
const FIELDS=['name','chain','segment','status','rep','visitDay','contact','phone','address','postcode','city','notes'];
const iso=d=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const TODAY=iso(new Date());
const addDays=n=>{const d=new Date();d.setDate(d.getDate()+n);return iso(d)};
const fmt=d=>d?String(d).split('-').reverse().join('.'):'';
const ago=d=>d?Math.round((new Date(TODAY)-new Date(d))/864e5):null;
const TODAYNAME=['','Pazartesi','Salı','Çarşamba','Perşembe','Cuma',''][new Date().getDay()];
const eur=n=>'€ '+Math.round(n||0).toLocaleString('nl-NL');
const low=s=>String(s||'').toLocaleLowerCase('tr');

/* Kayıp riski ve iade kuralları */
const RISK={dropPace:0.7,dropMin:3000,silentDays:45,silentMax:365,silentMin:1000};
let RET_WARN=0.025;
// Yönetici sekmesinden değiştirilebilen kurallar (settings/rules). Boş/geçersiz değer varsayılana düşer.
const RDEF={pasif:120,temas:30,arag:30,credDays:15,credCut:50,iade:2.5,riskPace:70,dropMin:3000,riskSilent:45,silentMax:365,silentMin:1000};
let R={...RDEF},RMETA={};
function applyRules(d){R={...RDEF};RMETA=d||{};for(const k in RDEF){const v=Number((d||{})[k]);if(Number.isFinite(v)&&v>0)R[k]=v}
  RET_WARN=R.iade/100;RISK.dropPace=R.riskPace/100;RISK.dropMin=R.dropMin;RISK.silentDays=R.riskSilent;RISK.silentMax=R.silentMax;RISK.silentMin=R.silentMin}
// Verinin tarihi: satış / iade verisinin geçerli olduğu son gün (Power BI eşitlemesi). Yoksa bugün.
const dataTo=()=>(RET&&RET.through)||(MON&&MON.through)||TODAY;
// yılın geçen kısmı (o gün dahil): bu yılın satışını geçen yılın cirosunun aynı dönemine göre kıyaslamak için
const yearFrac=d=>{const y=+d.slice(0,4),s=Date.UTC(y,0,1),n=Date.UTC(y,+d.slice(5,7)-1,+d.slice(8,10));return ((n-s)/864e5+1)/((Date.UTC(y+1,0,1)-s)/864e5)};
// YF, CY (bu yıl), PY (geçen yıl) her çizimde verinin tarihinden yeniden hesaplanır (derive)
let YF=yearFrac(TODAY),CY=+TODAY.slice(0,4),PY=CY-1;
const OUTCOMES=[['Sipariş alındı',0,''],['Tekrar gel',7,'Tekrar ziyaret et'],['Fiyat itirazı',14,'Fiyat itirazını yeniden görüş'],['Rakip var',30,'Rakip durumunu kontrol et'],['Kapalıydı / yetkili yok',3,'Tekrar uğra'],['Bilgi notu',0,'']];
const CHANNELS=['Ziyaret','Telefon','WhatsApp'];
// Ziyaret kaydı ve Geçmiş şimdilik kapalı. Yeniden açmak için true yapın.
const VISIT_LOG=false;
/* Türkçe yüzde eki: %61'i, %67'si, %83'ü, %90'ı, %100'ü, %12,0'ı */
function pctEk(v){const t=String(v).replace(/[^\d,]/g,'');const [ip,dp]=t.split(',');const n=parseInt(dp!=null&&dp!==''?dp:ip,10);
  if(isNaN(n)||n===0)return "'ı";const l=n%10;if(l)return "'"+['','i','si','ü','ü','i','sı','si','i','u'][l];
  if(n%1000===0)return "'i";if(n%100===0)return "'ü";return "'"+['','u','si','u','ı','si','ı','i','i','ı'][Math.floor(n/10)%10]}
const pct1=x=>(x*100).toFixed(1).replace('.',',');
// büyüme / tempo yüzdesi: +3,2% / −1,5% / 0,0% (yuvarlanınca sıfırsa işaretsiz) ve renk sınıfı
const gPct=g=>{const t=(g*100).toFixed(1);return t==='0.0'||t==='-0.0'?'0,0%':(g>0?'+':'')+t.replace('.',',')+'%'};
const gCls=g=>{const t=(g*100).toFixed(1);return t==='0.0'||t==='-0.0'?'':g<0?'down':'up'};
/* oturum açan kişi: e-postadan ad soyad (temsilci listesiyle eşleşirse oradaki yazım) ve baş harfler */
const fold=s=>String(s||'').toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[^a-z]/g,'');
// temsilci listesinde olmayan kullanıcıların adı (e-posta küçük harfle)
const NAMES={'raci.oener@akar-gmbh.de':'Raci Öner'};
function personOf(email){const fixed=NAMES[String(email||'').trim().toLowerCase()];const parts=String(email||'').split('@')[0].split(/[._\-]+/).filter(Boolean);
  const hit=REPS.find(r=>fold(r)===fold(parts.join('')));
  const name=fixed||hit||parts.map(p=>p.charAt(0).toLocaleUpperCase('tr')+p.slice(1).toLocaleLowerCase('tr')).join(' ');
  const w=name.split(/\s+/).filter(Boolean);const ini=(w.length>1?w[0][0]+w[w.length-1][0]:(w[0]||'?').slice(0,2)).toLocaleUpperCase('tr');
  return {name,ini}}
function renderUser(){renderTheme();const a=window.CRM_AUTH;if(!a||!a.email){$('#avBtn').hidden=true;return}
  const p=personOf(a.email);$('#avBtn').hidden=false;$('#avBtn').textContent=p.ini;$('#avBtn').title=p.name;$('#avBtn').setAttribute('aria-label','Hesap: '+p.name);
  $('#umName').textContent=p.name;$('#umMail').textContent=a.email}
/* gündüz / gece modu: seçim tarayıcıda saklanır, seçim yoksa cihaz ayarı geçerli */
const THEME_KEY='crm-theme';
const sysDark=()=>!!(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);
const curTheme=()=>document.documentElement.dataset.theme||(sysDark()?'dark':'light');
const ICON_SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';
const ICON_MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"/></svg>';
function renderTheme(){const d=curTheme()==='dark',b=$('#thmBtn');if(!b)return;b.innerHTML=d?ICON_SUN:ICON_MOON;b.setAttribute('aria-pressed',d);b.title=d?'Gündüz moduna geç':'Gece moduna geç'}
function setTheme(t){document.documentElement.dataset.theme=t;try{localStorage.setItem(THEME_KEY,t)}catch(e){}renderTheme()}
try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',renderTheme)}catch(e){}
const umOpen=on=>{$('#umDrop').hidden=!on;$('#avBtn').setAttribute('aria-expanded',on)};
/* Roller ve izinler. Rol, oturum açılırken allowed_users tablosundan gelir (window.CRM_ROLE).
   Satış temsilcisi ve Muhasebe izinleri settings/perms kaydında; Yönetici her şeye yetkilidir.
   Aynı kurallar veritabanında da (Supabase RLS: has_perm) uygulanır. */
const ROLES=[['admin','Yönetici'],['satis','Satış temsilcisi'],['muhasebe','Muhasebe']];
const PERMS=[
  ['v_targets','Hedefler sekmesini görür','','Görüntüleme'],
  ['v_board','Karne sekmesini görür','','Görüntüleme'],
  ['v_overdue','Açık faturaları ve Vade Takibi sekmesini görür','Müşteri kartındaki açık faturalar ve vadesi geçen kutusu dahil.','Görüntüleme'],
  ['v_credit','Kredi Limiti sekmesini görür','Tanımlı limit, açık bakiye ve önerilen limit.','Görüntüleme'],
  ['v_all','Tüm temsilcilerin müşterilerini görür','Kapalıysa kullanıcı yalnız kendi adına kayıtlı müşterileri görür (e-postası temsilci adıyla eşleşmeli). Hedefler sekmesi bundan etkilenmez: tüm ekip görünür.','Görüntüleme'],
  ['e_notes','Telefon ve yetkili kişi bilgisini düzenler','Ziyaret kaydı girme ve takibi tamamlandı işaretleme de bu izne bağlıdır.','Düzenleme'],
  ['e_visit','Rut günü, ziyaret sıklığı, merch ve dizim bilgisini düzenler','Müşteri kartındaki seçim kutularıyla. Müşteri Excel\'i içe aktarılınca aynı alanlar dosyadaki değerle güncellenir.','Düzenleme'],
  ['e_status','Müşteri durumunu (Aktif / Pasif) elle değiştirir','','Düzenleme'],
  ['e_targets','Hedefleri girer ve değiştirir','','Düzenleme'],
  ['e_arag','ARAG sürecini başlatır ve kapatır','','Düzenleme'],
  ['x_export',"Excel'e aktarır",'','Veri aktarımı'],
  ['x_import',"Excel'den müşteri içe aktarır",'Müşteri bilgilerinin üzerine yazar; Excel\'de olmayan müşterileri silebilir.','Veri aktarımı'],
  ['x_sales','Satış verisini içe aktarır','Günlük satış ve detaylı satış raporundan aylık satış, iade, müşterilerin yıl toplamları ve hedef gerçekleşenlerini günceller. Tüm müşterileri görme izni de gerekir.','Veri aktarımı'],
  ['x_openinv','Açık faturaları içe aktarır','','Veri aktarımı'],
  ['e_rules','Yönetici ayarlarını (kurallar) görür ve değiştirir','Pasif gün sınırı, temas günü, ARAG günü, kredi limiti ayarları vb.','Yönetim']];
const PDEF={satis:{v_targets:true,v_overdue:true,e_notes:true},muhasebe:{v_overdue:true,v_credit:true,v_all:true,e_notes:true,e_arag:true,x_export:true,x_openinv:true}};
let PM={},PMETA={},UL=null;
const roleKnown=()=>!!window.CRM_ROLE||typeof window.CRM_IS_ADMIN==='boolean';
const myRole=()=>{const r=window.CRM_ROLE;if(r&&ROLES.some(x=>x[0]===r))return r;return window.CRM_IS_ADMIN===true?'admin':'satis'};
const roleName=r=>(ROLES.find(x=>x[0]===r)||[,r||'–'])[1];
const permOf=(role,k)=>role==='admin'||!!{...(PDEF[role]||{}),...(PM[role]||{})}[k];
const can=k=>permOf(myRole(),k);
const isAdmin=()=>myRole()==='admin';
// "tüm temsilciler" izni yoksa: yalnız kullanıcının kendi temsilci adı (eşleşmezse hiçbir müşteri)
// kullanıcının temsilci adı: kullanıcı listesindeki 'Temsilci' alanı (CRM_REP); yoksa e-postadan çıkarılan ad
const ownRep=()=>{const n=window.CRM_REP!==undefined?window.CRM_REP:personOf(window.CRM_USER||(window.CRM_AUTH||{}).email||'').name;return n&&allReps().includes(n)?n:null};
const repGuess=e=>{const n=personOf(e).name;return REPS.includes(n)?n:''};
// ziyaret kaydı ve takip: veritabanında activities yazımı e_notes iznine bağlı (can_write_doc)
const canNote=()=>canWrite&&can('e_notes');
const canVisit=()=>canWrite&&can('e_visit');
const repLock=()=>can('v_all')?null:(ownRep()||'—');
const viewOk=v=>v==='board'?can('v_board'):v==='admin'?can('e_rules'):v==='perms'?isAdmin():v==='targets'?can('v_targets'):v==='overdue'?can('v_overdue'):v==='credit'?can('v_credit'):true;

let db=null,canWrite=true,loaded=false;
let CALL=[],C=[],A=[],D={last:{},open:{}},RET=null,OI=null,AR={},MON=null,K={},RK={};
/* iletişim bilgisi: temsilcinin girdiği (contacts) ile Excel'den geleni birleştirir; yenisi geçerli.
   Excel tarafının zamanı ctAt: yalnız Excel'den yetkili/telefon değişince yazılır (satış içe aktarması dokunmaz).
   Temsilcinin boşalttığı alan (ör. yetkiliyi sil) Excel'de daha yeni bir değer gelene kadar boş kalır. */
const pick=(a,ta,b,tb)=>typeof a==='string'&&ta>=tb?a:(b||a||'');
const ctOf=c=>{const k=K[c.id]||{},tk=k.updatedAt||0,tc=c.ctAt||0;return {phone:pick(k.phone,tk,c.phone,tc),contact:pick(k.contact,tk,c.contact,tc)}};
const waNum=p=>{let s=String(p||'').replace(/[^\d+]/g,'');if(s.startsWith('+'))s=s.slice(1);else if(s.startsWith('00'))s=s.slice(2);else if(s.startsWith('0'))s='31'+s.slice(1);else if(/^6\d{8}$/.test(s))s='31'+s;return s.replace(/\D/g,'')};
const telHref=p=>'tel:'+String(p||'').replace(/[^+\d]/g,'');
const mapsHref=c=>'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent([c.address||c.name,c.postcode,c.city,'Nederland'].filter(Boolean).join(', '));
// kayıp riski yalnız aktif müşteriler için; pasifler ayrıca sayılır (riskCalc)
function riskOf(c){return c.status==='Pasif'?null:riskCalc(c)}
function riskCalc(c){
  const c25=typeof c.ciro2025==='number'?c.ciro2025:0;
  const s26=typeof c.sales2026==='number'?c.sales2026:null;
  const iv=inv(c),d=iv&&iv.last?ago(iv.last):null;const why=[];let val=0;
  if(c25>=RISK.dropMin&&s26!=null){const exp=c25*YF,pace=s26/exp;if(pace<RISK.dropPace){const loss=exp-s26;why.push({k:'drop',pace,loss});val=Math.max(val,loss)}}
  const yearly=Math.max(c25,s26!=null?s26/YF:0);
  if(d!=null&&d>=RISK.silentDays&&d<=RISK.silentMax&&yearly>=RISK.silentMin){const m=yearly/12;why.push({k:'silent',days:d,monthly:m});val=Math.max(val,m*d/30)}
  return why.length?{why,val}:null;
}
// Tempo: bu yılın satışı / (geçen yıl cirosu × yılın geçen kısmı) − 1. Kart, zincir, Karne ve Excel bu fonksiyonu kullanır.
const tempoOf=c=>typeof c.ciro2025==='number'&&c.ciro2025>0&&typeof c.sales2026==='number'&&YF>0?c.sales2026/(c.ciro2025*YF)-1:null;
const riskText=r=>r?r.why.map(x=>x.k==='drop'?`Ciro temposu %${Math.round(x.pace*100)} · ${eur(x.loss)} geride`:`${x.days} gündür fatura yok (aylık ~${eur(x.monthly)})`).join(' · '):'';
function retOf(c){if(!RET||!RET.map)return null;const r=RET.map[code(c)];if(!r||!(r[0]>0))return null;const p=Math.abs(r[1]||0)/r[0];return {p,iade:r[1]||0,sales:r[0],warn:p>=RET_WARN}}
// Açık faturalar (sync/openinv): map[kod]={lim,vade,inv:[[no,faturaTarihi,tür F/I/P,tutar,kalan,vadeTarihi]]}
const OI_T={F:'Fatura',I:'İade',P:'Fiyat farkı'};
const eurc=n=>(n<0?'−':'')+'€ '+Math.abs(n||0).toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2});
const dueIn=d=>d?Math.round((new Date(d)-new Date(TODAY))/864e5):null;
function oiOf(c){
  if(!OI||!OI.map)return null;const o=OI.map[code(c)];if(!o||!o.inv||!o.inv.length)return null;
  const L=o.inv.map(([no,d,t,amt,rest,due])=>({no,d,t,amt,rest,due,days:dueIn(due)}));
  const O={L,tot:0,od:0,odn:0,odMax:0,nd:0,ndn:0,cr:0,crn:0,lim:o.lim,vade:o.vade};
  for(const x of L){O.tot+=x.rest;
    if(x.rest<0){O.cr+=x.rest;O.crn++}
    else if(x.days!=null&&x.days<0){O.od+=x.rest;O.odn++;O.odMax=Math.max(O.odMax,-x.days)}
    else{O.nd+=x.rest;O.ndn++}}
  return O;
}
const oiState=x=>x.rest<0?['cr','Alacak (müşteri lehine)']:x.days==null?['','Vade yok']:x.days<0?['od',`${-x.days} gün geçti`]:x.days===0?['td','Bugün vadeli']:['nd',`${x.days} gün kaldı`];
// ARAG (tahsilat / hukuki takip) süreci: 'arag' koleksiyonunda müşteri başına {active,at,by}. Vadesi geçen en eski fatura 30 günü aşınca başlatılabilir.
const aragOf=c=>AR[c.id]&&AR[c.id].active?AR[c.id]:null;
const aragElig=o=>!!(o&&o.odn&&o.odMax>R.arag);
function aragHtml(c,o){
  const a=aragOf(c),adm=can('e_arag')&&canWrite;
  if(a)return `<div class="arag on" id="aragBox"><span class="aragtag">ARAG</span><span>ARAG süreci aktif${a.at?` · ${fmt(a.at)} tarihinden beri`:''}</span>${adm?`<button type="button" class="ghost" id="aragOff" data-cid="${esc(c.id)}">Süreci kapat</button>`:''}</div>`;
  if(!aragElig(o)||!adm)return '';
  return `<div class="arag" id="aragBox"><span>En eski vadesi geçen fatura <b>${o.odMax} gün</b> gecikmiş (${R.arag} günü aştı).</span><button type="button" class="primary" id="aragOn" data-cid="${esc(c.id)}">ARAG süreci</button></div>`;
}
// Vade Takibi sekmesi: 1) vadesi geçenler, 2) bu ay (bugünden ay sonuna kadar) vadesi gelecekler
const monthEnd=d=>{const y=+d.slice(0,4),m=+d.slice(5,7);return iso(new Date(Date.UTC(y,m,0)))};
// bu ay vadesi gelecek: kalanı pozitif, vadesi bugün ile ay sonu arasında olan kalemler (iade / fiyat farkı alacakları hariç)
function dueMonthOf(c){
  const o=oiOf(c);if(!o)return null;const end=monthEnd(TODAY);
  const L=o.L.filter(x=>x.rest>0&&x.due&&x.due>=TODAY&&x.due<=end);if(!L.length)return null;
  const first=L.reduce((a,x)=>x.due<a?x.due:a,L[0].due);
  return {amt:L.reduce((a,x)=>a+x.rest,0),n:L.length,first,days:dueIn(first)};
}
const dueRows=()=>C.filter(c=>!st.rep||c.rep===st.rep).map(c=>[c,dueMonthOf(c)]).filter(([,d])=>d).sort((a,b)=>a[1].first.localeCompare(b[1].first)||b[1].amt-a[1].amt);
function overdueRows(){
  return C.filter(c=>!st.rep||c.rep===st.rep).map(c=>[c,oiOf(c)]).filter(([,o])=>o&&o.od>0).sort((a,b)=>b[1].od-a[1].od);
}
// Yönetici sekmesi: kurallar ve ayarlar
const RULES=[
  ['pasif','Pasif gün sınırı','gün',7,730,1,'Son satış faturası bu kadar günden eskiyse müşteri otomatik <b>Pasif</b> olur. Elle belirlenen durum (kart / Excel) bunu geçersiz kılar. Excel\'e aktarmada da bu değer kullanılır.','Durum ve temas'],
  ['temas','Temas günü','gün',1,365,1,'Son temastan (fatura ya da kayıt) bu kadar gün geçen aktif müşteri "temas yok" kutusunda sayılır ve listede noktayla işaretlenir.','Durum ve temas'],
  ['arag','ARAG süreç günü','gün',1,365,1,'Müşterinin en eski vadesi geçen faturası bu kadar günü aşınca kartta <b>ARAG süreci</b> butonu çıkar.','Açık faturalar'],
  ['credDays','Kredi limiti: ek gün','gün',1,180,1,'Önerilen limit, aylık ortalama satışın <b>ödeme vadesi + bu kadar gün</b> karşılığıdır (sipariş ile fatura arası ve ödeme toleransı).','Kredi limiti'],
  ['credCut','Kredi limiti: gecikme kesintisi','%',1,100,1,'En eski vadesi geçen faturası ARAG süreç gününü aşan müşterinin önerilen limiti bu oranda düşürülür. ARAG süreci aktifse öneri 0 (peşin çalışma).','Kredi limiti'],
  ['iade','İade uyarı eşiği','%',0.1,50,0.1,'Aynı dönemdeki satış faturalarına göre iade oranı bu yüzdeyi geçen müşteri kırmızı işaretlenir ve Karne\'deki iade listesine girer.','İade'],
  ['riskPace','Kayıp riski: ciro temposu','%',10,100,1,'Bu yılın satışı, geçen yılın cirosunun aynı dönemine göre bu yüzdenin altındaysa müşteri kayıp riskinde sayılır.','Kayıp riski'],
  ['dropMin','Ciro temposu: en az geçen yıl cirosu','€',0,10000000,100,'Ciro temposu kuralı yalnız geçen yıl cirosu bu tutar ve üzerindeki müşterilere uygulanır.','Kayıp riski'],
  ['riskSilent','Kayıp riski: faturasız gün','gün',7,365,1,'Bu kadar gündür fatura kesilmeyen müşteri kayıp riskinde sayılır.','Kayıp riski'],
  ['silentMax','Faturasız gün: en fazla','gün',30,3650,1,'Bundan uzun süredir faturası olmayan müşteri artık kayıp riski sayılmaz (çoktan kaybedilmiş kabul edilir). Faturasız gün sınırından büyük olmalı.','Kayıp riski'],
  ['silentMin','Faturasız gün: en az yıllık ciro','€',0,10000000,100,'Faturasız gün kuralı yalnız yıllık cirosu (geçen yıl ya da bu yılın yıllığa çevrilmiş satışı) bu tutar ve üzerindeki müşterilere uygulanır.','Kayıp riski']];
const RKEY={riskPace:'dropPace',dropMin:'dropMin',riskSilent:'silentDays',silentMax:'silentMax',silentMin:'silentMin'};
function ruleImpact(k,v){
  if(!(v>0))return '';
  if(k==='pasif'){const n=C.filter(c=>!(c._st0&&c._st0.manual)&&!c.statusOv&&(c.lastInvoice?ago(c.lastInvoice)>v:((c._st0&&c._st0.status)||'Pasif')==='Pasif')).length;return `${n} müşteri otomatik pasif olur`}
  if(k==='temas'){const n=C.filter(c=>c.status!=='Pasif'&&(()=>{const d=ago(D.last[c.id]);return d===null||d>v})()).length;return `${n} aktif müşteri ${v}+ gündür temassız`}
  if(k==='arag'){if(!(OI&&OI.map))return '';const n=C.filter(c=>{const o=oiOf(c);return o&&o.odn&&o.odMax>v}).length;return `${n} müşteri ARAG'a uygun`}
  if(k==='credDays'||k==='credCut'){if(!(OI&&OI.map))return '';const keep=R[k];R[k]=v;const L=creditRows().filter(x=>x.lim),n=L.filter(x=>x.r.rec<x.lim).length,m=L.filter(x=>x.r.rec>x.lim).length;R[k]=keep;return `${m} müşteride öneri mevcut limitin üstünde, ${n} müşteride altında`}
  if(k==='iade'){if(!(RET&&RET.map))return '';const n=C.filter(c=>{const r=retOf(c);return r&&r.p>=v/100}).length;return `${n} müşteri eşiğin üzerinde`}
  if(RKEY[k]){const keep={...RISK};RISK[RKEY[k]]=k==='riskPace'?v/100:v;const n=C.filter(c=>riskOf(c)).length;Object.assign(RISK,keep);return `${n} müşteri kayıp riskinde`}
  return '';
}
function renderAdmin(){
  if(st.view!=='admin')return;
  const ed=can('e_rules')&&canWrite,m=RMETA||{};
  const upd=m.updatedAt?`Son güncelleme: ${fmt(iso(new Date(m.updatedAt)))}${m.by?' · '+esc(personOf(m.by).name||m.by):''}`:'Henüz değiştirilmedi: tüm değerler varsayılan.';
  $('#admin').innerHTML=`<button type="button" class="ghost home" data-view="list" id="homeA">← Ana sayfaya dön</button><div class="rethead"><h3>Kurallar ve Ayarlar <small class="sm">tüm kullanıcılar için geçerli</small></h3><span class="sm">${upd}</span></div>
  <form class="ordp rform" id="rform" autocomplete="off" novalidate>
  ${RULES.map(([k,l,u,mn,mx,stp,d,g],i)=>`${g!==(RULES[i-1]||[])[7]?`<h4 class="rgrp">${g}</h4>`:''}<div class="rrow"><label for="r_${k}"><b>${l}</b><small>${d}</small></label>
   <div class="rin"><span class="rbox"><input id="r_${k}" name="${k}" type="number" inputmode="decimal" min="${mn}" max="${mx}" step="${stp}" value="${R[k]}" ${ed?'':'disabled'}><em>${u}</em></span>
   <small class="rdef">Varsayılan: ${u==='€'?eur(RDEF[k]):String(RDEF[k]).replace('.',',')+' '+u}${R[k]!==RDEF[k]?' · <b>değiştirildi</b>':''}</small><small class="rimp" data-rimp="${k}">${ruleImpact(k,R[k])}</small></div></div>`).join('')}
  ${ed?`<div class="qsave"><span class="sm" id="rmsg"></span><button type="button" class="ghost" id="rdef">Varsayılanlara dön</button><button type="submit" class="primary">Kaydet</button></div>`:''}
  </form>`;
}
// Kullanıcı izinleri (yalnız Yönetici): rollerin izinleri ve kullanıcı listesi
async function loadUsers(){if(!window.CRM_USERS||st.ulLoading)return;st.ulLoading=true;
  try{UL=await window.CRM_USERS.list()}catch(e){UL=[];toast('Kullanıcı listesi okunamadı: '+(e.message||e),1)}st.ulLoading=false;render()}
const MAIN_ADMIN='baran.sengul@akar-group.com';
function renderPerms(){
  if(st.view!=='perms')return;
  const ed=isAdmin()&&canWrite,m=PMETA||{};
  if(UL===null&&window.CRM_USERS)loadUsers();
  const cnt=r=>UL?UL.filter(u=>(u.role||'satis')===r).length:null;
  const upd=m.updatedAt?`Son güncelleme: ${fmt(iso(new Date(m.updatedAt)))}${m.by?' · '+esc(personOf(m.by).name||m.by):''}`:'Henüz değiştirilmedi: varsayılan izinler geçerli.';
  const cb=(r,k)=>r==='admin'?'<input type="checkbox" checked disabled aria-label="Yönetici: her zaman">':`<input type="checkbox" name="${r}|${k}" aria-label="${esc(roleName(r))}: ${esc(PERMS.find(x=>x[0]===k)[1])}"${permOf(r,k)?' checked':''}${ed?'':' disabled'}>`;
  const me=String(window.CRM_USER||(window.CRM_AUTH||{}).email||'').toLowerCase();
  const urow=u=>{const e=String(u.email||''),lk=e.toLowerCase()===me||e.toLowerCase()===MAIN_ADMIN,r=u.role||'satis',p=personOf(e).name;
    return `<tr data-urow="${esc(e)}"><td><b>${esc(p)}</b><small class="cru">${esc(e)}</small></td><td><select data-urole="${esc(e)}" aria-label="${esc(p)} rolü"${ed&&!lk?'':' disabled'}>${ROLES.map(([k,l])=>`<option value="${k}"${k===r?' selected':''}>${l}</option>`).join('')}</select></td>
    <td><select data-urep="${esc(e)}" aria-label="${esc(p)} temsilci adı"${ed?'':' disabled'}><option value="">–</option>${[...new Set([...allReps(),...(u.rep?[u.rep]:[])])].map(x=>`<option${x===u.rep?' selected':''}>${esc(x)}</option>`).join('')}</select>
    <small class="cru${r!=='admin'&&!permOf(r,'v_all')&&!u.rep?' bad':''}">${r==='admin'||permOf(r,'v_all')?'tüm müşterileri görür':u.rep?`yalnız ${esc(u.rep)} müşterileri`:'temsilci seçilmedi: müşteri göremez'}</small></td>
    <td>${ed&&!lk?`<button type="button" class="ghost" data-udel="${esc(e)}">Kaldır</button>`:lk?'<span class="sm">siz / ana yönetici</span>':''}</td></tr>`};
  const users=!window.CRM_USERS?'<p class="empty">Kullanıcı listesi bu ortamda yönetilemiyor.</p>':UL===null?'<p class="empty">Kullanıcılar yükleniyor…</p>':
   `<div class="ordp"><table id="uT"><thead><tr><th>Kullanıcı</th><th>Rol</th><th>Temsilci (gördüğü müşteriler)</th><th></th></tr></thead><tbody>${UL.slice().sort((a,b)=>ROLES.findIndex(x=>x[0]===(a.role||'satis'))-ROLES.findIndex(x=>x[0]===(b.role||'satis'))||personOf(a.email).name.localeCompare(personOf(b.email).name,'tr')).map(urow).join('')}</tbody></table>
   ${ed?`<form class="uadd" id="uform" autocomplete="off"><label>Yeni kullanıcı e-postası<input name="email" type="email" required placeholder="ad.soyad@akar-bv.nl"></label><label>Rol<select name="role">${ROLES.map(([k,l])=>`<option value="${k}"${k==='satis'?' selected':''}>${l}</option>`).join('')}</select></label><button class="primary" type="submit">Ekle</button></form>
   <p class="sm">Eklenen kişi giriş ekranında e-postasını yazıp “e-postama giriş bağlantısı gönder” ile ilk girişini yapar; sonra kendine şifre belirleyebilir. Kaldırılan kişi CRM'e giremez.</p>`:''}</div>`;
  $('#perms').innerHTML=`<button type="button" class="ghost home" data-view="list" id="homeP">← Ana sayfaya dön</button><div class="rethead"><h3>Kullanıcı İzinleri <small class="sm">rol başına</small></h3><span class="sm">${upd}</span></div>
  <form class="ordp" id="pform" autocomplete="off"><table id="pT"><thead><tr><th>İzin</th>${ROLES.map(([r,l])=>`<th>${l}${cnt(r)!=null?` <small>(${cnt(r)})</small>`:''}</th>`).join('')}</tr></thead>
  <tbody>${PERMS.map(([k,l,d,g],i)=>`${g!==(PERMS[i-1]||[])[3]?`<tr class="pg"><th colspan="${ROLES.length+1}">${g}</th></tr>`:''}<tr data-perm="${k}"><td><b>${l}</b>${d?`<small class="cru">${d}</small>`:''}</td>${ROLES.map(([r])=>`<td>${cb(r,k)}</td>`).join('')}</tr>`).join('')}
  <tr><td><b>Kullanıcı izinleri ve kullanıcılar</b><small class="cru">Bu sayfa; yalnız Yönetici.</small></td>${ROLES.map(([r])=>`<td><input type="checkbox" disabled${r==='admin'?' checked':''} aria-label="${roleName(r)}"></td>`).join('')}</tr></tbody></table>
  ${ed?`<div class="qsave"><span class="sm" id="pmsg"></span><button type="button" class="ghost" id="pdef">Varsayılanlara dön</button><button type="submit" class="primary">Kaydet</button></div>`:''}</form>
  <h3>Kullanıcılar</h3>${users}`;
}
// sayı kutusu değeri: ondalık ayırıcı nokta ya da virgül (binlik ayırıcı yok)
const rnum=x=>{const n=parseFloat(String(x??'').trim().replace(',','.'));return Number.isFinite(n)?n:null};
function rformCheck(f){let bad=0;for(const [k,,,mn,mx] of RULES){const e=f.elements[k];const v=rnum(e.value);const ok=v!=null&&v>=mn&&v<=mx;e.closest('.rbox').classList.toggle('bad',!ok);if(!ok)bad++;
  const im=f.querySelector(`[data-rimp="${k}"]`);if(im)im.textContent=ok?ruleImpact(k,v):`${String(mn).replace('.',',')}–${mx} arası bir değer girin`}
  {const a=rnum(f.elements.riskSilent.value),b=rnum(f.elements.silentMax.value);if(a!=null&&b!=null&&b<=a){f.elements.silentMax.closest('.rbox').classList.add('bad');const im=f.querySelector('[data-rimp="silentMax"]');if(im)im.textContent=`Faturasız gün sınırından (${a}) büyük olmalı`;bad++}}
  return !bad}
// Açık fatura dosyasında olup CRM'de müşteri kaydı olmayan kodlar. Temsilcisi olmadığından yalnız tüm müşterileri görenlere (v_all) gösterilir; sunucu da (my_sync) bu kodları diğerlerine göndermez.
function oiOrphans(){
  if(!OI||!OI.map||!can('v_all'))return [];
  const known=new Set(CALL.map(code));
  return Object.keys(OI.map).filter(k=>!known.has(k)).map(k=>{const o=oiOf({code:k});if(!o)return null;
    const due=o.L.filter(x=>x.rest>0&&x.due).map(x=>x.due).sort()[0]||'';return {k,o,due}}).filter(Boolean).sort((a,b)=>b.o.tot-a.o.tot||a.k.localeCompare(b.k));
}
function orphanHtml(){
  const L=st.rep?[]:oiOrphans();if(!L.length)return '';
  const tot=L.reduce((a,x)=>a+x.o.tot,0),od=L.reduce((a,x)=>a+x.o.od,0);
  const dueTd=x=>{if(!x.due)return x.o.crn?'<span class="sm">yalnız alacak</span>':'–';const d=dueIn(x.due);return `${fmt(x.due)}${d<0?` <small class="odd">${-d} gün geçti</small>`:''}`};
  const row=x=>`<tr${x.o.odn&&x.o.odMax>R.arag?' class="o30"':''}><td>${esc(x.k)}</td><td><b>${eurc(x.o.tot)}</b></td><td>${x.o.od>0?`<span class="odv">${eurc(x.o.od)}</span>`:'–'}</td><td>${x.o.L.length}</td><td>${dueTd(x)}</td></tr>`;
  return `<div class="rethead"><h3 id="orphHead">CRM'de olmayan müşteri kodları <small class="sm">${L.length} kod · net ${eurc(tot)}${od>0?` · vadesi geçen ${eurc(od)}`:''}</small></h3></div>
  <div class="ordp"><table id="odOrph"><thead><tr><th>Kod</th><th>Açık bakiye (net)</th><th>Vadesi geçen</th><th>Kalem</th><th>En eski vade</th></tr></thead><tbody>${L.map(row).join('')}</tbody><tfoot><tr><td>Toplam</td><td>${eurc(tot)}</td><td>${od>0?eurc(od):'–'}</td><td>${L.reduce((a,x)=>a+x.o.L.length,0)}</td><td></td></tr></tfoot></table></div>
  <p class="sm">Bu kodlar açık fatura dosyasında var ama CRM müşteri listesinde yok; tutarları yukarıdaki toplamlara, kartlara ve Kredi Limiti sekmesine girmez. Müşteri Excel'iyle CRM'e eklenince ya da ERP'de kapatılınca bu listeden çıkar.</p>`;
}
function renderOverdue(){
  const has=!!(OI&&OI.map)&&can('v_overdue');$('#tabV').hidden=!has;
  const all=has?overdueRows():[];
  $('#tabV').textContent=has?`Vade Takibi (${all.length})`:'Vade Takibi';
  if(st.view!=='overdue')return;
  if(!has){$('#overdue').innerHTML='<p class="empty">Açık fatura verisi yok.</p>';return}
  const f=['30','arag'].includes(st.ovf)?st.ovf:'all';
  const L=f==='30'?all.filter(([,o])=>aragElig(o)):f==='arag'?all.filter(([c])=>aragOf(c)):all;
  const sum=L.reduce((a,[,o])=>a+o.od,0),n30=all.filter(([,o])=>aragElig(o)).length,nA=all.filter(([c])=>aragOf(c)).length;
  const fb=(k,l)=>`<button type="button" data-ovf="${k}" aria-pressed="${f===k}">${l}</button>`;
  const row=([c,o],i)=>{const a=aragOf(c);return `<tr${aragElig(o)?' class="o30"':''}><td class="rk">${i+1}</td><td><button class="lnk" data-open="${esc(c.id)}">${esc(c.name)}</button></td><td>${esc(c.rep||'')}</td><td><b class="odv">${eur(o.od)}</b></td><td>${o.odn}</td><td><span class="odd">${o.odMax} gün</span></td><td>${a?'<em class="rtag ar">ARAG</em>':aragElig(o)?`<span class="sm">${R.arag}+ gün</span>`:''}</td></tr>`};
  $('#overdue').innerHTML=`<div class="rethead"><h3>Vadesi Geçen Müşteriler <small class="sm">${fmt(OI.asOf)} verisi${st.rep?' · '+esc(st.rep):''} · ${L.length} müşteri · ${eur(sum)}</small></h3>
  <div class="seg2" role="group" aria-label="Süz">${fb('all',`Tümü (${all.length})`)}${fb('30',`${R.arag}+ gün (${n30})`)}${fb('arag',`ARAG (${nA})`)}</div></div>
  ${L.length?`<div class="ordp"><table id="odT" class="vt"><thead><tr><th>#</th><th>Müşteri</th><th>Temsilci</th><th>Tutar</th><th>Fatura</th><th>En eski</th><th>ARAG</th></tr></thead><tbody>${L.map(row).join('')}</tbody><tfoot><tr><td class="rk"></td><td>Toplam</td><td></td><td>${eur(sum)}</td><td>${L.reduce((a,[,o])=>a+o.odn,0)}</td><td></td><td></td></tr></tfoot></table></div>`:'<p class="empty">Bu süzgeçte müşteri yok.</p>'}
  <p class="sm">Tutar: vadesi geçmiş faturaların kalan tutarı (iade ve fiyat farkı alacakları hariç). Gün sayısı bugüne göre. Satıra tıklayınca müşteri kartı açılır.</p>${dueHtml()}${orphanHtml()}`;
}
function dueHtml(){
  const L=dueRows(),sum=L.reduce((a,[,d])=>a+d.amt,0),mn=MONTHS_LONG[+TODAY.slice(5,7)-1]+' '+TODAY.slice(0,4);
  const left=d=>d===0?'Bugün':`${d} gün kaldı`;
  const row=([c,d],i)=>`<tr${d.days<=7?' class="soon"':''}><td class="rk">${i+1}</td><td><button class="lnk" data-open="${esc(c.id)}">${esc(c.name)}</button></td><td>${esc(c.rep||'')}</td><td><b>${eur(d.amt)}</b></td><td>${d.n}</td><td><span class="ddt">${fmt(d.first)}</span></td><td><small class="ddl">${left(d.days)}</small></td></tr>`;
  return `<div class="rethead"><h3 id="dueHead">Bu Ay Vadesi Gelecek Müşteriler <small class="sm">${mn} sonuna kadar${st.rep?' · '+esc(st.rep):''} · ${L.length} müşteri · ${eur(sum)}</small></h3></div>
  ${L.length?`<div class="ordp"><table id="duT" class="vt"><thead><tr><th>#</th><th>Müşteri</th><th>Temsilci</th><th>Tutar</th><th>Fatura</th><th>Vade Tarihi</th><th aria-hidden="true"></th></tr></thead><tbody>${L.map(row).join('')}</tbody><tfoot><tr><td class="rk"></td><td>Toplam</td><td></td><td>${eur(sum)}</td><td>${L.reduce((a,[,d])=>a+d.n,0)}</td><td></td><td></td></tr></tfoot></table></div>`:`<p class="empty">${mn} sonuna kadar vadesi gelecek fatura yok.</p>`}
  <p class="sm">Tutar: bugünden ay sonuna kadar vadesi dolacak faturaların kalan tutarı (iade ve fiyat farkı alacakları hariç). Vadesi geçmiş faturalar yukarıdaki listede. Satıra tıklayınca müşteri kartı açılır.</p>`;
}
// Kredi limiti: tanımlı limit (açık fatura dosyasından), açık bakiye (net) ve önerilen limit
const limOf=o=>o&&typeof o.lim==='number'&&o.lim>0?o.lim:null;
const vadeOf=o=>o&&o.vade!=null&&o.vade!==''&&Number.isFinite(+o.vade)?+o.vade:null;
// öneri = aylık ortalama satış × (vade + ek gün) / 30; gecikmede kesinti, ARAG'da 0; 500'e yukarı yuvarlanır
function credRec(c,o){
  const c25=typeof c.ciro2025==='number'?c.ciro2025:0,s26=typeof c.sales2026==='number'?c.sales2026:null;
  const yearly=Math.max(0,s26!=null&&YF>0?s26/YF:c25),monthly=yearly/12,vd=vadeOf(o),vade=vd==null?30:vd,days=vade+R.credDays;
  let f=1,note='';
  if(aragOf(c)){f=0;note='ARAG süreci aktif: peşin çalışma'}
  else if(o&&o.odn&&o.odMax>R.arag){f=1-R.credCut/100;note=`${o.odMax} gün gecikme: %${R.credCut} kesinti`}
  return {rec:Math.ceil(monthly*days/30*f/500-1e-9)*500,monthly,vade,vdKnown:vd!=null,days,f,note};
}
function creditRows(){
  return C.filter(c=>!st.rep||c.rep===st.rep).map(c=>{const o=oiOf(c);if(!o)return null;const lim=limOf(o);
    return {c,o,lim,over:lim?o.tot-lim:o.tot,r:credRec(c,o)}}).filter(Boolean);
}
function renderCredit(){
  const has=!!(OI&&OI.map),okv=has&&can('v_credit');$('#tabK').hidden=!okv;
  const all=okv?creditRows():[],over=all.filter(x=>x.lim&&x.over>0),nol=all.filter(x=>!x.lim&&x.o.tot>0);
  $('#tabK').textContent=okv?`Kredi Limiti (${over.length})`:'Kredi Limiti';
  if(st.view!=='credit')return;
  if(!okv){$('#credit').innerHTML='<p class="empty">Açık fatura verisi yok.</p>';return}
  const f=['nolim','all'].includes(st.crf)?st.crf:'over';
  const L=(f==='over'?over:f==='nolim'?nol:all).slice().sort((a,b)=>(b.lim?b.over:-1e12)-(a.lim?a.over:-1e12)||b.o.tot-a.o.tot);
  const sOver=over.reduce((a,x)=>a+x.over,0),sOd=over.reduce((a,x)=>a+x.o.od,0),nUp=over.filter(x=>x.r.rec>x.lim).length,nDn=over.filter(x=>x.r.rec<=x.lim).length;
  const fb=(k,l)=>`<button type="button" data-crf="${k}" aria-pressed="${f===k}">${l}</button>`;
  const dif=x=>{if(!x.lim)return '<span class="sm">limit yok</span>';const d=x.r.rec-x.lim;return d===0?'<span class="sm">aynı</span>':`<b class="${d>0?'up':'down'}">${d>0?'+':'−'}${eur(Math.abs(d))}</b>`};
  const row=(x,i)=>{const {c,o,lim,r}=x,tip=`Aylık ortalama satış ${eur(r.monthly)} × (vade ${r.vade}${r.vdKnown?'':' (varsayılan)'} + ${R.credDays} gün) ÷ 30${r.f<1?` × ${Math.round(r.f*100)}%`:''}`;
    return `<tr data-crow="${esc(c.id)}"><td class="rk">${i+1}</td><td><button class="lnk" data-open="${esc(c.id)}">${esc(c.name)}</button>${aragOf(c)?' <em class="rtag ar">ARAG</em>':''}</td><td>${esc(c.rep||'')}</td><td>${r.vdKnown?r.vade+' gün':'–'}</td>
    <td>${lim?eur(lim):'<span class="sm">tanımsız</span>'}</td><td><b>${eur(o.tot)}</b>${lim?`<small class="cru">%${Math.round(o.tot/lim*100)} kullanım</small>`:''}</td>
    <td>${lim?(x.over>0?`<b class="crov">${eur(x.over)}</b>`:`<span class="sm">kalan ${eur(-x.over)}</span>`):'–'}</td><td>${o.od>0?`<span class="odv">${eur(o.od)}</span><small class="cru">en eski ${o.odMax} gün</small>`:'–'}</td>
    <td title="${esc(tip)}"><b>${eur(r.rec)}</b>${r.note?`<small class="cru crn">${esc(r.note)}</small>`:''}</td><td>${dif(x)}</td></tr>`};
  $('#credit').innerHTML=`<div class="rethead"><h3>Kredi Limiti <small class="sm">${fmt(OI.asOf)} açık fatura verisi${st.rep?' · '+esc(st.rep):''}</small></h3>
  <div class="seg2" role="group" aria-label="Süz">${fb('over',`Limiti aşan (${over.length})`)}${fb('nolim',`Limit tanımsız (${nol.length})`)}${fb('all',`Tümü (${all.length})`)}</div></div>
  <div class="crsum" id="crSum"><div class="bad"><span>Limiti aşan müşteri</span><b>${over.length}</b><small>${all.filter(x=>x.lim).length} limitli müşteriden</small></div><div class="bad"><span>Toplam aşım</span><b>${eur(sOver)}</b><small>açık bakiye − tanımlı limit</small></div><div><span>Aşanların vadesi geçen</span><b>${eur(sOd)}</b><small>${over.filter(x=>x.o.od>0).length} müşteride</small></div><div><span>Öneri</span><b>${nUp} artır · ${nDn} artırma</b><small>limiti aşanlar için</small></div></div>
  ${L.length?`<div class="ordp"><table id="crT"><thead><tr><th>#</th><th>Müşteri</th><th>Temsilci</th><th>Vade</th><th>Tanımlı limit</th><th>Açık bakiye</th><th>Aşım</th><th>Vadesi geçen</th><th>Önerilen limit</th><th>Fark</th></tr></thead><tbody>${L.map(row).join('')}</tbody><tfoot><tr><td class="rk"></td><td>Toplam</td><td></td><td></td><td>${eur(L.reduce((a,x)=>a+(x.lim||0),0))}</td><td>${eur(L.reduce((a,x)=>a+x.o.tot,0))}</td><td>${eur(L.reduce((a,x)=>a+(x.lim&&x.over>0?x.over:0),0))}</td><td>${eur(L.reduce((a,x)=>a+(x.o.od>0?x.o.od:0),0))}</td><td>${eur(L.reduce((a,x)=>a+x.r.rec,0))}</td><td></td></tr></tfoot></table></div>`:'<p class="empty">Bu süzgeçte müşteri yok.</p>'}
  <p class="sm crnote"><b>Mevcut durum:</b> açık faturaların net kalanı (iade ve fiyat farkı alacakları düşülür). <b>Önerilen limit</b> = aylık ortalama satış × (ödeme vadesi + ${R.credDays} gün) ÷ 30, € 500'e yukarı yuvarlanır. Aylık satış, ${CY} satışının yıllığa çevrilmesiyle bulunur (yılın %${Math.round(YF*100)}${pctEk(Math.round(YF*100))} geçti). En eski vadesi geçen faturası ${R.arag} günü aşan müşteride öneri %${R.credCut} düşürülür; ARAG süreci aktifse öneri € 0 (peşin). Vadesi bilinmeyen müşteride 30 gün alınır. Ek gün ve kesinti oranı Yönetici ayarlarından değiştirilir. Satıra tıklayınca müşteri kartı açılır.</p>`;
}
function oiHtml(c){
  if(!OI||!OI.map||!can('v_overdue'))return '';
  const o=oiOf(c),asOf=OI.asOf?`${fmt(OI.asOf)} itibarıyla`:'';
  if(!o)return `<section class="oi" id="oi"><h3>Açık Faturalar</h3><p class="oi-none">${asOf} açık fatura yok.</p></section>`;
  const rank=x=>x.rest<0?2:x.days!=null&&x.days<0?0:1;
  const L=[...o.L].sort((a,b)=>rank(a)-rank(b)||String(a.due||'').localeCompare(String(b.due||''))),all=st.oiAll===c.id,MAX=8;
  const sh=all?L:L.slice(0,MAX);
  const lim=typeof o.lim==='number'&&o.lim>0?o.lim:null;
  return `<section class="oi" id="oi"><h3>Açık Faturalar <small>${asOf}</small></h3>
  <div class="oi-sum"><div class="${o.od>0?'bad':''}"><span>Vadesi geçen</span><b>${eur(o.od)}</b><small>${o.odn?`${o.odn} fatura · en eski ${o.odMax} gün`:'yok'}</small></div><div><span>Vadesi gelmemiş</span><b>${eur(o.nd)}</b><small>${o.ndn} fatura</small></div><div><span>Toplam açık (net)</span><b>${eur(o.tot)}</b><small>${o.crn?`${eur(Math.abs(o.cr))} iade / fiyat farkı düşüldü`:'&nbsp;'}</small></div>${lim?`<div class="${o.tot>lim?'bad':''}"><span>Kredi limiti</span><b>${eur(lim)}</b><small>${o.tot>lim?`${eur(o.tot-lim)} aşıldı`:`kalan ${eur(lim-o.tot)}`}${can('v_credit')?` · öneri ${eur(credRec(c,o).rec)}`:''}</small></div>`:''}</div>
  <ul class="oi-l">${sh.map(x=>{const [k,t]=oiState(x);return `<li class="${k}"><div class="oi-a"><b>${esc(x.no)}</b><span class="oi-t">${esc(OI_T[x.t]||'')}</span><b class="oi-r">${eurc(x.rest)}</b></div><div class="oi-b"><span>Fatura ${fmt(x.d)||'–'}${Math.abs(x.amt-x.rest)>=0.01?` · tutar ${eurc(x.amt)}`:''}</span><span>Vade ${fmt(x.due)||'–'}</span><em class="oi-s">${t}</em></div></li>`}).join('')}</ul>
  ${L.length>MAX?`<button type="button" class="ghost oi-more" data-oiall="${esc(c.id)}">${all?'Daha az göster':`Tümünü göster (${L.length})`}</button>`:''}
  ${o.vade!=null?`<p class="oi-note">Ödeme vadesi: ${o.vade} gün. Gün sayıları bugüne göre hesaplanır.</p>`:''}</section>`;
}
const monthKey=()=>(MON&&MON.month)||TODAY.slice(0,7);
// aylık hedef = Hedefler sekmesinde o ay için girilen kategori hedeflerinin toplamı (qtargets)
const tgtMap=()=>{const q=(QTS[monthKey()]||{}).reps||{},o={};for(const [r,v] of Object.entries(q)){const s=Object.values((v&&v.c)||{}).reduce((a,x)=>a+(+(x&&x.t)||0),0);if(s)o[r]=s}return o};
const tgtOf=rep=>{const t=tgtMap();return rep?(t[rep]||0):Object.values(t).reduce((a,v)=>a+v,0)};
// ayın ne kadarı geçti (hedef temposu için)
const monthFrac=()=>{const mk=monthKey(),t=MON&&MON.through&&MON.through.slice(0,7)===mk?MON.through:mk===TODAY.slice(0,7)?TODAY:mk<TODAY.slice(0,7)?'':TODAY;if(!t)return 1;const y=+mk.slice(0,4),m=+mk.slice(5,7);return +t.slice(8,10)/new Date(y,m,0).getDate()};
const barHtml=(v,t)=>{if(!t)return '';const p=v/t;return `<span class="bar" title="Hedefin %${Math.round(p*100)}${pctEk(Math.round(p*100))}"><i class="${p<monthFrac()?'behind':''}" style="width:${Math.min(100,Math.max(0,p*100)).toFixed(1)}%"></i></span>`};
const code=c=>c.code||String(c.id||'').replace(/^c/,'');
const has=(c,k)=>Object.prototype.hasOwnProperty.call(c,k);
const inv=c=>(c.lastInvoice||c.sales2026!=null||c.invoices2026!=null)?{last:c.lastInvoice||'',no:c.lastInvoiceNo||'',sales:c.sales2026,n:c.invoices2026}:null;
const st={q:'',rep:'',seg:'',chain:'',status:'',quick:'',sel:null,view:'list',type:'Ziyaret',formFor:null,arm:null};
try{const s=JSON.parse(localStorage.getItem('crm-ui')||'{}');if(s.rep)st.rep=s.rep;if(s.view)st.view=s.view;if(s.qv)st.qv=s.qv;if(s.rf)st.rf=s.rf}catch(e){}
const saveUi=()=>{try{localStorage.setItem('crm-ui',JSON.stringify({rep:st.rep,view:st.view,qv:st.qv,rf:st.rf}))}catch(e){}};

let tt;
const toast=(m,bad)=>{const t=$('#toast');t.textContent=m;t.className='toast show'+(bad?' bad':'');clearTimeout(tt);tt=setTimeout(()=>{t.className='toast'},3400)};
const fail=e=>{const c=e&&e.code;if(c==='invalid_argument'){canWrite=false;render();toast('Kaydedilemedi: bu sayfada değişiklik yapma izniniz yok.',1)}else if(c==='quota_exceeded')toast('Depolama sınırı doldu; eski kayıtları silin.',1);else toast('Kaydedilemedi, lütfen tekrar deneyin.',1)};
async function w(fn){
  if(!db||!canWrite){toast('Şu an kayıt yapılamıyor.',1);return false}
  try{await fn();return true}catch(e){
    if(e&&e.code==='unavailable'){await new Promise(r=>setTimeout(r,500+Math.random()*700));try{await fn();return true}catch(e2){fail(e2);return false}}
    fail(e);return false}
}
const SEGCOL=[['sPla',['platin','platinum']],['sGol',['gold','altın','altin']],['sSil',['silver','gümüş','gumus']],['sBro',['bronze','bronz','bakır','bakir']],['sGas',['gastronomi','gastronomy']],['sTop',['toptan']],['sKio',['kiosk','kioks','kiosks','kiosk market']],['sPot',['potential','potantial','potansiyel','potensiyel']]];
const segCls=v=>{if(v==='A')return ' sA';if(v==='B')return ' sB';const n=String(v||'').trim().toLocaleLowerCase('tr');if(!n)return '';
  for(const [cl,keys] of SEGCOL)if(keys.some(k=>n===k||n.startsWith(k+' ')))return ' '+cl;return ''};
const allSegs=()=>[...new Set(C.map(c=>c.segment).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'tr'));
const allReps=()=>{const have=new Set([...CALL.map(c=>c.rep).filter(Boolean),...Object.values(QTS).flatMap(q=>Object.keys((q&&q.reps)||{}))]);
  return [...REPS.filter(r=>have.has(r)),...[...have].filter(r=>!REPS.includes(r)).sort((a,b)=>a.localeCompare(b,'tr'))]};

/* Elle durum: 'statusov' koleksiyonunda müşteri başına {status}. Öncelik: sitede elle > Excel 'Durum (elle)' > otomatik. */
let SO={};
const autoSt=c=>c.lastInvoice?(ago(c.lastInvoice)>R.pasif?'Pasif':'Aktif'):((c._st0&&c._st0.status)||'Pasif');
function applyStatus(){for(const c of C){if(!c._st0)c._st0={status:c.status||'',manual:c.statusManual||''};const ov=(SO[c.id]||{}).status||'';
  c.statusOv=ov;c.statusManual=ov||c._st0.manual;c.status=ov||c._st0.manual||autoSt(c)}}
const statusAuto=c=>(c._st0&&c._st0.manual)||autoSt(c);
function statusHtml(c){
  const adm=can('e_status')&&canWrite;
  if(!adm)return c.status?`<span class="tag"${c.statusOv?' title="Durum elle belirlendi"':''}>${esc(c.status)}${c.statusOv?' · elle':''}</span>`:'';
  const a=statusAuto(c);
  return `<label class="tag stsel${c.statusOv?' ov':''}${c.status==='Pasif'?' pas':''}" title="Müşteri durumu"><span class="sr">Durum</span><select id="stSel" data-cid="${esc(c.id)}" aria-label="Müşteri durumu">`+
    `<option value=""${c.statusOv?'':' selected'}>${esc(a||'–')} · ${c._st0&&c._st0.manual?'Excel':'otomatik'}</option><option value="Aktif"${c.statusOv==='Aktif'?' selected':''}>Aktif · elle</option><option value="Pasif"${c.statusOv==='Pasif'?' selected':''}>Pasif · elle</option></select></label>`}
function derive(){
  {const dt=dataTo();YF=yearFrac(dt);CY=+dt.slice(0,4);PY=CY-1}
  applyStatus();
  const last={},open={};
  for(const c of C){const v=inv(c);if(v&&v.last)last[c.id]=v.last}
  for(const a of A){if(!a.customerId)continue;
    if(a.date&&(!last[a.customerId]||a.date>last[a.customerId]))last[a.customerId]=a.date;
    if(a.nextDate&&!a.done)(open[a.customerId]=open[a.customerId]||[]).push(a)}
  D={last,open};
  RK={};for(const c of C){const r=riskOf(c);if(r)RK[c.id]=r}
}
const noContact30=c=>{const d=ago(D.last[c.id]);return d===null||d>R.temas};
const isCold=c=>c.status!=='Pasif'&&noContact30(c);
const isDue=c=>(D.open[c.id]||[]).some(a=>a.nextDate<=TODAY);

function visible(){
  const q=low(st.q);
  let r=C.filter(c=>(!st.rep||c.rep===st.rep)&&(!st.seg||(st.seg==='__bos'?!c.segment:c.segment===st.seg))&&(!st.status||(c.status||'')===st.status)&&(!st.chain||(st.chain==='__any'?!!chainOf(c):chainOf(c)===st.chain))&&(!q||low([c.name,c.chain,c.city,c.postcode,ctOf(c).contact,c.address].join(' ')).includes(q)));
  if(st.quick==='route')r=r.filter(c=>TODAYNAME&&c.visitDay===TODAYNAME);
  if(st.quick==='due')r=r.filter(isDue);
  if(st.quick==='cold')r=r.filter(isCold);
  if(st.quick==='od'){const m=new Map();r=r.filter(c=>{const o=oiOf(c);if(o&&o.od>0){m.set(c.id,o.od);return true}return false});r.sort((a,b)=>m.get(b.id)-m.get(a.id));return r}
  if(st.quick==='risk'){r=r.filter(c=>RK[c.id]);r.sort((a,b)=>RK[b.id].val-RK[a.id].val);return r}
  r.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'tr'));
  return r;
}

function renderTop(){
  renderUser();
  {const lk=repLock();$('#reps').innerHTML=(lk!==null?[lk]:['',...allReps()]).map(r=>`<button class="chip${st.rep===r?' on':''}" data-rep="${esc(r)}" aria-pressed="${st.rep===r}"${lk!==null?' disabled title="Yalnız kendi müşterilerinizi görüyorsunuz"':''}>${r==='—'?'Temsilci eşleşmedi':r?esc(r):'Tüm temsilciler'}</button>`).join('')}
  $('#ximpBtn').hidden=!(canWrite&&can('x_import'));$('#oimpBtn').hidden=!(canWrite&&can('x_openinv'));$('#simpBtn').hidden=!(canWrite&&can('x_sales')&&can('v_all'));$('#xexp').hidden=$('#xsal').hidden=!can('x_export');$('#umSep').hidden=$('#ximpBtn').hidden&&$('#oimpBtn').hidden&&$('#simpBtn').hidden&&$('#xexp').hidden;
  $('#umRules').hidden=!can('e_rules');$('#umPerms').hidden=!isAdmin();$('#umSep2').hidden=$('#umRules').hidden&&$('#umPerms').hidden;
  $('#umRules').classList.toggle('on',st.view==='admin');$('#umPerms').classList.toggle('on',st.view==='perms');
  if($('#umRole'))$('#umRole').textContent=roleKnown()?roleName(myRole()):'';
  {const dt=(RET&&RET.through)||(MON&&MON.through);$('#sub').textContent=dt?`Satış verisi ${fmt(dt)} tarihine kadar${OI&&OI.asOf?` · açık faturalar ${fmt(OI.asOf)}`:''}`:'Marketler, ziyaret notları ve sıradaki adımlar tek yerde'}
  let b='';
  if(st.nodb)b=`<span>Kayıtlara ulaşılamıyor. ${esc(window.CRM_DIAG||'Supabase ayarlarını (CRM_CONFIG) ve internet bağlantısını kontrol edin.')}</span>`;
  else if(st.err)b='<span>Kayıtlar okunamadı. Sayfayı daha sonra tekrar açın.</span>';
  else if(st.slow&&!loaded)b='<span>Veriye henüz ulaşılamıyor; bağlantınızı kontrol edin. Gösterilenler güncel olmayabilir.</span>';
  else if(!canWrite)b='<span>Salt okunur görünüm: kayıt eklemek için sayfa sahibinden “Contributor” yetkisi isteyin.</span>';
  else if(C.some(c=>c.sample))b=`<span><b>Örnek kayıtlar gösteriliyor.</b> Kendi listenizi “İçe aktar” ile ekleyin; örnekleri tek tıkla silebilirsiniz.</span><button class="ghost" id="clearSample" type="button">${st.arm==='samples'?'Emin misiniz? Evet, sil':'Örnekleri sil'}</button>`;
  $('#banner').innerHTML=b;
}
function renderStats(){
  const mine=C.filter(c=>!st.rep||c.rep===st.rep),ids=new Set(mine.map(c=>c.id));
  const rk=mine.filter(c=>RK[c.id]),rkv=rk.reduce((a,c)=>a+RK[c.id].val,0),rkPasL=mine.filter(c=>c.status==='Pasif'),rkPas=rkPasL.length,sumOf=k=>rkPasL.reduce((a,c)=>a+(typeof c[k]==='number'?c[k]:0),0);
  const odOk=can('v_overdue');
  const S=[['route',mine.filter(c=>TODAYNAME&&c.visitDay===TODAYNAME).length,`Bugün rutta (${TODAYNAME||'hafta sonu'})`],['risk',rk.length,`Kayıp riski · ${eur(rkv)}`],...(VISIT_LOG?[['due',mine.filter(isDue).length,'Takip zamanı gelmiş']]:[]),['cold',mine.filter(isCold).length,`${R.temas}+ gündür temas yok (aktif)`],...(OI&&OI.map&&odOk?(()=>{let n=0,v=0;for(const c of mine){const o=oiOf(c);if(o&&o.od>0){n+=o.odn;v+=o.od}}return [['od',n,`Vadesi geçen · ${eur(v)}`]]})():[])];
  const dueSum=OI&&OI.map&&odOk?mine.reduce((a,c)=>{const d=dueMonthOf(c);return a+(d?d.amt:0)},0):0;
  $('#stats').style.setProperty('--n',S.length+1);$('#stats').style.setProperty('--m',S.length+1===4?2:3);
  $('#stats').innerHTML=S.map(([k,v,l])=>`<button class="stat${st.quick===k?' on':''}" data-quick="${k}" aria-pressed="${st.quick===k}"><b>${k==='od'?`<i class="stnum">${v}</i><small class="stunit">vadesi geçen fatura</small>`:v}</b><span>${l}</span>${k==='risk'?`<small class="stsub" id="rkPas" title="Pasif müşterilerin tamamı (kayıp riskine sayılmaz)">Pasif müşteri: ${rkPas}</small><small class="stsub" id="rkPasC" title="Bu pasif müşterilerin toplam cirosu: ${PY} yılı ve ${CY} YTD (net satış)">${PY}: ${eur(sumOf('ciro2025'))} · ${CY}: ${eur(sumOf('sales2026'))}</small>`:k==='od'?`<small class="stsub" id="odDue" title="Bugünden ay sonuna kadar vadesi dolacak faturaların kalan tutarı (Vade Takibi sekmesindeki ikinci liste)">Bu ay vadesi gelecek: ${eur(dueSum)}</small>`:''}</button>`).join('')+ordStat(mine);
  renderOrd();
}
const MONTHS_LONG=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const OUT_CRM="CRM'de olmayan",NO_REP='Temsilci yok';
function monRows(){
  if(!MON||!MON.map)return null;const byCode=new Map(CALL.map(c=>[code(c),c]));const reps={};
  for(const [k,v] of Object.entries(MON.map)){const [sat=0,n=0,iade=0,ff=0]=v||[];const c=byCode.get(k);const r=c?(c.rep||NO_REP):OUT_CRM;const o=reps[r]||(reps[r]={sat:0,iade:0,ff:0,amt:0,n:0,cust:0});o.sat+=sat;o.iade+=iade;o.ff+=ff;o.amt+=sat+iade+ff;o.n+=n;if(n)o.cust++}
  return reps;
}
function ordStat(mine){
  const reps=monRows();const mname=MON&&MON.month?MONTHS_LONG[+MON.month.slice(5,7)-1]:'';
  let v='–',amt=0;if(reps){amt=st.rep?(reps[st.rep]?.amt||0):Object.values(reps).reduce((a,o)=>a+o.amt,0);v=eur(amt)}
  const t=tgtOf(st.rep);
  return `<button class="stat${st.ord?' on':''}" id="ordBtn" aria-pressed="${!!st.ord}"><b>${v}</b><span>Bu ay net ciro${mname?` (${mname})`:''}${t?` · hedef ${eur(t)} (%${Math.round(amt/t*100)})`:st.rep?'':' · temsilci dağılımı'}</span>${barHtml(amt,t)}</button>`;
}
function renderOrd(){
  const el=$('#ordp');if(!st.ord){el.innerHTML='';return}
  const reps=monRows();if(!reps){el.innerHTML='<div class="ordp"><p>Bu ayın verisi henüz yüklenmedi.</p></div>';return}
  for(const r of Object.keys(tgtMap()))if(!reps[r])reps[r]={sat:0,iade:0,ff:0,amt:0,n:0,cust:0};
  if(repLock()!==null)for(const r of Object.keys(reps))if(r!==st.rep)delete reps[r];
  const rows=Object.entries(reps).sort((a,b)=>b[1].amt-a[1].amt);
  const sum=k=>rows.reduce((a,[,o])=>a+o[k],0);const tot=sum('amt');
  const upd=MON.updatedAt?` · güncelleme ${fmt(MON.updatedAt)}`:'';const thr=MON.through?` · ${fmt(MON.through)} dahil`:'';
  const neg=v=>v?eur(v):'–';
  const hasT=tgtOf('')>0,tc=(v,t)=>hasT?`<td>${t?eur(t):'–'}</td><td>${t?`%${Math.round(v/t*100)}`:'–'}</td>`:'';
  el.innerHTML=`<div class="ordp"><div class="oh"><b>Bu ay net ciro – temsilci bazında (${MONTHS_LONG[+MON.month.slice(5,7)-1]} ${MON.month.slice(0,4)})</b><small>Net ciro = satış faturası − iade − fiyat farkı${thr}${upd}${hasT?` · ayın %${Math.round(monthFrac()*100)}${pctEk(Math.round(monthFrac()*100))} geçti`:''}</small></div>
  <table><thead><tr><th>Temsilci</th><th>Net ciro</th><th>Satış</th><th>İade</th><th>Fiyat farkı</th><th>Fatura</th><th>Müşteri</th><th>Pay</th>${hasT?'<th>Hedef</th><th>Gerçekleşme</th>':''}</tr></thead><tbody>
  ${rows.map(([r,o])=>`<tr${st.rep===r?' class="on"':''}><td>${r===OUT_CRM||r===NO_REP?esc(r):`<button class="lnk" data-rep="${esc(st.rep===r?'':r)}">${esc(r)}</button>`}</td><td><b>${eur(o.amt)}</b></td><td>${eur(o.sat)}</td><td>${neg(o.iade)}</td><td>${neg(o.ff)}</td><td>${o.n}</td><td>${o.cust}</td><td>${tot?(o.amt/tot*100).toFixed(1).replace('.',','):'0'}%</td>${tc(o.amt,tgtOf(r===OUT_CRM||r===NO_REP?'\u0000':r))}</tr>`).join('')}
  </tbody><tfoot><tr><td>Toplam</td><td><b>${eur(tot)}</b></td><td>${eur(sum('sat'))}</td><td>${neg(sum('iade'))}</td><td>${neg(sum('ff'))}</td><td>${sum('n')}</td><td>${sum('cust')}</td><td>100%</td>${tc(tot,tgtOf(''))}</tr></tfoot></table></div>`;
}
function renderList(){
  const r=visible();
  $('#count').textContent=`${r.length} müşteri`;
  $('#qf').textContent=st.quick?{route:'Filtre: bugünkü rut',due:'Filtre: takibi gelenler',cold:`Filtre: ${R.temas}+ gün temas yok`,risk:'Filtre: kayıp riski (en büyük kayıp üstte)',od:'Filtre: vadesi geçmiş açık faturası olanlar (en büyük tutar üstte)'}[st.quick]:'';
  if(!C.length){$('#list').innerHTML=`<li class="empty">${loaded?'Henüz müşteri yok. <b>İçe aktar</b> ile Excel listenizi yükleyin.':'Yükleniyor…'}</li>`;return}
  if(!r.length){$('#list').innerHTML='<li class="empty">Bu filtrelere uyan müşteri yok.</li>';return}
  $('#list').innerHTML=r.map(c=>{const d=ago(D.last[c.id]),rk=RK[c.id],rt=retOf(c),oi=oiOf(c);
    const sub=st.quick==='od'&&oi?`<small class="rk">${eur(oi.od)} vadesi geçmiş · en eski ${oi.odMax} gün</small>`:st.quick==='risk'&&rk?`<small class="rk">${esc(riskText(rk))}</small>`:`<small>${esc([c.chain,c.city,c.rep,c.visitDay].filter(Boolean).join(' · ')||'—')}</small>`;
    return `<li><button class="row${st.sel===c.id?' sel':''}" data-id="${esc(c.id)}"><span class="seg${segCls(c.segment)}" title="${esc(c.segment||'')}">${esc(c.segment||'–')}</span><span class="rm"><b${c.status==='Pasif'?' class="pas"':''}>${esc(c.name)}</b>${sub}</span><span class="lc${noContact30(c)?' cold':''}">${aragOf(c)?'<em class="rtag ar" title="ARAG süreci aktif">ARAG</em>':''}${oi&&oi.od>0&&st.quick!=='od'?`<em class="rtag rt" title="Vadesi geçmiş açık fatura: ${eur(oi.od)}">vade ${oi.odMax} gün</em>`:''}${rt&&rt.warn?`<em class="rtag rt" title="İade oranı %${pct1(RET_WARN)} üzerinde">iade %${pct1(rt.p)}</em>`:''}${rk&&st.quick!=='risk'?'<em class="rtag" title="Kayıp riski">risk</em>':''}${VISIT_LOG&&isDue(c)?'<em class="tk-tag">takip</em>':''}${noContact30(c)?`<i class="dot" title="${R.temas}+ gündür temas yok"></i>`:''}${d===null?'temas yok':d===0?'bugün':d+' gün'}</span></button></li>`}).join('');
}
function actRow(a){
  const late=!a.done&&a.nextDate&&a.nextDate<=TODAY;
  return `<li><div class="tm"><b>${fmt(a.date)}</b><span class="ty t${TYPES.indexOf(a.type)}">${esc(a.type||'Not')}</span></div><div class="tb"><small>${esc(a.rep||'')}</small>${+a.amount?`<span class="amt">${eur(+a.amount)}</span>`:''}${a.outcome?`<p class="oc">${esc(a.outcome)}</p>`:''}${a.note?`<p>${esc(a.note)}</p>`:''}${a.nextAction||a.nextDate?`<label class="nx${a.done?' done':''}${late?' late':''}"><input type="checkbox" data-done="${esc(a.id)}" ${a.done?'checked':''} ${canNote()?'':'disabled'}> <span>${esc(a.nextAction||'Takip')}${a.nextDate?' · '+fmt(a.nextDate):''}</span></label>`:''}</div></li>`;
}
// masaüstünde kart her zaman görünen alana sığar ve kendi içinde kayar (liste kaydırmasından bağımsız)
function fitDetail(){const d=$('#detail');if(!d)return;if(innerWidth<=900){d.style.maxHeight='';return}
  const t=Math.max(d.getBoundingClientRect().top,12);d.style.maxHeight=Math.max(innerHeight-t-12,240)+'px'}
{let raf=0;const f=()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;fitDetail()})};addEventListener('scroll',f,{passive:true});addEventListener('resize',f)}
function renderDetail(){
  const el=$('#detail'),c=C.find(x=>x.id===st.sel);
  el.classList.toggle('open',!!c);
  if(st.lastSel!==st.sel){st.lastSel=st.sel;el.scrollTop=0}
  if(!c){st.formFor=null;el.innerHTML=`<div class="ph"><h2>Bir müşteri seçin</h2><p>Listeden bir market seçtiğinizde bilgileri, geçmiş ziyaretleri ve sıradaki takip burada görünür.</p><ul><li>Üstteki kutulara tıklayarak bugünkü rutu, takibi gelmiş ya da uzun süredir ziyaret edilmeyen müşterileri süzebilirsiniz.</li>${VISIT_LOG?'<li>Her ziyaretten sonra kısa bir not girin; not o günün tarihiyle kaydedilir.</li>':''}</ul></div>`;return}
  const acts=A.filter(a=>a.customerId===c.id).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||(b.createdAt||0)-(a.createdAt||0));
  const reps=allReps();if(c.rep&&!reps.includes(c.rep))reps.push(c.rep);
  const lastD=D.last[c.id],iv=inv(c),ct=ctOf(c),rk=RK[c.id],rt=retOf(c),oi=oiOf(c);
  const info=[['Adres',[c.address,c.postcode,c.city].filter(Boolean).join(', ')],['Yetkili',ct.contact],['Telefon',ct.phone],['Rut günü',c.visitDay],['Ziyaret sıklığı',[c.freq,c.weeks&&c.freq!=='Haftalık'?'hafta '+c.weeks:''].filter(Boolean).join(' · ')],['Merch',c.merch],['Dizim',c.dizim],['Ödeme vadesi',c.pay],['Son temas',lastD?`${fmt(lastD)} (${ago(lastD)===0?'bugün':ago(lastD)+' gün önce'})`:''],['Son fatura',iv&&iv.last?`${fmt(iv.last)} (${ago(iv.last)} gün önce)${iv.no?' · '+iv.no:''}`:''],[`${CY} net satış`,iv?[iv.sales!=null&&iv.sales!==''?eur(iv.sales):'',iv.n!=null&&iv.n!==''?iv.n+' fatura':''].filter(Boolean).join(' · '):'']];
  const ve=canVisit(),vs=(k,opts,v,lab)=>`<select class="vsel" data-vk="${k}" data-cid="${esc(c.id)}" aria-label="${lab}">${k==='weeks'&&opts.includes(v)?'':`<option value="">${k==='weeks'?'hafta –':'–'}</option>`}${opts.map(o=>`<option value="${esc(o)}"${o===(v||'')?' selected':''}>${k==='weeks'?'hafta ':''}${esc(o)}</option>`).join('')}</select>`;
  const wk=WEEKS_OF[c.freq]||[];
  const ddv=(k,v)=>!ve?null:k==='Rut günü'?vs('visitDay',DAYS,c.visitDay,'Rut günü'):k==='Ziyaret sıklığı'?vs('freq',FREQS,c.freq,'Ziyaret sıklığı')+(wk.length>1?vs('weeks',wk,c.weeks,'Ziyaret haftaları'):''):k==='Merch'?vs('merch',VY,c.merch,'Merch'):k==='Dizim'?vs('dizim',VY,c.dizim,'Dizim'):null;
  el.innerHTML=`<button class="back" id="back" type="button">← Listeye dön</button>
  <div class="dh"><div><h2${c.status==='Pasif'?' class="pas"':''}>${esc(c.name)}</h2>${c.rep?`<p class="drep" id="dRep">Temsilci: ${esc(c.rep)}</p>`:''}<p class="tags">${c.segment?`<span class="seg${segCls(c.segment)}">${esc(c.segment)}</span>`:''}${statusHtml(c)}${c.chain?`<span class="tag">${esc(c.chain)}</span>`:''}</p></div>
</div>
  ${rk?`<p class="alert" id="riskAlert">Kayıp riski: ${esc(riskText(rk))}</p>`:''}${oi&&oi.od>0?`<p class="alert" id="odAlert">Vadesi geçmiş açık fatura: ${eur(oi.od)} · ${oi.odn} fatura, en eski ${oi.odMax} gün</p>`:''}${aragHtml(c,oi)}${rt&&rt.warn?`<p class="alert" id="retAlert">Yüksek iade: satışın %${pct1(rt.p)}${pctEk(pct1(rt.p))} iade (${eur(Math.abs(rt.iade))} / ${eur(rt.sales)})</p>`:''}
  ${ctaHtml(c,ct)}
  ${chainHtml(c)}
  <dl class="info">${info.map(([k,v])=>`<div${k==='Adres'?' class="full"':''}><dt>${k}</dt><dd${(k==='Merch'||k==='Dizim')&&v?` class="${v==='Var'?'yes':'no'}"`:''}>${ddv(k,v)??(k==='Telefon'&&v?`<a href="${esc(telHref(v))}">${esc(v)}</a>`:esc(v||'–'))}</dd></div>`).join('')}${cmpRow(c)}${retRows(c)}</dl>
  ${oiHtml(c)}
  ${VISIT_LOG&&canNote()?visitForm(c):''}
  ${VISIT_LOG?`<h3>Geçmiş</h3><ol class="tl">${acts.length?acts.map(actRow).join(''):'<li class="empty">Henüz kayıt yok.</li>'}</ol>`:''}`;
}
function ctaHtml(c,ct){
  const edit=st.ctEdit===c.id;
  return `<div class="cta">${ct.phone?`<a class="call" id="ctCall" href="${esc(telHref(ct.phone))}">Ara</a><a id="ctWa" href="https://wa.me/${esc(waNum(ct.phone))}" target="_blank" rel="noopener">WhatsApp</a>`:''}<a id="ctMap" href="${esc(mapsHref(c))}" target="_blank" rel="noopener">Yol tarifi</a>${canWrite&&can('e_notes')&&!edit?`<button type="button" id="ctEdit">${ct.phone||ct.contact?'İletişimi düzenle':'Telefon / yetkili ekle'}</button>`:''}</div>
  ${edit?`<form class="ctf" id="ctform" autocomplete="off"><label>Yetkili kişi<input name="contact" value="${esc(ct.contact)}"></label><label>Telefon<input name="phone" type="tel" inputmode="tel" placeholder="06 12345678" value="${esc(ct.phone)}"></label><button class="primary" type="submit">Kaydet</button><button class="ghost" type="button" id="ctCancel">Vazgeç</button>${ct.contact?'<button class="ghost danger" type="button" id="ctDel">Yetkiliyi sil</button>':''}</form>`:''}`;
}
function visitForm(c){
  const due=(D.open[c.id]||[]).filter(a=>a.nextDate<=TODAY);
  const radio=(name,v,on)=>`<label><input type="radio" name="${name}" value="${esc(v)}"${on?' checked':''}><span>${esc(v)}</span></label>`;
  return `<form class="aform" id="aform" autocomplete="off"><h3>Ziyaret Kaydı</h3>
    <fieldset class="typ"><legend>Kanal</legend>${CHANNELS.map(x=>radio('ch',x,x===(CHANNELS.includes(st.type)?st.type:'Ziyaret'))).join('')}</fieldset>
    <fieldset class="typ"><legend>Sonuç</legend>${OUTCOMES.map(o=>radio('out',o[0],false)).join('')}</fieldset>
    <label class="amtf" hidden>Sipariş tutarı (€, isteğe bağlı)<input name="amount" inputmode="decimal" placeholder="örn. 850"></label>
    <label>Not<textarea name="note" rows="2" placeholder="İsteğe bağlı: raf durumu, rakip, istek…"></textarea></label>
    <div class="g2"><label>Sıradaki adım<input name="nextAction" placeholder="örn. Tekrar ziyaret et"></label><label>Takip tarihi<input type="date" name="nextDate" min="${TODAY}"></label></div>
    <div class="qd">Takip: ${[[3,'3 gün'],[7,'1 hafta'],[14,'2 hafta'],[30,'1 ay'],[0,'Yok']].map(([n,l])=>`<button type="button" data-nd="${n}">${l}</button>`).join('')}</div>
    ${due.length?`<label class="nx"><input type="checkbox" name="closeDue" checked> <span>Zamanı gelen ${due.length} takibi tamamlandı say</span></label>`:''}
    <button class="primary" type="submit">Kaydet</button></form>`;
}
function syncOutcome(f,defaults){
  const v=(f.querySelector('input[name=out]:checked')||{}).value||'';
  f.querySelector('.amtf').hidden=v!=='Sipariş alındı';
  if(!defaults)return;const o=OUTCOMES.find(x=>x[0]===v);if(!o)return;
  const na=f.elements.nextAction,nd=f.elements.nextDate;
  if(na.dataset.touched!=='1')na.value=o[2];if(nd.dataset.touched!=='1')nd.value=o[1]?addDays(o[1]):'';
}
function renderBoard(){
  $('#tabB').hidden=!can('v_board');
  if(st.view!=='board')return;
  const mk=monthKey(),mon=monRows()||{},d7=addDays(-7),d30=addDays(-30);
  const cm=Object.fromEntries(C.map(c=>[c.id,c]));
  const repOf=a=>a.rep||(cm[a.customerId]||{}).rep||'';
  const T={n:0,ak:0,c25:0,s26:0,c25b:0,ord:0,t:0,a7:0,a30:0,late:0,rk:0,rkv:0,np:0};
  // tempo yalnız geçen yıl cirosu olan müşterilerle (zincir özeti ve kartla aynı kural)
  const both=c=>typeof c.ciro2025==='number'&&c.ciro2025>0&&typeof c.sales2026==='number';
  const rows=allReps().filter(r=>repLock()===null||r===st.rep).map(r=>{const cs=C.filter(c=>c.rep===r);
    const o={r,n:cs.length,ak:cs.filter(c=>c.status!=='Pasif').length,
      c25:cs.reduce((a,c)=>a+(typeof c.ciro2025==='number'?c.ciro2025:0),0),
      s26:cs.reduce((a,c)=>a+(typeof c.sales2026==='number'?c.sales2026:0),0),
      c25b:cs.reduce((a,c)=>a+(both(c)?c.ciro2025:0),0),
      s26b:cs.reduce((a,c)=>a+(both(c)?c.sales2026:0),0),
      ord:(mon[r]||{}).amt||0,t:tgtOf(r),
      a7:A.filter(a=>repOf(a)===r&&a.date>=d7).length,a30:A.filter(a=>repOf(a)===r&&a.date>=d30).length,
      late:A.filter(a=>repOf(a)===r&&a.nextDate&&!a.done&&a.nextDate<TODAY&&cm[a.customerId]).length,
      rk:cs.filter(c=>RK[c.id]).length,rkv:cs.reduce((a,c)=>a+(RK[c.id]?RK[c.id].val:0),0),
      np:cs.filter(c=>c.status!=='Pasif'&&!ctOf(c).phone).length};
    return o}).filter(o=>o.n||o.t);
  for(const o of rows)for(const k in T)T[k]+=o[k]||0;
  T.s26b=rows.reduce((a,o)=>a+o.s26b,0);
  const pace=o=>o.c25b>0?(()=>{const g=o.s26b/(o.c25b*YF)-1;return `<span class="${gCls(g)}">${gPct(g)}</span>`})():'–';
  const ordC=o=>`${eur(o.ord)}${o.t?` <span class="sm">/ ${eur(o.t)} · %${Math.round(o.ord/o.t*100)}</span>`:''}`;
  const tr=(o,tot)=>`<tr><td>${tot?'Toplam':`<button class="lnk" data-brep="${esc(o.r)}">${esc(o.r)}</button>`}</td><td>${o.n} <span class="sm">(${o.ak} aktif)</span></td><td>${eur(o.c25)}</td><td>${eur(o.s26)}</td><td>${pace(o)}</td>${VISIT_LOG?`<td>${o.a7} / ${o.a30}</td>`:''}<td>${tot?`${o.rk} · ${eur(o.rkv)}`:`<button class="lnk" data-brisk="${esc(o.r)}">${o.rk} · ${eur(o.rkv)}</button>`}</td></tr>`;
  // iade oranı en yüksek ilk 25: varsayılan aktifler; genel ilk 25'teki pasifler çizginin altında
  const RTOP=25,isPas=c=>c.status==='Pasif',rf=['aktif','pasif'].includes(st.rf)?st.rf:'both';
  const retAll=C.map(c=>[c,retOf(c)]).filter(([,r])=>r&&r.warn).sort((a,b)=>b[1].p-a[1].p);
  const top=rf==='pasif'?retAll.filter(([c])=>isPas(c)).slice(0,RTOP):retAll.filter(([c])=>!isPas(c)).slice(0,RTOP);
  const topPas=rf==='both'?retAll.slice(0,RTOP).filter(([c])=>isPas(c)):[];
  const nAkt=retAll.filter(([c])=>!isPas(c)).length,nPas=retAll.length-nAkt;
  const retRow=([c,r],i)=>`<tr${isPas(c)?' class="pasr"':''}><td class="rk">${i+1}</td><td><button class="lnk" data-open="${esc(c.id)}">${esc(c.name)}</button></td><td>${esc(c.rep||'')}</td><td>${eur(r.sales)}</td><td>${eur(Math.abs(r.iade))}</td><td><b class="warn">%${pct1(r.p)}</b></td></tr>`;
  const rfBtn=(k,l)=>`<button type="button" data-rf="${k}" aria-pressed="${rf===k}">${l}</button>`;
  const mname=`${MONTHS_LONG[+mk.slice(5,7)-1]} ${mk.slice(0,4)}`;
  $('#board').innerHTML=`<h3>Temsilci Karnesi</h3>
  <div class="ordp"><div class="oh"><b>Tempo: ${CY} YTD satış, ${PY} cirosunun aynı dönemine göre (${fmt(dataTo())} itibarıyla yılın %${Math.round(YF*100)}${pctEk(Math.round(YF*100))})</b><small>Tempo yalnız ${PY} cirosu olan müşterilerle hesaplanır; yeni müşteriler dahil değildir.${VISIT_LOG?' Kayıt = ziyaret/telefon notu (7 gün / 30 gün).':''}</small></div>
  <table id="boardT"><thead><tr><th>Temsilci</th><th>Müşteri</th><th>Ciro ${PY}</th><th>${CY} YTD</th><th>Tempo</th>${VISIT_LOG?'<th>Kayıt 7g / 30g</th>':''}<th>Kayıp Riski</th></tr></thead>
  <tbody>${rows.map(o=>tr(o)).join('')}</tbody><tfoot>${tr(T,1)}</tfoot></table></div>
  <div class="rethead"><h3>En Yüksek İade Oranı <small class="sm">ilk ${RTOP} · satışın %${pct1(RET_WARN)}${pctEk(pct1(RET_WARN))} ve üzeri · ${nAkt} aktif, ${nPas} pasif müşteri bu eşiğin üzerinde</small></h3>
    <div class="seg2" role="group" aria-label="Durum filtresi">${rfBtn('both','Aktif + Pasif')}${rfBtn('aktif','Aktif')}${rfBtn('pasif','Pasif')}</div></div>
  ${top.length||topPas.length?`<div class="ordp"><table id="retT"><thead><tr><th class="rk">#</th><th>Müşteri</th><th>Temsilci</th><th>Satış</th><th>İade</th><th>Oran</th></tr></thead><tbody>${top.map(retRow).join('')}${topPas.length?`<tr class="sep"><td colspan="6">Pasif · genel ilk ${RTOP}'te yer alan ${topPas.length} müşteri</td></tr>${topPas.map(retRow).join('')}`:''}</tbody></table></div>`:'<p class="empty">İade oranı yüksek müşteri yok.</p>'}
`;
}
/* ===== Hedef takibi (Excel'deki temsilci hedef tablosu) =====
   Veri aylık girilir: docs koleksiyonu "qtargets", belge kimliği "2026-11" gibi.
   Çeyrek (2026-Q4) ve yıl (2026-Y) görünümleri o ayların toplamıdır.
   { period, reps: { "Özgür Firat": { c:{atis:{p,t,a},…}, f:{tahsilat:{t,a},…} } }, updatedAt, by }
   p = 2025 sell-out, t = 2026 hedef, a = 2026 sell-out (gerçekleşen).
   Yalnızca yönetici düzenler (veritabanı kuralı da öyle); herkes görür. */
const QCATS=[['atis','Atıştırmalık'],['icecek','İçecek'],['mutfak','Mutfak'],['nonfood','Non-Food'],['temel','Temel Gıda']];
const QFIN=[['devir','Önceki Ay Devir'],['tahsilat','Tahsilat'],['fkns','FKNS'],['iade','İade']];
const QNAMES=['Q1','Q2','Q3','Q4'];
const QMON=['Ocak–Mart','Nisan–Haziran','Temmuz–Eylül','Ekim–Aralık'];
const QTEAM='Akar Benelux Toplam';
let QTS={};
const eurIn=n=>n==null||n===''||!isFinite(n)?'':Math.round(n).toLocaleString('nl-NL');
const nz=v=>typeof v==='number'&&isFinite(v)?v:0;
const qNow=()=>TODAY.slice(0,7);
// seçili hedef döneminin yılı: tablo başlıkları ve kıyas etiketi buna göre (2027 seçilince 2027 Hedef / 2026 Sell-Out)
const qY=()=>+(st.qp||qNow()).slice(0,4),qYY=()=>`${String(qY()).slice(2)} vs ${String(qY()-1).slice(2)}`;
const isMonthKey=k=>/^\d{4}-\d{2}$/.test(k);
const p2=n=>String(n).padStart(2,'0');
function qMonths(key){if(isMonthKey(key))return [key];const [y,q]=key.split('-');const ms=q==='Y'?[1,2,3,4,5,6,7,8,9,10,11,12]:[0,1,2].map(i=>(+q.slice(1)-1)*3+1+i);return ms.map(m=>`${y}-${p2(m)}`)}
function qRange(key){if(isMonthKey(key)){const [y,m]=key.split('-').map(Number);return [key+'-01',iso(new Date(y,m,0))]}const [y,q]=key.split('-');if(q==='Y')return [y+'-01-01',y+'-12-31'];const m=(+q.slice(1)-1)*3+1;return [`${y}-${p2(m)}-01`,iso(new Date(+y,m+2,0))]}
// dönemin geçen kısmı (0–1): gerçekleşmenin bugün olması gereken seviyesi
// rakamların tarihi: dönemdeki girilmiş ayların en yenisi (girilmemişse bugün)
function qAsOf(key){const d=qMonths(key).map(m=>(QTS[m]||{}).asOf).filter(Boolean).sort();return d.length?d[d.length-1]:''}
// dönemin geçen kısmı (0–1): rakamların tarihinde gerçekleşmenin olması gereken seviye
function qPace(key){const [s,e]=qRange(key),ref=qAsOf(key)||TODAY;if(ref<s)return 0;if(ref>e)return 1;const d=x=>Date.parse(x)/864e5;return (d(ref)-d(s)+1)/(d(e)-d(s)+1)}
const qTitle=key=>{if(isMonthKey(key))return `${MONTHS_LONG[+key.slice(5,7)-1]} ${key.slice(0,4)}`;const [y,q]=key.split('-');return q==='Y'?`${y} Yılı (ayların toplamı)`:`${q} ${y} · ${QMON[+q.slice(1)-1]} (ayların toplamı)`};
function qAdd(out,e){
  for(const [k] of QCATS){const s=((e||{}).c||{})[k];if(!s)continue;const o=out.c[k]||(out.c[k]={p:0,t:0,a:0});o.p+=nz(s.p);o.t+=nz(s.t);o.a+=nz(s.a)}
  for(const [k] of QFIN){const s=((e||{}).f||{})[k];if(!s)continue;const o=out.f[k]||(out.f[k]={t:0});o.t+=nz(s.t);if(s.a!=null)o.a=nz(o.a)+nz(s.a)}
  return out}
function qEntry(key,rep){const out={c:{},f:{}};for(const m of qMonths(key))qAdd(out,((QTS[m]||{}).reps||{})[rep]);return out}
const qTeam=key=>{const out={c:{},f:{}};for(const r of allReps())qAdd(out,qEntry(key,r));return out};
const qCat=(e,k)=>{const s=(e.c||{})[k]||{};return {p:nz(s.p),t:nz(s.t),a:nz(s.a)}};
const qTot=e=>QCATS.reduce((o,[k])=>{const s=qCat(e,k);o.p+=s.p;o.t+=s.t;o.a+=s.a;return o},{p:0,t:0,a:0});
const qHas=e=>QCATS.some(([k])=>{const s=qCat(e,k);return s.p||s.t||s.a})||QFIN.some(([k])=>{const s=(e.f||{})[k]||{};return nz(s.t)||nz(s.a)});
const qPct=(a,t)=>t?a/t:null;
const qGrow=(a,p)=>p>0?a/p-1:null;
// renk: hedefe ulaştı = yeşil yazı; dönemin geçen kısmının gerisinde = kırmızı. İade bir sınırdır: aşılınca kırmızı.
const qCls=(pct,pace,inv)=>pct==null?'':inv?(pct>1?'q-bad':''):(pct>=1?'q-good':pct<pace?'q-bad':'');
const rnd=x=>Math.sign(x)*Math.round(Math.abs(x)); // Excel gibi: -12,5 → -13
const qPctTxt=x=>{if(x==null)return '–';const r=rnd(x*100);return (r<0?'−%':'%')+Math.abs(r)};
const qGrowTxt=x=>{if(x==null)return '–';const r=rnd(x*100);return (r>0?'+':r<0?'−':'')+'%'+Math.abs(r)};
const qGrowCls=x=>x==null?'':x<0?'down':'up';
const qMoney=v=>v?eur(v):'–';
function qBar(pct,pace,inv){
  if(pct==null)return '<span class="qbar" aria-hidden="true"></span>';
  const bad=inv?pct>1:pct<pace;
  return `<span class="qbar ${bad?'q-bad':'q-ok'}" aria-hidden="true"><i style="width:${Math.min(100,Math.max(0,pct*100)).toFixed(1)}%"></i>${!inv&&pace>0&&pace<1?`<b style="left:${(pace*100).toFixed(1)}%"></b>`:''}</span>`}
function qCard(name,e,pace,team){
  if(!team&&!qHas(e))return `<article class="qcard qnone" data-qcard="${esc(name)}"><header><h4>${esc(name)}</h4><span class="qbig">–</span></header><p class="sm">Bu dönem için veri girilmemiş.</p></article>`;
  const T=qTot(e),pct=qPct(T.a,T.t),g=qGrow(T.a,T.p),left=T.t-T.a;
  const tah=(e.f||{}).tahsilat||{},tp=tah.a==null?null:qPct(nz(tah.a),nz(tah.t));
  const tahTxt=tah.a!=null?`Tahsilat: ${qMoney(nz(tah.a))} / ${qMoney(nz(tah.t))} hedef (${qPctTxt(tp)})`:nz(tah.t)?`Tahsilat hedefi: ${eur(tah.t)} · gerçekleşen henüz girilmedi`:'';
  return `<article class="qcard${team?' team':''}" data-qcard="${esc(name)}"><div class="qsum">
    <header><h4>${esc(name)}</h4><span class="qbigw"><span class="qbig ${qCls(pct,pace)}">${qPctTxt(pct)}</span><small>gerçekleşme</small></span></header>
    ${qBar(pct,pace)}
    <p class="qline"><b>${eur(T.a)}</b> <span class="sm">/ ${eur(T.t)} hedef</span></p>
    ${T.t?`<p class="qleft">${left>0?`Hedefe kalan: <b>${eur(left)}</b>`:`<span class="q-good">Hedef aşıldı: +${eur(-left)}</span>`}</p>`:''}
    <p class="sm">${qY()-1} aynı dönem: ${qMoney(T.p)} · ${qYY()}: <span class="${qGrowCls(g)}">${qGrowTxt(g)}</span></p>
    ${tahTxt?`<p class="sm">${tahTxt}</p>`:''}</div>
    <ul class="qcats" aria-label="Kategoriler">${QCATS.map(([k,l])=>{const s=qCat(e,k),p=qPct(s.a,s.t);return `<li data-qc="${k}" title="${esc(l)}: ${eur(s.a)} / ${eur(s.t)} hedef"><span>${l}</span>${qBar(p,pace)}<b class="${qCls(p,pace)}">${qPctTxt(p)}</b></li>`}).join('')}</ul>
  </article>`}
function qTable(name,e,pace,team){
  if(!team&&!qHas(e))return `<section class="qblock qnone" data-qblock="${esc(name)}"><h4>${esc(name)}</h4><p class="sm">Bu dönem için veri girilmemiş.</p></section>`;
  const T=qTot(e);
  const row=(l,s,foot)=>{const p=qPct(s.a,s.t),g=qGrow(s.a,s.p);return `<tr${foot?' class="tot"':''}><td>${l}</td><td>${qMoney(s.p)}</td><td>${qMoney(s.t)}</td><td>${qMoney(s.a)}</td><td class="${qCls(p,pace)}">${qPctTxt(p)}</td><td class="${qGrowCls(g)}">${qGrowTxt(g)}</td></tr>`};
  const fin=QFIN.map(([k,l])=>{const s=(e.f||{})[k]||{},p=s.a==null?null:qPct(nz(s.a),nz(s.t));return `<tr><td>${l}</td><td>${qMoney(nz(s.t))}</td><td>${qMoney(nz(s.a))}</td><td class="${qCls(p,pace,k==='iade')}">${qPctTxt(p)}</td></tr>`}).join('');
  return `<section class="qblock${team?' team':''}" data-qblock="${esc(name)}"><h4>${esc(name)}</h4><div class="qtabs">
    <div class="ordp"><table class="qt"><thead><tr><th>Kategori</th><th class="h25">${qY()-1} Sell-Out</th><th class="hT">${qY()} Hedef</th><th class="h26">${qY()} Sell-Out</th><th>Gerçekleşme</th><th>${qYY()}</th></tr></thead>
      <tbody>${QCATS.map(([k,l])=>row(l,qCat(e,k))).join('')}</tbody><tfoot>${row('Genel Toplam',T,1)}</tfoot></table></div>
    <div class="ordp"><table class="qt"><thead><tr><th>Kalem</th><th class="hT">Hedef</th><th class="h26">Gerçekleşen</th><th>Gerçekleşme</th></tr></thead><tbody>${fin}</tbody></table></div>
  </div></section>`}
/* düzenleme formu (yalnızca yönetici, tek çeyrek) */
function qEditHtml(key){
  const cell=(n,v)=>`<td><span class="eurin"><i aria-hidden="true">€</i><input name="${esc(n)}" inputmode="decimal" autocomplete="off" placeholder="0" value="${eurIn(v)}"></span></td>`;
  const block=r=>{const e=qEntry(key,r);
    return `<section class="qblock" data-qblock="${esc(r)}"><h4>${esc(r)}</h4><div class="qtabs">
    <div class="ordp"><table class="qt qe"><thead><tr><th>Kategori</th><th class="h25">${qY()-1} Sell-Out</th><th class="hT">${qY()} Hedef</th><th class="h26">${qY()} Sell-Out</th><th>Gerçekleşme</th></tr></thead>
      <tbody>${QCATS.map(([k,l])=>{const s=((e.c||{})[k])||{};return `<tr><td>${l}</td>${cell(`${r}|c|${k}|p`,s.p)}${cell(`${r}|c|${k}|t`,s.t)}${cell(`${r}|c|${k}|a`,s.a)}<td data-qr="${esc(r)}|${k}">–</td></tr>`}).join('')}</tbody>
      <tfoot><tr class="tot"><td>Genel Toplam</td><td data-qs="${esc(r)}|p">–</td><td data-qs="${esc(r)}|t">–</td><td data-qs="${esc(r)}|a">–</td><td data-qr="${esc(r)}|_">–</td></tr></tfoot></table></div>
    <div class="ordp"><table class="qt qe"><thead><tr><th>Kalem</th><th class="hT">Hedef</th><th class="h26">Gerçekleşen</th></tr></thead>
      <tbody>${QFIN.map(([k,l])=>{const s=((e.f||{})[k])||{};return `<tr><td>${l}</td>${cell(`${r}|f|${k}|t`,s.t)}${cell(`${r}|f|${k}|a`,s.a)}</tr>`}).join('')}</tbody></table></div>
    </div></section>`};
  const [ms,me]=qRange(key),cur=(QTS[key]||{}).asOf||(TODAY<ms?ms:TODAY>me?me:TODAY);
  return `<form id="qform" autocomplete="off" data-key="${esc(key)}">
    <label class="qasof">Rakamların tarihi <input type="date" name="asOf" value="${cur}" min="${ms}" max="${me}" required><span class="sm">Sell-out ve tahsilat rakamları hangi güne kadar? Tempo (kırmızı/yeşil) bu tarihe göre hesaplanır.</span></label>
    <p class="qhelp">Tutarları € olarak girin (örn. 154.917; eksi değer olabilir: -625). <b>Excel'den yapıştırma:</b> Excel'de bir temsilcinin kategori satırlarını (isterseniz Kategori sütunuyla birlikte) kopyalayın, buradaki ilk kutuya yapıştırın; değerler sağa ve aşağı doğru dolar.</p>
    ${allReps().map(block).join('')}
    <div class="qsave"><span class="sm">${qTitle(key)}</span><button type="button" class="ghost" id="qCancel">Vazgeç</button><button class="primary" type="submit">Kaydet</button></div></form>`}
function qformTotals(f){
  const v=e=>{const n=num(e.value);return n==null?0:n};const S={};
  for(const e of f.querySelectorAll('input[name*="|c|"]')){const [r,,k,x]=e.name.split('|');const o=S[r]||(S[r]={p:0,t:0,a:0,c:{}});const c=o.c[k]||(o.c[k]={p:0,t:0,a:0});c[x]=v(e);o[x]+=v(e)}
  for(const td of f.querySelectorAll('[data-qs]')){const [r,x]=td.dataset.qs.split('|');const n=(S[r]||{})[x]||0;td.textContent=n?eur(n):'–'}
  const k=f.dataset.key,[ms,me]=qRange(k),ao=(f.elements.asOf&&f.elements.asOf.value)||TODAY,d=x=>Date.parse(x)/864e5;
  const pace=ao<ms?0:ao>me?1:(d(ao)-d(ms)+1)/(d(me)-d(ms)+1);
  for(const td of f.querySelectorAll('[data-qr]')){const [r,k]=td.dataset.qr.split('|');const o=S[r]||{p:0,t:0,a:0,c:{}};const s=k==='_'?o:(o.c[k]||{t:0,a:0});const p=qPct(s.a,s.t);td.textContent=qPctTxt(p);td.className=qCls(p,pace)}
}
function qPaste(e){
  const inp=e.target;if(!inp.matches||!inp.matches('#qform input'))return;
  const text=(e.clipboardData||window.clipboardData).getData('text')||'';
  if(!/[\t\n]/.test(text.trim()))return; // tek hücre: normal yapıştırma
  e.preventDefault();
  const table=inp.closest('table');const grid=[...table.tBodies[0].rows].map(tr=>[...tr.querySelectorAll('input')]);
  let ri=grid.findIndex(r=>r.includes(inp)),ci=grid[ri].indexOf(inp);
  const isNum=s=>{const t=String(s).trim();return t===''||/^[-−]?\s*€?\s*[-−]?\s*[\d.,\s]*%?$/.test(t)||/^€?\s*-\s*$/.test(t)};
  const hasLetters=s=>/[a-zçğıöşü#]/i.test(s);
  const rows=text.replace(/\r/g,'').split('\n').filter(l=>l.trim()!=='');
  let n=0,i=0;
  rows.forEach(line=>{let cells=line.split('\t');
    if(cells.length&&!isNum(cells[0]))cells=cells.slice(1); // Kategori adı sütunu atlanır
    if(!cells.some(c=>String(c).trim()!==''&&!hasLetters(c)))return; // başlık satırı: atla
    const row=grid[ri+i++];if(!row)return;
    cells.forEach((c,j)=>{const t=row[ci+j];if(!t)return;const s=String(c).trim().replace(/−/g,'-');
      if(/%$/.test(s)||hasLetters(s))return; // yüzde ve #DIV/0! gibi hücreler alınmaz
      const v=/^€?\s*-\s*€?$/.test(s)||s===''?null:num(s.replace(/^-\s*€\s*/,'-').replace(/€\s*-\s*/,'-'));
      t.value=v==null?'':eurIn(v);t.removeAttribute('aria-invalid');n++})});
  const f=inp.closest('form');st.qdirty=true;qformTotals(f);toast(`${n} hücre yapıştırıldı`);
}
function renderTargets(){
  const tRep=repLock()!==null?'':st.rep; // Hedefler: satış temsilcisi de tüm ekibi görür
  $('#tabH').hidden=!can('v_targets');
  if(st.view!=='targets')return;
  if(!st.qp)st.qp=qNow();
  const key=st.qp,y=key.slice(0,4),isM=isMonthKey(key),pace=qPace(key),adm=can('e_targets')&&canWrite;
  if(!isM||!adm)st.qedit=false;
  const years=[...new Set([TODAY.slice(0,4),...Object.keys(QTS).map(k=>k.slice(0,4))])].sort();
  const chip=(k,l)=>`<button type="button" class="chip${key===k?' on':''}" data-qp="${k}" aria-pressed="${key===k}">${l}</button>`;
  const filled=qMonths(key).filter(m=>Object.values((QTS[m]||{}).reps||{}).some(e=>qHas(qAdd({c:{},f:{}},e))));
  const asOf=qAsOf(key);
  let info=pace===0?'Bu dönem henüz başlamadı.':pace===1?'Dönem tamamlandı.':asOf?`Rakamlar <b>${fmt(asOf)}</b> itibarıyla: o tarihte dönemin <b>%${Math.round(pace*100)}${pctEk(Math.round(pace*100))}</b> geçmişti. Gerçekleşme bu oranın altındaysa kırmızı görünür.`:`Bugün ${fmt(TODAY)}: dönemin <b>%${Math.round(pace*100)}${pctEk(Math.round(pace*100))}</b> geçti. Gerçekleşme bu oranın altındaysa kırmızı görünür.`;
  if(!isM)info+=` <br>Verisi girilen aylar: <b>${filled.length?filled.map(m=>MONTHS_LONG[+m.slice(5,7)-1]).join(', '):'yok'}</b>.`;
  const view=st.qv==='tablo'?'tablo':'ozet';
  const reps=allReps().filter(r=>!tRep||r===tRep);
  const team=qTeam(key),any=qHas(team);
  let body;
  if(st.qedit)body=qEditHtml(key);
  else if(!any)body=`<div class="qempty"><p><b>${esc(qTitle(key))}</b> için hedef girilmemiş.</p>${adm?`<p>${isM?'“Düzenle” ile girebilir ya da Excel\'den kopyalayıp yapıştırabilirsiniz.':'Rakamlar aylık girilir: yukarıdan bir ay seçip “Düzenle”ye basın.'}</p>`:''}</div>`;
  else if(view==='tablo')body=(tRep?'':qTable(QTEAM,team,pace,1))+reps.map(r=>qTable(r,qEntry(key,r),pace)).join('');
  else body=`<div class="qgrid">${tRep?'':qCard(QTEAM,team,pace,1)}${reps.map(r=>qCard(r,qEntry(key,r),pace)).join('')}</div>`;
  const months=Array.from({length:12},(_,i)=>`${y}-${p2(i+1)}`);
  $('#targets').innerHTML=`<div class="qhead"><div><h3>Hedef Takibi <small class="sm">${esc(qTitle(key))}${adm?'':' · yalnızca görüntüleme'}</small></h3><p class="sm qinfo">${info}</p></div>
    <div class="qctl">${years.length>1?`<select id="qYear" aria-label="Yıl">${years.map(v=>`<option${v===y?' selected':''}>${v}</option>`).join('')}</select>`:''}
      <select id="qMonth" class="qmsel${isM?' on':''}" aria-label="Ay">${isM?'':'<option value="" selected>Ay seçin</option>'}${months.map(m=>`<option value="${m}"${m===key?' selected':''}>${MONTHS_LONG[+m.slice(5,7)-1]}${QTS[m]?' ●':''}</option>`).join('')}</select>
      <div class="chips" role="group" aria-label="Çeyrek ve yıl">${QNAMES.map(n=>chip(`${y}-${n}`,n)).join('')}${chip(`${y}-Y`,`${y} Yıl`)}</div>
      ${st.qedit?'':`<div class="seg2" role="group" aria-label="Görünüm"><button type="button" data-qv="ozet" aria-pressed="${view==='ozet'}">Özet</button><button type="button" data-qv="tablo" aria-pressed="${view==='tablo'}">Tablo</button></div>`}
      ${adm&&isM&&!st.qedit?'<button type="button" class="ghost" id="qEdit">Düzenle</button>':''}</div></div>
    ${st.qedit?'':`<p class="qleg"><span><i class="lg-ok"></i>Tempoda veya hedefte</span><span><i class="lg-bad"></i>Tempo altında</span><span><i class="lg-pm"></i>Olması gereken seviye (rakamların tarihine göre)</span><span>${qYY()}: ${qY()-1} aynı döneme göre büyüme${pace>0&&pace<1?' (dönem bitmeden düşük görünür)':''}</span></p>`}
    ${body}`;
  if(st.qedit){const f=$('#qform');if(f)qformTotals(f)}
}
/* ===== Zincir müşteriler =====
   Excel'deki "Zincir" sütunu aynı olan mağazalar bir zincir sayılır. Kartta zincirin özeti ve tüm mağazaları gösterilir. */
const CHAIN_NAMES={}; // istenirse elle ad: {'Aksa':'Aksa Groothandel – Zincir'}
const chainOf=c=>String(c.chain||'').trim();
const chainStores=ch=>C.filter(c=>chainOf(c)===ch);
function chainName(ch){if(CHAIN_NAMES[ch])return CHAIN_NAMES[ch];
  const sm=/markt|market/i.test(ch)?'':chainStores(ch).some(c=>/s[uü]permar(k|kt|ket)\b/i.test(c.name||''))?' Supermarkt':'';
  return `${ch}${sm} – Zincir`}
function chainHtml(c){
  const ch=chainOf(c);if(!ch)return '';const S=chainStores(ch);if(S.length<2)return '';
  const n=v=>typeof v==='number'&&isFinite(v)?v:0;
  const monAmt=x=>{const v=MON&&MON.map&&MON.map[code(x)];if(!v)return 0;const [sat=0,,iade=0,ff=0]=v;return sat+iade+ff};
  const both=S.filter(x=>typeof x.ciro2025==='number'&&x.ciro2025>0&&typeof x.sales2026==='number');
  const pb=both.reduce((a,x)=>a+x.ciro2025,0),sb=both.reduce((a,x)=>a+x.sales2026,0);
  const gTxt=g=>g==null?'–':`<span class="${gCls(g)}">${gPct(g)}</span>`;
  const tempo=tempoOf;
  let rs=0,ri=0;for(const x of S){const r=RET&&RET.map&&RET.map[code(x)];if(r){rs+=r[0]||0;ri+=Math.abs(r[1]||0)}}
  const rp=rs?ri/rs:null,rk=S.filter(x=>RK[x.id]),nA=S.filter(x=>x.status!=='Pasif').length;
  const reps=[...new Set(S.map(x=>x.rep).filter(Boolean))];
  const rows=[...S].sort((a,b)=>n(b.sales2026)-n(a.sales2026));
  const last=x=>{const v=inv(x);return v&&v.last?`${fmt(v.last)} <small>(${ago(v.last)} gün)</small>`:'–'};
  const tile=(k,v)=>`<div><dt>${k}</dt><dd>${v}</dd></div>`;
  return `<section class="chainbox" id="chainBox" aria-label="Zincir özeti">
    <div class="ch-h"><h3>${esc(chainName(ch))}</h3><button type="button" class="lnk" data-chainf="${esc(ch)}">Mağazaları listede göster</button></div>
    <dl class="chtiles">
      ${tile('Mağaza',`${S.length} <small>(${nA} aktif${S.length-nA?`, ${S.length-nA} pasif`:''})</small>`)}
      ${tile(`Ciro ${PY}`,eur(S.reduce((a,x)=>a+n(x.ciro2025),0)))}
      ${tile(`${CY} YTD`,eur(S.reduce((a,x)=>a+n(x.sales2026),0)))}
      ${tile('Tempo',gTxt(pb?sb/(pb*YF)-1:null))}
      ${tile(`Bu ay net ciro${MON&&MON.month?` (${MONTHS_LONG[+MON.month.slice(5,7)-1]})`:''}`,eur(S.reduce((a,x)=>a+monAmt(x),0)))}
      ${tile('İade oranı',rp==null?'–':`<span class="${rp>=RET_WARN?'warn':''}">%${pct1(rp)}</span>`)}
      ${tile('Kayıp riski',rk.length?`<span class="warn">${rk.length} mağaza</span>`:'yok')}
    </dl>
    <div class="chtab"><table id="chainT"><thead><tr><th>Mağaza</th>${reps.length>1?'<th>Temsilci</th>':''}<th>${CY} YTD</th><th>Tempo</th><th>Bu ay</th><th>Son fatura</th></tr></thead><tbody>
      ${rows.map(x=>`<tr${x.id===c.id?' class="cur" aria-current="true"':''}><td class="chn">${x.id===c.id?`<b${x.status==='Pasif'?' class="pas"':''}>${esc(x.name)}</b>`:`<button type="button" class="lnk${x.status==='Pasif'?' pas':''}" data-id="${esc(x.id)}">${esc(x.name)}</button>`}${x.status==='Pasif'?' <em class="rtag" title="Pasif müşteri">pasif</em>':''}${RK[x.id]?' <em class="rtag" title="Kayıp riski">risk</em>':''}<small>${esc(x.city||'')}</small></td>${reps.length>1?`<td>${esc(x.rep||'')}</td>`:''}<td>${typeof x.sales2026==='number'?eur(x.sales2026):'–'}</td><td>${gTxt(tempo(x))}</td><td>${monAmt(x)?eur(monAmt(x)):'–'}</td><td>${last(x)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="sm">Tempo: ${CY} YTD satış, ${PY} cirosunun aynı dönemine göre. Mağaza adına tıklayınca o mağazanın kartı açılır.</p>
  </section>`}
function renderTasks(){
  const cm=Object.fromEntries(C.map(c=>[c.id,c]));
  const t=A.filter(a=>a.nextDate&&!a.done&&cm[a.customerId]&&(!st.rep||(a.rep||cm[a.customerId].rep)===st.rep)).sort((a,b)=>a.nextDate.localeCompare(b.nextDate));
  $('#tabT').textContent=`Takipler (${t.length})`;
  if(st.view!=='tasks')return;
  const wk=addDays(7);
  const g=[['Gecikmiş',t.filter(a=>a.nextDate<TODAY)],['Bugün',t.filter(a=>a.nextDate===TODAY)],['Önümüzdeki 7 gün',t.filter(a=>a.nextDate>TODAY&&a.nextDate<=wk)],['Daha sonra',t.filter(a=>a.nextDate>wk)]];
  $('#tasks').innerHTML=t.length?g.filter(x=>x[1].length).map(([h,l])=>`<h3>${h} <small>${l.length}</small></h3><ul class="tk">${l.map(a=>`<li class="${h==='Gecikmiş'?'late':''}"><input type="checkbox" data-done="${esc(a.id)}" aria-label="Tamamlandı" ${canNote()?'':'disabled'}><span class="td">${fmt(a.nextDate)}</span><button class="lnk" type="button" data-open="${esc(a.customerId)}">${esc(cm[a.customerId].name)}</button><span class="ta">${esc(a.nextAction||'Takip')}</span><small>${esc(a.rep||cm[a.customerId].rep||'')}</small></li>`).join('')}</ul>`).join(''):'<p class="empty">Açık takip yok. Bir müşteriye kayıt girerken “Sıradaki adım” ve tarih yazarsanız burada listelenir.</p>';
}
function render(){
  // satış temsilcisi (tüm müşteriler izni yok): yalnız kendi müşterileri C'de; tüm liste CALL
  {const lk=roleKnown()?repLock():null;C=lk!==null?CALL.filter(c=>c.rep===lk):CALL}
  derive();
  {const segs=allSegs();if(st.seg&&st.seg!=='__bos'&&!segs.includes(st.seg))st.seg='';const html='<option value="">Sgmt. Tümü</option>'+segs.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')+'<option value="__bos">Segment: boş</option>';if($('#fseg').innerHTML!==html)$('#fseg').innerHTML=html}
  {const chs=[...new Set(C.map(chainOf).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));if(st.chain&&st.chain!=='__any'&&!chs.includes(st.chain))st.chain='';
   const html='<option value="">Zincir Tümü</option><option value="__any">Yalnız zincirler</option>'+chs.map(v=>`<option value="${esc(v)}">${esc(v)} (${chainStores(v).length})</option>`).join('');if($('#fchain').innerHTML!==html)$('#fchain').innerHTML=html;$('#fchain').value=st.chain||''}
  $('#fseg').value=st.seg;$('#fstat').value=st.status;
  {const lk=roleKnown()?repLock():null;if(lk!==null)st.rep=lk;if(st.sel&&!C.some(c=>c.id===st.sel))st.sel=null}
  if(roleKnown()&&!viewOk(st.view))st.view='list';
  if(st.view==='tasks'&&!VISIT_LOG)st.view='list';
  if((st.view==='overdue'||st.view==='credit')&&!(OI&&OI.map)&&loaded)st.view='list';
  $('#tabT').hidden=!VISIT_LOG;$('#tLeg').textContent=R.temas;$('#dueLeg').hidden=!VISIT_LOG;
  document.querySelectorAll('.tab').forEach(b=>{const on=b.dataset.view===st.view;b.classList.toggle('on',on);b.setAttribute('aria-selected',on)});
  {const set=st.view==='admin'||st.view==='perms';$('#stats').hidden=set;$('#ordp').hidden=set;$('#reps').hidden=set;$('nav.tabs').hidden=set}
  $('#listView').hidden=st.view!=='list';$('#tasksView').hidden=st.view!=='tasks';$('#boardView').hidden=st.view!=='board';$('#targetsView').hidden=st.view!=='targets';$('#overdueView').hidden=st.view!=='overdue';$('#creditView').hidden=st.view!=='credit';$('#adminView').hidden=st.view!=='admin';$('#permsView').hidden=st.view!=='perms';
  // açık formlardaki yazılanları yeniden çizimde koru
  const keep={};let foc=null;
  for(const id of ['aform','ctform','qform','rform','pform','uform']){const f=$('#'+id);if(!f||(id==='rform'&&!st.rdirty)||(id==='pform'&&!st.pdirty)||(!['qform','rform','pform','uform'].includes(id)&&st.formFor!==st.sel))continue;
    keep[id]=[...f.elements].filter(e=>e.name).map(e=>({n:e.name,t:e.type,v:e.value,c:e.checked,touched:e.dataset.touched}));
    const ae=document.activeElement;if(ae&&f.contains(ae)&&ae.name&&ae.type!=='radio'&&ae.type!=='checkbox')foc=[id,ae.name]}
  renderTop();renderStats();renderList();renderTasks();renderBoard();renderTargets();renderOverdue();renderCredit();renderAdmin();renderPerms();
  renderDetail();fitDetail();
  for(const [id,vals] of Object.entries(keep)){const g=$('#'+id);if(!g)continue;
    for(const e of g.elements){if(!e.name)continue;const k=(e.type==='radio'||e.type==='checkbox')?vals.find(x=>x.n===e.name&&x.v===e.value):vals.find(x=>x.n===e.name);if(!k)continue;
      if(e.type==='radio'||e.type==='checkbox')e.checked=k.c;else e.value=k.v;if(k.touched)e.dataset.touched=k.touched}
    if(id==='aform')syncOutcome(g,false);if(id==='qform')qformTotals(g)}
  if(foc){const g=$('#'+foc[0]);if(g&&g.elements[foc[1]])g.elements[foc[1]].focus()}
  st.formFor=st.sel;
}

function cmpRow(c){
  const a=c.ciro2025,b=c.sales2026,has=x=>typeof x==='number'&&isFinite(x),lbl=`Ciro ${PY} (yıl) → ${CY} YTD`;
  if(!has(a)&&!has(b))return `<div class="cmp"><dt>${lbl}</dt><dd>–</dd></div>`;
  const g=has(a)&&a>0&&has(b)?b/(a*YF)-1:null;
  return `<div class="cmp"><dt>${lbl}</dt><dd>${has(a)?eur(a):'–'} → ${has(b)?eur(b):'–'}${g==null?'':` <span class="${gCls(g)}" id="cmpG" title="Tempo: ${CY} YTD satış, ${PY} cirosunun aynı dönemine (yılın %${Math.round(YF*100)}${pctEk(Math.round(YF*100))}) göre">${gPct(g)}</span> <small class="sm">aynı döneme göre</small>`}</dd></div>`;
}

const MONTHS_TR=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
function retRows(c){
  if(!RET||!RET.map)return '';
  const mn=m=>MONTHS_TR[+String(m).slice(5,7)-1]||'',yr=m=>String(m).slice(0,4);
  const per=yr(RET.from)===yr(RET.to)?`${mn(RET.from)}–${mn(RET.to)} ${yr(RET.to)}`:`${mn(RET.from)} ${yr(RET.from)}–${mn(RET.to)} ${yr(RET.to)}`;
  const r=RET.map[code(c)];
  if(!r)return `<div class="cmp ret"><dt>İade ve fiyat farkı (${per})</dt><dd>Bu dönemde kayıt yok</dd></div>`;
  const [sales,iade,iadeN,ff,ffN]=r;
  const base=typeof sales==='number'?sales:null;
  const pct=v=>base>0&&v?`<span class="rp">%${(Math.abs(v)/base*100).toFixed(1).replace('.',',')}</span>`:'';
  const bad=!!(retOf(c)||{}).warn;
  const line=(l,v,n,p)=>`<div class="rl${bad&&l==='İade'?' bad':''}"><span>${l}</span><b>${v?eur(v):'€ 0'}</b><small>${n||0} fatura</small>${p?pct(v):'<span></span>'}</div>`;
  return `<div class="cmp ret"><dt>İade ve fiyat farkı (${per})</dt><dd>${line('Satış faturası',sales,r[5],0)}${line('İade',iade,iadeN,1)}${line('Fiyat farkı',ff,ffN,1)}<p class="rn">${base>0?`Oranlar aynı dönemdeki satış faturalarına (${eur(base)}) göre.`:'Bu dönemde satış faturası olmadığı için oran gösterilemiyor.'}</p></dd></div>`;
}

/* customer modal */
function openModal(c){
  if(!c)return;
  const f=$('#cform');f.reset();f.dataset.id=c?c.id:'';
    $('#segDL').innerHTML=allSegs().map(v=>`<option value="${esc(v)}">`).join('');
  for(const k of FIELDS){if(f.elements[k])f.elements[k].value=c[k]||''}
  f.elements.rep.readOnly=true;f.elements.rep.title='Temsilci değiştirilemez';
  $('#modal').hidden=false;f.elements.name.focus();
}
const closeModals=()=>{$('#modal').hidden=true;$('#imodal').hidden=true;$('#smodal').hidden=true;splan=null};

/* Excel round-trip (dynamic workbook) */
async function loadXLSX(){
  if(window.XLSX)return window.XLSX;
  await new Promise((res,rej)=>{const sc=document.createElement('script');sc.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';sc.onload=res;sc.onerror=rej;document.head.appendChild(sc)});
  return window.XLSX;
}
// Müşteri Excel'i: yalnız müşteri bilgisi. [başlık, alan, tür, yalnız dışa aktarılır]
const COLS=[['Kod','code','t'],['Müşteri','name','t'],['Zincir','chain','t'],
 ['Segment','segment','seg'],['Durum','status','st',1],['Durum (elle)','statusManual','st0'],
 ['Temsilci','rep','t'],['Rut günü','visitDay','day'],['Ziyaret sıklığı','freq','t'],['Ziyaret haftaları','weeks','t'],['Ödeme vadesi','pay','t'],['Merch','merch','vy'],['Dizim','dizim','vy'],
 ['Yetkili','contact','t'],['Telefon','phone','t'],['Adres','address','t'],['Posta kodu','postcode','t'],['Şehir','city','t']];
const EDIT_KEYS=COLS.filter(c=>!c[3]).map(c=>c[1]);
// Satış Excel'i: sistemdeki satış verisi, Kod ile müşteri Excel'ine eşlenir; içe aktarılmaz
const SCOLS=()=>[['Kod','code','t'],['Müşteri','name','t'],['Son fatura tarihi','lastInvoice','d'],['Son fatura no','lastInvoiceNo','t'],[`${CY} net satış (€)`,'sales2026','n'],[`${CY} fatura sayısı`,'invoices2026','i'],[`Ciro ${PY} (€)`,'ciro2025','n'],['Tempo % (aynı dönem)','_tempo','p']];
// eski dosyalarda olabilecek satış sütunları: okunmaz, değerler sistemden gelir
const OLD_SALES=['Son fatura tarihi','Son fatura no','2026 net satış (€)','2026 fatura sayısı','Ciro 2025 (€)','Tempo % (aynı dönem)','Büyüme %'];
const XL=n=>{let s='';n++;while(n){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26)}return s};
const colOf=k=>XL(COLS.findIndex(c=>c[1]===k));
const serial=d=>{const [y,m,dd]=d.split('-').map(Number);return (Date.UTC(y,m-1,dd)-Date.UTC(1899,11,30))/864e5};
const fromSerial=n=>new Date(Date.UTC(1899,11,30)+Math.round(n)*864e5).toISOString().slice(0,10);
const normKod=v=>{const s=String(v??'').trim();return /^\d+$/.test(s)?String(parseInt(s,10)):s};
const normH=h=>low(h).replace(/\s+/g,' ').trim();
const num=x=>{if(x===''||x==null)return null;if(typeof x==='number')return x;const n=parseFloat(String(x).replace(/[€\s.]/g,'').replace(',','.'));return isNaN(n)?null:n};

function cellVal(x,t){
  if(t==='d'){if(Object.prototype.toString.call(x)==='[object Date]')return iso(x);if(typeof x==='number'&&x>20000&&x<80000)return fromSerial(x);const s=String(x||'').trim();if(/^\d\d[.\-/]\d\d[.\-/]\d{4}$/.test(s))return s.slice(6,10)+'-'+s.slice(3,5)+'-'+s.slice(0,2);return /^\d{4}-\d\d-\d\d/.test(s)?s.slice(0,10):''}
  if(t==='n'){const n=num(x);return n==null?null:Math.round(n*100)/100}
  const s=String(x??'').trim();
  if(t==='seg')return s;
  if(t==='st')return ['Aktif','Pasif'].find(v=>low(v)===low(s))||'';
  if(t==='st0')return ['Aktif','Pasif'].find(v=>low(v)===low(s))||'';
  if(t==='vy')return /^(var|evet|yes|ja|x|1)$/i.test(s)?'Var':/^(yok|hay[ıi]r|no|nee|0)$/i.test(s)?'Yok':'';
  if(t==='day'){const d=s&&DAYS.find(dn=>low(dn).startsWith(low(s).slice(0,3)));return d||''}
  return s;
}
function xlCell(v,t){
  if(v==null||v==='')return {t:'s',v:''};
  if(t==='d')return {t:'n',v:serial(v),z:'dd.mm.yyyy'};
  if(t==='n')return {t:'n',v:+v,z:'#,##0.00'};
  if(t==='i')return {t:'n',v:+v,z:'0'};
  if(t==='p')return {t:'n',v:+v,z:'0.0%'};
  return {t:'s',v:String(v)};
}
function xlSheet(cols,list,val,w){
  const ws={};cols.forEach((c,j)=>ws[XL(j)+1]={t:'s',v:c[0]});
  list.forEach((c,i)=>{const o=val(c);cols.forEach(([h,k,t],j)=>ws[XL(j)+(i+2)]=xlCell(o[k],t))});
  const ref=`A1:${XL(cols.length-1)}${list.length+1}`;ws['!ref']=ref;ws['!autofilter']={ref};ws['!cols']=w.map(x=>({wch:x}));return ws;
}
async function saveXLSX(sheet,name,file){
  const X=await loadXLSX();toast('Excel hazırlanıyor…');
  const wb=X.utils.book_new();X.utils.book_append_sheet(wb,sheet,name);
  const buf=X.write(wb,{type:'array',bookType:'xlsx'});
  const dl=await (window.claude?claude.use('downloads'):null);
  if(!dl){toast('Bu görünümde dosya indirilemiyor.',1);return}
  await dl.save({filename:`${file}_${fmt(TODAY)}.xlsx`,data:buf});
}
const xlList=()=>[...C].sort((a,b)=>String(a.rep||'').localeCompare(String(b.rep||''),'tr')||String(a.name||'').localeCompare(String(b.name||''),'tr'));
async function exportXLSX(){
  try{await saveXLSX(xlSheet(COLS,xlList(),c=>({...c,...ctOf(c),code:code(c),statusManual:(c._st0?c._st0.manual:c.statusManual)||''}),[10,36,14,10,8,12,15,11,13,12,11,8,8,16,15,32,11,18]),'Müşteriler','CRM_Musteriler')}
  catch(err){if(err&&err.code==='declined')return;toast('Excel dosyası oluşturulamadı.',1)}
}
async function exportSales(){
  try{await saveXLSX(xlSheet(SCOLS(),xlList(),c=>{const iv=inv(c);return {code:code(c),name:c.name,lastInvoice:iv?iv.last:'',lastInvoiceNo:iv?iv.no:'',sales2026:iv?iv.sales:null,invoices2026:iv?iv.n:null,ciro2025:typeof c.ciro2025==='number'?c.ciro2025:null,_tempo:tempoOf(c)}},[10,36,14,15,16,14,14,14]),'Satış','CRM_Satis')}
  catch(err){if(err&&err.code==='declined')return;toast('Excel dosyası oluşturulamadı.',1)}
}
let plan=null;
// ===== Satış verisi içe aktarma =====
// İki dosya birlikte yüklenir: günlük satış (Daily sell-out, belge bazında) ve detaylı satış raporu (ürün bazında).
// Günlük satış: sync/month (ay), sync/returns (yıl başından bu yana) ve müşterinin yıl toplamları.
// Detaylı rapor: o ayın hedef gerçekleşenleri (temsilci × kategori). İki dosyanın müşteri toplamları birbirini tutmalı.
// Yazma tek işlemde, sunucudaki import_sales() fonksiyonuyla yapılır.
const deacc=s=>low(s).replace(/ı/g,'i').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
const PIM_CAT={'atistirmalik':'atis','icecek':'icecek','mutfak':'mutfak','temel gida':'temel','non-food':'nonfood','nonfood':'nonfood','non food':'nonfood'};
const MON3={jan:1,oca:1,feb:2,sub:2,mar:3,mrz:3,maa:3,apr:4,nis:4,may:5,mai:5,mei:5,jun:6,haz:6,jul:7,tem:7,aug:8,agu:8,sep:9,eyl:9,oct:10,okt:10,eki:10,nov:11,kas:11,dec:12,dez:12,ara:12};
const monNo=v=>{if(typeof v==='number'&&v>=1&&v<=12)return v;const s=deacc(v);if(/^\d{1,2}$/.test(s))return +s;return MON3[s.slice(0,3)]||0};
const r2=x=>Math.round(x*100)/100;
function headRow(rows,need){for(let i=0;i<Math.min(rows.length,30);i++){const h=(rows[i]||[]).map(x=>deacc(x));if(need.every(n=>h.includes(n)))return i}return -1}
function sheetRows(X,wb){const out=[];for(const n of wb.SheetNames)out.push(X.utils.sheet_to_json(wb.Sheets[n],{header:1,defval:'',raw:true}));return out}
// günlük satış: [{d,no,t:F/I/P,k,e,rep,name}]
function parseDaily(rows){
  const h=headRow(rows,['datum','belegnr','belegart','debitorennr','eur']);if(h<0)return null;
  const H=rows[h].map(x=>deacc(x)),ix=n=>H.indexOf(n),I={d:ix('datum'),no:ix('belegnr'),t:ix('belegart'),k:ix('debitorennr'),n:ix('debitorenbez'),e:ix('eur'),v:ix('verkaeufer')};
  const out=[],badT=new Set();
  for(const r of rows.slice(h+1)){const d=cellVal(r[I.d],'d'),k=normKod(r[I.k]);if(!d||!k)continue;
    const tt=deacc(r[I.t]),t=/iade/.test(tt)?'I':/fiyat/.test(tt)?'P':/fatura/.test(tt)?'F':'';if(!t){badT.add(String(r[I.t]));continue}
    out.push({d,no:String(r[I.no]??'').trim(),t,k,e:r2(num(r[I.e])||0),rep:I.v>=0?String(r[I.v]??'').trim():'',name:I.n>=0?String(r[I.n]??'').trim():''})}
  return {rows:out,badT:[...badT]};
}
// detaylı rapor: [{k,rep,y,m,cat,pim,e}]; Power BI tablosundaki boş (birleştirilmiş) hücreler üst satırdan doldurulur
function parseDetail(rows){
  const h=headRow(rows,['debitorennr','ciro','pim']);if(h<0)return null;
  const H=rows[h].map(x=>deacc(x)),ix=n=>H.indexOf(n);
  const I={k:ix('debitorennr'),rep:H.findIndex(x=>/^vertreter/.test(x)),y:H.findIndex(x=>/year|yil|jahr/.test(x)),m:H.findIndex(x=>/month|monat|^ay$|- ay/.test(x)),art:ix('artikelnr'),pim:ix('pim'),e:ix('ciro')};
  const fill=Math.max(I.k,I.rep,I.y,I.m)+1,last=[],out=[],badCat=new Set();
  for(const r of rows.slice(h+1)){
    for(let j=0;j<fill;j++){if(r[j]===''||r[j]==null)r[j]=last[j];else last[j]=r[j]}
    if(I.art>=0&&!String(r[I.art]??'').trim())continue;
    const k=normKod(r[I.k]);if(!k)continue;const pim=String(r[I.pim]??'').trim(),cat=PIM_CAT[deacc(pim)];if(!cat){badCat.add(pim||'(boş)');continue}
    out.push({k,rep:String(r[I.rep]??'').trim(),y:+r[I.y]||0,m:monNo(r[I.m]),cat,e:num(r[I.e])||0})}
  return {rows:out,badCat:[...badCat]};
}
const ymOf=(y,m)=>`${y}-${String(m).padStart(2,'0')}`;
// temsilci adı: sistemdeki yazımla eşleştir (Özgur → Özgür)
function repName(n,known){const d=deacc(n);return known.find(x=>deacc(x)===d)||n}
function planSales(files){
  const err=[],warn=[];const D=files.find(f=>f.daily),T=files.find(f=>f.detail);
  for(const f of files)if(!f.daily&&!f.detail)err.push(`"${f.name}" tanınmadı: günlük satış dosyasında Datum, BelegNr, Belegart, DebitorenNr ve EUR; detaylı raporda DebitorenNr, PIM ve Ciro sütunları olmalı.`);
  if(!D)err.push('Günlük satış dosyası (Daily sell-out) seçilmedi.');if(!T)err.push('Detaylı satış raporu seçilmedi.');
  if(files.length!==2)err.push(`İki dosya birlikte seçilmeli (${files.length} dosya seçildi).`);
  if(err.length)return {err,warn};
  if(D.daily.badT.length)err.push(`Günlük satışta tanınmayan belge türü: ${D.daily.badT.join(', ')}`);
  if(T.detail.badCat.length)err.push(`Detaylı raporda tanınmayan kategori (PIM): ${T.detail.badCat.join(', ')}`);
  const dr=D.daily.rows,tr=T.detail.rows;if(!dr.length)err.push('Günlük satış dosyasında satır yok.');if(!tr.length)err.push('Detaylı raporda satır yok.');
  if(err.length)return {err,warn};
  const dm=[...new Set(dr.map(x=>x.d.slice(0,7)))],tm=[...new Set(tr.map(x=>x.y&&x.m?ymOf(x.y,x.m):'?'))];
  if(dm.length>1)err.push(`Günlük satış dosyası birden fazla ay içeriyor: ${dm.join(', ')}. Tek ay olmalı.`);
  if(tm.length>1||tm[0]==='?')err.push(`Detaylı raporda yıl ve ay okunamadı ya da birden fazla ay var: ${tm.join(', ')}.`);
  if(err.length)return {err,warn};
  const month=dm[0];if(tm[0]!==month)err.push(`Dosyalar farklı aylara ait: günlük satış ${month}, detaylı rapor ${tm[0]}.`);
  const through=dr.reduce((a,x)=>x.d>a?x.d:a,'');
  if(RET&&RET.from&&RET.from.slice(0,4)!==month.slice(0,4))err.push(`Dosya ${month.slice(0,4)} yılına ait; sistemdeki yıl verisi ${RET.from.slice(0,4)}. Yeni yıla geçiş ayrıca yapılmalı.`);
  if(MON&&MON.month){if(month<MON.month)err.push(`Dosya ayı (${month}) sistemdeki aydan (${MON.month}) eski.`);
    else if(month===MON.month&&MON.through&&through<MON.through)err.push(`Dosya ${fmt(through)} tarihine kadar; sistemde ${fmt(MON.through)} tarihine kadar veri var. Daha eski veri yüklenemez.`)}
  // müşteri toplamları iki dosyada aynı olmalı
  const dn={},tn={};for(const x of dr)dn[x.k]=(dn[x.k]||0)+x.e;for(const x of tr)tn[x.k]=(tn[x.k]||0)+x.e;
  const diff=[...new Set([...Object.keys(dn),...Object.keys(tn)])].map(k=>[k,r2(dn[k]||0),r2(tn[k]||0)]).filter(([,a,b])=>Math.abs(a-b)>1).sort((a,b)=>Math.abs(b[1]-b[2])-Math.abs(a[1]-a[2]));
  if(diff.length)err.push(`İki dosyanın müşteri toplamları tutmuyor (${diff.length} müşteri), dosyalar aynı tarihe kadar alınmamış olabilir: ${diff.slice(0,5).map(([k,a,b])=>`${k}: günlük ${eurc(a)} / detaylı ${eurc(b)}`).join('; ')}${diff.length>5?' …':''}`);
  if(err.length)return {err,warn};
  // ay verisi: kod → [satış, fatura adedi, iade, fiyat farkı, iade adedi, fiyat farkı adedi]
  const mon={},last={};
  for(const x of dr){const m=mon[x.k]||(mon[x.k]=[0,0,0,0,0,0]);
    if(x.t==='F'){m[0]+=x.e;m[1]++;if(!last[x.k]||x.d>last[x.k][0]||(x.d===last[x.k][0]&&x.no>last[x.k][1]))last[x.k]=[x.d,x.no]}
    else if(x.t==='I'){m[2]+=x.e;m[4]++}else{m[3]+=x.e;m[5]++}}
  for(const m of Object.values(mon))for(const i of [0,2,3])m[i]=r2(m[i]);
  // sistemdeki aynı ayın verisi çıkarılıp yenisi eklenir; yeni ayda önceki ay olduğu gibi kalır
  const same=!!(MON&&MON.month===month),om=same?(MON.map||{}):{};
  const oldN=(k,i)=>{const o=om[k];if(!o)return 0;if(o.length>=6)return o[i];const t=i===4?'I':'P';return dr.filter(x=>x.k===k&&x.t===t&&x.d<=MON.through).length};
  const base=(RET&&RET.map)||{},ret={...base},codes=new Set([...Object.keys(om),...Object.keys(mon)]);
  for(const k of codes){const o=base[k]||[0,0,0,0,0,0],a=om[k]||[0,0,0,0],b=mon[k]||[0,0,0,0,0,0];
    ret[k]=[r2(o[0]-a[0]+b[0]),r2(o[1]-a[2]+b[2]),o[2]-oldN(k,4)+b[4],r2(o[3]-a[3]+b[3]),o[4]-oldN(k,5)+b[5],o[5]-a[1]+b[1]]}
  const byCode=new Map(CALL.map(c=>[code(c),c])),cust={};
  for(const k of codes){const c=byCode.get(k);if(!c)continue;const a=om[k]||[0,0,0,0],b=mon[k]||[0,0,0,0,0,0];
    const s=typeof c.sales2026==='number'?c.sales2026:0,n=typeof c.invoices2026==='number'?c.invoices2026:0;
    const p={sales2026:r2(s-(a[0]+a[2]+a[3])+(b[0]+b[2]+b[3])),invoices2026:n-a[1]+b[1]};
    if(last[k]&&(!c.lastInvoice||last[k][0]>c.lastInvoice||(last[k][0]===c.lastInvoice&&last[k][1]>(c.lastInvoiceNo||'')))){p.lastInvoice=last[k][0];p.lastInvoiceNo=last[k][1]}
    if(p.sales2026!==c.sales2026||p.invoices2026!==c.invoices2026||p.lastInvoice)cust[c.id]=p}
  // hedef gerçekleşenleri: temsilci × kategori; dosyada olmayan temsilci ve kategori 0
  const q=QTS[month]||{},known=[...new Set([...Object.keys(q.reps||{}),...allReps()])],act={};
  for(const x of tr){const r=repName(x.rep,known);const o=act[r]||(act[r]={});o[x.cat]=(o[x.cat]||0)+x.e}
  for(const r of Object.keys(q.reps||{}))if(!act[r]){act[r]={};warn.push(`${r}: detaylı raporda bu ay satış yok, hedef gerçekleşenleri 0 olacak.`)}
  for(const r of Object.keys(act))for(const [k] of QCATS)act[r][k]=Math.round(act[r][k]||0);
  // kontroller ve uyarılar
  const unknown=Object.keys(mon).filter(k=>!byCode.has(k)),gone=Object.keys(om).filter(k=>!mon[k]&&byCode.has(k));
  if(unknown.length)warn.push(`${unknown.length} müşteri kodu CRM'de yok; satışları toplamlara girer ama bir müşteri kartında görünmez: ${unknown.slice(0,8).map(k=>{const x=dr.find(y=>y.k===k);return `${k}${x&&x.name?' '+x.name:''} (${eurc(mon[k][0]+mon[k][2]+mon[k][3])})`}).join(', ')}${unknown.length>8?' …':''}`);
  if(gone.length)warn.push(`${gone.length} müşterinin sistemde bu ay satışı vardı, yeni dosyada yok; bu aydaki satışları sıfırlanacak: ${gone.slice(0,8).map(k=>byCode.get(k).name).join(', ')}${gone.length>8?' …':''}`);
  const repD={},repT={};for(const x of dr)if(x.rep){const r=repName(x.rep,known);repD[r]=(repD[r]||0)+x.e}for(const x of tr){const r=repName(x.rep,known);repT[r]=(repT[r]||0)+x.e}
  const sum=i=>r2(Object.values(mon).reduce((a,m)=>a+m[i],0));
  const tot={satis:sum(0),n:sum(1),iade:sum(2),ff:sum(3)};
  const payload={
    expect:{month:MON?String(MON.importedAt??MON.through??''):'',returns:RET?String(RET.through??''):''},
    month:{cols:['satis','faturaAdet','iade','fiyatFarki','iadeAdet','fiyatFarkiAdet'],month,through,updatedAt:TODAY,importedAt:Date.now(),by:(window.CRM_AUTH||{}).email||'',source:`${D.name} + ${T.name}`,map:mon},
    returns:{...(RET||{}),from:(RET&&RET.from)||month.slice(0,4)+'-01',to:month,through,updatedAt:TODAY,cols:['satis','iade','iadeAdet','fiyatFarki','fiyatFarkiAdet','satisAdet'],source:`Yıl başından bu yana; son içe aktarma ${D.name} + ${T.name}`,map:ret},
    customers:cust,qtargets:{key:month,asOf:through,reps:act}};
  return {err,warn,payload,info:{D,T,month,through,tot,nCust:Object.keys(cust).length,nCodes:Object.keys(mon).length,repD,repT,same}};
}
async function readSales(fl){
  try{
    const X=await loadXLSX();const files=[];
    for(const f of fl){const o={name:f.name};try{const wb=X.read(await f.arrayBuffer(),{type:'array'});
      for(const rows of sheetRows(X,wb)){if(!o.daily){const d=parseDaily(rows);if(d){o.daily=d;continue}}if(!o.detail){const t=parseDetail(rows);if(t)o.detail=t}}}catch(e){}
      files.push(o)}
    const pl=planSales(files);splan=pl.err.length?null:pl;
    const i=pl.info;
    const rep=i?[...new Set([...Object.keys(i.repD),...Object.keys(i.repT)])].sort((a,b)=>a.localeCompare(b,'tr')):[];
    $('#sprev').innerHTML=(i?`<p><b>${MONTHS_LONG[+i.month.slice(5)-1]} ${i.month.slice(0,4)}</b> · veri ${fmt(i.through)} tarihine kadar${i.same?'':' · yeni ay'}</p>
      <p>Günlük satış: ${esc(i.D.name)} (${i.D.daily.rows.length} belge) · Detaylı rapor: ${esc(i.T.name)} (${i.T.detail.rows.length} satır)</p>
      <div class="ordp"><table id="sT"><thead><tr><th>Temsilci</th><th>Günlük satış</th><th>Detaylı rapor</th><th><span class="sr">Kontrol</span></th></tr></thead><tbody>${rep.map(r=>{const a=r2(i.repD[r]||0),b=r2(i.repT[r]||0);return `<tr><td>${esc(r)}</td><td>${eurc(a)}</td><td>${eurc(b)}</td><td>${Math.abs(a-b)<=1?'✓':'<b class="bad">✗</b>'}</td></tr>`}).join('')}</tbody>
      <tfoot><tr><td>Toplam</td><td>${eurc(i.tot.satis+i.tot.iade+i.tot.ff)}</td><td>${eurc(Object.values(i.repT).reduce((a,x)=>a+x,0))}</td><td></td></tr></tfoot></table></div>
      <p>Satış ${eurc(i.tot.satis)} (${i.tot.n} fatura) · iade ${eurc(i.tot.iade)} · fiyat farkı ${eurc(i.tot.ff)}. <b>${i.nCust}</b> müşterinin yıl toplamı güncellenecek; ${i.nCodes} müşteri kodu bu ay satış yapmış.</p>`:'')+
      (pl.err.length?`<div class="warn" id="serr"><b>Yüklenemez:</b><ul>${pl.err.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'')+
      (pl.warn.length?`<div id="swarn"><b>Dikkat:</b><ul>${pl.warn.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'');
    $('#srun').disabled=!splan;$('#spr').textContent='';$('#smodal').hidden=false;
  }catch(err){toast('Dosyalar okunamadı. .xlsx formatında iki Excel dosyası seçin.',1)}
}
let splan=null;
async function applySales(){
  if(!splan)return;const p=splan.payload;splan=null;$('#srun').disabled=true;$('#spr').textContent='Yazılıyor…';
  try{const r=await db.rpc('import_sales',{p});closeModals();toast(`Satış verisi güncellendi: ${fmt(p.month.through)} tarihine kadar, ${Object.keys(p.customers).length} müşteri.`);render()}
  catch(e){const m=String((e&&e.message)||e);$('#spr').textContent='';toast(/stale/.test(m)?'Bu arada sistemdeki satış verisi değişmiş. Dosyaları yeniden seçin.':/izin|perm/.test(m)?'Satış verisini içe aktarma izniniz yok.':'Satış verisi yazılamadı: '+m,1)}
}
// Açık fatura dosyası (ERP "Export" sayfası) → sync/openinv
async function readOpenInv(f){
  try{
    const X=await loadXLSX();const wb=X.read(await f.arrayBuffer(),{type:'array'});
    const ws=wb.Sheets['Export']||wb.Sheets[wb.SheetNames[0]];
    const rows=X.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});
    const H=(rows[0]||[]).map(normH),ix=n=>H.indexOf(normH(n));
    const I={k:ix('Müsteri Kodu'),no:ix('Fatura No'),d:ix('Datum'),t:ix('Fatura Türü'),a:ix('Fatura Tutarı'),r:ix('Rest Offen'),due:ix('Faelligkeit'),tage:ix('Tage Fälligkeit'),lim:ix('Kredit Limit'),v:ix('Vade')};
    if([I.k,I.no,I.r,I.due].some(i=>i<0)){toast('Açık fatura dosyası tanınmadı: "Müsteri Kodu", "Fatura No", "Rest Offen" ve "Faelligkeit" sütunları gerekli.',1);return}
    const map={};let n=0,asOf='';const r2=x=>Math.round(x*100)/100;
    for(const r of rows.slice(1)){
      const k=normKod(r[I.k]);const rest=num(r[I.r]);if(!k||rest==null||Math.abs(rest)<0.005)continue;
      const due=cellVal(r[I.due],'d'),d=I.d>=0?cellVal(r[I.d],'d'):'';
      const tt=String(I.t>=0?r[I.t]:'').toLowerCase(),t=/iade/.test(tt)?'I':/fiyat/.test(tt)?'P':'F';
      if(I.tage>=0&&due&&typeof r[I.tage]==='number'){const a=fromSerial(serial(due)+r[I.tage]*-1);if(a>asOf)asOf=a}
      const m=map[k]||(map[k]={inv:[]});
      if(I.lim>=0&&num(r[I.lim])!=null)m.lim=num(r[I.lim]);if(I.v>=0&&num(r[I.v])!=null)m.vade=num(r[I.v]);
      m.inv.push([String(r[I.no]).trim(),d,t,r2(num(r[I.a])??rest),r2(rest),due]);n++}
    if(!n){toast('Dosyada açık fatura bulunamadı.',1);return}
    const known=new Set(CALL.map(code)),ks=Object.keys(map),miss=ks.filter(k=>!known.has(k));
    asOf=asOf||TODAY;
    const net=k=>r2(map[k].inv.reduce((a,x)=>a+x[4],0)),MX=12,ml=miss.slice().sort((a,b)=>net(b)-net(a)).map(k=>`${k} (${eurc(net(k))})`);
    const missTxt=miss.length?`\n\n${miss.length} müşteri kodu CRM'de yok; kartlarda görünmez, Vade Takibi sekmesinde ayrı listelenir:\n${ml.slice(0,MX).join(', ')}${ml.length>MX?` ve ${ml.length-MX} kod daha`:''}`:'';
    if(!confirm(`${n} açık kalem, ${ks.length} müşteri (veri tarihi ${fmt(asOf)}).${missTxt}\n\nMevcut açık fatura verisinin yerine yazılsın mı?`))return;
    await db.doc('sync/openinv').set({asOf,n,map,at:Date.now(),by:(window.CRM_AUTH||{}).email||''});
    toast(`Açık faturalar güncellendi: ${n} kalem, ${ks.length-miss.length} müşteri.`);
  }catch(err){toast('Açık fatura dosyası okunamadı.',1)}
}
async function readImport(f){
  try{
    const X=await loadXLSX();const wb=X.read(await f.arrayBuffer(),{type:'array'});
    const ws=wb.Sheets['Müşteriler']||wb.Sheets[wb.SheetNames[0]];
    const rows=X.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});
    const head=(rows[0]||[]).map(normH);
    const idx=COLS.filter(c=>!c[3]).map(([h,k,t])=>[k,t,head.indexOf(normH(h))]).filter(x=>x[2]>=0);
    if(!idx.some(x=>x[0]==='code')||!idx.some(x=>x[0]==='name')){toast('Dosyada "Kod" ve "Müşteri" sütunları bulunamadı.',1);return}
    const known=new Set(COLS.map(c=>normH(c[0]))),oldS=new Set(OLD_SALES.map(normH));
    const salesCols=(rows[0]||[]).filter(h=>oldS.has(normH(h))||/net satış|fatura sayısı|^ciro \d{4}/.test(normH(h)));
    const ignored=(rows[0]||[]).filter(h=>String(h).trim()&&!known.has(normH(h))&&!salesCols.includes(h));
    const seen=new Set(),parsed=[];let bad=0,dup=0;const odd={status:0};
    for(const r of rows.slice(1)){
      const o={};for(const [k,t,i] of idx){o[k]=cellVal(r[i],t);if(k==='status'&&String(r[i]).trim()&&!o[k])odd[k]++}
      o.code=normKod(o.code);
      if(!o.code||!o.name){if(r.some(x=>String(x).trim()))bad++;continue}
      if(seen.has(o.code)){dup++;continue}seen.add(o.code);parsed.push(o);
    }
    const keys=idx.map(x=>x[0]);
    // yalnız dosyadaki müşteri bilgisi alanları yazılır; satış verisi ve diğer alanlar korunur
    const cur=(c,k)=>k==='statusManual'?((c._st0?c._st0.manual:c.statusManual)||''):(c[k]??'');
    const byCode=new Map(C.map(c=>[code(c),c]));const writes=[];let same=0;
    for(const o of parsed){const old=byCode.get(o.code);
      if(old){const p={};for(const k of keys)if(String(cur(old,k))!==String(o[k]??''))p[k]=o[k]??'';
        if(!Object.keys(p).length){same++;continue}
        p.updatedAt=Date.now();if('contact' in p||'phone' in p)p.ctAt=p.updatedAt;writes.push({id:old.id,isNew:false,data:p});continue}
      const d={};for(const k of EDIT_KEYS)d[k]=keys.includes(k)?(o[k]??''):'';
      Object.assign(d,{status:'',lastInvoice:'',lastInvoiceNo:'',sales2026:null,invoices2026:null,ciro2025:null,createdAt:Date.now(),updatedAt:Date.now(),ctAt:Date.now()});
      writes.push({id:'c'+o.code,isNew:true,data:d})}
    const gone=C.filter(c=>!seen.has(code(c)));const goneIds=new Set(gone.map(c=>c.id));
    const goneActs=A.filter(a=>goneIds.has(a.customerId));
    const nNew=writes.filter(w=>w.isNew).length;
    const miss=COLS.filter(c=>!c[3]&&!idx.some(x=>x[0]===c[1])).map(c=>c[0]);
    plan={writes,gone,goneActs};
    $('#iprev').innerHTML=`<p><b>${parsed.length}</b> müşteri okundu: <b>${writes.length-nNew}</b> güncellenecek, <b>${nNew}</b> yeni eklenecek, ${same} müşteride değişiklik yok.</p><p>Yalnız müşteri bilgileri güncellenir; satış verisi (son fatura, net satış, fatura sayısı, ${PY} cirosu) sistemden gelir ve değişmez.</p>
      ${gone.length?`<p class="warn"><b>${gone.length} müşteri Excel'de olmadığı için CRM'den kalıcı olarak silinecek</b>${goneActs.length?` (bu müşterilere ait ${goneActs.length} ziyaret/not kaydıyla birlikte)`:''}. Bu işlem geri alınamaz: ${esc(gone.slice(0,8).map(c=>c.name).join(', '))}${gone.length>8?` ve ${gone.length-8} müşteri daha`:''}.</p>`:''}
      <p>Okunan sütunlar: ${esc(idx.map(x=>COLS.find(c=>c[1]===x[0])[0]).join(', '))}.${miss.length?` Dosyada olmayan sütunlar değişmez: ${esc(miss.join(', '))}.`:''}${salesCols.length?` Satış sütunları okunmadı: ${esc(salesCols.join(', '))}.`:''}${ignored.length?` Tanınmayan sütunlar okunmadı: ${esc(ignored.join(', '))}.`:''}</p>
      ${bad||dup||odd.status?`<p>${bad?`${bad} satır Kod veya Müşteri adı eksik olduğu için atlandı. `:''}${dup?`${dup} tekrar eden Kod atlandı (ilk satır alındı). `:''}${odd.status?`${odd.status} satırda Durum Aktif/Pasif değil, boş yazılacak.`:''}</p>`:''}`;
    $('#irun').textContent=gone.length?'Uygula ve sil':'Uygula';
    $('#irun').disabled=!writes.length&&!gone.length;$('#ipr').textContent='';$('#imodal').hidden=false;
  }catch(err){toast('Dosya okunamadı. .xlsx formatında bir Excel dosyası seçin.',1)}
}
async function applyImport(){
  if(!plan)return;const {writes,gone,goneActs}=plan;plan=null;$('#irun').disabled=true;let n=0,del=0,ok=true;
  for(const wv of writes){if(!await w(()=>wv.isNew?db.collection('customers').doc(wv.id).set(wv.data):db.collection('customers').doc(wv.id).update(wv.data))){ok=false;break}n++;if(n%10===0||n===writes.length)$('#ipr').textContent=`${n}/${writes.length} müşteri yazıldı`}
  if(ok){for(const a of goneActs){if(!await w(()=>db.collection('activities').doc(a.id).delete())){ok=false;break}}}
  if(ok){for(const c of gone){if(!await w(()=>db.collection('customers').doc(c.id).delete())){ok=false;break}del++;$('#ipr').textContent=`${del}/${gone.length} müşteri silindi`}}
  if(ok&&gone.some(c=>c.id===st.sel))st.sel=null;
  toast(ok?`${n} müşteri yazıldı${del?`, ${del} müşteri silindi`:''}`:`İşlem yarıda kaldı: ${n} müşteri yazıldı, ${del} silindi`,!ok);if(ok)closeModals();render();
}

/* events */
document.addEventListener('click',async e=>{
  if(e.target.closest('#thmBtn')){umOpen(false);setTheme(curTheme()==='dark'?'light':'dark');return}
  if(!$('#umDrop').hidden&&!e.target.closest('#umenu'))umOpen(false);
  const um=e.target.closest('#avBtn,[data-um]');
  if(um){if(um.id==='avBtn'){umOpen($('#umDrop').hidden);return}umOpen(false);const a=window.CRM_AUTH;if(!a)return;if(um.dataset.um==='pw')await a.setPassword();else if(um.dataset.um==='out')await a.signOut();return}
  const t=e.target.closest('button,[data-close]');
  if(e.target.classList.contains('modal')){closeModals();return}
  if(!t)return;
  if(t.id!=='clearSample'&&!t.dataset.delact&&st.arm){st.arm=null;render()}
  if(t.matches('[data-close]')){closeModals();return}
  if(t.id==='ordBtn'){st.ord=!st.ord;if(st.ord)st.quick='';render();return}
  if(t.dataset.qp!==undefined){if(st.qedit&&st.qdirty&&!confirm('Kaydedilmemiş değişiklikler silinsin mi?'))return;st.qp=t.dataset.qp;st.qedit=false;st.qdirty=false;render();return}
  if(t.dataset.chainf!==undefined){st.chain=t.dataset.chainf;st.quick='';st.view='list';if(innerWidth<=900)st.sel=null;render();$('#list').scrollIntoView({block:'start'});return}
  if(t.dataset.qv){st.qv=t.dataset.qv;saveUi();render();return}
  if(t.dataset.rf){st.rf=t.dataset.rf;saveUi();render();return}
  if(t.id==='qEdit'){st.qedit=true;st.qdirty=false;render();const i=$('#qform input');if(i)i.focus();return}
  if(t.id==='qCancel'){if(st.qdirty&&!confirm('Kaydedilmemiş değişiklikler silinsin mi?'))return;st.qedit=false;st.qdirty=false;render();return}
  if(t.dataset.rep!==undefined){st.rep=t.dataset.rep;saveUi();render();return}
  if(t.id==='rdef'){st.rdirty=true;const f=$('#rform');for(const k in RDEF)f.elements[k].value=RDEF[k];rformCheck(f);$('#rmsg').textContent='Varsayılan değerler yazıldı; kaydetmek için Kaydet\'e basın';return}
  if(t.dataset.ovf!==undefined){st.ovf=t.dataset.ovf;render();return}
  if(t.dataset.crf!==undefined){st.crf=t.dataset.crf;render();return}
  if(t.id==='pdef'){st.pdirty=true;const f=$('#pform');for(const e of f.querySelectorAll('input[name*="|"]')){const [r,k]=e.name.split('|');e.checked=!!(PDEF[r]||{})[k]}$('#pmsg').textContent='Varsayılan izinler işaretlendi; kaydetmek için Kaydet\'e basın';return}
  if(t.dataset.udel!==undefined){if(!isAdmin()||!window.CRM_USERS)return;const em=t.dataset.udel;if(!confirm(`${personOf(em).name} (${em}) CRM kullanıcılarından kaldırılsın mı? Bu kişi artık giriş yapamaz.`))return;
    try{await window.CRM_USERS.remove(em);toast(`${personOf(em).name} kaldırıldı`);UL=null;render()}catch(err){toast('Kaldırılamadı: '+(err.message||err),1)}return}
  if(t.id==='aragOn'||t.id==='aragOff'){if(!can('e_arag'))return;const id=t.dataset.cid,c=C.find(x=>x.id===id);if(!c)return;
    if(t.id==='aragOff'&&!confirm(`${c.name} için ARAG süreci kapatılsın mı?`))return;
    const o=oiOf(c)||{};
    const ok=await w(()=>t.id==='aragOn'?db.collection('arag').doc(id).set({active:true,at:TODAY,customer:c.name,code:code(c),od:Math.round((o.od||0)*100)/100,odMax:o.odMax||0,by:window.CRM_USER||''}):db.collection('arag').doc(id).delete());
    if(ok)toast(t.id==='aragOn'?`${c.name}: ARAG süreci aktif`:`${c.name}: ARAG süreci kapatıldı`);return}
  if(t.dataset.oiall!==undefined){st.oiAll=st.oiAll===t.dataset.oiall?null:t.dataset.oiall;render();return}
  if(t.dataset.quick!==undefined){st.ord=false;st.quick=st.quick===t.dataset.quick?'':t.dataset.quick;st.view='list';render();return}
  if(t.dataset.view){umOpen(false);if(st.view==='admin'&&t.dataset.view!=='admin'&&st.rdirty){if(!confirm('Kaydedilmemiş ayar değişiklikleri silinsin mi?'))return;st.rdirty=false}
    if(st.view==='perms'&&t.dataset.view!=='perms'&&st.pdirty){if(!confirm('Kaydedilmemiş izin değişiklikleri silinsin mi?'))return;st.pdirty=false}
    if(t.dataset.view==='perms')UL=null;st.view=t.dataset.view;saveUi();render();if(t.closest('#umDrop'))scrollTo({top:$('nav.tabs').offsetTop-8,behavior:'smooth'});return}
  if(t.id==='ctEdit'){st.ctEdit=st.sel;render();const f=$('#ctform');if(f)f.elements.contact.focus();return}
  if(t.id==='ctDel'){if(!canNote()){toast('İletişim bilgisi düzenleme izniniz yok.',1);return}
    const c=C.find(x=>x.id===st.sel);if(!c)return;const ct=ctOf(c);if(!ct.contact)return;
    if(!confirm(`${ct.contact} yetkili kişi olarak silinsin mi? Telefon numarası korunur.`))return;
    if(await w(()=>db.collection('contacts').doc(c.id).set({phone:ct.phone,contact:'',updatedAt:Date.now(),by:window.CRM_USER||''}))){st.ctEdit=null;st.formFor=null;toast('Yetkili kişi silindi');render()}
    return}
  if(t.id==='ctCancel'){st.ctEdit=null;render();return}
  if(t.dataset.nd!==undefined){const f=t.closest('form');const n=+t.dataset.nd;f.elements.nextDate.value=n?addDays(n):'';f.elements.nextDate.dataset.touched='1';if(!n){f.elements.nextAction.value='';f.elements.nextAction.dataset.touched='1'}else if(!f.elements.nextAction.value)f.elements.nextAction.value='Takip';return}
  if(t.dataset.brep!==undefined){st.rep=t.dataset.brep;st.view='list';st.quick='';st.ord=false;saveUi();render();return}
  if(t.dataset.brisk!==undefined){st.rep=t.dataset.brisk;st.view='list';st.quick='risk';st.ord=false;saveUi();render();return}
  if(t.dataset.id){st.sel=t.dataset.id;st.ctEdit=null;render();if(innerWidth<=900)$('#detail').scrollTop=0;return}
  if(t.dataset.open){st.view='list';st.sel=t.dataset.open;saveUi();render();return}
  if(t.id==='back'){st.sel=null;render();return}
  if(t.id==='irun'){applyImport();return}
  if(t.id==='srun'){applySales();return}
  if(t.id==='xexp'){umOpen(false);if(!can('x_export'))return;exportXLSX();return}
  if(t.id==='xsal'){umOpen(false);if(!can('x_export'))return;exportSales();return}
  if(t.id==='clearSample'){if(st.arm!=='samples'){st.arm='samples';render();return}
    st.arm=null;for(const a of A.filter(x=>x.sample))await w(()=>db.collection('activities').doc(a.id).delete());
    for(const c of C.filter(x=>x.sample))await w(()=>db.collection('customers').doc(c.id).delete());
    st.sel=null;toast('Örnek kayıtlar silindi');render();return}
});
document.addEventListener('change',async e=>{
  const t=e.target;
  if(t.name==='asOf'&&t.closest('#qform')){st.qdirty=true;qformTotals(t.closest('form'));return}
  if(t.closest('#qform')&&t.name&&t.name.includes('|')){const n=num(t.value);if(n!=null&&!(t.name.endsWith('|t')&&n<0)){t.value=eurIn(n);t.removeAttribute('aria-invalid')}else if(String(t.value).trim())t.setAttribute('aria-invalid','true');qformTotals(t.closest('form'));return}
  if(t.id==='qYear'||t.id==='qMonth'){if(st.qedit&&st.qdirty&&!confirm('Kaydedilmemiş değişiklikler silinsin mi?')){render();return}
    st.qp=t.id==='qMonth'?t.value:t.value+(st.qp||qNow()).slice(4);st.qedit=false;st.qdirty=false;render();return}
  if(t.dataset.done){if(!canNote()){t.checked=!t.checked;return}const ok=await w(()=>db.collection('activities').doc(t.dataset.done).update({done:t.checked,doneAt:t.checked?TODAY:''}));if(ok&&t.checked)toast('Takip tamamlandı');if(!ok)t.checked=!t.checked;return}
  if(t.name==='ch'&&t.closest('#aform')){st.type=t.value;return}
  if(t.name==='out'&&t.closest('#aform')){syncOutcome(t.closest('form'),true);return}
  if(t.id==='fseg'){st.seg=t.value;render()}
  if(t.id==='fchain'){st.chain=t.value;render()}
  if(t.classList&&t.classList.contains('vsel')){if(!canVisit()){toast('Bu bilgiyi düzenleme izniniz yok.',1);render();return}
    const c=C.find(x=>x.id===t.dataset.cid);if(!c)return;const k=t.dataset.vk,v=t.value,p={[k]:v};
    if(k==='weeks'&&!v){render();return}
    if(k==='freq'){const W=WEEKS_OF[v]||[],f=String(c.weeks||'').split(', ')[0];p.weeks=W.includes(c.weeks)?c.weeks:(W.find(x=>x.split(', ')[0]===f)||W.find(x=>x.split(', ').includes(f))||W[0]||'')}
    const lab={visitDay:'Rut günü',freq:'Ziyaret sıklığı',weeks:'Ziyaret haftaları',merch:'Merch',dizim:'Dizim'}[k];
    if(await w(()=>db.rpc('set_visit',{cid:c.id,p})))toast(`${c.name} · ${lab}: ${k==='weeks'?'hafta '+v:v||'–'}${k==='freq'&&WEEKS_OF[v]&&WEEKS_OF[v].length>1?' (hafta '+p.weeks+')':''}`);else render();return}
  if(t.id==='stSel'){if(!can('e_status')){render();return}const id=t.dataset.cid,v=t.value,c=C.find(x=>x.id===id);if(!c)return;
    const ok=await w(()=>v?db.collection('statusov').doc(id).set({status:v,customer:c.name,updatedAt:Date.now(),by:window.CRM_USER||''}):db.collection('statusov').doc(id).delete());
    if(ok)toast(v?`${c.name}: ${v} olarak işaretlendi`:`${c.name}: durum yeniden otomatik (${statusAuto(c)||'–'})`);else render();return}
  if(t.id==='fstat'){st.status=t.value;render()}
  if(t.closest&&t.closest('#pform')){st.pdirty=true;$('#pmsg').textContent='Kaydedilmemiş değişiklik var';return}
  if(t.dataset.urole!==undefined){if(!isAdmin()||!window.CRM_USERS){render();return}const em=t.dataset.urole,r=t.value;
    const u=(UL||[]).find(x=>x.email===em)||{};
    try{await window.CRM_USERS.save(em,r,u.rep||null);toast(`${personOf(em).name}: ${roleName(r)}`);UL=null;render()}catch(err){toast('Rol kaydedilemedi: '+(err.message||err),1);render()}return}
  if(t.dataset.urep!==undefined){if(!isAdmin()||!window.CRM_USERS){render();return}const em=t.dataset.urep,u=(UL||[]).find(x=>x.email===em)||{};
    try{await window.CRM_USERS.save(em,u.role||'satis',t.value||null);toast(`${personOf(em).name}: ${t.value?'temsilci '+t.value:'temsilci kaldırıldı'}`);UL=null;render()}catch(err){toast('Temsilci kaydedilemedi: '+(err.message||err),1);render()}return}
  if(t.id==='simp'){umOpen(false);if(t.files.length&&can('x_sales')&&can('v_all')){const f=[...t.files];t.value='';readSales(f)}return}
  if(t.id==='oimp'){umOpen(false);if(t.files[0]&&can('x_openinv')){const f=t.files[0];t.value='';readOpenInv(f)}return}
  if(t.id==='ximp')umOpen(false);
  if(t.id==='ximp'&&t.files[0]&&can('x_import')){const f=t.files[0];t.value='';readImport(f);return}
});
$('#q').addEventListener('input',e=>{st.q=e.target.value;renderList()});
document.addEventListener('paste',qPaste);
document.addEventListener('input',e=>{const t=e.target;if(t.closest&&t.closest('#rform')){st.rdirty=true;rformCheck(t.closest('#rform'));$('#rmsg').textContent='Kaydedilmemiş değişiklik var'}if(t.closest&&t.closest('#qform')){st.qdirty=true;qformTotals(t.closest('#qform'))}if((t.name==='nextAction'||t.name==='nextDate')&&t.closest('#aform'))t.dataset.touched='1'});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.id==='ximpBtn'){e.preventDefault();$('#ximp').click();return}if((e.key==='Enter'||e.key===' ')&&e.target.id==='oimpBtn'){e.preventDefault();$('#oimp').click();return}if((e.key==='Enter'||e.key===' ')&&e.target.id==='simpBtn'){e.preventDefault();$('#simp').click();return}if(e.key==='Escape'){if(!$('#umDrop').hidden){umOpen(false);$('#avBtn').focus();return}if(!$('#modal').hidden||!$('#imodal').hidden||!$('#smodal').hidden)closeModals();else if(st.sel&&innerWidth<=900){st.sel=null;render()}}});
document.addEventListener('submit',async e=>{
  if(e.target.id==='pform'){e.preventDefault();if(!isAdmin())return;const f=e.target,d={};
    for(const [r] of ROLES.slice(1)){d[r]={};for(const [k] of PERMS)d[r][k]=!!(f.elements[r+'|'+k]||{}).checked}
    const ch=[];for(const [r,l] of ROLES.slice(1))for(const [k] of PERMS)if(d[r][k]!==permOf(r,k))ch.push(l);
    if(!ch.length){st.pdirty=false;toast('Değişiklik yok.');render();return}
    const meta={updatedAt:Date.now(),by:window.CRM_USER||''};
    if(await w(()=>db.doc('settings/perms').set({...d,...meta}))){st.pdirty=false;PM=d;PMETA={...d,...meta};toast('İzinler kaydedildi: '+[...new Set(ch)].join(', '));render()}return}
  if(e.target.id==='uform'){e.preventDefault();if(!isAdmin()||!window.CRM_USERS)return;const f=e.target,em=String(f.elements.email.value||'').trim().toLowerCase(),r=f.elements.role.value;
    if(!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(em)){toast('Geçerli bir e-posta yazın.',1);f.elements.email.focus();return}
    const ex=(UL||[]).find(u=>String(u.email).toLowerCase()===em);
    try{await window.CRM_USERS.save(ex?ex.email:em,r,ex?(ex.rep||null):(repGuess(em)||null));f.reset();toast(ex?`${personOf(em).name} zaten kayıtlı: rolü ${roleName(r)} yapıldı`:`${personOf(em).name} eklendi (${roleName(r)})`);UL=null;render()}catch(err){toast('Eklenemedi: '+(err.message||err),1)}return}
  if(e.target.id==='rform'){e.preventDefault();if(!can('e_rules'))return;const f=e.target;
    if(!rformCheck(f)){toast('Hatalı değerleri düzeltin.',1);return}
    const d={};for(const k in RDEF)d[k]=rnum(f.elements[k].value);
    const ch=Object.keys(RDEF).filter(k=>d[k]!==R[k]);if(!ch.length){st.rdirty=false;toast('Değişiklik yok.');render();return}
    const ok=await w(()=>db.doc('settings/rules').set({...d,updatedAt:Date.now(),by:window.CRM_USER||''}));
    if(ok){st.rdirty=false;applyRules({...RMETA,...d,updatedAt:Date.now(),by:window.CRM_USER||''});toast('Ayarlar kaydedildi: '+ch.map(k=>RULES.find(r=>r[0]===k)[1]).join(', '));render()}return}
  e.preventDefault();const f=e.target;
  if(f.id==='cform'){
    const v={};for(const k of FIELDS)v[k]=String(f.elements[k].value||'').trim();
    if(!v.name)return;
    const id=f.dataset.id;const old=id&&C.find(c=>c.id===id);if(!old){toast('Müşteri bulunamadı.',1);return}
    const now=Date.now();
    const obj={...old,...v,rep:old.rep||'',updatedAt:now};delete obj.id;if(v.contact!==(old.contact||'')||v.phone!==(old.phone||''))obj.ctAt=now;
    if(await w(()=>db.collection('customers').doc(id).set(obj))){closeModals();st.sel=id;st.view='list';toast('Güncellendi');render()}
    return}
  if(f.id==='aform'){
    if(!canNote()){toast('Ziyaret kaydı girme izniniz yok.',1);return}
    const c=C.find(x=>x.id===st.sel);if(!c)return;const fd=Object.fromEntries(new FormData(f));
    const note=String(fd.note||'').trim(),outcome=String(fd.out||'');
    if(!note&&!outcome){toast('Bir sonuç seçin ya da not yazın.',1);return}
    const today=iso(new Date()),nextDate=String(fd.nextDate||'');
    if(nextDate&&nextDate<today){toast('Takip tarihi geçmişte olamaz.',1);return}
    const nextAction=String(fd.nextAction||'').trim()||(nextDate?'Takip':'');
    const amount=outcome==='Sipariş alındı'?(num(fd.amount)||0):0;
    const type=CHANNELS.includes(fd.ch)?fd.ch:'Ziyaret';st.type=type;
    const obj={customerId:c.id,type,outcome,date:today,rep:c.rep||'',by:window.CRM_USER||'',note,amount,nextAction,nextDate,done:false,createdAt:Date.now()};
    const due=fd.closeDue?(D.open[c.id]||[]).filter(a=>a.nextDate<=TODAY):[];
    const ref=db.collection('activities').doc();
    if(await w(()=>ref.set(obj))){let n=0;for(const a of due)if(await w(()=>db.collection('activities').doc(a.id).update({done:true,doneAt:today})))n++;
      st.formFor=null;f.reset();toast('Kaydedildi'+(n?` · ${n} takip tamamlandı`:''));render()}
    return}
  if(f.id==='ctform'){
    if(!can('e_notes')){toast('İletişim bilgisi düzenleme izniniz yok.',1);return}
    const c=C.find(x=>x.id===st.sel);if(!c)return;
    const phone=String(f.elements.phone.value||'').trim(),contact=String(f.elements.contact.value||'').trim();
    if(phone&&String(phone).replace(/\D/g,'').length<8){toast('Telefon numarası çok kısa görünüyor.',1);return}
    if(await w(()=>db.collection('contacts').doc(c.id).set({phone,contact,updatedAt:Date.now(),by:window.CRM_USER||''}))){st.ctEdit=null;st.formFor=null;toast('İletişim bilgisi kaydedildi');render()}
    return}
  if(f.id==='qform'){
    if(!can('e_targets')){toast('Hedef girme izniniz yok.',1);return}
    const key=f.dataset.key,reps={};let bad=0;
    for(const e of f.querySelectorAll('input[name*="|"]')){const v=String(e.value||'').trim();e.removeAttribute('aria-invalid');if(!v)continue;
      const n=num(v.replace(/−/g,'-')),[r,g,k,x]=e.name.split('|');
      if(n==null||(x==='t'&&n<0)){bad++;e.setAttribute('aria-invalid','true');continue}
      const E=reps[r]||(reps[r]={c:{},f:{}});(E[g][k]=E[g][k]||{})[x]=Math.round(n)}
    if(bad){toast(`${bad} kutu hatalı: € tutarı girin (hedef eksi olamaz).`,1);const b=f.querySelector('[aria-invalid=true]');if(b)b.focus();return}
    const asOf=String((f.elements.asOf||{}).value||'');const [ms,me]=qRange(key);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||asOf<ms||asOf>me){toast('Rakamların tarihi seçilen ayın içinde olmalı.',1);f.elements.asOf.focus();return}
    if(await w(()=>db.doc('qtargets/'+key).set({period:key,asOf,reps,updatedAt:Date.now(),by:window.CRM_USER||''}))){st.qedit=false;st.qdirty=false;toast('Hedefler kaydedildi');render()}
    return}
});

render();
(async()=>{
  const timer=setTimeout(()=>{if(!loaded){st.slow=true;render()}},10000);
  const cl=window.claude;
  db=cl?await cl.use('db'):null;
  if(!db){clearTimeout(timer);st.nodb=true;loaded=true;canWrite=false;render();return}
  try{const u=await cl.use('user');const cw=u?await u.can('data.write'):null;if(cw===false)canWrite=false}catch(err){}
  db.collection('customers').onSnapshot(s=>{
    CALL=s.docs.map(d=>({...d.data(),id:d.id}));C=CALL;
    if(!s.metadata.fromCache){loaded=true;st.slow=false;clearTimeout(timer)}
    if(st.sel&&!C.some(c=>c.id===st.sel))st.sel=null;
    render()},err=>{clearTimeout(timer);loaded=true;st.err=true;render()});
  db.doc('sync/month').onSnapshot(d=>{MON=d.exists?d.data():null;render()},()=>{});
  db.collection('statusov').onSnapshot(s=>{SO=Object.fromEntries(s.docs.map(d=>[d.id,d.data()]));render()},()=>{});
  db.collection('contacts').onSnapshot(s=>{K=Object.fromEntries(s.docs.map(d=>[d.id,d.data()]));render()},()=>{});
  db.collection('qtargets').onSnapshot(s=>{QTS=Object.fromEntries(s.docs.map(d=>[d.id,d.data()]));render()},()=>{});
  db.collection('arag').onSnapshot(s=>{AR=Object.fromEntries(s.docs.map(d=>[d.id,d.data()]));render()},()=>{});
  db.doc('settings/rules').onSnapshot(d=>{applyRules(d.exists?d.data():null);render()},()=>{});
  db.doc('settings/perms').onSnapshot(d=>{const x=d.exists?d.data():{};PMETA=x;PM={};for(const [r] of ROLES.slice(1))if(x[r]&&typeof x[r]==='object')PM[r]=x[r];render()},()=>{});
  db.doc('sync/openinv').onSnapshot(d=>{OI=d.exists?d.data():null;render()},()=>{});
  db.doc('sync/returns').onSnapshot(d=>{RET=d.exists?d.data():null;render()},()=>{});
  db.collection('activities').orderBy('date','desc').limit(1000).onSnapshot(s=>{A=s.docs.map(d=>({...d.data(),id:d.id}));render()},err=>{st.err=true;render()});
})();
}
