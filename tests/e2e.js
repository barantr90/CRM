// Uçtan uca testler: node tests/e2e.js
// index.html, Supabase yerine bellek içi bir veritabanıyla (tests/mockdb.js) açılır; gerçek veriye dokunulmaz.
const {chromium}=require('playwright');
const path=require('path'),fs=require('fs');
const ROOT=path.resolve(__dirname,'..');
const SHOTS=process.env.SHOTS||path.join(__dirname,'screens');
const FIX=fs.readFileSync(path.join(__dirname,'fixture.js'),'utf8');
const MOCK=fs.readFileSync(path.join(__dirname,'mockdb.js'),'utf8');
let pass=0,fail=0;const errors=[];
const ok=(cond,msg)=>{if(cond){pass++;console.log('  ✓',msg)}else{fail++;console.log('  ✗',msg)}};
const step=t=>console.log('\n'+t);

async function open(browser,{admin=true,user='baran.sengul@akar-group.com',viewport={width:1400,height:1000},scheme='light'}={}){
  const ctx=await browser.newContext({viewport,colorScheme:scheme});
  const page=await ctx.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text())});
  // dış kaynakları (font, CDN) kapat: test tamamen çevrimdışı
  await page.route(/^https?:/,r=>r.abort());
  await page.addInitScript(`try{localStorage.clear()}catch(e){};${FIX};window.CRM_IS_ADMIN=${admin};window.CRM_USER=${JSON.stringify(user)};window.CRM_AUTH={email:${JSON.stringify(user)},async setPassword(){window.__pw=(window.__pw||0)+1},async signOut(){window.__out=(window.__out||0)+1}};${MOCK}`);
  await page.goto('file://'+path.join(ROOT,'index.html'));
  await page.waitForSelector('#list .row');
  return {ctx,page};
}
const txt=(p,s)=>p.$eval(s,e=>e.textContent.replace(/\u00a0/g,' ').trim()).catch(()=>null);
const rows=p=>p.$$eval('#list .row b',bs=>bs.map(b=>b.textContent));
const writes=p=>p.evaluate(()=>window.__writes);
const doc=(p,k)=>p.evaluate(k=>{const d=window.__store.get(k);return d===undefined?null:d},k);
const sel=async(p,name)=>{await p.click(`#list .row:has-text("${name}")`);await p.waitForSelector('#detail h2')};

(async()=>{
  fs.mkdirSync(SHOTS,{recursive:true});
  const browser=await chromium.launch();
  let {ctx,page}=await open(browser);
  const F=await page.evaluate(()=>({...window.__FIX,days:Object.fromEntries([-3,7,14].map(n=>[n,window.__FIX.day(n)]))}));
  F.day=n=>F.days[n];

  step('0. Sayfa açılıyor');
  ok((await page.$$('#stats .stat')).length===4,'4 özet kutusu var');
  ok(!(await page.$('[data-quick=due]')),'"Takip zamanı gelmiş" kutusu yok');
  ok(await page.isHidden('#tabT'),'Takipler sekmesi gizli');
  ok(await page.isHidden('#dueLeg'),'listedeki "takip" açıklaması gizli');
  ok(!(await page.$('#list .tk-tag')),'satırlarda "takip" etiketi yok');
  ok((await rows(page)).length===8,'8 müşteri listelendi');
  ok(await page.title()==='Akar Benelux NL CRM'&&await txt(page,'header h1')==='Akar Benelux NL CRM','başlık: Akar Benelux NL CRM');

  step('0b. Kullanıcı menüsü');
  ok(await txt(page,'#avBtn')==='BS','sağ üstte baş harfler: BS');
  ok(await page.isHidden('#umDrop'),'menü başta kapalı');
  await page.click('#avBtn');
  ok(await page.isVisible('#umDrop')&&await txt(page,'#umName')==='Baran Sengül'&&await txt(page,'#umMail')==='baran.sengul@akar-group.com','tıklayınca menü açılıyor: ad soyad ve e-posta');
  await page.screenshot({path:path.join(SHOTS,'0-menu.png'),clip:{x:700,y:0,width:700,height:260}});
  await page.click('h1');ok(await page.isHidden('#umDrop'),'dışarı tıklayınca kapanıyor');
  await page.click('#avBtn');await page.keyboard.press('Escape');ok(await page.isHidden('#umDrop'),'Esc ile kapanıyor');
  await page.click('#avBtn');await page.click('[data-um=pw]');
  ok(await page.evaluate(()=>window.__pw)===1&&await page.isHidden('#umDrop'),'"Şifre belirle" çalışıyor ve menüyü kapatıyor');
  await page.click('#avBtn');await page.click('[data-um=out]');ok(await page.evaluate(()=>window.__out)===1,'"Çıkış" çalışıyor');
  ok(!(await page.$('body > div[style*="position:fixed"]')),'sol alttaki eski butonlar yok');
  ok(await page.isHidden('#xexp')&&await page.isHidden('#ximpBtn'),'Excel butonları üst barda değil (menü kapalıyken görünmüyor)');
  ok(await page.$eval('#xexp',e=>!!e.closest('#umDrop'))&&await page.$eval('#ximpBtn',e=>!!e.closest('#umDrop')),'Excel butonları BS menüsünün içinde');
  await page.click('#avBtn');
  ok(await page.isVisible('#xexp')&&await page.isVisible('#ximpBtn')&&await page.isVisible('#umSep'),'yönetici menüde Excel\'e aktar ve Excel\'den içe aktar görüyor');
  {const items=await page.$$eval('#umDrop [role=menuitem]',e=>e.map(x=>x.textContent.trim()));ok(JSON.stringify(items)===JSON.stringify(["Excel'e aktar","Excel'den içe aktar",'Şifre belirle','Çıkış']),'menü sırası: '+items.join(' · '))}
  await page.screenshot({path:path.join(SHOTS,'0-menu-excel.png'),clip:{x:900,y:0,width:500,height:330}});
  {const [fc]=await Promise.all([page.waitForEvent('filechooser',{timeout:3000}).catch(()=>null),page.click('#ximpBtn')]);ok(!!fc,'Excel\'den içe aktar dosya seçme penceresini açıyor')}
  await page.keyboard.press('Escape');await page.click('#avBtn');await page.click('#xexp');
  ok(await page.isHidden('#umDrop'),'Excel\'e aktar tıklanınca menü kapanıyor');

  step('0d. Gündüz / gece modu');
  {const bg=()=>page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
   ok(await page.isVisible('#thmBtn'),'sağ üstte tema düğmesi var');
   ok(await bg()==='rgb(255, 255, 255)'&&await page.getAttribute('#thmBtn','aria-pressed')==='false','cihaz açık modda: sayfa gündüz modunda başlıyor');
   ok(await page.getAttribute('#thmBtn','title')==='Gece moduna geç','düğme ipucu: Gece moduna geç');
   await page.click('#thmBtn');
   ok(await bg()==='rgb(18, 13, 11)'&&await page.getAttribute('#thmBtn','aria-pressed')==='true','tıklayınca gece modu');
   ok(await page.evaluate(()=>localStorage.getItem('crm-theme'))==='dark','seçim tarayıcıda saklandı');
   ok(await page.getAttribute('#thmBtn','title')==='Gündüz moduna geç','düğme ipucu: Gündüz moduna geç');
   await page.screenshot({path:path.join(SHOTS,'0-gece.png')});
   // aynı tarayıcıda yeni sekme: seçim hatırlanmalı
   const p2=await ctx.newPage();await p2.route(/^https?:/,r=>r.abort());
   await p2.addInitScript(`${FIX};window.CRM_IS_ADMIN=true;${MOCK}`);
   await p2.goto('file://'+path.join(ROOT,'index.html'));await p2.waitForSelector('#list .row');
   ok(await p2.evaluate(()=>document.documentElement.dataset.theme)==='dark'&&await p2.evaluate(()=>getComputedStyle(document.body).backgroundColor)==='rgb(18, 13, 11)','sayfa yeniden açılınca gece modu hatırlanıyor');
   ok(await p2.isVisible('#thmBtn')&&await p2.isHidden('#avBtn'),'oturum bilgisi yokken de tema düğmesi görünüyor');
   await p2.close();
   await page.click('#thmBtn');
   ok(await bg()==='rgb(255, 255, 255)'&&await page.evaluate(()=>localStorage.getItem('crm-theme'))==='light','tekrar tıklayınca gündüz modu');
   await page.click('#avBtn');await page.click('#thmBtn');
   ok(await page.isHidden('#umDrop'),'menü açıkken tema değişince menü kapanıyor');
   await page.click('#thmBtn');}

  step('1. Kayıp riski listesi');
  const tile=await txt(page,'[data-quick=risk]');
  ok(tile.startsWith('3'),`risk kutusu 3 müşteri gösteriyor ("${tile}")`);
  await page.click('[data-quick=risk]');
  const r1=await rows(page);
  ok(JSON.stringify(r1)===JSON.stringify(['Düşüş Market','Kayıp Market','Sessiz Market']),'en büyük kayıp üstte sıralı: '+r1.join(', '));
  ok(!r1.includes('Kapanan Market'),'elle "Pasif" yapılan (kapanan) müşteri listede yok');
  ok(!r1.includes('Küçük Kiosk'),'küçük ciro eşiğin altında, listede yok');
  ok(!r1.includes('Sağlıklı Market'),'temposu normal müşteri listede yok');
  const why=await page.$$eval('#list .rk',e=>e.map(x=>x.textContent));
  ok(why[0].includes('Ciro temposu %'+Math.round(20000/(60000*F.YF)*100)),'Düşüş Market nedeni: '+why[0]);
  ok(/70 gündür fatura yok/.test(why[2]),'Sessiz Market nedeni: '+why[2]);
  await page.click('.chip[data-rep="Lütfi Kaplan"]');
  ok(JSON.stringify(await rows(page))===JSON.stringify(['Düşüş Market','Sessiz Market']),'temsilci seçilince yalnızca onun riskli müşterileri');
  await sel(page,'Düşüş Market');
  ok(/Kayıp riski: Ciro temposu/.test(await txt(page,'#riskAlert')),'müşteri kartında risk uyarısı');
  await page.screenshot({path:path.join(SHOTS,'1-risk.png')});
  await page.click('[data-quick=risk]');await page.click('.chip[data-rep=""]');

  step('2. Ziyaret kaydı ve Geçmiş kapalı');
  await sel(page,'Sessiz Market');
  ok(!(await page.$('#aform')),'ziyaret kaydı formu görünmüyor');
  ok(!(await page.$$eval('#detail h3',h=>h.map(x=>x.textContent))).includes('Geçmiş'),'Geçmiş bölümü görünmüyor');
  ok(!(await page.$('#detail .tl')),'geçmiş listesi yok');
  await page.screenshot({path:path.join(SHOTS,'2-kart.png')});

  step('3. Telefon, WhatsApp ve yol tarifi');
  await sel(page,'Sağlıklı Market');
  ok(await page.getAttribute('#ctCall','href')==='tel:0612345678','Ara → tel:0612345678');
  ok(await page.getAttribute('#ctWa','href')==='https://wa.me/31612345678','WhatsApp → 31612345678 (06 → 316)');
  const maps=decodeURIComponent(await page.getAttribute('#ctMap','href'));
  ok(maps.includes('destination=Kerkstraat 1, 1017 GA, Amsterdam, Nederland'),'yol tarifi adresi doğru');
  await sel(page,'İadeci Market');
  ok(await page.getAttribute('#ctWa','href')==='https://wa.me/31698765432','+31 6… numarası doğru çevrildi');
  await sel(page,'Sessiz Market');
  ok(!(await page.$('#ctCall'))&&!!(await page.$('#ctMap')),'telefonu yoksa yalnız yol tarifi; adres yoksa ada göre arar');
  ok(decodeURIComponent(await page.getAttribute('#ctMap','href')).includes('Sessiz Market'),'adres yoksa market adı kullanılıyor');
  await page.click('#ctEdit');
  await page.fill('#ctform [name=phone]','123');await page.click('#ctform button[type=submit]');
  ok(/çok kısa/.test(await txt(page,'#toast')),'kısa numara reddedildi');
  await page.fill('#ctform [name=phone]','06 11122233');await page.fill('#ctform [name=contact]','Mehmet Usta');
  await page.click('#ctform button[type=submit]');await page.waitForTimeout(100);
  const k=await doc(page,'contacts/c2');
  ok(k&&k.phone==='06 11122233'&&k.contact==='Mehmet Usta','iletişim bilgisi "contacts" koleksiyonuna kaydedildi');
  ok(await page.getAttribute('#ctCall','href')==='tel:0611122233','kaydedince Ara butonu çıktı');
  await page.fill('#q','mehmet usta');
  ok(JSON.stringify(await rows(page))==='["Sessiz Market"]','yetkili adıyla arama çalışıyor');
  await page.fill('#q','');await page.dispatchEvent('#q','input');
  await page.screenshot({path:path.join(SHOTS,'3-iletisim.png')});

  step('5. İade uyarısı');
  const tags=await page.$$eval('#list .row',rs=>rs.map(r=>[r.querySelector('b').textContent,(r.querySelector('.rtag[title^="İade"]')||{}).textContent||'']));
  ok(tags.find(t=>t[0]==='İadeci Market')[1]==='iade %12,0','İadeci Market listede "iade %12,0" etiketi taşıyor');
  ok(tags.find(t=>t[0]==='Düşüş Market')[1]==='',"Düşüş Market (%2,0) etiketsiz: eşik %2,5");
  ok(tags.find(t=>t[0]==='Yeni Market')[1]==='iade %3,0','Yeni Market (%3,0) etiketli');
  ok(tags.filter(t=>t[1]).length===2,'%2,5 altındaki müşterilerde etiket yok');
  ok(await page.$eval('#list .rtag.rt',e=>getComputedStyle(e).color)==='rgb(198, 40, 40)','iade etiketi kırmızı');
  await sel(page,'İadeci Market');
  ok(/satışın %12,0'i iade/.test(await txt(page,'#retAlert')),'kartta iade uyarısı: '+await txt(page,'#retAlert'));
  await sel(page,'Sağlıklı Market');
  ok(!(await page.$('#retAlert')),'%1 iadede uyarı yok');
  await sel(page,'İadeci Market');
  ok(await page.$eval('#detail .rl.bad b',e=>getComputedStyle(e).color)==='rgb(198, 40, 40)','kartta İade satırı kırmızı');

  step('6. Temsilci karnesi');
  ok(await page.isVisible('#tabB'),'yönetici Karne sekmesini görüyor');
  await page.click('#tabB');
  ok(await page.isHidden('#listView')&&await page.isVisible('#boardView'),'Karne açıkken müşteri listesi gizli');

  const br=await page.$$eval('#boardT tbody tr',rs=>Object.fromEntries(rs.map(r=>{const t=[...r.cells].map(c=>c.textContent.replace(/\u00a0/g,' ').trim());return [t[0],t]})));
  ok(br['Lütfi Kaplan'][5].startsWith('2 ·'),'Lütfi: 2 riskli müşteri');
  ok(br['Gökhan Genç'][5].startsWith('1 ·'),'Gökhan: 1 riskli (kapanan hariç)');
  ok(!(await page.$$eval('#boardT th',t=>t.map(x=>x.textContent))).some(t=>t.startsWith('Kayıt')),'karnede ziyaret kaydı sütunu yok');
  ok(br['Mehmet Halici'][2]==='€ 50.500','Mehmet ciro 2025 toplamı € 50.500 → '+JSON.stringify(br['Mehmet Halici'][2]));
  {const h=await page.$$eval('#boardT th',t=>t.map(x=>x.textContent));
   ok(JSON.stringify(h)==='["Temsilci","Müşteri","Ciro 2025","2026 YTD","Tempo","Kayıp Riski"]','karne sütunları: '+h.join(', '));
   ok(Object.values(br).every(r=>r.length===6),'satırlarda da 6 hücre var')}
  const rt=await page.$$eval('#retT tbody tr',rs=>rs.map(r=>r.cells[0].textContent));
  ok(JSON.stringify(rt)==='["İadeci Market","Yeni Market"]','iade tablosu orana göre: İadeci, Yeni');
  await page.screenshot({path:path.join(SHOTS,'6-karne.png'),fullPage:true});
  await page.click('[data-brisk="Lütfi Kaplan"]');
  ok(await page.isVisible('#listView')&&JSON.stringify(await rows(page))==='["Düşüş Market","Sessiz Market"]','risk sayısına tıklayınca o temsilcinin risk listesi açılıyor');
  await page.click('.chip[data-rep=""]');await page.click('[data-quick=risk]');

  step('7. Çeyrek hedef takibi');
  await page.click('#tabB');
  ok(!(await page.$$eval('#board h3',h=>h.map(x=>x.textContent))).some(t=>/Hedef/.test(t)),'hedefler Karne sekmesinde değil');
  await page.click('#tabH');
  ok(await page.isVisible('#targetsView')&&await page.isHidden('#boardView')&&await page.isHidden('#listView'),'Hedefler sekmesi ayrı açılıyor');
  const QK=F.QK,[QY,QQ]=QK.split('-');
  // dönemin geçen kısmı (uygulamadaki formülün aynısı)
  const qs=(+QQ.slice(1)-1)*3+1,qStart=`${QY}-${String(qs).padStart(2,'0')}-01`,qEnd=new Date(Date.UTC(+QY,qs+2,0)).toISOString().slice(0,10);
  const dd=x=>Date.parse(x)/864e5,PACE=F.TODAY<qStart?0:F.TODAY>qEnd?1:(dd(F.TODAY)-dd(qStart)+1)/(dd(qEnd)-dd(qStart)+1);
  const expCls=p=>p>=1?'q-good':p<PACE?'q-bad':'';
  ok(await page.$eval(`[data-qp="${QK}"]`,e=>e.classList.contains('on')),'açılışta içinde bulunulan çeyrek seçili: '+QK);
  ok((await txt(page,'#targets h3')).includes(QQ+' '+QY),'başlıkta dönem: '+await txt(page,'#targets h3'));
  ok(/dönemin %\d+'i geçti|henüz başlamadı|tamamlandı/.test(await txt(page,'.qinfo')),'tempo açıklaması: '+await txt(page,'.qinfo'));
  ok((await page.$$eval('#targets [data-qp]',b=>b.map(x=>x.textContent))).join(',')===`Q1,Q2,Q3,Q4,${QY} Yıl`,'dönem seçenekleri: Q1–Q4 ve yıl');

  // Özet görünümü (varsayılan)
  ok(await page.getAttribute('[data-qv=ozet]','aria-pressed')==='true','varsayılan görünüm: Özet');
  const big=n=>txt(page,`[data-qcard="${n}"] .qbig`);
  ok(await big('Özgür Firat')==='%84','Özgür genel gerçekleşme %84 (Excel ile aynı)');
  ok(await big('Lütfi Kaplan')==='%56','Lütfi genel gerçekleşme %56 (Excel ile aynı)');
  ok(await big('Akar Benelux Toplam')==='%80','ekip toplamı %80 (312.763 / 389.000)');
  ok(await big('Mehmet Halici')==='–','verisi olmayan temsilci: –');
  {const c=await page.$eval('[data-qcard="Özgür Firat"] [data-qc="icecek"] > b',e=>[e.textContent,e.className]);ok(c[0]==='%124'&&c[1]==='q-good','Özgür İçecek %124 yeşil (hedef aşıldı)')}
  {const c=await page.$eval('[data-qcard="Özgür Firat"] [data-qc="nonfood"] > b',e=>[e.textContent,e.className]);ok(c[0]==='%6'&&c[1]===expCls(0.06),`Özgür Non-Food %6 → ${expCls(0.06)||'normal'} (tempo %${Math.round(PACE*100)})`)}
  {const c=await page.$eval('[data-qcard="Özgür Firat"] [data-qc="atis"] > b',e=>e.className);ok(c===expCls(122499/180000),'Özgür Atıştırmalık %68 rengi tempoya göre doğru')}
  ok((await page.$$('[data-qcard="Özgür Firat"] .qbar b')).length===(PACE>0&&PACE<1?6:0),'çubuklarda "bugün olması gereken" çizgisi');
  ok(/Tahsilat hedefi: € 390\.747 · gerçekleşen henüz girilmedi/.test(await txt(page,'[data-qcard="Özgür Firat"]')),'Özgür kartında tahsilat hedefi ve açıklama');
  ok(/Hedefe kalan: € 54\.434/.test(await txt(page,'[data-qcard="Özgür Firat"] .qleft')),'Özgür hedefe kalan: € 54.434 (339.000 − 284.566)');
  ok(/Bu dönem için veri girilmemiş/.test(await txt(page,'[data-qcard="Mehmet Halici"]'))&&!(await page.$('[data-qcard="Mehmet Halici"] .qcats')),'verisi olmayan temsilci sade gösteriliyor');
  await page.screenshot({path:path.join(SHOTS,'7-ozet.png'),fullPage:true});

  // Tablo görünümü (Excel düzeni)
  await page.click('[data-qv=tablo]');
  ok(await page.getAttribute('[data-qv=tablo]','aria-pressed')==='true'&&await page.evaluate(()=>JSON.parse(localStorage.getItem('crm-ui')).qv)==='tablo','Tablo görünümü seçildi ve hatırlanıyor');
  const qrow=(b,i)=>page.$eval(`[data-qblock="${b}"] table`,(t,i)=>[...t.rows[i].cells].map(c=>c.textContent.replace(/ /g,' ').trim()),i);
  ok(JSON.stringify(await page.$$eval('[data-qblock="Özgür Firat"] .ordp:first-child thead th',t=>t.map(x=>x.textContent)))==='["Kategori","2025 Sell-Out","2026 Hedef","2026 Sell-Out","Gerçekleşme","26 vs 25"]','tablo başlıkları Excel ile aynı sırada');
  {const r=await qrow('Özgür Firat',1);ok(JSON.stringify(r)==='["Atıştırmalık","€ 154.917","€ 180.000","€ 122.499","%68","−%21"]','Özgür Atıştırmalık satırı: '+r.join(' | '))}
  {const r=await qrow('Özgür Firat',6);ok(JSON.stringify(r)==='["Genel Toplam","€ 287.315","€ 339.000","€ 284.566","%84","−%1"]','Özgür Genel Toplam: '+r.join(' | '))}
  {const f=await page.$eval('[data-qblock="Özgür Firat"] .ordp:nth-child(2) table',t=>[...t.rows].map(r=>[...r.cells].map(c=>c.textContent.replace(/ /g,' ').trim()).join('|')));
   ok(f[2]==='Tahsilat|€ 390.747|–|–'&&f[4]==='İade|€ 5.085|–|–','Özgür finans: Tahsilat 390.747, İade 5.085 (bölme hatası yerine –) → '+JSON.stringify(f))}
  ok(await page.$eval('#targets .qblock',e=>e.dataset.qblock)==='Akar Benelux Toplam','ekip toplamı en üstte');
  {const r=await qrow('Akar Benelux Toplam',6);ok(r[2]==='€ 389.000'&&r[3]==='€ 312.763','ekip toplamı: hedef 389.000, sell-out 312.763')}
  await page.screenshot({path:path.join(SHOTS,'7-tablo.png'),fullPage:true});
  await page.click('.chip[data-rep="Lütfi Kaplan"]');
  ok(JSON.stringify(await page.$$eval('#targets .qblock',b=>b.map(x=>x.dataset.qblock)))==='["Lütfi Kaplan"]','temsilci seçilince yalnızca onun tablosu');
  await page.click('.chip[data-rep=""]');

  // Yıl ve boş dönem
  await page.click(`[data-qp="${QY}-Y"]`);
  ok((await txt(page,'#targets h3')).includes('Yılı')&&!(await page.$('#qEdit')),'yıl görünümü: Q1–Q4 toplamı, düzenleme yok');
  {const r=await qrow('Özgür Firat',6);ok(r[3]==='€ 284.566','yıl toplamı çeyreklerin toplamı')}
  const other=QQ==='Q1'?'Q2':'Q1';
  await page.click(`[data-qp="${QY}-${other}"]`);
  ok(/hedef girilmemiş/.test(await txt(page,'.qempty')),'verisi olmayan çeyrekte açıklama');

  // Düzenleme (yalnızca yönetici)
  await page.click(`[data-qp="${QK}"]`);
  await page.click('#qEdit');
  ok((await page.$$('#qform input')).length===5*(15+8),'düzenleme: 5 temsilci × (15 satış + 8 finans) kutu');
  ok(await page.inputValue('#qform [name="Özgür Firat|c|atis|p"]')==='154.917','mevcut değerler kutularda');
  // Excel'den yapıştırma: başlık satırı, kategori sütunu, € biçimi ve % sütunu dahil
  const TSV='KATEGORI\t2025 SELL-OUT\t2026 HEDEF\t2026 SELL-OUT\tGERCEKLESME\nATISTIRMALIK\t€ 113.240 \t€ 135.000 \t€ 111.920 \t83%\nICECEK\t€ 25.088 \t€ 32.000 \t€ 18.182 \t57%\nMUTFAK\t€ 27.392\t€ 34.000\t€ 33.522\t99%\nNON-FOOD\t€ 174\t€ 1.000\t€ 440\t44%\nTEMEL GIDA\t€ 6.377\t€ 10.000\t€ 7.350\t73%';
  await page.focus('#qform [name="Gökhan Genç|c|atis|p"]');
  await page.evaluate(t=>{const e=document.activeElement;const dt=new DataTransfer();dt.setData('text/plain',t);e.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))},TSV);
  ok(await page.inputValue('#qform [name="Gökhan Genç|c|atis|p"]')==='113.240'&&await page.inputValue('#qform [name="Gökhan Genç|c|temel|a"]')==='7.350','Excel bloğu yapıştırıldı: 5 satır × 3 sütun yerine oturdu');
  ok(/15 hücre yapıştırıldı/.test(await txt(page,'#toast')),'bildirim: '+await txt(page,'#toast'));
  ok(await txt(page,'#qform [data-qs="Gökhan Genç|t"]')==='€ 212.000'&&await txt(page,'#qform [data-qr="Gökhan Genç|_"]')==='%81','canlı toplam: Gökhan hedef € 212.000, gerçekleşme %81 (Excel ile aynı)');
  // finans bloğu: "€ -" ve #DIV/0! hücreleri
  await page.focus('#qform [name="Gökhan Genç|f|devir|t"]');
  await page.evaluate(t=>{const e=document.activeElement;const dt=new DataTransfer();dt.setData('text/plain',t);e.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))},'ONCEKI AY DEVIR\t€ -\t€ -\t#DIV/0!\nTAHSILAT\t€ 172.949\t€ -\t0%\nFKNS\t0\t0\t#DIV/0!\nIADE\t€ 3.180\t€ -\t0%');
  ok(await page.inputValue('#qform [name="Gökhan Genç|f|tahsilat|t"]')==='172.949'&&await page.inputValue('#qform [name="Gökhan Genç|f|devir|t"]')===''&&await page.inputValue('#qform [name="Gökhan Genç|f|iade|t"]')==='3.180','finans bloğu yapıştırıldı ("€ -" boş, #DIV/0! atlandı)');
  await page.fill('#qform [name="Baran Sengül|c|atis|t"]','5000');await page.fill('#qform [name="Baran Sengül|c|atis|a"]','-625');await page.press('#qform [name="Baran Sengül|c|atis|a"]','Tab');
  ok(await page.inputValue('#qform [name="Baran Sengül|c|atis|a"]')==='-625','eksi sell-out kabul ediliyor (-625)');
  await page.fill('#qform [name="Mehmet Halici|c|atis|t"]','-5');await page.click('#qform button[type=submit]');
  ok(/hatalı/.test(await txt(page,'#toast'))&&await page.getAttribute('#qform [name="Mehmet Halici|c|atis|t"]','aria-invalid')==='true','eksi hedef reddedildi ve kutu işaretlendi');
  await page.fill('#qform [name="Mehmet Halici|c|atis|t"]','');
  await page.screenshot({path:path.join(SHOTS,'7-duzenle.png'),fullPage:true});
  // vazgeç uyarısı
  page.once('dialog',d=>d.dismiss());await page.click('#qCancel');
  ok(!!(await page.$('#qform')),'kaydedilmemiş değişiklikte Vazgeç onay soruyor (hayır → düzenlemede kalır)');
  await page.click('#qform button[type=submit]');await page.waitForTimeout(150);
  const qd=await doc(page,'qtargets/'+QK);
  ok(qd&&JSON.stringify(qd.reps['Gökhan Genç'].c.atis)==='{"p":113240,"t":135000,"a":111920}'&&qd.reps['Gökhan Genç'].f.tahsilat.t===172949,'Gökhan kaydedildi');
  ok(qd.reps['Baran Sengül'].c.atis.a===-625&&qd.reps['Özgür Firat'].c.icecek.a===117932&&!qd.reps['Mehmet Halici'],'eksi değer kaydı; Özgür korundu; boş temsilci kaydedilmedi');
  ok(!(await page.$('#qform'))&&/kaydedildi/.test(await txt(page,'#toast')),'kaydedince düzenleme kapandı');
  await page.click('[data-qv=ozet]');
  ok(await big('Gökhan Genç')==='%81','Özet\'te Gökhan %81');
  await page.click('[data-qv=tablo]');await page.click('[data-qv=ozet]');

  // aylık net ciro kutusu (değişmedi)
  await page.click('[data-view=list]');
  await page.click('.chip[data-rep="Lütfi Kaplan"]');
  {const v=await txt(page,'#ordBtn');ok(/hedef € 4\.000 \(%30\)/.test(v),'Lütfi seçiliyken net ciro kutusunda aylık hedef ve yüzde → '+JSON.stringify(v))}
  ok(!!(await page.$('#ordBtn .bar i')),'ilerleme çubuğu var');
  await page.click('.chip[data-rep=""]');
  ok(/hedef € 14\.000/.test(await txt(page,'#ordBtn')),'tüm temsilcilerde toplam hedef € 14.000');
  await page.click('#ordBtn');
  const heads=await page.$$eval('#ordp th',t=>t.map(x=>x.textContent));
  ok(heads.includes('Hedef')&&heads.includes('Gerçekleşme'),'net ciro tablosunda Hedef ve Gerçekleşme sütunları');
  ok(['Net ciro','Satış','İade','Fiyat farkı'].every(h=>heads.includes(h)),'net ciro tablosu: Net ciro, Satış, İade, Fiyat farkı');
  {const r=await page.$$eval('#ordp tbody tr',rs=>{const x=rs.find(r=>r.cells[0].textContent.includes('Lütfi'));return [...x.cells].map(c=>c.textContent.replace(/\u00a0/g,' ').trim())});
   ok(r[1]==='€ 1.200'&&r[2]==='€ 1.350'&&r[3]==='€ -100'&&r[4]==='€ -50','Lütfi net ciro € 1.200 = satış 1.350 − iade 100 − fiyat farkı 50 → '+r.slice(1,5).join(' | '))}
  ok(/Bu ay net ciro/.test(await txt(page,'#ordBtn')),'özet kutusu: Bu ay net ciro');
  await page.screenshot({path:path.join(SHOTS,'7-hedef.png')});
  await ctx.close();

  step('0c. Raci Öner');
  ({ctx,page}=await open(browser,{admin:false,user:'Raci.Oener@akar-gmbh.de'}));
  ok(await txt(page,'#avBtn')==='RÖ','baş harfler: RÖ');
  await page.click('#avBtn');ok(await txt(page,'#umName')==='Raci Öner','menüde ad: Raci Öner');
  ok(!(await page.$('.chip[data-rep="Raci Öner"]')),'temsilci butonlarına eklenmedi');
  await ctx.close();

  step('6/7. Temsilci (yönetici olmayan) görünümü');
  ({ctx,page}=await open(browser,{admin:false,user:'lutfi.kaplan@akar-bv.nl'}));
  ok(await page.isHidden('#tabB'),'temsilci Karne sekmesini görmüyor');
  ok(await txt(page,'#avBtn')==='LK','temsilcide baş harfler: LK');
  await page.click('#avBtn');ok(await txt(page,'#umName')==='Lütfi Kaplan','e-postadan Türkçe ad: Lütfi Kaplan');
  ok(await page.isHidden('#xexp')&&await page.isHidden('#ximpBtn')&&await page.isHidden('#umSep'),'temsilcinin menüsünde Excel butonları yok');
  await page.keyboard.press('Escape');
  ok(await page.isHidden('#ximpBtn'),'temsilci Excel içe aktarmayı görmüyor (mevcut davranış)');
  await sel(page,'Sessiz Market');
  ok(!!(await page.$('#ctEdit')),'temsilci telefon ekleyebiliyor');
  ok(await page.isVisible('#tabH'),'temsilci Hedefler sekmesini görüyor');
  await page.click('#tabH');
  ok(!(await page.$('#qEdit'))&&!(await page.$('#targets input')),'temsilci yalnızca görüntülüyor: Düzenle ve giriş kutusu yok');
  ok(/yalnızca görüntüleme/.test(await txt(page,'#targets h3')),'başlıkta "yalnızca görüntüleme" yazıyor');
  ok(await txt(page,'[data-qcard="Özgür Firat"] .qbig')==='%84'&&await txt(page,'[data-qcard="Lütfi Kaplan"] .qbig')==='%56','temsilci tüm ekibin hedeflerini görüyor');
  await page.click('[data-qv=tablo]');ok(!!(await page.$('[data-qblock="Lütfi Kaplan"]')),'temsilci Tablo görünümünü de açabiliyor');
  await page.screenshot({path:path.join(SHOTS,'7-temsilci-hedefler.png'),fullPage:true});
  await page.evaluate(()=>{window.CRM_IS_ADMIN=undefined});await page.click('[data-qv=ozet]');
  ok(!(await page.$('#qEdit')),'yönetici olarak doğrulanmamış kullanıcı Düzenle görmüyor');
  await ctx.close();

  step('8. Telefon ekranı (390 px) ve koyu tema');
  ({ctx,page}=await open(browser,{viewport:{width:390,height:844},scheme:'dark'}));
  ok(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor)==='rgb(18, 13, 11)'&&await page.getAttribute('#thmBtn','aria-pressed')==='true','cihaz koyu modda: seçim yokken gece modunda başlıyor');
  ok(await page.$eval('#thmBtn',e=>{const r=e.getBoundingClientRect();return r.top<70&&r.right<=390})&&await page.$eval('header h1',e=>{const r=document.createRange();r.selectNodeContents(e);const h=r.getBoundingClientRect(),t=document.querySelector('#thmBtn').getBoundingClientRect();return h.right<=t.left}),'telefonda tema düğmesi sağ üstte, başlıkla çakışmıyor');
  ok(await page.$eval('#avBtn',e=>{const r=e.getBoundingClientRect();return r.right<=390&&r.top<70}),'telefonda baş harf butonu sağ üstte');
  await page.click('#avBtn');ok(await page.$eval('#umDrop',e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=390}),'telefonda menü ekrana sığıyor');
  await page.screenshot({path:path.join(SHOTS,'8-mobil-menu.png')});await page.keyboard.press('Escape');
  await page.click('[data-quick=risk]');
  const sw=await page.evaluate(()=>document.documentElement.scrollWidth);
  ok(sw<=390,'yatay kaydırma yok (genişlik '+sw+')');
  await page.screenshot({path:path.join(SHOTS,'8-mobil-liste.png')});
  await page.click('[data-quick=risk]');
  await page.click('#list .row:has-text("Sağlıklı Market")');
  const ctaOk=await page.$eval('.cta',e=>e.getBoundingClientRect().right<=390);
  ok(ctaOk,'butonlar ekrana sığıyor');
  await page.screenshot({path:path.join(SHOTS,'8-mobil-kart.png'),fullPage:true});
  await ctx.close();

  step('7m. Hedefler telefonda');
  ({ctx,page}=await open(browser,{viewport:{width:390,height:844}}));
  await page.click('#tabH');
  ok(await page.evaluate(()=>document.documentElement.scrollWidth)<=390,'Özet telefonda yana taşmıyor');
  await page.screenshot({path:path.join(SHOTS,'7m-ozet.png'),fullPage:true});
  await page.click('[data-qv=tablo]');
  ok(await page.evaluate(()=>document.documentElement.scrollWidth)<=390,'Tablo telefonda sayfayı taşırmıyor (tablolar kendi içinde kayar)');
  await page.screenshot({path:path.join(SHOTS,'7m-tablo.png'),fullPage:true});
  await ctx.close();

  step('Konsol hataları');
  ok(errors.length===0,errors.length?'hatalar: '+errors.join(' | '):'hiç JavaScript hatası yok');
  await browser.close();
  console.log(`\nSonuç: ${pass} geçti, ${fail} kaldı`);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
