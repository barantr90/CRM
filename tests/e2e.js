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

  step('7. Hedef takibi (ayrı sekme)');
  await page.click('#tabB');
  ok(!(await page.$('#board #tform'))&&!(await page.$$eval('#board h3',h=>h.map(x=>x.textContent))).some(t=>t.startsWith('Aylık')),'hedefler artık Karne sekmesinde değil');
  await page.click('#tabH');
  ok(await page.isVisible('#targetsView')&&await page.isHidden('#boardView')&&await page.isHidden('#listView'),'Hedefler sekmesi ayrı açılıyor');
  const heads7=await page.$$eval('#tform thead th',t=>t.map(x=>x.textContent));
  ok(JSON.stringify(heads7)==='["Temsilci","A","B","C","D","E","Hedef","Bu Ay Sipariş","Gerçekleşme"]','hedef tablosu: Temsilci, A–E, Hedef, Bu Ay Sipariş, Gerçekleşme');
  ok((await page.$$('#tform .eurin i')).length===25&&await txt(page,'#tform .eurin i')==='€','her hücrede € simgesi (5 temsilci × 5 kategori)');
  await page.fill('#tform [name="Lütfi Kaplan|A"]','abc');await page.click('#tform button[type=submit]');
  ok(/€ tutarı olmalı/.test(await txt(page,'#toast')),'geçersiz hedef reddedildi');
  await page.fill('#tform [name="Lütfi Kaplan|A"]','1500');await page.press('#tform [name="Lütfi Kaplan|A"]','Tab');
  ok(await page.inputValue('#tform [name="Lütfi Kaplan|A"]')==='1.500','1500 yazınca alan "1.500" biçimine geçiyor');
  await page.fill('#tform [name="Lütfi Kaplan|B"]','2.500');await page.fill('#tform [name="Mehmet Halici|A"]','10.000');
  ok(await txt(page,'#tform [data-tt="Lütfi Kaplan"]')==='€ 4.000','satır toplamı canlı: € 4.000');
  ok(await txt(page,'#tform [data-ct="A"]')==='€ 11.500'&&await txt(page,'#tform [data-ct="_all"]')==='€ 14.000','sütun ve genel toplam canlı: A € 11.500, toplam € 14.000');
  await page.screenshot({path:path.join(SHOTS,'7-hedef-tablo.png'),fullPage:true});
  await page.click('#tform button[type=submit]');await page.waitForTimeout(100);
  const tg=await doc(page,'targets/'+F.TODAY.slice(0,7));
  ok(tg&&tg.grid['Lütfi Kaplan'].A===1500&&tg.grid['Lütfi Kaplan'].B===2500&&tg.reps['Lütfi Kaplan']===4000&&tg.reps['Mehmet Halici']===10000,'kategori hedefleri ve temsilci toplamları kaydedildi');
  ok(JSON.stringify(tg.cats)==='["A","B","C","D","E"]','kategori adları kayıtta');
  ok(/^%30/.test(await txt(page,'#tform [data-tp="Lütfi Kaplan"]'))&&!!(await page.$('#tform [data-tp="Lütfi Kaplan"] .bar')),'Lütfi gerçekleşme %30 ve çubuk');
  ok(/^%66/.test(await txt(page,'#tform [data-tp="_all"]')),'toplam gerçekleşme %66 (9.200 / 14.000)');
  await page.screenshot({path:path.join(SHOTS,'7-hedefler-sekme.png'),fullPage:true});
  await page.click('#tabB');
  await page.click('[data-view=list]');
  await page.click('.chip[data-rep="Lütfi Kaplan"]');
  {const v=await txt(page,'#ordBtn');ok(/hedef € 4\.000 \(%30\)/.test(v),'Lütfi seçiliyken sipariş kutusunda hedef ve yüzde → '+JSON.stringify(v))}
  ok(!!(await page.$('#ordBtn .bar i')),'ilerleme çubuğu var');
  await page.click('.chip[data-rep=""]');
  ok(/hedef € 14\.000/.test(await txt(page,'#ordBtn')),'tüm temsilcilerde toplam hedef € 14.000');
  await page.click('#ordBtn');
  const heads=await page.$$eval('#ordp th',t=>t.map(x=>x.textContent));
  ok(heads.includes('Hedef')&&heads.includes('Gerçekleşme'),'sipariş tablosunda Hedef ve Gerçekleşme sütunları');
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
  await page.keyboard.press('Escape');
  ok(await page.isHidden('#ximpBtn'),'temsilci Excel içe aktarmayı görmüyor (mevcut davranış)');
  await sel(page,'Sessiz Market');
  ok(!!(await page.$('#ctEdit')),'temsilci telefon ekleyebiliyor');
  ok(await page.isVisible('#tabH'),'temsilci Hedefler sekmesini görüyor');
  await page.click('#tabH');
  ok(/hedef girilmemiş/.test(await txt(page,'#targets')),'hedef yoksa bilgi mesajı');
  await page.evaluate(m=>window.claude.use('db').then(db=>db.doc('targets/'+m).set({month:m,cats:['A','B','C','D','E'],grid:{'Lütfi Kaplan':{A:3000,B:1000}},reps:{'Lütfi Kaplan':4000,'Özgür Firat':5000}})),F.TODAY.slice(0,7));
  await page.waitForTimeout(100);
  ok(!(await page.$('#tform'))&&!(await page.$('#targets input')),'temsilci hedefleri yalnızca görüntülüyor: giriş alanı ve kaydet yok');
  ok(/yalnızca görüntüleme/.test(await txt(page,'#targets h3')),'başlıkta "yalnızca görüntüleme" yazıyor');
  ok(await txt(page,'#tgT [data-tt="Lütfi Kaplan"]')==='€ 4.000'&&/^%30/.test(await txt(page,'#tgT [data-tp="Lütfi Kaplan"]')),'temsilci hedefi ve gerçekleşmeyi görüyor: € 4.000 · %30');
  ok(await txt(page,'#tgT [data-tt="Özgür Firat"]')==='€ 5.000 kategorisiz','kategorisiz eski hedef de görünüyor');
  await page.screenshot({path:path.join(SHOTS,'7-temsilci-hedefler.png'),fullPage:true});
  await page.evaluate(()=>{window.CRM_IS_ADMIN=undefined});await page.click('#tabH');
  ok(!(await page.$('#tform')),'yönetici olarak doğrulanmamış kullanıcı hedef formunu görmüyor');
  await ctx.close();

  step('8. Telefon ekranı (390 px) ve koyu tema');
  ({ctx,page}=await open(browser,{viewport:{width:390,height:844},scheme:'dark'}));
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

  step('Konsol hataları');
  ok(errors.length===0,errors.length?'hatalar: '+errors.join(' | '):'hiç JavaScript hatası yok');
  await browser.close();
  console.log(`\nSonuç: ${pass} geçti, ${fail} kaldı`);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
