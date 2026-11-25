// Telefon puntosu: telefonda (≤ 600 px) her yazı, masaüstü + telefon kurallarının verdiği boyuttan 2 px küçük gösterilir.
// style.css sonundaki blok bu dosyayla üretilir; elle düzenlenmez. Yeni bir font-size eklenince: node tests/punto.js
// Yöntem: 390 px'te geçerli olan her kuralın aynı seçiciyle ve aynı sırayla (−2 px) bir kopyası en sona eklenir;
// seçici özgüllüğü aynı ve sıra korunduğu için her öğede kazanan kural yine aynı kuralın kopyasıdır.
const fs=require('fs'),path=require('path');
const CSS=path.join(__dirname,'..','style.css');
const A='/* TELEFON PUNTOSU',Z='/* /TELEFON PUNTOSU */',DIFF=2;
const strip=s=>{const i=s.indexOf(A);return i<0?s:s.slice(0,i).trimEnd()+'\n'+s.slice(s.indexOf(Z)+Z.length).replace(/^\s+/,'')};
async function build(browser,css){
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.setContent('<style></style>');await page.$eval('style',(e,c)=>{e.textContent=c},strip(css));
  const body=await page.evaluate(D=>{const out=new Map();
    const walk=(rules,ok)=>{for(const r of rules){
      if(r.cssRules&&r.media)walk(r.cssRules,ok&&matchMedia(r.media.mediaText).matches);
      else if(r.selectorText&&ok){const v=r.style.getPropertyValue('font-size');if(!v||/inherit|initial|unset|em|%/.test(v))continue;
        const m=/^([\d.]+)px$/.exec(v),nv=m?`${+(parseFloat(m[1])-D).toFixed(2)}px`:`calc(${v} - ${D}px)`;
        out.delete(r.selectorText);out.set(r.selectorText,nv)}}};
    walk(document.styleSheets[0].cssRules,true);
    return [...out].map(([s,v])=>`${s}{font-size:${v}}`).join('\n')},DIFF);
  await page.close();
  return `${A}: telefonda yazılar ${DIFF} px küçük. tests/punto.js üretir; elle düzenlenmez. */\n@media(max-width:600px){\n${body}\n}\n${Z}\n`;
}
module.exports={build,strip,A,Z,DIFF};
if(require.main===module)(async()=>{const {chromium}=require('playwright');const b=await chromium.launch();
  const css=fs.readFileSync(CSS,'utf8'),blk=await build(b,css);await b.close();
  fs.writeFileSync(CSS,strip(css).trimEnd()+'\n\n'+blk);console.log('style.css: telefon puntosu bloğu güncellendi ('+blk.split('\n').length+' satır)')})();
