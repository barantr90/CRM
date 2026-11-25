# Akar Benelux NL CRM

Hollanda'daki market müşterileri için satış CRM'i. Kullanıcılar Türkçe konuşur; arayüz metinleri, kod yorumları, commit mesajları ve kullanıcıya verilen yanıtlar **Türkçe** olur.

## Yapı

Derleme adımı yok: düz HTML + vanilla JS; `main` dalındaki dosyalar statik olarak yayınlanan canlı sitedir.

| Dosya | İçerik |
|---|---|
| `index.html` | İskelet: üst bar ve sağ üst menü (`#umDrop`), sekmeler (`nav.tabs`), görünüm bölümleri (`#listView`, `#targetsView`, `#boardView`, `#overdueView`, `#creditView`, `#adminView`, `#permsView`), modallar |
| `app.js` | Tüm uygulama mantığı. Tek blok `{ ... }` içinde; global yok |
| `style.css` | Tüm stiller. Renkler `:root` değişkenleri; gece modu `[data-theme=dark]` |
| `supabase-baglanti.js` | Supabase'i Firestore benzeri `db` arayüzüne çevirir, giriş ekranı, `window.CRM_ROLE / CRM_REP / CRM_USERS` |
| `config.js` | Supabase URL ve anon key (herkese açık anahtar; gizli bilgi değil) |
| `tests/` | Uçtan uca testler (Playwright + bellek içi sahte veritabanı) |

### app.js akışı
- Veri global dizilerde: `CALL` (tüm müşteriler), `C` (kullanıcının görebildiği müşteriler), `A` (activities), `OI` (açık faturalar), `RET` (iade), `MON` (bu ay), `QTS` (hedefler), `SO` (elle durum), `K` (iletişim), `AR` (ARAG), `PM` (izinler).
- Her veri değişiminde `render()` çağrılır. Önce `derive()` çalışır, sonra her bölümün `renderX()` fonksiyonu kendini çizer. Bir bölüm açık değilse `renderX()` erken döner ama sekme etiketini günceller.
- `render()` açık formlardaki yazılanları korur (`aform`, `ctform`, `qform`, `rform`, `pform`, `uform`). `rform` ve `pform` yalnız kirliyse korunur (`st.rdirty` / `st.pdirty`).
- Olaylar belge düzeyinde dinlenir (`click` / `change` / `input` / `submit`) ve `data-*` öznitelikleriyle ayrılır.
- UI durumu `st` nesnesinde tutulur. `rep`, `view`, `qv` ve `rf` alanları localStorage'daki `crm-ui` anahtarında saklanır.

## Veritabanı (Supabase)

- Proje: `kbryjqxqtjekooiwtpou`. Tek tablo: `docs(collection text, id text, data jsonb, updated_at)`.
- Erişim `supabase-baglanti.js` üzerinden yapılır:
  - `db.collection(c).doc(id).get/set/update/delete`, `db.doc('c/id')` ve `onSnapshot`.
  - Canlı güncellemeler `postgres_changes` ile gelir.
  - **`sync` koleksiyonu tablodan değil `my_sync(p_id)` RPC'sinden okunur.**

### Koleksiyonlar

| Koleksiyon | İçerik |
|---|---|
| `customers` | Müşteri kayıtları. Kimlik `c<kod>`, alan `code`. Diğer alanlar: `rep`, `ciro2025`, `sales2026`, `lastInvoice`, `status`, `statusManual`, `segment`, `chain`, `visitDay`, … |
| `activities` | Notlar ve takipler (`customerId`). Ziyaret kaydı şu an kapalı: `VISIT_LOG=false` |
| `contacts` | Temsilcinin girdiği telefon / yetkili (kimlik = müşteri id) |
| `statusov` | Elle Aktif/Pasif (kimlik = müşteri id) |
| `arag` | ARAG tahsilat süreci (kimlik = müşteri id) |
| `qtargets` | Aylık hedefler (kimlik `YYYY-MM`) |
| `settings/rules` | Yönetici ayarları |
| `settings/perms` | Rol izinleri |
| `sync/month` | Bu ay: `map[kod]=[satış, fatura adedi, iade, fiyat farkı]` |
| `sync/returns` | Yıl başından iade: `map[kod]=[satış, iade, iadeAdet, ff, ffAdet, satışAdet]`, `through` |
| `sync/openinv` | Açık faturalar: `map[kod]={lim, vade, inv:[[no, tarih, F/I/P, tutar, kalan, vade]]}`, `asOf` |
| `issues` | Otomatik görevlerin sorun kayıtları |

- Satış verisi Power BI / Excel dışa aktarımından gelir. Sabah çalışan zamanlanmış bir görev `customers` (`lastInvoice`, `sales2026` vb.) ile `sync/month` ve `sync/returns` kayıtlarını günceller.
- Açık faturalar menüdeki "Açık faturaları içe aktar" ile ERP Excel'inden yüklenir.

### Roller, izinler ve RLS
- Roller `allowed_users(email, role, rep)` tablosunda: `admin` (Yönetici), `satis` (Satış temsilcisi), `muhasebe`. `rep`, kullanıcının temsilci adıdır.
- Ana yönetici `supabase-baglanti.js` içindeki `ADMIN_EMAIL` ile SQL'deki `is_admin()` fonksiyonudur. Her zaman yöneticidir.
- İzin anahtarları `app.js` → `PERMS`, varsayılanlar `PDEF`. Aynı varsayılanlar SQL'deki `has_perm()` içinde de vardır; **ikisi birlikte değiştirilir.**
- SQL yardımcıları:
  - `is_allowed`, `is_admin`, `my_role`, `my_rep`, `has_perm(p)`, `sees_all`, `sees_customer(id)`
  - `can_write_doc(col, id)`, `can_delete_doc(col)`, `my_sync(id)`
- `v_all` izni olmayan kullanıcı veritabanında da yalnız kendi müşterilerini görür (`customers.data->>'rep' = my_rep()`) ve onlara bağlı kayıtlara erişir. `sync` verisi ona yalnız kendi kodlarıyla döner.
- **Hedefler** kısıtlamanın dışındadır: `qtargets` ve `settings` herkese açıktır, Hedefler sekmesi tüm ekibi gösterir.
- İstemcide aynı kurallar `can(k)`, `isAdmin()`, `repLock()` ve `viewOk(view)` ile uygulanır.
- **Yeni bir yazma veya görünüm eklerken hem istemci kontrolünü hem RLS'i güncelle.**
- Şema değişikliği Supabase MCP `apply_migration` ile yapılır. Sonra kurallar kullanıcı taklidiyle test edilir:
  ```sql
  begin;
  set local role authenticated;
  select set_config('request.jwt.claims','{"email":"…","role":"authenticated"}',true);
  -- kuralı deneyen sorgular
  rollback;
  ```

## İş kuralları (değiştirmeden önce oku)

- **Ayarlar** `RDEF` içinde tanımlı; Yönetici ayarları ekranından değişir (`settings/rules`). Sabit eşik yazma; yeni eşik `RDEF` ve `RULES` listesine eklenir, etki metni `ruleImpact()` ile verilir. Tanımlı ayarlar:
  - `pasif` 120, `temas` 30, `arag` 30
  - `credDays` 15, `credCut` 50, `iade` 2.5
  - `riskPace` 70, `dropMin` 3000, `riskSilent` 45, `silentMax` 365, `silentMin` 1000
- **Durum:** son satış faturası `R.pasif` günden eskiyse müşteri Pasif olur. Öncelik sırası: `statusov` (sitede elle) > `statusManual` (Excel) > otomatik (`autoSt`).
- **Kayıp riski** (`riskCalc`) yalnız aktif müşterilerde hesaplanır; pasifler risk kutusunun altında ayrıca sayılır. İki koşul vardır:
  - tempo düşüşü
  - faturasız gün
- **Tempo / büyüme** her yerde `sales2026 / (ciro2025 × YF) − 1` ile hesaplanır.
  - `YF`, verinin tarihine göre yılın geçen oranıdır: `dataTo()` = `RET.through` ya da `MON.through` ya da bugün.
  - `CY` / `PY` (bu yıl / geçen yıl) etiketleri dinamiktir; yılı metne gömme.
- **İade oranı** (`retOf`): |iade| ÷ aynı dönemin satış faturaları. Uyarı eşiği `R.iade` %.
- **Açık faturalar** (`oiOf`): vadesi geçen, gelmeyen ve alacak ayrı hesaplanır. Toplam = net kalan.
- **ARAG:** en eski gecikme `R.arag` günü aşınca kartta buton çıkar.
- **Kredi limiti önerisi** (`credRec`):
  - Formül: aylık ortalama satış × (vade + `credDays`) ÷ 30, € 500'e yukarı yuvarlanır.
  - Gecikme `R.arag` günü aşarsa öneri `credCut` % düşürülür; ARAG aktifse öneri 0.
- **Aylık hedef** = Hedefler sekmesinde o ay girilen kategori hedeflerinin toplamı (`tgtMap`).
- Bir veri birden çok yerde gösteriliyorsa **tek fonksiyondan** hesaplanmalı. Kart, liste, Karne ve Excel'e aktarım aynı sonucu vermeli.

## Biçim ve dil
- Para: `eur(n)` → `€ 1.234`, kuruşlu: `eurc`. Yüzde: `gPct` / `gCls`, `pct1`, Türkçe ek: `pctEk`.
- Tarih: `fmt('2026-11-25')` → `25.11.2026`.
- Küçük harf için `low()` (Türkçe I/ı). Ayar kutularında ondalık sayı `rnum()` ile okunur, çünkü `num()` noktayı binlik ayırıcı sayar.
- Kullanıcıdan gelen her metin `esc()` ile basılır.
- Telefon genişliği (390 px) ve gece modu her değişiklikte çalışmalı; tablolar kendi içinde kayar, sayfa yatay taşmaz.

## Test

```bash
node tests/e2e.js
```

- Sayfa yerel bir sunucudan, `tests/mockdb.js` (bellek içi db) ve `tests/fixture.js` (`window.__SEED` örnek verisi) ile açılır; gerçek veriye dokunulmaz.
- Excel'e aktarım testi için: `XLSX_LIB=/yol/xlsx.full.min.js node tests/e2e.js`.
- `open(browser, {admin, role, user, seed})` farklı rol ve izinlerle sayfa açar. Diğer yardımcılar:
  - `goAdm(page)`: menüden Yönetici ayarlarını açar.
  - `goList(page)`: ana sayfaya döner.
  - `doc(page, 'col/id')`: sahte db'deki kaydı okur.
- **Her değişiklikte yeni davranış için test ekle ve tüm testlerin geçtiğini gör.** Hatayı düzeltirken önce eski kodda başarısız olan bir test yaz.
- Ekran görüntüleri `tests/screens/` altına yazılır (git'e girmez); arayüz değişikliğinden sonra bak.

## Çalışma şekli
- Değişiklikler PR ile `main`'e birleştirilir (main = canlı site). PR açıklaması Türkçe yazılır: özet ve test sonucu.
- Kullanıcıya her işten sonra kısa bir Türkçe özet verilir: ne değişti, canlıda nasıl görünür, PR bağlantısı, test sayısı. Sayfanın Ctrl+F5 ile yenilenmesi hatırlatılır.
- Canlı veriyle ilgili sayıları (müşteri adedi, oran vb.) Supabase'den bağımsız SQL ile doğrula; tahmin yazma.
- **Müşteri verisi içeren dosyaları (Excel, CSV, dışa aktarımlar) repoya koyma.**
- Gizli anahtar yazma: `config.js`'teki anon key dışında anahtar yoktur; service key kullanılmaz.
- Yetki kuralı: hedef, durum, ayar, izin ve içe aktarma gibi yazma işlemleri yalnız izni olan role açıktır. Varsayılan olarak bunlar yalnız Yöneticiye açıktır; diğer roller görüntüler.
