// Bellek içi veritabanı: index.html'in kullandığı window.claude.use('db') arayüzünü taklit eder.
// Test sırasında Supabase'e hiç bağlanılmaz.
(function(){
  const seed=window.__SEED||{};
  const store=new Map(); // "col/id" -> data
  for(const [col,docs] of Object.entries(seed))for(const [id,d] of Object.entries(docs))store.set(col+'/'+id,JSON.parse(JSON.stringify(d)));
  const listeners=new Set();
  const emit=col=>setTimeout(()=>{for(const l of [...listeners])l(col)},0);
  const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
  window.__writes=[];
  function docRef(col,id){
    const key=col+'/'+id;
    return {id,
      async get(){const d=store.get(key);return {id,exists:d!==undefined,data:()=>clone(d)}},
      async set(d){if(window.__failWrites)throw Object.assign(new Error('fail'),{code:'x'});if(col==='contacts'&&d.more!=null&&!(Array.isArray(d.more)&&d.more.length<=2))throw new Error('contacts_more_max');if(col==='contacts'&&!ctValid(d))throw new Error('contacts_valid');store.set(key,clone(d));window.__writes.push(['set',key,clone(d)]);emit(col)},
      async update(p){if(!store.has(key))throw new Error('not found');store.set(key,{...store.get(key),...clone(p)});window.__writes.push(['update',key,clone(p)]);emit(col)},
      async delete(){store.delete(key);window.__writes.push(['delete',key]);emit(col)},
      onSnapshot(cb){const f=c=>{if(c===col)this.get().then(cb)};this.get().then(cb);listeners.add(f);return()=>listeners.delete(f)}
    };
  }
  let n=0;
  function collection(col){
    let ord=null,lim=null;
    const q={orderBy(f,d){ord=[f,d];return q},limit(x){lim=x;return q},
      doc(id){return docRef(col,id||('m'+(++n)+Date.now().toString(36)))},
      onSnapshot(cb){const load=()=>{let rows=[...store.entries()].filter(([k])=>k.startsWith(col+'/')).map(([k,d])=>({id:k.slice(col.length+1),d}));
          if(ord){const [f,dir]=ord;rows.sort((a,b)=>{const x=a.d[f]??'',y=b.d[f]??'';return (x<y?-1:x>y?1:0)*(dir==='desc'?-1:1)})}
          if(lim)rows=rows.slice(0,lim);
          cb({docs:rows.map(r=>({id:r.id,exists:true,data:()=>clone(r.d)})),metadata:{fromCache:false}})};
        load();const f=c=>{if(c===col)load()};listeners.add(f);return()=>listeners.delete(f)}};
    return q;
  }
  // sunucudaki contacts_valid() karşılığı: yetkili adı harflerden, telefon geçerli biçimde
  const nOk=v=>{const t=String(v||'').trim();return !t||(t.length<=60&&/^\p{L}[\p{L}\p{M} .'’-]*$/u.test(t)&&(t.match(/\p{L}/gu)||[]).length>=2)};
  const pOk=v=>{const t=String(v||'').trim();if(!t)return true;if(!/^\+?[\d\s().\-\/]+$/.test(t))return false;return /^(0[1-9]\d{8}|(\+|00)31[1-9]\d{8}|(\+|00)(?!31)[1-9]\d{7,13}|6\d{8})$/.test(t.replace(/[\s().\-\/]/g,''))};
  const ctValid=d=>[d,...(Array.isArray(d.more)?d.more:[])].every(x=>x&&nOk(x.contact)&&pOk(x.phone));
  const db={collection,doc(p){const [c,i]=p.split('/');return docRef(c,i)}};
  // sunucudaki import_sales() fonksiyonunun bellek içi karşılığı (tek işlemde yazar)
  // sunucudaki set_visit() karşılığı: yalnız rut günü, ziyaret sıklığı/haftaları, merch ve dizim; değerler listeden
  const VIS={visitDay:['','Pazartesi','Salı','Çarşamba','Perşembe','Cuma'],freq:['','Haftalık','2 haftada 1','4 haftada 1'],weeks:['','1, 2, 3, 4','1, 3','2, 4','1','2','3','4'],merch:['','Var','Yok'],dizim:['','Var','Yok']};
  const WOF={'':[''],'Haftalık':['1, 2, 3, 4'],'2 haftada 1':['1, 3','2, 4'],'4 haftada 1':['1','2','3','4']};
  db.rpc=async(name,args)=>{
    if(name==='set_visit'){const {cid,p}=args;if(window.__failWrites)throw new Error('fail');
      const cur=store.get('customers/'+cid);if(!cur)throw new Error('müşteri yok');
      for(const [k,v] of Object.entries(p))if(!VIS[k]||!VIS[k].includes(v))throw new Error('geçersiz değer: '+k);
      const x={...cur,...p,visitAt:Date.now()};if(('freq' in p||'weeks' in p)&&!(WOF[x.freq||'']||[]).includes(x.weeks||''))throw new Error('sıklık ve haftalar uyuşmuyor');
      store.set('customers/'+cid,x);window.__writes.push(['rpc','set_visit',clone(args)]);emit('customers');return {ok:true}}
    const {p}=args;
    if(name!=='import_sales')throw new Error('rpc yok: '+name);
    if(window.__failWrites)throw new Error('fail');
    const g=k=>store.get(k),m=g('sync/month'),r=g('sync/returns');
    if(String(m?(m.importedAt??m.through??''):'')!==p.expect.month||String(r?(r.through??''):'')!==p.expect.returns)throw new Error('stale: veri değişmiş');
    store.set('sync/month',clone(p.month));store.set('sync/returns',clone(p.returns));
    const K=['sales2026','invoices2026','lastInvoice','lastInvoiceNo'];
    for(const [id,c] of Object.entries(p.customers)){const cur=g('customers/'+id);if(!cur)continue;const x={...cur};for(const k of K)if(k in c)x[k]=c[k];x.updatedAt=Date.now();store.set('customers/'+id,x)}
    const q=clone(g('qtargets/'+p.qtargets.key))||{period:p.qtargets.key,reps:{}};q.reps=q.reps||{};
    for(const [rep,cs] of Object.entries(p.qtargets.reps)){const e=q.reps[rep]||(q.reps[rep]={c:{}});e.c=e.c||{};for(const [k,a] of Object.entries(cs)){const o=e.c[k]||(e.c[k]={p:0,t:0});o.a=a}}
    q.asOf=p.qtargets.asOf;q.updatedAt=Date.now();store.set('qtargets/'+p.qtargets.key,q);
    window.__writes.push(['rpc','import_sales',clone(p)]);for(const c of ['sync','customers','qtargets'])emit(c);
    return {ok:true}};
  window.__store=store;
  // kullanıcı listesi (Supabase'de allowed_users tablosu)
  const users=(window.__USERS||[{email:'baran.sengul@akar-group.com',role:'admin',rep:'Baran Sengül'},{email:'lutfi.kaplan@akar-bv.nl',role:'satis',rep:'Lütfi Kaplan'},{email:'Raci.Oener@akar-gmbh.de',role:'satis',rep:null}]).map(u=>({...u}));
  window.__users=users;
  window.CRM_USERS={async list(){return users.map(u=>({...u}))},
    async save(email,role,rep){const u=users.find(x=>x.email===email);if(u){u.role=role;u.rep=rep||null}else users.push({email,role,rep:rep||null})},
    async remove(email){const i=users.findIndex(x=>x.email===email);if(i>=0)users.splice(i,1)}};
  window.claude={async use(k){
    if(k==='db')return db;
    if(k==='user')return {can:async()=>true};
    if(k==='downloads')return {async save({filename,data}){window.__download={filename,size:data.byteLength||data.length}}};
    return null}};
})();
