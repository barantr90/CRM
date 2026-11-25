// Uçtan uca testler: node tests/e2e.js
// index.html, Supabase yerine bellek içi bir veritabanıyla (tests/mockdb.js) açılır; gerçek veriye dokunulmaz.
const {chromium}=require('playwright');
const path=require('path'),fs=require('fs');
const ROOT=path.resolve(__dirname,'..');
// Sayfa, gerçek sitedeki gibi bir web sunucusundan açılır (file:// tarayıcıda yerel depolamayı tutarsız saklıyor).
const http=require('http');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
let BASE='';
function serve(){return new Promise(res=>{const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  if(!f.startsWith(ROOT+path.sep)){r.writeHead(403);return r.end()}
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});r.end(d)})});
  srv.listen(0,'127.0.0.1',()=>{BASE=`http://127.0.0.1:${srv.address().port}`;res(srv)})})}
// dış kaynaklar (font, CDN) kapalı: yalnızca yerel sunucu
const offline=u=>u.hostname!=='127.0.0.1';
const SHOTS=process.env.SHOTS||path.join(__dirname,'screens');
const FIX=fs.readFileSync(path.join(__dirname,'fixture.js'),'utf8');
const MOCK=fs.readFileSync(path.join(__dirname,'mockdb.js'),'utf8');
let pass=0,fail=0;const errors=[];
const ok=(cond,msg)=>{if(cond){pass++;console.log('  ✓',msg)}else{fail++;console.log('  ✗',msg)}};
const step=t=>console.log('\n'+t);

async function open(browser,{visitLog=false,admin=true,role='',seed=null,user='baran.sengul@akar-group.com',viewport={width:1400,height:1000},scheme='light'}={}){
  const ctx=await browser.newContext({viewport,colorScheme:scheme});
  const page=await ctx.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text())});
  // dış kaynakları (font, CDN) kapat: test tamamen çevrimdışı
  await page.route(offline,r=>r.abort());
  await page.addInitScript(`try{if(!sessionStorage.getItem('__t')){localStorage.clear();sessionStorage.setItem('__t','1')}}catch(e){};${FIX};${seed?`Object.assign(window.__SEED,${JSON.stringify(seed)});`:''}window.CRM_IS_ADMIN=${admin};${role?`window.CRM_ROLE=${JSON.stringify(role)};`:''}window.CRM_USER=${JSON.stringify(user)};window.CRM_AUTH={email:${JSON.stringify(user)},async setPassword(){window.__pw=(window.__pw||0)+1},async signOut(){window.__out=(window.__out||0)+1}};${MOCK}`);
  // ziyaret kaydı canlıda kapalı (VISIT_LOG=false); izin testleri için açık hâliyle yüklenir
  if(visitLog){const src=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');if(!src.includes('const VISIT_LOG=false;'))throw new Error('VISIT_LOG satırı bulunamadı');
    await page.route(u=>u.pathname==='/app.js',r=>r.fulfill({contentType:'text/javascript; charset=utf-8',body:src.replace('const VISIT_LOG=false;','const VISIT_LOG=true;')}))}
  await page.goto(BASE+'/index.html');
  await page.waitForSelector('#list .row');
  return {ctx,page};
}
const txt=(p,s)=>p.$eval(s,e=>e.textContent.replace(/\u00a0/g,' ').trim()).catch(()=>null);
const rows=p=>p.$$eval('#list .row b',bs=>bs.map(b=>b.textContent));
const writes=p=>p.evaluate(()=>window.__writes);
const doc=(p,k)=>p.evaluate(k=>{const d=window.__store.get(k);return d===undefined?null:d},k);
const goList=async p=>{for(const q of ['#homeA','#homeP','.tab[data-view=list]'])if(await p.isVisible(q)){await p.click(q);return}throw new Error('ana sayfa butonu yok')};
const goAdm=async p=>{await p.click('#avBtn');await p.click('#umRules')};
const sel=async(p,name)=>{await p.click(`#list .row:has-text("${name}")`);await p.waitForSelector('#detail h2')};

(async()=>{
  fs.mkdirSync(SHOTS,{recursive:true});
  const server=await serve();
  const browser=await chromium.launch();
  let {ctx,page}=await open(browser);
  const F=await page.evaluate(()=>({...window.__FIX,days:Object.fromEntries([-3,7,14].map(n=>[n,window.__FIX.day(n)]))}));
  F.day=n=>F.days[n];

  step('0. Sayfa açılıyor');
  ok((await page.$$('#stats .stat')).length===5,'5 özet kutusu var (Vadesi geçen dahil)');
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
  ok(await page.isVisible('#oimpBtn'),'yönetici menüde Açık faturaları içe aktar görüyor');
  {const items=await page.$$eval('#umDrop [role=menuitem]',e=>e.map(x=>x.textContent.trim()));ok(JSON.stringify(items)===JSON.stringify(["Excel'e aktar","Excel'den içe aktar",'Açık faturaları içe aktar','Yönetici ayarları','Kullanıcı izinleri','Şifre belirle','Çıkış']),'menü sırası: '+items.join(' · '))}
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
   // aynı sekmede sayfayı yenile: seçim hatırlanmalı
   await page.reload();await page.waitForSelector('#list .row');
   ok(await page.evaluate(()=>document.documentElement.dataset.theme)==='dark'&&await bg()==='rgb(18, 13, 11)','sayfa yenilenince gece modu hatırlanıyor');
   // oturum bilgisi olmayan sayfa (ayrı sekme)
   const p2=await ctx.newPage();await p2.route(offline,r=>r.abort());
   await p2.addInitScript(`${FIX};window.CRM_IS_ADMIN=true;${MOCK}`);
   await p2.goto(BASE+'/index.html');await p2.waitForSelector('#list .row');
   ok(await p2.isVisible('#thmBtn')&&await p2.isHidden('#avBtn'),'oturum bilgisi yokken de tema düğmesi görünüyor');
   await p2.close();
   await page.click('#thmBtn');
   ok(await bg()==='rgb(255, 255, 255)'&&await page.evaluate(()=>localStorage.getItem('crm-theme'))==='light','tekrar tıklayınca gündüz modu');
   await page.click('#avBtn');await page.click('#thmBtn');
   ok(await page.isHidden('#umDrop'),'menü açıkken tema değişince menü kapanıyor');
   await page.click('#thmBtn');}

  step('1. Kayıp riski listesi');
  const tile=await txt(page,'[data-quick=risk]');
  ok(await txt(page,'[data-quick=risk] b')==='2',`risk kutusu yalnız aktif 2 müşteri gösteriyor ("${tile}")`);
  ok(await txt(page,'#rkPas')==='Pasif müşteri: 2','kutunun altında küçük punto: Pasif müşteri: 2 (Kayıp Market, Kapanan Market)');
  {await page.evaluate(()=>window.claude.use('db').then(db=>db.collection('statusov').doc('c4').set({status:'Pasif'})));await page.waitForTimeout(150);
   ok(await txt(page,'#rkPas')==='Pasif müşteri: 3'&&/^2025: € 50\.500 · 2026: € 100$/.test(await txt(page,'#rkPasC')),'riskte olmayan pasif (Küçük Kiosk) de sayılıyor ve cirosu eklendi: '+await txt(page,'#rkPas')+' · '+await txt(page,'#rkPasC'));
   await page.evaluate(()=>window.claude.use('db').then(db=>db.collection('statusov').doc('c4').delete()));await page.waitForTimeout(150);}
  ok(await txt(page,'#rkPasC')==='2025: € 50.000 · 2026: € 0','altında pasiflerin cirosu: 2025 € 50.000 (10.000+40.000), 2026 € 0 → '+await txt(page,'#rkPasC'));
  ok(await page.$eval('#rkPas',e=>parseFloat(getComputedStyle(e).fontSize)<parseFloat(getComputedStyle(e.previousElementSibling).fontSize)),'pasif satırı daha küçük punto');
  await page.click('[data-quick=risk]');
  const r1=await rows(page);
  ok(JSON.stringify(r1)===JSON.stringify(['Düşüş Market','Sessiz Market']),'en büyük kayıp üstte sıralı, pasif yok: '+r1.join(', '));
  ok(!r1.includes('Kayıp Market'),'otomatik pasif (400 gündür faturasız) müşteri kayıp riskinde değil');
  ok(!r1.includes('Kapanan Market'),'elle "Pasif" yapılan (kapanan) müşteri listede yok');
  ok(!r1.includes('Küçük Kiosk'),'küçük ciro eşiğin altında, listede yok');
  ok(!r1.includes('Sağlıklı Market'),'temposu normal müşteri listede yok');
  const why=await page.$$eval('#list .rk',e=>e.map(x=>x.textContent));
  ok(why[0].includes('Ciro temposu %'+Math.round(20000/(60000*F.YF)*100)),'Düşüş Market nedeni: '+why[0]);
  ok(/70 gündür fatura yok/.test(why[1]),'Sessiz Market nedeni: '+why[1]);
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

  step('3b. Zincir müşteriler');
  {const ctx2=await browser.newContext({viewport:{width:1400,height:1000}});const p=await ctx2.newPage();
   p.on('pageerror',e=>errors.push(e.message));await p.route(offline,r=>r.abort());
   const EXTRA=`(()=>{const S=window.__SEED,Y=window.__FIX.YF,b=S.customers.c3;
     const add=(code,o)=>{S.customers['c'+code]={...b,code,phone:'',contact:'',address:'',rep:'Özgür Firat',...o}};
     add('801',{name:'Sahan Gouda B.V.',chain:'Sahan',city:'Gouda',ciro2025:20000,sales2026:Math.round(20000*Y*0.5),status:'Aktif'});
     add('802',{name:'Sahan Supermarkt Schiedam B.V.',chain:'Sahan',city:'Schiedam',ciro2025:70000,sales2026:Math.round(70000*Y),status:'Aktif'});
     add('803',{name:'Sahan DC B.V.',chain:'Sahan',city:'Capelle aan den IJssel',ciro2025:10000,sales2026:500,status:'Pasif',lastInvoice:window.__FIX.day(-200)});
     add('804',{name:'Yildiz Food B.V.',chain:'Yildiz Food',city:'Rotterdam',ciro2025:50000,sales2026:Math.round(50000*Y),status:'Aktif'});
     S.sync.month.map['801']=[1000,1,-100,0];S.sync.month.map['802']=[5000,2,0,0];
     S.sync.returns.map['801']=[10000,-500,1,0,0,5];S.sync.returns.map['802']=[30000,-300,1,0,0,9]})();`;
   await p.addInitScript(`${FIX};${EXTRA};window.CRM_IS_ADMIN=true;window.CRM_AUTH={email:'baran.sengul@akar-group.com'};${MOCK}`);
   await p.goto(BASE+'/index.html');await p.waitForSelector('#list .row');
   ok(await p.$eval('#fseg',e=>e.nextElementSibling&&e.nextElementSibling.id)==='fchain','zincir kutusu segment kutusunun hemen yanında');
   ok(JSON.stringify(await p.$$eval('#fchain option',o=>o.map(x=>x.textContent)))==='["Zincir Tümü","Yalnız zincirler","Sahan (3)","Yildiz Food (1)"]','zincir seçenekleri mağaza sayısıyla');
   ok(await p.$eval('#fseg option',e=>e.textContent)==='Sgmt. Tümü','segment kutusunda kısa etiket (Sgmt. Tümü) korunuyor');
   await p.selectOption('#fchain','Sahan');
   ok(JSON.stringify((await rows(p)).sort())==='["Sahan DC B.V.","Sahan Gouda B.V.","Sahan Supermarkt Schiedam B.V."]','Sahan seçilince yalnız 3 Sahan mağazası');
   await p.selectOption('#fchain','__any');
   ok((await rows(p)).length===4,'"Yalnız zincirler": 4 zincir mağazası');
   await p.selectOption('#fchain','');
   await sel(p,'Sahan Gouda B.V.');
   ok(await txt(p,'#chainBox h3')==='Sahan Supermarkt – Zincir','zincir adı türetildi: Sahan Supermarkt – Zincir');
   const tiles=await p.$$eval('#chainBox .chtiles div',d=>Object.fromEntries(d.map(x=>[x.querySelector('dt').textContent.replace(/ \(.*/,''),x.querySelector('dd').textContent.replace(/ /g,' ')])));
   ok(tiles['Mağaza']==='3 (2 aktif, 1 pasif)','mağaza sayısı: '+tiles['Mağaza']);
   ok(tiles['Ciro 2025']==='€ 100.000','zincir ciro 2025 toplamı € 100.000');
   ok(tiles['Bu ay net ciro']==='€ 5.900','zincir bu ay net ciro € 5.900 (900 + 5.000)');
   ok(tiles['İade oranı']==='%2,0','zincir iade oranı %2,0 (800 / 40.000)');
   const tr=await p.$$eval('#chainT tbody tr',r=>r.map(x=>[x.cells[0].querySelector('b,.lnk').textContent,x.classList.contains('cur')]));
   ok(JSON.stringify(tr.map(x=>x[0]))==='["Sahan Supermarkt Schiedam B.V.","Sahan Gouda B.V.","Sahan DC B.V."]','tüm mağazalar 2026 YTD\'ye göre sıralı');
   ok(tr.find(x=>x[0]==='Sahan Gouda B.V.')[1]&&tr.filter(x=>x[1]).length===1,'seçili mağaza tabloda vurgulu');
   ok(await p.$eval('#chainBox .chtab',e=>e.scrollWidth<=e.clientWidth+1),'masaüstünde mağaza tablosu kutuya sığıyor (kaydırma yok)');
   await (await p.$('#chainBox')).screenshot({path:path.join(SHOTS,'3b-zincir.png')});
   await p.click('#chainT .lnk[data-id="c802"]');
   ok(await txt(p,'#detail h2')==='Sahan Supermarkt Schiedam B.V.'&&!!(await p.$('#chainT tr.cur')),'tablodan başka mağazaya geçiliyor, zincir özeti orada da var');
   await p.click('[data-chainf]');
   ok(await p.inputValue('#fchain')==='Sahan'&&(await rows(p)).length===3,'"Mağazaları listede göster" listeyi zincire süzüyor');
   await p.selectOption('#fchain','');
   await sel(p,'Yildiz Food B.V.');ok(!(await p.$('#chainBox')),'tek mağazalı zincirde özet yok');
   await sel(p,'Sağlıklı Market');ok(!(await p.$('#chainBox')),'zincir olmayan müşteride özet yok');
   await ctx2.close();
   // telefon
   const ctx3=await browser.newContext({viewport:{width:390,height:844}});const m=await ctx3.newPage();await m.route(offline,r=>r.abort());
   await m.addInitScript(`${FIX};${EXTRA};window.CRM_IS_ADMIN=true;${MOCK}`);await m.goto(BASE+'/index.html');await m.waitForSelector('#list .row');
   await m.click('#list .row:has-text("Sahan Gouda B.V.")');await m.waitForSelector('#chainBox');
   ok(await m.evaluate(()=>document.documentElement.scrollWidth)<=390&&await m.$eval('#chainBox',e=>e.getBoundingClientRect().right<=390),'telefonda zincir özeti ekrana sığıyor (tablo kendi içinde kayar)');
   await m.screenshot({path:path.join(SHOTS,'3b-zincir-mobil.png'),fullPage:true});
   await ctx3.close();}

  step('3c. Aktif / pasif elle düzenleme');
  {await page.fill('#q','');await page.dispatchEvent('#q','input');
   await sel(page,'Sağlıklı Market');
   ok(!!(await page.$('#stSel')),'yönetici kartta durum seçimini görüyor');
   ok(await page.$eval('#stSel option',o=>o.textContent)==='Aktif · otomatik','varsayılan: otomatik (Aktif)');
   await page.selectOption('#stSel','Pasif');await page.waitForTimeout(150);
   const ov=await doc(page,'statusov/c3');
   ok(ov&&ov.status==='Pasif'&&ov.by==='baran.sengul@akar-group.com','elle durum ayrı kayda yazıldı (statusov/c3)');
   ok(await page.$eval('#detail h2',e=>e.classList.contains('pas'))&&await page.$eval('#list .row[data-id="c3"] b',e=>e.classList.contains('pas')),'kartta ve listede pasif (kırmızı) görünüyor');
   ok(/Pasif olarak işaretlendi/.test(await txt(page,'#toast')),'bildirim: '+await txt(page,'#toast'));
   await page.selectOption('#fstat','Pasif');
   ok((await rows(page)).includes('Sağlıklı Market'),'Durum: Pasif filtresinde çıkıyor');
   await page.selectOption('#fstat','');
   // sabah eşitlemesi müşteri kaydını yeniden yazsa bile elle durum korunur
   await page.evaluate(()=>window.claude.use('db').then(db=>db.collection('customers').doc('c3').get().then(d=>db.collection('customers').doc('c3').set({...d.data(),status:'Aktif',statusManual:''}))));
   await page.waitForTimeout(150);
   ok(await page.inputValue('#stSel')==='Pasif'&&await page.$eval('#detail h2',e=>e.classList.contains('pas')),'müşteri kaydı yeniden yazılınca (Power BI / Excel) elle durum korunuyor');
   await page.selectOption('#stSel','');await page.waitForTimeout(150);
   ok(!(await doc(page,'statusov/c3'))&&!(await page.$eval('#detail h2',e=>e.classList.contains('pas'))),'"otomatik" seçilince elle kayıt silindi, durum yeniden Aktif');
   // Excel'de elle Pasif yapılmış müşteri
   await page.selectOption('#fstat','Pasif');await sel(page,'Kapanan Market');
   ok(await page.$eval('#stSel option',o=>o.textContent)==='Pasif · Excel','Excel\'de "Durum (elle)" dolu müşteri: Pasif · Excel');
   await page.selectOption('#fstat','');
   // kayıp riski: elle pasif yapılan müşteri riskten çıkar
   const before=await txt(page,'[data-quick=risk] b');
   await sel(page,'Düşüş Market');await page.selectOption('#stSel','Pasif');await page.waitForTimeout(150);
   ok(+(await txt(page,'[data-quick=risk] b'))===+before-1,'elle pasif yapılan müşteri kayıp riski listesinden çıkıyor ('+before+' → '+await txt(page,'[data-quick=risk] b')+')');
   await page.screenshot({path:path.join(SHOTS,'3c-durum.png'),clip:{x:560,y:300,width:840,height:260}});
   await page.selectOption('#stSel','');await page.waitForTimeout(150);
   ok(await txt(page,'[data-quick=risk] b')===before,'otomatiğe dönünce tekrar riskte');}

  step('3d. Açık faturalar');
  {await page.fill('#q','');await page.dispatchEvent('#q','input');
   const od=await page.$('[data-quick=od]');ok(!!od,'"Vadesi geçen" kutusu var');
   ok(+(await txt(page,'[data-quick=od] b'))===1&&/€ 1\.201/.test(await txt(page,'[data-quick=od] span')),'kutu: 1 müşteri · '+await txt(page,'[data-quick=od] span'));
   ok(/vade 40 gün/.test(await txt(page,'#list .row[data-id="c1"] .lc')),'listede etiket: vade 40 gün');
   await page.click('[data-quick=od]');ok(JSON.stringify(await rows(page))===JSON.stringify(['Düşüş Market']),'filtre yalnız vadesi geçeni gösteriyor');
   ok(/1\.201 vadesi geçmiş · en eski 40 gün/.test(await txt(page,'#list .row small')),'filtrede alt satır tutar ve gün');
   await page.click('[data-quick=od]');
   await sel(page,'Düşüş Market');
   ok(/Vadesi geçmiş açık fatura: € 1\.201 · 1 fatura, en eski 40 gün/.test(await txt(page,'#odAlert')),'kart üstünde uyarı');
   const items=await page.$$eval('#oi .oi-l li',ls=>ls.map(l=>[l.className,l.querySelector('.oi-a b').textContent,l.querySelector('.oi-s').textContent,l.querySelector('.oi-r').textContent.replace(/ /g,' ')]));
   ok(JSON.stringify(items.map(i=>i[1]))==='["RE26-1","RE26-2","CR26-1"]','sıra: vadesi geçen, gelmeyen, alacak');
   ok(items[0][0]==='od'&&items[0][2]==='40 gün geçti'&&items[0][3]==='€ 1.200,50','vadesi geçen: 40 gün geçti, kalan € 1.200,50');
   ok(items[1][0]==='nd'&&items[1][2]==='5 gün kaldı','vadesi gelmeyen: 5 gün kaldı');
   ok(items[2][0]==='cr'&&/Alacak/.test(items[2][2])&&items[2][3]==='−€ 80,25','iade: alacak, −€ 80,25');
   ok(/tutar € 1\.500,00/.test(await txt(page,'#oi .oi-l li.od .oi-b')),'kısmi ödenen faturada asıl tutar görünüyor');
   const sum=await page.$$eval('#oi .oi-sum div',ds=>ds.map(d=>d.textContent.replace(/ /g,' ')));
   ok(/Vadesi geçen€ 1\.2011 fatura · en eski 40 gün/.test(sum[0])&&/Toplam açık \(net\)€ 2\.020/.test(sum[2])&&/Kredi limiti€ 2\.000€ 20 aşıldı/.test(sum[3]),'özet: '+sum.join(' | '));
   ok(await page.$eval('#oi .oi-sum .bad b',e=>getComputedStyle(e).color)==='rgb(198, 40, 40)','vadesi geçen tutar kırmızı');
   await page.screenshot({path:path.join(SHOTS,'3d-acik-fatura.png'),clip:{x:560,y:200,width:840,height:700}});
   await sel(page,'Sağlıklı Market');
   ok(!(await page.$('#odAlert'))&&await txt(page,'#oi li .oi-s')==='Bugün vadeli','bugün vadeli: uyarı yok, "Bugün vadeli"');
   await sel(page,'Sessiz Market');
   ok(/açık fatura yok/.test(await txt(page,'#oi')),'açık faturası olmayan müşteride "açık fatura yok"');}

  step('3e. Sıralama kutusu yok, Vadesi Geçen sekmesi, ARAG');
  {ok(!(await page.$('#fsort')),'"Ada göre" sıralama kutusu kaldırıldı');
   const names=await rows(page);ok(JSON.stringify(names)===JSON.stringify([...names].sort((a,b)=>a.localeCompare(b,'tr'))),'liste ada göre sıralı kalıyor');
   ok(await txt(page,'#tabV')==='Vadesi Geçen (1)','sekme: Vadesi Geçen (1)');
   const tabs=await page.$$eval('.tabs .tab:not([hidden])',b=>b.map(x=>x.textContent.replace(/ \(.*/,'')));
   ok(JSON.stringify(tabs)==='["Müşteriler","Hedefler","Karne","Vadesi Geçen","Kredi Limiti"]','sekme sırası: '+tabs.join(' · '));
   await page.click('#tabV');
   const r=await page.$$eval('#odT tbody tr',tr=>tr.map(t=>[...t.cells].map(c=>c.textContent.replace(/ /g,' '))));
   ok(r.length===1&&r[0][1]==='Düşüş Market'&&r[0][3]==='€ 1.201'&&r[0][5]==='40 gün','tabloda yalnız vadesi geçen: '+JSON.stringify(r));
   await page.click('[data-ovf=arag]');ok(/Bu süzgeçte müşteri yok/.test(await txt(page,'#overdue')),'ARAG süzgeci başta boş');
   await page.click('[data-ovf=all]');
   await page.screenshot({path:path.join(SHOTS,'3e-vadesi-gecen.png'),clip:{x:0,y:440,width:1400,height:300}});
   await page.click('#odT .lnk');await page.waitForSelector('#detail h2');
   ok(await txt(page,'#detail h2')==='Düşüş Market'&&!(await page.isHidden('#listView')),'satıra tıklayınca müşteri kartı açılıyor');
   ok(/40 gün/.test(await txt(page,'#aragBox'))&&!!(await page.$('#aragOn')),'40 gün gecikmede ARAG süreci butonu var');
   await page.click('#aragOn');await page.waitForTimeout(150);
   const T0=await page.evaluate(()=>window.__FIX.TODAY);
   const ad=await doc(page,'arag/c1');ok(ad&&ad.active===true&&ad.at===T0&&ad.odMax===40,'ARAG kaydı yazıldı (arag/c1)');
   ok(/ARAG süreci aktif/.test(await txt(page,'#aragBox'))&&await page.$eval('#aragBox',e=>e.classList.contains('on')),'kartta: ARAG süreci aktif');
   ok(await txt(page,'#list .row[data-id="c1"] .rtag.ar')==='ARAG','listede ARAG etiketi');
   await page.screenshot({path:path.join(SHOTS,'3e-arag-kart.png'),clip:{x:560,y:180,width:840,height:330}});
   await page.click('#tabV');await page.click('[data-ovf=arag]');
   ok((await page.$$('#odT tbody tr')).length===1&&/ARAG/.test(await txt(page,'#odT tbody tr td:last-child')),'ARAG süzgecinde görünüyor');
   await page.click('[data-ovf=all]');await goList(page);
   await sel(page,'Sağlıklı Market');ok(!(await page.$('#aragBox')),'30 günü aşmayan müşteride ARAG butonu yok');
   await sel(page,'Düşüş Market');page.once('dialog',d=>d.accept());await page.click('#aragOff');await page.waitForTimeout(150);
   ok(!(await doc(page,'arag/c1'))&&!!(await page.$('#aragOn')),'süreç kapatılınca kayıt silindi, buton geri geldi');}

  step('3f. Liste ve kart bağımsız kayıyor');
  {const {ctx:c2,page:p2}=await open(browser,{viewport:{width:1400,height:650}});
   await sel(p2,'Düşüş Market');
   {const r=await p2.evaluate(()=>{scrollTo(0,0);return new Promise(res=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const b=document.querySelector('#detail').getBoundingClientRect();res([b.top,b.bottom])})))});
    ok(r[1]<=650+1&&r[0]>100,'sayfa en üstteyken de kartın altı ekranda (kart '+Math.round(r[0])+'–'+Math.round(r[1])+' px)')}
   const m=()=>p2.evaluate(()=>{const d=document.querySelector('#detail'),r=d.getBoundingClientRect();return {win:scrollY,det:d.scrollTop,sh:d.scrollHeight,ch:d.clientHeight,top:r.top,bottom:r.bottom}});
   // listeyi ekranın üstüne getir: kart yapışık hâle gelsin
   await p2.evaluate(()=>scrollTo(0,document.querySelector('#list').getBoundingClientRect().top+scrollY-20));await p2.waitForTimeout(100);
   let a=await m();ok(a.sh>a.ch+50,'kart ekrandan uzun ve kendi içinde kayabilir ('+a.sh+' > '+a.ch+')');
   ok(a.bottom<=650+1,'kartın altı ekranın dışına taşmıyor');
   const box=await p2.$eval('#detail',d=>{const r=d.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+Math.min(r.height,500)/2}});
   await p2.mouse.move(box.x,box.y);await p2.mouse.wheel(0,400);await p2.waitForTimeout(250);
   let b=await m();ok(b.det>a.det&&b.win===a.win,'kart üzerinde kaydırınca yalnız kart kayıyor (kart '+a.det+'→'+b.det+', sayfa '+a.win+'→'+b.win+')');
   await p2.mouse.wheel(0,5000);await p2.waitForTimeout(250);await p2.mouse.wheel(0,600);await p2.waitForTimeout(250);
   let c=await m();ok(c.win===a.win,'kartın sonuna gelince sayfa/liste sürüklenmiyor');
   const lb=await p2.$eval('#list',l=>{const r=l.getBoundingClientRect();return {x:r.x+r.width/2,y:300}});
   await p2.mouse.move(lb.x,lb.y);await p2.mouse.wheel(0,-150);await p2.waitForTimeout(250);
   let d=await m();ok(d.win<c.win&&d.det===c.det,'liste üzerinde kaydırınca sayfa kayıyor, kartın kendi kaydırması değişmiyor (sayfa '+c.win+'→'+d.win+', kart '+c.det+'→'+d.det+')');
   await p2.click('#list .row:has-text("Sağlıklı Market")');await p2.waitForTimeout(100);
   ok((await m()).det===0,'başka müşteri seçilince kart en üstten açılıyor');
   await c2.close();}

  step('5. İade uyarısı');
  const tags=await page.$$eval('#list .row',rs=>rs.map(r=>[r.querySelector('b').textContent,(r.querySelector('.rtag[title^="İade"]')||{}).textContent||'']));
  ok(tags.find(t=>t[0]==='İadeci Market')[1]==='iade %12,0','İadeci Market listede "iade %12,0" etiketi taşıyor');
  ok(tags.find(t=>t[0]==='Düşüş Market')[1]==='',"Düşüş Market (%2,0) etiketsiz: eşik %2,5");
  ok(tags.find(t=>t[0]==='Yeni Market')[1]==='iade %3,0','Yeni Market (%3,0) etiketli');
  ok(tags.filter(t=>t[1]).length===2,'%2,5 altındaki müşterilerde etiket yok');
  ok(await page.$eval('#list .rtag.rt',e=>getComputedStyle(e).color)==='rgb(198, 40, 40)','iade etiketi kırmızı');
  await sel(page,'İadeci Market');
  ok(/satışın %12,0'ı iade/.test(await txt(page,'#retAlert')),'kartta iade uyarısı: '+await txt(page,'#retAlert'));
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
  ok(br['Gökhan Genç'][5].startsWith('0 ·'),'Gökhan: 0 riskli (iki müşterisi de pasif)');
  ok(!(await page.$$eval('#boardT th',t=>t.map(x=>x.textContent))).some(t=>t.startsWith('Kayıt')),'karnede ziyaret kaydı sütunu yok');
  ok(br['Mehmet Halici'][2]==='€ 50.500','Mehmet ciro 2025 toplamı € 50.500 → '+JSON.stringify(br['Mehmet Halici'][2]));
  {const h=await page.$$eval('#boardT th',t=>t.map(x=>x.textContent));
   ok(JSON.stringify(h)==='["Temsilci","Müşteri","Ciro 2025","2026 YTD","Tempo","Kayıp Riski"]','karne sütunları: '+h.join(', '));
   ok(Object.values(br).every(r=>r.length===6),'satırlarda da 6 hücre var')}
  const rt=await page.$$eval('#retT tbody tr:not(.sep)',rs=>rs.map(r=>r.cells[1].textContent));
  ok(JSON.stringify(rt)==='["İadeci Market","Yeni Market"]','iade tablosu orana göre: İadeci, Yeni');
  await page.screenshot({path:path.join(SHOTS,'6-karne.png'),fullPage:true});
  await page.click('[data-brisk="Lütfi Kaplan"]');
  ok(await page.isVisible('#listView')&&JSON.stringify(await rows(page))==='["Düşüş Market","Sessiz Market"]','risk sayısına tıklayınca o temsilcinin risk listesi açılıyor');
  await page.click('.chip[data-rep=""]');await page.click('[data-quick=risk]');

  step('6b. İade tablosu: ilk 25, aktif / pasif');
  {const ctx2=await browser.newContext({viewport:{width:1400,height:1000}});const p=await ctx2.newPage();
   p.on('pageerror',e=>errors.push(e.message));await p.route(offline,r=>r.abort());
   // 32 ek müşteri: iade oranı %9,9'dan %6,8'e iner; 6, 12, 18, 24, 30. sıradakiler pasif
   const EXTRA=`(()=>{const S=window.__SEED;for(let i=1;i<=32;i++){const code=String(900+i);S.customers['c'+code]={...S.customers.c3,code,name:'İade '+String(i).padStart(2,'0'),status:i%6===0?'Pasif':'Aktif',...(i%6===0?{lastInvoice:window.__FIX.day(-200)}:{}),rep:'Mehmet Halici'};S.sync.returns.map[code]=[10000,-(1000-i*10),1,0,0,5]}})();`;
   await p.addInitScript(`${FIX};${EXTRA};window.CRM_IS_ADMIN=true;window.CRM_AUTH={email:'baran.sengul@akar-group.com'};${MOCK}`);
   await p.goto(BASE+'/index.html');await p.waitForSelector('#list .row');await p.click('#tabB');
   const names=()=>p.$$eval('#retT tbody tr:not(.sep)',rs=>rs.map(r=>r.cells[1].textContent));
   ok(await p.getAttribute('[data-rf=both]','aria-pressed')==='true','varsayılan filtre: Aktif + Pasif');
   let n=await names();
   const act=n.slice(0,25),pas=n.slice(25);
   ok(act.length===25&&act[0]==='İadeci Market'&&act[24]==='İade 28','üstte en yüksek iade oranlı 25 aktif müşteri (1. İadeci Market, 25. İade 28)');
   ok(!act.some(x=>['İade 06','İade 12','İade 18','İade 24'].includes(x)),'ilk 25 listesinde pasif yok');
   ok(JSON.stringify(pas)==='["İade 06","İade 12","İade 18","İade 24"]','çizginin altında genel ilk 25\'teki 4 pasif: '+pas.join(', '));
   ok(/Pasif · genel ilk 25'te yer alan 4 müşteri/.test(await txt(p,'#retT tr.sep')),'ayırıcı satır: '+await txt(p,'#retT tr.sep'));
   ok(await p.$eval('#retT tr.sep td',e=>getComputedStyle(e).borderTopWidth)==='1px','ince çizgi (1 px)');
   ok(await p.$$eval('#retT tr.pasr',r=>r.length)===4&&await p.$eval('#retT tr.pasr .rk',e=>e.textContent)==='1','pasifler soluk ve kendi sırasıyla');
   ok(/29 aktif, 5 pasif müşteri bu eşiğin üzerinde/.test(await txt(p,'.rethead small')),'eşik üzerindeki sayılar: '+await txt(p,'.rethead small'));
   await (await p.$('#retT')).screenshot({path:path.join(SHOTS,'6b-iade25.png')});
   await p.click('[data-rf=aktif]');n=await names();
   ok(n.length===25&&!(await p.$('#retT tr.sep'))&&!(await p.$('#retT tr.pasr')),'Aktif filtresi: yalnız 25 aktif, çizgi yok');
   await p.click('[data-rf=pasif]');n=await names();
   ok(JSON.stringify(n)==='["İade 06","İade 12","İade 18","İade 24","İade 30"]'&&!(await p.$('#retT tr.sep')),'Pasif filtresi: 5 pasif müşterinin hepsi, en yüksek oran üstte');
   ok(await p.evaluate(()=>JSON.parse(localStorage.getItem('crm-ui')).rf)==='pasif','filtre seçimi hatırlanıyor');
   await p.click('#retT tbody tr:first-child .lnk');
   ok(await p.isVisible('#listView')&&(await txt(p,'#detail h2'))==='İade 06','müşteri adına tıklayınca kartı açılıyor');
   await ctx2.close();}

  step('7. Çeyrek hedef takibi');
  await page.click('#tabB');
  ok(!(await page.$$eval('#board h3',h=>h.map(x=>x.textContent))).some(t=>/Hedef/.test(t)),'hedefler Karne sekmesinde değil');
  await page.click('#tabH');
  ok(await page.isVisible('#targetsView')&&await page.isHidden('#boardView')&&await page.isHidden('#listView'),'Hedefler sekmesi ayrı açılıyor');
  const QK=F.QK,QY=QK.slice(0,4),QQ='Q'+(Math.floor((+QK.slice(5,7)-1)/3)+1);
  const MN=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'],MNAME=MN[+QK.slice(5,7)-1];
  // dönemin geçen kısmı (uygulamadaki formülün aynısı)
  const qStart=QK+'-01',qEnd=new Date(Date.UTC(+QY,+QK.slice(5,7),0)).toISOString().slice(0,10);
  const ASOF=QK+'-20',dd=x=>Date.parse(x)/864e5,PACE=(dd(ASOF)-dd(qStart)+1)/(dd(qEnd)-dd(qStart)+1); // rakamların tarihi: ayın 20'si
  const expCls=p=>p>=1?'q-good':p<PACE?'q-bad':'';
  ok(await page.inputValue('#qMonth')===QK,'açılışta içinde bulunulan ay seçili: '+QK);
  ok((await txt(page,'#targets h3')).includes(MNAME+' '+QY),'başlıkta ay: '+await txt(page,'#targets h3'));
  ok((await page.$$eval('#qMonth option',o=>o.map(x=>x.textContent))).length===12,'ay listesinde 12 ay');
  ok(/dönemin %\d+'(i|si|ü|ı|u) geç(ti|mişti)|henüz başlamadı|tamamlandı/.test(await txt(page,'.qinfo')),'tempo açıklaması: '+await txt(page,'.qinfo'));
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
  ok((await page.$$('[data-qcard="Özgür Firat"] .qbar b')).length===6,'çubuklarda "bugün olması gereken" çizgisi');
  {const t=await txt(page,'.qinfo');ok(t.includes('Rakamlar 20.'+QK.slice(5,7)+'.'+QY+' itibarıyla'),'tempo rakamların tarihine göre: '+t)}
  {const c=await page.$$eval('[data-qcard="Özgür Firat"] .qcats li > b',b=>b.map(x=>x.className==='q-bad'?'kırmızı':'normal'));
   ok(JSON.stringify(c)==='["normal","normal","normal","kırmızı","kırmızı"]','Özgür kategori renkleri Excel ile aynı (%68, %124, %74 normal; %6, %53 kırmızı) → '+c.join(','))}
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
  // çeyrek = ayların toplamı
  await page.click(`[data-qp="${QY}-${QQ}"]`);
  ok((await txt(page,'#targets h3')).includes(QQ+' '+QY)&&(await txt(page,'#targets h3')).includes('ayların toplamı'),'çeyrek görünümü: '+await txt(page,'#targets h3'));
  ok(new RegExp('Verisi girilen aylar: '+MNAME).test(await txt(page,'.qinfo')),'çeyrekte hangi ayların girildiği yazıyor');
  {const r=await qrow('Özgür Firat',6);ok(r[3]==='€ 284.566','çeyrek toplamı = girilen ayların toplamı')}
  ok(!(await page.$('#qEdit')),'çeyrek görünümünde Düzenle yok (rakamlar aylık girilir)');
  await page.click(`[data-qp="${QY}-Y"]`);
  ok((await txt(page,'#targets h3')).includes('Yılı')&&!(await page.$('#qEdit')),'yıl görünümü: Q1–Q4 toplamı, düzenleme yok');
  {const r=await qrow('Özgür Firat',6);ok(r[3]==='€ 284.566','yıl toplamı çeyreklerin toplamı')}
  const other=QQ==='Q1'?'Q2':'Q1';
  await page.click(`[data-qp="${QY}-${other}"]`);
  ok(/hedef girilmemiş/.test(await txt(page,'.qempty')),'verisi olmayan çeyrekte açıklama');

  // Düzenleme (yalnızca yönetici)
  await page.selectOption('#qMonth',QK);
  await page.click('#qEdit');
  ok((await page.$$('#qform input[name*="|"]')).length===5*(15+8),'düzenleme: 5 temsilci × (15 satış + 8 finans) kutu');
  ok(await page.inputValue('#qform [name="Özgür Firat|c|atis|p"]')==='154.917','mevcut değerler kutularda');
  ok(await page.inputValue('#qform [name=asOf]')===QK+'-20','düzenlemede rakamların tarihi kayıtlı tarihle geliyor');
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
  ok(qd&&JSON.stringify(qd.reps['Gökhan Genç'].c.atis)==='{"p":113240,"t":135000,"a":111920}'&&qd.reps['Gökhan Genç'].f.tahsilat.t===172949&&qd.asOf===QK+'-20','Gökhan ve rakamların tarihi kaydedildi');
  ok(qd.reps['Baran Sengül'].c.atis.a===-625&&qd.reps['Özgür Firat'].c.icecek.a===117932&&!qd.reps['Mehmet Halici'],'eksi değer kaydı; Özgür korundu; boş temsilci kaydedilmedi');
  ok(!(await page.$('#qform'))&&/kaydedildi/.test(await txt(page,'#toast')),'kaydedince düzenleme kapandı');
  await page.click('[data-qv=ozet]');
  ok(await big('Gökhan Genç')==='%81','Özet\'te Gökhan %81');
  await page.click('[data-qv=tablo]');await page.click('[data-qv=ozet]');

  // aylık net ciro kutusu: hedef = Hedefler sekmesindeki o ayın kategori hedefleri toplamı
  await page.click('[data-view=list]');
  await page.click('.chip[data-rep="Lütfi Kaplan"]');
  {const v=await txt(page,'#ordBtn');ok(/hedef € 50\.000 \(%2\)/.test(v),'Lütfi: hedef = Hedefler sekmesindeki kategori hedefleri (40.000+3.500+5.500+500+500 = € 50.000), %2 → '+JSON.stringify(v))}
  ok(!!(await page.$('#ordBtn .bar i')),'ilerleme çubuğu var');
  await page.click('.chip[data-rep=""]');
  {const exp=await page.evaluate(()=>{const q=window.__store.get('qtargets/'+window.__FIX.QK).reps;return Object.values(q).reduce((a,r)=>a+Object.values(r.c||{}).reduce((b,x)=>b+(+x.t||0),0),0)});
   const v=await txt(page,'#ordBtn');ok(v.includes('hedef € '+exp.toLocaleString('nl-NL')),'tüm temsilcilerde toplam hedef Hedefler sekmesiyle aynı (€ '+exp.toLocaleString('nl-NL')+') → '+v)}
  ok(!/14\.000/.test(await txt(page,'#ordBtn')),'eski aylık hedef kaydı (targets) artık kullanılmıyor');
  await page.click('#ordBtn');
  const heads=await page.$$eval('#ordp th',t=>t.map(x=>x.textContent));
  ok(heads.includes('Hedef')&&heads.includes('Gerçekleşme'),'net ciro tablosunda Hedef ve Gerçekleşme sütunları');
  ok(['Net ciro','Satış','İade','Fiyat farkı'].every(h=>heads.includes(h)),'net ciro tablosu: Net ciro, Satış, İade, Fiyat farkı');
  {const r=await page.$$eval('#ordp tbody tr',rs=>{const x=rs.find(r=>r.cells[0].textContent.includes('Lütfi'));return [...x.cells].map(c=>c.textContent.replace(/\u00a0/g,' ').trim())});
   ok(r[1]==='€ 1.200'&&r[2]==='€ 1.350'&&r[3]==='€ -100'&&r[4]==='€ -50','Lütfi net ciro € 1.200 = satış 1.350 − iade 100 − fiyat farkı 50 → '+r.slice(1,5).join(' | '))}
  ok(/Bu ay net ciro/.test(await txt(page,'#ordBtn')),'özet kutusu: Bu ay net ciro');
  await page.screenshot({path:path.join(SHOTS,'7-hedef.png')});
  await ctx.close();

  step('9. Yönetici: kurallar ve ayarlar');
  ({ctx,page}=await open(browser));
  {ok(!(await page.$('#tabA')),'Yönetici artık sekme değil');
   await page.click('#avBtn');ok(await page.isVisible('#umRules')&&await txt(page,'#umRules')==='Yönetici ayarları','yönetici menüde "Yönetici ayarları"nı görüyor');
   await page.click('#umRules');ok(await page.isVisible('#rform')&&await page.isHidden('#umDrop'),'menüden ayarlar açılıyor');
   const vals=await page.$$eval('#rform input',i=>i.map(x=>[x.name,x.value]));
   ok(JSON.stringify(vals)==='[["pasif","120"],["temas","30"],["arag","30"],["credDays","15"],["credCut","50"],["iade","2.5"],["riskPace","70"],["dropMin","3000"],["riskSilent","45"],["silentMax","365"],["silentMin","1000"]]','11 kural, varsayılan değerlerle: '+JSON.stringify(vals));
   ok(JSON.stringify(await page.$$eval('#rform .rgrp',h=>h.map(x=>x.textContent)))==='["Durum ve temas","Açık faturalar","Kredi limiti","İade","Kayıp riski"]','kurallar 5 başlık altında gruplu');
   ok(await txt(page,'#r_dropMin ~ em')==='€'&&/Varsayılan: € 3\.000/.test(await txt(page,'#rform .rrow:has(#r_dropMin) .rdef')),'tutar kuralları € ile ve varsayılanı € 3.000');
   ok(/Henüz değiştirilmedi/.test(await txt(page,'#admin')),'henüz değiştirilmedi notu');
   ok(/müşteri otomatik pasif olur/.test(await txt(page,'[data-rimp=pasif]')),'pasif gün etkisi: '+await txt(page,'[data-rimp=pasif]'));
   const before=await txt(page,'[data-rimp=pasif]');
   await page.fill('#r_pasif','60');
   ok(await txt(page,'[data-rimp=pasif]')!==before&&/Kaydedilmemiş/.test(await txt(page,'#rmsg')),'değer yazınca etki anında güncelleniyor: '+await txt(page,'[data-rimp=pasif]'));
   await page.fill('#r_temas','0');
   ok(await page.$eval('#r_temas',e=>e.closest('.rbox').classList.contains('bad'))&&/arası bir değer/.test(await txt(page,'[data-rimp=temas]')),'geçersiz değer işaretleniyor');
   await page.click('#rform button[type=submit]');await page.waitForTimeout(100);
   ok(!(await doc(page,'settings/rules'))&&/Hatalı/.test(await txt(page,'#toast')),'geçersiz değerle kaydedilmiyor');
   await page.fill('#r_temas','5');await page.fill('#r_arag','50');
   await page.fill('#r_iade','3.5');ok(/eşiğin üzerinde/.test(await txt(page,'[data-rimp=iade]'))&&!(await page.$eval('#r_iade',e=>e.closest('.rbox').classList.contains('bad'))),'ondalık değer kabul ediliyor');await page.fill('#r_iade','2.5');
   // başka bir veri değişikliği sayfayı yeniden çizse de yazılanlar kaybolmuyor
   await page.evaluate(()=>window.claude.use('db').then(db=>db.collection('contacts').doc('c9').set({phone:'1'})));await page.waitForTimeout(150);
   ok(await page.inputValue('#r_pasif')==='60'&&await page.inputValue('#r_temas')==='5','yeniden çizimde yazılanlar korunuyor');
   await page.click('#rform button[type=submit]');await page.waitForTimeout(150);
   const d=await doc(page,'settings/rules');
   ok(d&&d.pasif===60&&d.temas===5&&d.arag===50&&d.iade===2.5&&d.by==='baran.sengul@akar-group.com','ayarlar settings/rules kaydına yazıldı');
   ok(/Ayarlar kaydedildi: Pasif gün sınırı, Temas günü, ARAG süreç günü$/.test(await txt(page,'#toast')),'bildirim yalnız değişenleri sayıyor (iade eşiği 2.5 değişmedi): '+await txt(page,'#toast'));
   ok(/Son güncelleme: .* · Baran Sengül/.test(await txt(page,'#admin'))&&(await page.$$eval('.rdef b',b=>b.length))===3,'son güncelleme ve "değiştirildi" işaretleri');
   await goList(page);
   ok(await page.$eval('#list .row[data-id="c2"] b',e=>e.classList.contains('pas')),'pasif sınırı 60: 70 gündür faturasız Sessiz Market artık Pasif');
   ok(/^5\+ gündür temas yok/.test(await txt(page,'[data-quick=cold] span'))&&await txt(page,'#tLeg')==='5','temas günü 5: kutu ve açıklama güncellendi');
   await sel(page,'Düşüş Market');ok(!(await page.$('#aragOn')),'ARAG günü 50: 40 günlük gecikmede buton yok');
   // temsilci de aynı kuralları görür
   const {ctx:c2,page:p2}=await open(browser,{admin:false,user:'lutfi.kaplan@akar-bv.nl'});
   await p2.evaluate(()=>window.claude.use('db').then(db=>db.doc('settings/rules').set({pasif:60,temas:5})));await p2.waitForTimeout(150);
   ok(await p2.$eval('#umRules',e=>e.hidden),'temsilci Yönetici ayarlarını görmüyor');
   ok(/^5\+ gündür/.test(await txt(p2,'[data-quick=cold] span')),'kural temsilci ekranında da geçerli');
   await c2.close();
   await goAdm(page);await page.click('#rdef');
   ok(await page.inputValue('#r_pasif')==='120'&&/Kaydet/.test(await txt(page,'#rmsg')),'Varsayılanlara dön değerleri geri yazıyor (kaydetmeden)');
   await page.click('#rform button[type=submit]');await page.waitForTimeout(150);
   const d2=await doc(page,'settings/rules');ok(d2&&d2.pasif===120&&d2.temas===30&&d2.arag===30,'varsayılanlar kaydedildi');
   // sabit eşikler de ayardan
   const riskN=async()=>+(await page.evaluate(()=>document.querySelector('[data-quick=risk] b').textContent));
   await goList(page);const r0=await riskN();
   ok(!!(await page.$('#list .row[data-id="c6"] .rtag.rt')),'İadeci Market iade uyarısı var (satış € 20.000 ≥ € 1.000)');
   await goAdm(page);
   await page.fill('#r_dropMin','100000');await page.fill('#r_silentMax','60');
   await page.fill('#r_riskSilent','60');
   ok(await page.$eval('#r_silentMax',e=>e.closest('.rbox').classList.contains('bad'))&&/büyük olmalı/.test(await txt(page,'[data-rimp=silentMax]')),'en fazla faturasız gün, faturasız gün sınırından büyük olmalı');
   await page.fill('#r_riskSilent','45');
   await page.click('#rform button[type=submit]');await page.waitForTimeout(150);
   const d3=await doc(page,'settings/rules');ok(d3&&!('retMin' in d3)&&d3.dropMin===100000&&d3.silentMax===60,'yeni eşikler kaydedildi');
   await goList(page);
   const r1=await riskN();ok(r1===r0-2,`en az ciro € 100.000 ve en fazla 60 gün: Düşüş (€ 60.000) ve Sessiz (70 gün) riskten çıktı (${r0} → ${r1})`);
   await goAdm(page);await page.click('#rdef');await page.click('#rform button[type=submit]');await page.waitForTimeout(150);
   await goList(page);ok(await riskN()===r0,'varsayılanlara dönünce eski hâline geldi');
   await goAdm(page);
   // kalıcılık: kaydedilen ayar sayfa yenilenince formda kayıtlı hâliyle görünür
   await goAdm(page);await page.fill('#r_arag','21');await page.fill('#r_riskPace','20');await page.click('#rform button[type=submit]');await page.waitForTimeout(150);
   // sayfayı Yönetici sekmesi açıkken ve ayarlar veritabanında kayıtlıyken yeniden aç (ayarlar ilk çizimden sonra gelir)
   {const c3=await browser.newContext({viewport:{width:1400,height:1000}});const p3=await c3.newPage();p3.on('pageerror',e=>errors.push(e.message));await p3.route(offline,r=>r.abort());
    await p3.addInitScript(`try{localStorage.setItem('crm-ui',JSON.stringify({view:'admin'}))}catch(e){};${FIX};window.__SEED.settings={rules:{arag:21,riskPace:20,updatedAt:1,by:'baran.sengul@akar-group.com'}};window.CRM_IS_ADMIN=true;window.CRM_USER="baran.sengul@akar-group.com";window.CRM_AUTH={email:"baran.sengul@akar-group.com"};${MOCK}`);
    await p3.goto(BASE+'/index.html');await p3.waitForSelector('#rform');await p3.waitForTimeout(300);
    ok(await p3.inputValue('#r_arag')==='21'&&await p3.inputValue('#r_riskPace')==='20','sayfa açılınca kayıtlı ayarlar formda görünüyor (ARAG 21, tempo %20) — eskiden varsayılanlar görünüyordu');
    ok(/değiştirildi/.test(await txt(p3,'#rform .rrow:has(#r_arag) .rdef')),'kayıtlı değerde "değiştirildi" işareti');
    await c3.close();}
   await page.fill('#r_temas','12');page.once('dialog',d=>d.dismiss());await goList(page);
   ok(await page.isVisible('#rform')&&await page.inputValue('#r_temas')==='12','kaydedilmemiş değişiklik varken sekmeden çıkarken soruyor (vazgeçince kalıyor)');
   await page.click('#rdef');await page.click('#rform button[type=submit]');await page.waitForTimeout(150);
   await page.screenshot({path:path.join(SHOTS,'9-yonetici.png'),fullPage:true});}
  await ctx.close();

  step('10. Veri doğruluğu: ekrandaki rakamlar bağımsız hesapla aynı mı');
  ({ctx,page}=await open(browser));
  {// bağımsız hesap: ham kayıtlardan (sitenin kodunu kullanmadan)
   const raw=await page.evaluate(()=>{const S=window.__store,cs=[],so={};for(const [k,v] of S.entries()){if(k.startsWith('customers/'))cs.push({id:k.slice(10),...v});if(k.startsWith('statusov/'))so[k.slice(9)]=v.status}
     return {cs,so,ret:S.get('sync/returns'),mon:S.get('sync/month'),today:window.__FIX.TODAY}});
   const days=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/864e5);
   const stOf=c=>raw.so[c.id]||c.statusManual||(c.lastInvoice?(days(c.lastInvoice,raw.today)>120?'Pasif':'Aktif'):(c.status||'Pasif'));
   const dt=raw.ret.through||raw.mon.through||raw.today,y=+dt.slice(0,4);
   const yf=(Date.UTC(y,+dt.slice(5,7)-1,+dt.slice(8,10))-Date.UTC(y,0,1))/864e5+1;const YFx=yf/((Date.UTC(y+1,0,1)-Date.UTC(y,0,1))/864e5);
   // 1) temsilci bazında müşteri / aktif / pasif
   await page.click('#tabB');
   const br=await page.$$eval('#boardT tbody tr',rs=>rs.map(r=>[...r.cells].map(c=>c.textContent.replace(/ /g,' ').trim())));
   let okN=true,msg=[];for(const r of br){const rep=r[0],cs=raw.cs.filter(c=>c.rep===rep),ak=cs.filter(c=>stOf(c)!=='Pasif').length;
     const exp=`${cs.length} (${ak} aktif)`;if(r[1]!==exp){okN=false;msg.push(rep+': '+r[1]+' ≠ '+exp)}}
   ok(okN&&br.length>=4,'Karne: her temsilcinin müşteri ve aktif sayısı ham veriyle aynı '+(msg.join('; ')||'('+br.map(r=>r[0]+' '+r[1]).join(', ')+')'));
   const sumN=br.reduce((a,r)=>a+parseInt(r[1]),0);ok(sumN===raw.cs.length,'temsilcilerin müşteri toplamı = tüm müşteriler ('+sumN+')');
   // 2) tempo (büyüme): Karne, kart ve zincir aynı tanım
   const tempo=(s26,c25)=>s26/(c25*YFx)-1,pctS=g=>{const t=(g*100).toFixed(1);return t==='0.0'||t==='-0.0'?'0,0%':(g>0?'+':'')+t.replace('.',',')+'%'};
   for(const r of br){const cs=raw.cs.filter(c=>c.rep===r[0]&&typeof c.ciro2025==='number'&&typeof c.sales2026==='number');const c25=cs.reduce((a,c)=>a+c.ciro2025,0),s26=cs.reduce((a,c)=>a+c.sales2026,0);
     if(c25>0)ok(r[4]===pctS(tempo(s26,c25)),`Karne tempo ${r[0]}: ${r[4]} = ${pctS(tempo(s26,c25))}`)}
   ok(new RegExp(`${dt.split('-').reverse().join('\\.')} itibarıyla yılın %${Math.round(YFx*100)}`).test(await txt(page,'#board .oh b')),'tempo, satış verisinin tarihine göre: '+await txt(page,'#board .oh b'));
   await goList(page);await sel(page,'Düşüş Market');
   const c1=raw.cs.find(c=>c.id==='c1');
   ok(await txt(page,'#cmpG')===pctS(tempo(c1.sales2026,c1.ciro2025)),'kartta büyüme = tempo (aynı döneme göre): '+await txt(page,'#cmpG'));
   ok(/aynı döneme göre/.test(await txt(page,'#detail .cmp'))&&/Ciro \d{4} \(yıl\) → \d{4} YTD/.test(await txt(page,'#detail .cmp dt')),'kart etiketi: '+await txt(page,'#detail .cmp dt'));
   // 3) iade oranı: liste etiketi, kart uyarısı, kart satırı ve Karne listesi aynı taban (aynı dönemdeki satış faturası)
   const r6=raw.ret.map['6'],p6=Math.abs(r6[1])/r6[0],p6s=(p6*100).toFixed(1).replace('.',',');
   ok((await txt(page,'#list .row[data-id="c6"] .rtag.rt'))===`iade %${p6s}`,'liste etiketi: iade %'+p6s);
   await sel(page,'İadeci Market');
   ok((await txt(page,'#retAlert')).includes(`%${p6s}`),'kart uyarısı aynı oran: '+await txt(page,'#retAlert'));
   ok((await txt(page,'#detail .rl.bad .rp'))===`%${p6s}`,'kart İade satırı aynı oran (eskiden net satışa bölünüyordu): '+await txt(page,'#detail .rl.bad .rp'));
   ok(/aynı dönemdeki satış faturalarına \(€ 20\.000\)/.test(await txt(page,'#detail .rn')),'kart notu tabanı söylüyor: '+await txt(page,'#detail .rn'));
   await page.click('#tabB');
   const rt=await page.$$eval('#retT tbody tr',rs=>rs.map(r=>[...r.cells].map(c=>c.textContent.trim())));
   const r6row=rt.find(r=>r[1]==='İadeci Market');ok(r6row&&r6row[5]===`%${p6s}`,'Karne iade listesi aynı oran');
   // 4) sabit yazılmış metinler / veriler
   await goList(page);
   ok(await page.$eval('#list .dot',e=>e.getAttribute('title'))==='30+ gündür temas yok','listedeki nokta ipucu çalışıyor (eskiden "${R.temas}" yazıyordu)');
   ok((await txt(page,'#sub')).startsWith('Satış verisi '+raw.mon.through.split('-').reverse().join('.')),'başlık altında verinin tarihi: '+await txt(page,'#sub'));
   // verinin tarihi değişince tempo da değişir (bugüne değil veriye bağlı)
   await page.evaluate(()=>window.claude.use('db').then(db=>db.doc('sync/returns').get().then(d=>db.doc('sync/returns').set({...d.data(),through:'2026-06-30'}))));await page.waitForTimeout(150);
   await page.click('#tabB');ok(/30\.06\.2026 itibarıyla yılın %50/.test(await txt(page,'#board .oh b')),'veri tarihi 30.06 → yılın %50: '+await txt(page,'#board .oh b'));
   await page.evaluate(()=>window.claude.use('db').then(db=>db.doc('sync/returns').get().then(d=>{const x=d.data();delete x.through;return db.doc('sync/returns').set(x)})));await page.waitForTimeout(150);
   // 5) hedef tablosu başlıkları seçilen yıla göre
   await page.evaluate(()=>window.claude.use('db').then(db=>db.doc('qtargets/2027-01').set({period:'2027-01',asOf:'2027-01-20',reps:{'Lütfi Kaplan':{c:{atis:{p:1,t:2,a:1}}}}})));await page.waitForTimeout(150);
   await page.click('#tabH');await page.selectOption('#qYear','2027');await page.selectOption('#qMonth','2027-01');await page.click('[data-qv=tablo]');
   const hd=await page.$$eval('[data-qblock="Lütfi Kaplan"] .ordp:first-child thead th',t=>t.map(x=>x.textContent));
   ok(JSON.stringify(hd.slice(1))==='["2026 Sell-Out","2027 Hedef","2027 Sell-Out","Gerçekleşme","27 vs 26"]','2027 seçilince başlıklar: '+hd.join(' | '));
   await page.selectOption('#qYear','2026');
   // 6) temsilci listesi veriden: müşterisi olan yeni temsilci otomatik eklenir
   await page.evaluate(()=>window.claude.use('db').then(db=>db.collection('customers').doc('c777').set({code:'777',name:'Yeni Temsilci Market',rep:'Ayşe Yılmaz',status:'Aktif',lastInvoice:window.__FIX.day(-3)})));await page.waitForTimeout(150);
   ok(!!(await page.$('.chip[data-rep="Ayşe Yılmaz"]')),'yeni temsilci (müşterisi var) butonlarda otomatik çıkıyor');}
  await ctx.close();

  // Excel'e aktar: SheetJS kütüphanesi yerel olarak verilirse çalışır (XLSX_LIB=/yol/xlsx.full.min.js node tests/e2e.js)
  if(process.env.XLSX_LIB){
  step('11. Excel\'e aktar');
  {const c2=await browser.newContext();const p2=await c2.newPage();p2.on('pageerror',e=>errors.push(e.message));
   await p2.route(offline,r=>/xlsx/.test(r.request().url())?r.fulfill({body:fs.readFileSync(process.env.XLSX_LIB),contentType:'text/javascript'}):r.abort());
   await p2.addInitScript(`${FIX};window.CRM_IS_ADMIN=true;window.CRM_USER="baran.sengul@akar-group.com";window.CRM_AUTH={email:"baran.sengul@akar-group.com"};${MOCK};(()=>{const u=window.claude.use;window.claude.use=async k=>k==='downloads'?{async save({filename,data}){window.__xf=filename;window.__xb=data}}:u(k)})();`);
   await p2.goto(BASE+'/index.html');await p2.waitForSelector('#list .row');
   await p2.evaluate(()=>window.claude.use('db').then(db=>db.doc('settings/rules').set({pasif:60})));await p2.waitForTimeout(150);
   await p2.click('#avBtn');await p2.click('#xexp');
   const got=await p2.waitForFunction(()=>window.__xb,null,{timeout:20000}).then(()=>true).catch(()=>false);
   ok(got,'Excel dosyası oluşturuldu (toast: '+await txt(p2,'#toast')+')');
   if(got){const r=await p2.evaluate(()=>{const wb=XLSX.read(window.__xb,{type:'array'}),m=XLSX.utils.sheet_to_json(wb.Sheets['Müşteriler']),a=wb.Sheets['Ayarlar'];
       return {f:window.__xf,h:Object.keys(m[0]),n:m.length,pasif:a.B2.v,yf:a.B5.v,ss:(m.find(x=>x['Müşteri']==='Sessiz Market')||{})['Durum'],
         tf:wb.Sheets['Müşteriler'][XLSX.utils.encode_cell({r:1,c:Object.keys(m[0]).indexOf('Tempo % (aynı dönem)')})].f}});
     ok(/^CRM_Musteriler_\d\d\.\d\d\.\d{4}\.xlsx$/.test(r.f)&&r.n===8,'dosya adı ve 8 müşteri: '+r.f);
     ok(r.pasif===60,'Ayarlar: pasif gün sınırı Yönetici ayarından (60)');
     ok(r.ss==='Pasif','Sessiz Market (70 gün) pasif sınırı 60 ile Pasif');
     ok(r.h.includes('Tempo % (aynı dönem)')&&!r.h.includes('Büyüme %')&&r.yf>0&&r.yf<=1&&/Ayarlar!\$B\$5/.test(r.tf),'Tempo % sütunu ve formülü sitedeki tanımla aynı ('+r.tf+')')}
   await c2.close();}}


  step('12. Kredi Limiti sekmesi');
  ({ctx,page}=await open(browser));
  {ok(await txt(page,'#tabK')==='Kredi Limiti (1)','sekme: Kredi Limiti (1)');
   await page.click('#tabK');
   const s=await page.$$eval('#crSum div',d=>d.map(x=>x.textContent.replace(/ /g,' ')));
   ok(/Limiti aşan müşteri1/.test(s[0])&&/Toplam aşım€ 20/.test(s[1])&&/Aşanların vadesi geçen€ 1\.201/.test(s[2]),'özet: '+s.join(' | '));
   const r=await page.$$eval('#crT tbody tr',tr=>tr.map(t=>[...t.cells].map(c=>c.textContent.replace(/ /g,' ').trim())));
   ok(r.length===1&&r[0][1]==='Düşüş Market'&&r[0][3]==='30 gün'&&r[0][4]==='€ 2.000'&&/^€ 2\.020%101 kullanım$/.test(r[0][5])&&r[0][6]==='€ 20','satır: tanımlı € 2.000, açık bakiye € 2.020 (%101), aşım € 20: '+JSON.stringify(r[0]));
   // öneri: aylık satış × (30 + 15) / 30, 40 gün gecikme (> 30) → %50 kesinti, 500'e yukarı
   const YF=await page.evaluate(()=>window.__FIX.YF),m=20000/YF/12,exp=Math.ceil(m*45/30*0.5/500-1e-9)*500;
   ok(r[0][8]===`€ ${exp.toLocaleString('nl-NL')}40 gün gecikme: %50 kesinti`,`önerilen limit bağımsız hesapla aynı: € ${exp} (${r[0][8]})`);
   ok(r[0][9]===(exp>2000?'+':'−')+'€ '+Math.abs(exp-2000).toLocaleString('nl-NL'),'fark = öneri − tanımlı: '+r[0][9]);
   ok(/Aylık ortalama satış €\s[\d.]+ × \(vade 30 \+ 15 gün\) ÷ 30 × 50%/.test(await page.getAttribute('#crT tbody tr td:nth-child(9)','title')),'hesap ipucunda gösteriliyor: '+await page.getAttribute('#crT tbody tr td:nth-child(9)','title'));
   await page.click('[data-crf=nolim]');
   ok(JSON.stringify(await page.$$eval('#crT tbody tr td:nth-child(2)',t=>t.map(x=>x.textContent.trim())))==='["Sağlıklı Market"]','Limit tanımsız: Sağlıklı Market (bakiye € 450)');
   await page.click('[data-crf=all]');ok((await page.$$('#crT tbody tr')).length===2,'Tümü: açık bakiyesi olan 2 müşteri');
   await page.screenshot({path:path.join(SHOTS,'12-kredi.png'),fullPage:true});
   await page.click('[data-crf=over]');
   // ayardan ek gün ve kesinti
   await page.evaluate(()=>window.claude.use('db').then(db=>db.doc('settings/rules').set({credDays:30,credCut:100})));await page.waitForTimeout(150);
   ok(await txt(page,'#crT tbody tr td:nth-child(9) b')==='€ 0','kesinti %100: öneri € 0');
   await page.evaluate(()=>window.claude.use('db').then(db=>db.doc('settings/rules').set({arag:60,credDays:30})));await page.waitForTimeout(150);
   const exp2=Math.ceil(m*60/30/500-1e-9)*500;
   ok(await txt(page,'#crT tbody tr td:nth-child(9)')===`€ ${exp2.toLocaleString('nl-NL')}`,`ARAG günü 60 (gecikme 40): kesinti yok, ek gün 30 → € ${exp2}`);
   await page.evaluate(()=>window.claude.use('db').then(db=>db.collection('arag').doc('c1').set({active:true,at:'2026-11-20'})));await page.waitForTimeout(150);
   ok(/^€ 0ARAG süreci aktif/.test(await txt(page,'#crT tbody tr td:nth-child(9)')),'ARAG aktif: öneri € 0 (peşin)');
   await page.evaluate(()=>window.claude.use('db').then(async db=>{await db.collection('arag').doc('c1').delete();await db.doc('settings/rules').delete()}));await page.waitForTimeout(150);
   await page.click('#crT .lnk');await page.waitForSelector('#detail h2');
   ok(await txt(page,'#detail h2')==='Düşüş Market'&&/Kredi limiti€ 2\.000€ 20 aşıldı · öneri € /.test((await txt(page,'#oi .oi-sum'))||''),'satır karta gidiyor; kartta limit kutusunda öneri');
   await page.click('.chip[data-rep="Mehmet Halici"]');await page.click('#tabK');
   ok(/Bu süzgeçte müşteri yok/.test(await txt(page,'#credit'))&&await txt(page,'#tabK')==='Kredi Limiti (0)','temsilci seçimine uyuyor');
   await page.click('.chip[data-rep=""]');}
  await ctx.close();

  step('13. Kullanıcı izinleri');
  ({ctx,page}=await open(browser));
  {await page.click('#avBtn');
   ok(await page.isVisible('#umRules')&&await page.isVisible('#umPerms')&&await txt(page,'#umRole')==='Yönetici','menüde Yönetici ayarları, Kullanıcı izinleri ve rol: Yönetici');
   await page.click('#umPerms');await page.waitForSelector('#pform');
   ok(await page.isHidden('#umDrop')&&await page.isVisible('#permsView'),'menüden Kullanıcı izinleri sayfası açılıyor');
   ok(JSON.stringify(await page.$$eval('#pT thead th',t=>t.map(x=>x.textContent)))==='["İzin","Yönetici (1)","Satış temsilcisi (2)","Muhasebe (0)"]','3 rol ve kullanıcı sayıları');
   ok(await page.$$eval('#pT td:nth-child(2) input',i=>i.every(x=>x.checked&&x.disabled)),'Yönetici her izne sahip, değiştirilemez');
   const chk=async(r,k)=>page.$eval(`[name="${r}|${k}"]`,e=>e.checked);
   ok(await chk('satis','e_notes')&&await chk('satis','v_targets')&&!(await chk('satis','e_status'))&&!(await chk('satis','v_credit')),'satış varsayılanı: iletişim ve hedefleri görme var; durum ve kredi yok');
   ok(await chk('muhasebe','v_credit')&&await chk('muhasebe','e_arag')&&await chk('muhasebe','x_openinv')&&!(await chk('muhasebe','v_targets')),'muhasebe varsayılanı: kredi, ARAG, açık fatura içe aktarma; hedef yok');
   // kullanıcılar
   const ur=await page.$$eval('#uT tbody tr',t=>t.map(x=>x.querySelector('b').textContent+'|'+x.querySelector('select').value+'|'+x.querySelector('select').disabled));
   ok(JSON.stringify(ur)==='["Baran Sengül|admin|true","Lütfi Kaplan|satis|false","Raci Öner|satis|false"]','kullanıcı listesi rolleriyle (kendi rolünüz kilitli): '+JSON.stringify(ur));
   await page.fill('#uform [name=email]','Muhasebe.Test@akar-bv.nl');await page.selectOption('#uform [name=role]','muhasebe');await page.click('#uform button');await page.waitForTimeout(150);
   ok((await page.evaluate(()=>window.__users)).some(u=>u.email==='muhasebe.test@akar-bv.nl'&&u.role==='muhasebe')&&/Muhasebe Test eklendi \(Muhasebe\)/.test(await txt(page,'#toast')),'yeni kullanıcı eklendi (küçük harf e-posta, Muhasebe)');
   ok(/Muhasebe \(1\)/.test(await txt(page,'#pT thead')),'rol sayısı güncellendi');
   await page.selectOption('[data-urole="Raci.Oener@akar-gmbh.de"]','muhasebe');await page.waitForTimeout(150);
   ok((await page.evaluate(()=>window.__users)).find(u=>u.email==='Raci.Oener@akar-gmbh.de').role==='muhasebe','rol değiştirildi: Raci Öner → Muhasebe');
   ok((await page.evaluate(()=>window.__users)).find(u=>u.email==='muhasebe.test@akar-bv.nl').rep===null,'temsilci olmayan yeni kullanıcıya temsilci atanmadı');
   await page.selectOption('[data-urep="Raci.Oener@akar-gmbh.de"]','Mehmet Halici');await page.waitForTimeout(150);
   {const u=(await page.evaluate(()=>window.__users)).find(u=>u.email==='Raci.Oener@akar-gmbh.de');ok(u.rep==='Mehmet Halici'&&u.role==='muhasebe','temsilci alanı kaydedildi (rol korunarak): Raci Öner → Mehmet Halici')}
   await page.selectOption('[data-urep="Raci.Oener@akar-gmbh.de"]','');await page.waitForTimeout(150);
   page.once('dialog',d=>d.accept());await page.click('[data-udel="muhasebe.test@akar-bv.nl"]');await page.waitForTimeout(150);
   ok(!(await page.evaluate(()=>window.__users)).some(u=>u.email==='muhasebe.test@akar-bv.nl'),'kullanıcı kaldırıldı');
   // izin değiştir ve kaydet
   await page.uncheck('[name="satis|v_all"]');await page.check('[name="satis|v_credit"]');
   ok(/Kaydedilmemiş/.test(await txt(page,'#pmsg')),'kaydedilmemiş değişiklik uyarısı');
   await page.evaluate(()=>window.claude.use('db').then(db=>db.collection('contacts').doc('c9').set({phone:'2'})));await page.waitForTimeout(150);
   ok(!(await chk('satis','v_all'))&&await chk('satis','v_credit'),'yeniden çizimde işaretler korunuyor');
   await page.click('#pform button[type=submit]');await page.waitForTimeout(150);
   const d=await doc(page,'settings/perms');
   ok(d&&d.satis.v_all===false&&d.satis.v_credit===true&&d.satis.e_notes===true&&d.muhasebe.v_credit===true&&d.by==='baran.sengul@akar-group.com','izinler settings/perms kaydına yazıldı');
   ok(/İzinler kaydedildi: Satış temsilcisi$/.test(await txt(page,'#toast')),'bildirim: '+await txt(page,'#toast'));
   await page.selectOption('[data-urole="Raci.Oener@akar-gmbh.de"]','satis');await page.waitForTimeout(150);
   ok(/temsilci seçilmedi: müşteri göremez/.test(await txt(page,'#uT tr[data-urow="Raci.Oener@akar-gmbh.de"]')),'temsilci adı seçilmeyen satış kullanıcısı için uyarı');
   await page.selectOption('[data-urole="Raci.Oener@akar-gmbh.de"]','muhasebe');await page.waitForTimeout(150);
   ok(/yalnız Lütfi Kaplan müşterileri/.test(await txt(page,'#uT tr[data-urow="lutfi.kaplan@akar-bv.nl"]'))&&/tüm müşterileri görür/.test(await txt(page,'#uT tr[data-urow="Raci.Oener@akar-gmbh.de"]')),'"tüm müşteriler" kapalı: temsilci yalnız kendi müşterilerini, muhasebe tümünü görür');
   await page.screenshot({path:path.join(SHOTS,'13-izinler.png'),fullPage:true});
   // temsilci: yalnız kendi müşterileri, Kredi Limiti var, menüde yönetim yok
   const {ctx:c2,page:p2}=await open(browser,{admin:false,user:'lutfi.kaplan@akar-bv.nl',seed:{settings:{perms:d}}});
   ok(JSON.stringify(await rows(p2))==='["Düşüş Market","Sessiz Market"]','temsilci yalnız kendi 2 müşterisini görüyor');
   ok(JSON.stringify(await p2.$$eval('#reps .chip',c=>c.map(x=>x.textContent)))==='["Lütfi Kaplan"]','temsilci seçimi kilitli: Lütfi Kaplan');
   ok(await p2.isVisible('#tabK')&&await p2.isHidden('#tabB'),'kredi izni verildi: Kredi Limiti sekmesi var; Karne yok');
   await p2.click('#avBtn');ok(await p2.isHidden('#umRules')&&await p2.isHidden('#umPerms')&&await p2.isHidden('#umSep2')&&await txt(p2,'#umRole')==='Satış temsilcisi','temsilci menüsünde yönetim yok; rol: Satış temsilcisi');
   await p2.evaluate(()=>{document.querySelector('#umPerms').click()});await p2.waitForTimeout(100);
   ok(await p2.isHidden('#permsView')&&await p2.isVisible('#listView'),'temsilci izin sayfasına giremiyor');
   await c2.close();
   // muhasebe rolü
   const {ctx:c3,page:p3}=await open(browser,{admin:false,role:'muhasebe',user:'Raci.Oener@akar-gmbh.de',seed:{settings:{perms:d}}});
   ok((await rows(p3)).length===8,'muhasebe tüm müşterileri görüyor');
   ok(await p3.isVisible('#tabK')&&await p3.isVisible('#tabV')&&await p3.isHidden('#tabH')&&await p3.isHidden('#tabB'),'muhasebe: Kredi Limiti ve Vadesi Geçen var; Hedefler ve Karne yok');
   await p3.click('#avBtn');
   ok(await p3.isVisible('#xexp')&&await p3.isVisible('#oimpBtn')&&await p3.isHidden('#ximpBtn')&&await p3.isHidden('#umRules')&&await txt(p3,'#umRole')==='Muhasebe','muhasebe menüsü: Excel\'e aktar ve açık fatura içe aktarma var; müşteri içe aktarma ve ayarlar yok');
   await p3.keyboard.press('Escape');await sel(p3,'Düşüş Market');
   ok(!!(await p3.$('#aragOn'))&&!(await p3.$('#stSel')),'muhasebe ARAG başlatabiliyor, durumu değiştiremiyor');
   await c3.close();
   // izni kapatılan sekme: Hedefler kapalıysa temsilci göremez
   const {ctx:c4,page:p4}=await open(browser,{admin:false,user:'lutfi.kaplan@akar-bv.nl',seed:{settings:{perms:{satis:{v_targets:false,v_overdue:false,v_all:true,e_notes:false}}}}});
   ok(await p4.isHidden('#tabH')&&await p4.isHidden('#tabV')&&!(await p4.$('[data-quick=od]')),'Hedefler ve açık fatura izni kapalı: sekmeler ve kutu yok');
   await sel(p4,'Düşüş Market');ok(!(await p4.$('#oi'))&&!(await p4.$('#ctEdit')),'kartta açık faturalar ve iletişim düzenleme yok');
   await c4.close();
   await page.click('[name="satis|v_credit"]');page.once('dialog',x=>x.accept());await goList(page);
   ok(await page.isVisible('#listView'),'kaydedilmemiş izinle sayfadan çıkarken soruyor');}
  await ctx.close();

  step('14. Satış temsilcisi yalnız kendi müşterileri; ayar sayfalarında üst kutular gizli');
  ({ctx,page}=await open(browser,{admin:false,user:'lutfi.kaplan@akar-bv.nl'}));
  {ok(JSON.stringify(await rows(page))==='["Düşüş Market","Sessiz Market"]','varsayılan: temsilci yalnız kendi 2 müşterisini görüyor');
   ok(JSON.stringify(await page.$$eval('#reps .chip',c=>c.map(x=>x.textContent)))==='["Lütfi Kaplan"]','temsilci seçimi kilitli');
   await page.fill('#q','Sağlıklı');await page.dispatchEvent('#q','input');ok((await rows(page)).length===0,'aramada başka temsilcinin müşterisi çıkmıyor');await page.fill('#q','');await page.dispatchEvent('#q','input');
   await page.click('#tabH');
   ok(await txt(page,'[data-qcard="Özgür Firat"] .qbig')==='%84'&&await txt(page,'[data-qcard="Lütfi Kaplan"] .qbig')==='%56'&&!!(await page.$('#targets .qgrid .qcard')),'Hedefler sekmesi kısıtlamanın dışında: tüm ekip görünüyor');
   await goList(page);await page.click('#ordBtn');
   ok(JSON.stringify(await page.$$eval('#ordp tbody tr td:first-child',t=>t.map(x=>x.textContent.trim())))==='["Lütfi Kaplan"]','aylık net ciro dağılımında yalnız kendisi');
   await page.click('#ordBtn');}
  await ctx.close();
  {const {ctx:c2,page:p2}=await open(browser,{admin:false,user:'lutfi.kaplan@akar-bv.nl',seed:{settings:{perms:{satis:{v_board:true,v_targets:true}}}}});
   await p2.click('#tabB');
   ok(JSON.stringify(await p2.$$eval('#boardT tbody td:first-child',t=>t.map(x=>x.textContent.trim())))==='["Lütfi Kaplan"]','Karne izni olsa da yalnız kendi satırı');
   await c2.close();}
  ({ctx,page}=await open(browser));
  {ok(await page.isVisible('#stats')&&await page.isVisible('#reps'),'ana sayfada üst kutular görünüyor');
   await goAdm(page);
   ok(await page.isHidden('#stats')&&await page.isHidden('#reps')&&await page.isVisible('#homeA'),'Yönetici ayarlarında üst kutular ve temsilci seçimi gizli; "Ana sayfaya dön" var');
   ok(await page.isHidden('nav.tabs'),'ayar sayfasında Müşteriler / Hedefler / Karne sekmeleri de gizli');
   await page.click('#homeA');ok(await page.isVisible('nav.tabs'),'ana sayfada sekmeler geri geliyor');ok(await page.isVisible('#listView')&&await page.isVisible('#stats'),'"Ana sayfaya dön" müşteri listesine döndürüyor');
   await page.click('#avBtn');await page.click('#umPerms');
   ok(await page.isHidden('#stats')&&await page.isVisible('#homeP'),'Kullanıcı izinlerinde de üst kutular gizli');
   await page.screenshot({path:path.join(SHOTS,'14-izinler-ust.png'),clip:{x:0,y:0,width:1400,height:420}});
   await page.click('#homeP');ok(await page.isVisible('#stats'),'izinlerden ana sayfaya dönüş');}
  await ctx.close();

  step('15. Temsilci adı kullanıcı listesinden (CRM_REP)');
  {const ctx2=await browser.newContext({viewport:{width:1400,height:1000}});const p2=await ctx2.newPage();p2.on('pageerror',e=>errors.push(e.message));await p2.route(offline,r=>r.abort());
   await p2.addInitScript(`${FIX};window.CRM_IS_ADMIN=false;window.CRM_ROLE='satis';window.CRM_REP='Mehmet Halici';window.CRM_USER='m.h@akar-bv.nl';window.CRM_AUTH={email:'m.h@akar-bv.nl'};${MOCK}`);
   await p2.goto(BASE+'/index.html');await p2.waitForSelector('#list .row');
   ok(JSON.stringify(await rows(p2))==='["Küçük Kiosk","Sağlıklı Market"]','e-posta adı eşleşmese de kullanıcı listesindeki temsilci (Mehmet Halici) geçerli');
   await ctx2.close();}

  step('0c. Raci Öner');
  ({ctx,page}=await open(browser,{admin:false,role:'muhasebe',user:'Raci.Oener@akar-gmbh.de'}));
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
  ok(await page.isHidden('#oimpBtn'),'temsilci açık fatura içe aktarmayı görmüyor');
  await sel(page,'Sessiz Market');
  ok(!!(await page.$('#ctEdit')),'temsilci telefon ekleyebiliyor');
  ok(!(await page.$('#stSel')),'temsilci durumu değiştiremiyor (seçim yok)');
  ok(!(await page.$('#aragOn')),'temsilci ARAG butonunu görmüyor');
  ok(await page.isVisible('#tabV'),'temsilci Vadesi Geçen sekmesini görüyor');
  await page.evaluate(()=>window.claude.use('db').then(db=>db.collection('arag').doc('c2').set({active:true,at:'2026-11-20'})));await page.waitForTimeout(150);
  ok(/ARAG süreci aktif · 20\.11\.2026/.test(await txt(page,'#aragBox'))&&!(await page.$('#aragOff')),'temsilci aktif ARAG durumunu görüyor, kapatamıyor');
  await page.evaluate(()=>window.claude.use('db').then(db=>db.collection('statusov').doc('c2').set({status:'Pasif'})));await page.waitForTimeout(150);
  ok(/Pasif · elle/.test(await txt(page,'#detail .tags')),'temsilci elle belirlenen durumu görüyor: Pasif · elle');
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

  step('16. Ziyaret kaydı ve takip, e_notes iznine bağlı (veritabanı kuralıyla aynı)');
  ({ctx,page}=await open(browser,{visitLog:true,admin:false,user:'lutfi.kaplan@akar-bv.nl'}));
  await sel(page,'Sessiz Market');
  ok(!!(await page.$('#aform'))&&await page.$$eval('#detail [data-done]',b=>b.length>0&&b.every(x=>!x.disabled)),'izin açık: ziyaret formu var, takip kutusu işaretlenebiliyor');
  await ctx.close();
  ({ctx,page}=await open(browser,{visitLog:true,admin:false,user:'lutfi.kaplan@akar-bv.nl',seed:{settings:{perms:{satis:{v_targets:true,v_overdue:true,e_notes:false}}}}}));
  await sel(page,'Sessiz Market');
  ok(!(await page.$('#aform')),'izin kapalı: ziyaret formu yok');
  ok(await page.$$eval('#detail [data-done]',b=>b.length>0&&b.every(x=>x.disabled)),'izin kapalı: kartta takip kutusu kilitli');
  await page.click('#tabT');
  ok(await page.$$eval('#tasks [data-done]',b=>b.length>0&&b.every(x=>x.disabled)),'izin kapalı: Takipler sekmesinde takip kutusu kilitli');
  await ctx.close();

  step('Konsol hataları');
  ok(errors.length===0,errors.length?'hatalar: '+errors.join(' | '):'hiç JavaScript hatası yok');
  await browser.close();server.close();
  console.log(`\nSonuç: ${pass} geçti, ${fail} kaldı`);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
