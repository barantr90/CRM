/* Supabase bağlantısı: CRM kodunun kullandığı veritabanı arayüzünü Supabase'in "docs" tablosuna bağlar */
(function(){
  if(window.claude)return; // Claude içinde açılırsa kendi veritabanını kullanır
  const cfg=window.CRM_CONFIG||{};
  const diag=m=>{window.CRM_DIAG=m;console.error('[CRM]',m)};
  const url=String(cfg.SUPABASE_URL||'').trim().replace(/\/+$/,''),key=String(cfg.SUPABASE_ANON_KEY||'').trim();
  if(!window.supabase){diag('Supabase kütüphanesi yüklenemedi (cdn.jsdelivr.net). İnternet/şirket ağı bu adresi engelliyor olabilir; sayfayı yenileyin ya da başka bir ağda deneyin.');return}
  if(!url||url.includes('PROJE-ID')||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)){diag('CRM_CONFIG içindeki SUPABASE_URL hatalı: "'+url+'". Şu biçimde olmalı: https://xxxxxxxx.supabase.co (sonunda /rest/v1 vb. olmadan).');return}
  if(!key||key.includes('BURAYA')||key.length<30){diag('CRM_CONFIG içindeki SUPABASE_ANON_KEY boş ya da hatalı. Supabase > Project Settings > API > "anon public" (veya "Publishable key") değerini yapıştırın.');return}
  let sb;try{sb=window.supabase.createClient(url,key)}catch(e){diag('Supabase bağlantısı kurulamadı: '+e.message);return}
  const T='docs';const ADMIN_EMAIL='baran.sengul@akar-group.com';
  const rid=()=>(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)).replace(/-/g,'').slice(0,20);
  const fail=e=>{throw Object.assign(new Error(e.message||'db'),{code:e.code})};
  const listeners=new Set();let chan=null;
  function ensureChannel(){
    if(chan)return;
    chan=sb.channel('docs-changes').on('postgres_changes',{event:'*',schema:'public',table:T},p=>{
      const r=p.new&&p.new.collection?p.new:p.old||{};for(const l of listeners)l(r)}).subscribe();
  }
  function onChange(fn){ensureChannel();listeners.add(fn);return()=>listeners.delete(fn)}
  function debounce(fn,ms){let t;return()=>{clearTimeout(t);t=setTimeout(fn,ms)}}
  function docRef(col,id){
    return {id,
      async get(){const {data,error}=await sb.from(T).select('data').eq('collection',col).eq('id',id).maybeSingle();if(error)fail(error);return {id,exists:!!data,data:()=>data?data.data:undefined}},
      async set(d){const {error}=await sb.from(T).upsert({collection:col,id,data:d,updated_at:new Date().toISOString()});if(error)fail(error)},
      async update(p){const cur=await this.get();if(!cur.exists)fail({message:'not found'});const {error}=await sb.from(T).update({data:{...cur.data(),...p},updated_at:new Date().toISOString()}).eq('collection',col).eq('id',id);if(error)fail(error)},
      async delete(){const {error}=await sb.from(T).delete().eq('collection',col).eq('id',id);if(error)fail(error)}
    };
  }
  // doc onSnapshot: sadece ilgili dokümanda yeniden yükle
  function docSnap(col,id,cb,err){const ref=docRef(col,id);const load=async()=>{try{cb(await ref.get())}catch(e){err&&err(e)}};load();const d=debounce(load,300);return onChange(r=>{if(r.collection===col&&r.id===id)d()})}
  function collection(col){
    let ord=null,lim=null;
    const q={
      orderBy(f,dir){ord=[f,dir];return q},limit(n){lim=n;return q},
      doc(id){const r=docRef(col,id||rid());r.onSnapshot=(cb,err)=>docSnap(col,r.id,cb,err);return r},
      onSnapshot(cb,err){
        const load=async()=>{try{
          const rows=[];for(let from=0;;from+=1000){const {data,error}=await sb.from(T).select('id,data').eq('collection',col).range(from,from+999);if(error)fail(error);rows.push(...data);if(data.length<1000)break}
          if(ord){const [f,dir]=ord;rows.sort((a,b)=>{const x=a.data[f]??'',y=b.data[f]??'';return (x<y?-1:x>y?1:0)*(dir==='desc'?-1:1)})}
          const out=lim?rows.slice(0,lim):rows;
          cb({docs:out.map(r=>({id:r.id,exists:true,data:()=>r.data})),metadata:{fromCache:false}})
        }catch(e){err&&err(e)}};
        load();const d=debounce(load,400);return onChange(r=>{if(r.collection===col)d()})
      }};
    return q;
  }
  const db={collection,doc(path){const [c,i]=path.split('/');const r=docRef(c,i);r.onSnapshot=(cb,err)=>docSnap(c,i,cb,err);return r}};
  window.CRM_DB=db; // zamanlanmış görevler için

  /* --- giriş ekranı --- */
  function loginUI(){
    return new Promise(res=>{
      const w=document.createElement('div');w.id='login';
      w.innerHTML=`<style>#login{position:fixed;inset:0;z-index:999;display:grid;place-items:center;background:var(--bg,#fff);font-family:system-ui,sans-serif}#login form{width:min(380px,90vw);display:grid;gap:12px;padding:28px;border:1px solid #ddd;border-radius:14px}#login h2{margin:0;font-size:24px}#login input,#login button{min-height:46px;border-radius:10px;font-size:16px;padding:0 14px;border:1px solid #ccc}#login button{background:#ff4a1c;color:#fff;border-color:#ff4a1c;font-weight:600;cursor:pointer}#login p{margin:0;color:#666;font-size:14px}</style>
      <form id="lpw"><h2>Müşteri Takibi</h2><p>E-posta ve şifrenizle giriş yapın.</p>
      <input type="email" name="e" required placeholder="ad@firma.com" autocomplete="username">
      <input type="password" name="p" required placeholder="Şifre" autocomplete="current-password">
      <button>Giriş yap</button><p id="lmsg"></p>
      <p><a href="#" id="lml">Şifrem yok / unuttum: e-postama giriş bağlantısı gönder</a></p></form>`;
      document.body.appendChild(w);
      const m=w.querySelector('#lmsg'),f=w.querySelector('#lpw');
      const explain=t=>/rate limit|too many|security purposes/i.test(t)?'Çok fazla e-posta istendi. Supabase ücretsiz planda saatte sadece birkaç e-posta gönderir; bir süre sonra tekrar deneyin ya da şifreyle giriş yapın. ('+t+')'
        :/invalid login|invalid credentials/i.test(t)?'E-posta veya şifre hatalı. ('+t+')'
        :/email not confirmed/i.test(t)?'Bu hesap henüz onaylanmamış. Supabase > Authentication > Users bölümünde kullanıcıyı oluştururken "Auto Confirm User" seçeneğini işaretleyin. ('+t+')'
        :/signups? not allowed|signup.*disabled/i.test(t)?'Bu e-posta Supabase\'de kullanıcı değil. Supabase > Authentication > Users > "Add user" ile ekleyin. ('+t+')'
        :'Giriş yapılamadı: '+t;
      f.onsubmit=async e=>{e.preventDefault();const email=f.elements.e.value.trim(),password=f.elements.p.value;m.textContent='Giriş yapılıyor…';
        const {error}=await sb.auth.signInWithPassword({email,password});if(error){console.error('[CRM]',error);m.textContent=explain(String(error.message||error))}};
      w.querySelector('#lml').onclick=async e=>{e.preventDefault();const email=f.elements.e.value.trim();if(!email){m.textContent='Önce e-posta adresinizi yazın.';return}m.textContent='Gönderiliyor…';
        const {error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:location.origin+location.pathname}});
        m.textContent=error?explain(String(error.message||error)):'E-postanıza giriş bağlantısı gönderildi (gelen kutusu/spam). Girdikten sonra sağ alttaki "Şifre belirle" ile kendinize şifre koyabilirsiniz.'};
      sb.auth.onAuthStateChange((ev,s)=>{if(s){w.remove();res(s)}});
    });
  }
  async function session(){
    const {data}=await sb.auth.getSession();const s=data.session||await loginUI();
    const {data:ok,error:ae}=await sb.from('allowed_users').select('email').maybeSingle();
    if(ae)throw new Error(/relation|does not exist|schema cache/i.test(ae.message)?'Veritabanı tabloları bulunamadı. 1-supabase-kurulum.sql dosyasını SQL Editor\'de çalıştırdınız mı? ('+ae.message+')':ae.message);
    if(!ok){document.body.innerHTML=`<div style="font-family:system-ui;padding:40px;max-width:520px;margin:auto"><h2>Erişim yetkiniz yok</h2><p>${s.user.email} adresi CRM kullanıcı listesinde değil. Yöneticinizden eklenmesini isteyin.</p><button id="lo">Farklı e-posta ile giriş</button></div>`;document.getElementById('lo').onclick=async()=>{await sb.auth.signOut();location.reload()};await new Promise(()=>{})}
    return s}
  function logoutBtn(s){const box=document.createElement('div');box.style.cssText='position:fixed;right:10px;bottom:10px;z-index:50;display:flex;gap:6px';
    const mk=(t,fn)=>{const b=document.createElement('button');b.textContent=t;b.style.cssText='font-size:12px;padding:6px 10px;border-radius:8px;border:1px solid #ccc;background:#fff;color:#333;opacity:.85;cursor:pointer';b.onclick=fn;box.appendChild(b)};
    mk('Şifre belirle',async()=>{const p=prompt('Yeni şifre (en az 8 karakter):');if(!p)return;if(p.length<8){alert('Şifre en az 8 karakter olmalı.');return}const {error}=await sb.auth.updateUser({password:p});alert(error?'Şifre kaydedilemedi: '+error.message:'Şifreniz kaydedildi. Bundan sonra e-posta ve şifreyle giriş yapabilirsiniz.')});
    mk('Çıkış ('+s.user.email+')',async()=>{await sb.auth.signOut();location.reload()});document.body.appendChild(box)}
  window.claude={async use(k){
    if(k==='db'){try{const s=await session();window.CRM_IS_ADMIN=String(s.user.email||'').toLowerCase()===ADMIN_EMAIL;logoutBtn(s);
      const {error:te}=await sb.from(T).select('id').limit(1);if(te)throw new Error(te.message);
      return db}catch(e){diag('Supabase hatası: '+(e.message||e));return null}}
    if(k==='user')return {can:async()=>true};
    if(k==='downloads')return {async save({filename,data}){const u=URL.createObjectURL(new Blob([data],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000)}};
    return null}};
})();
