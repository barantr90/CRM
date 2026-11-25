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
      async set(d){if(window.__failWrites)throw Object.assign(new Error('fail'),{code:'x'});store.set(key,clone(d));window.__writes.push(['set',key,clone(d)]);emit(col)},
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
  const db={collection,doc(p){const [c,i]=p.split('/');return docRef(c,i)}};
  window.__store=store;
  // kullanıcı listesi (Supabase'de allowed_users tablosu)
  const users=(window.__USERS||[{email:'baran.sengul@akar-group.com',role:'admin'},{email:'lutfi.kaplan@akar-bv.nl',role:'satis'},{email:'Raci.Oener@akar-gmbh.de',role:'satis'}]).map(u=>({...u}));
  window.__users=users;
  window.CRM_USERS={async list(){return users.map(u=>({...u}))},
    async save(email,role){const u=users.find(x=>x.email===email);if(u)u.role=role;else users.push({email,role})},
    async remove(email){const i=users.findIndex(x=>x.email===email);if(i>=0)users.splice(i,1)}};
  window.claude={async use(k){
    if(k==='db')return db;
    if(k==='user')return {can:async()=>true};
    if(k==='downloads')return {async save({filename,data}){window.__download={filename,size:data.byteLength||data.length}}};
    return null}};
})();
