# Akar Benelux NL CRM

Hollanda'daki market müşterileri için satış CRM'i. Arayüz metinleri, kod yorumları, commit mesajları, PR açıklamaları ve kullanıcıya verilen yanıtlar **Türkçe** olur.

## Mimari

Derleme yok: düz HTML + vanilla JS; `main` dalı canlı sitedir.

- `index.html`: iskelet (sekmeler, görünüm bölümleri, sağ üst menü).
- `app.js`: tüm mantık, tek blok içinde.
  - Veri global dizilerde: `CALL` (tüm müşteriler), `C` (kullanıcının görebildikleri), `OI`, `RET`, `MON`, `QTS`, …
  - Her değişimde `render()` → `derive()` → `renderX()` çağrılır.
  - Olaylar belge düzeyinde dinlenir ve `data-*` özniteliklerinden ayırt edilir.
- `style.css`: renkler `:root` değişkenlerinde; gece modu `[data-theme=dark]` ile.
- `supabase-baglanti.js`: Supabase'i Firestore benzeri bir `db` arayüzüne çevirir. Girişi ve `CRM_ROLE` / `CRM_REP` / `CRM_USERS` değerlerini sağlar.
- `config.js`: Supabase URL ve anon key (herkese açık).

## Veritabanı

- Supabase projesi `kbryjqxqtjekooiwtpou`.
- Tek tablo: `docs(collection, id, data jsonb)`.
- Müşteri kayıtları:
  - `customers`: müşteriler (id `c<kod>`, alanlar `code` ve `rep`).
  - Müşteri id'sine bağlı kayıtlar: `contacts`, `statusov`, `arag`, `activities`.
- Diğer kayıtlar:
  - `qtargets`: aylık hedefler.
  - `settings/rules` ve `settings/perms`: ayarlar ve izinler.
  - `sync/month`, `sync/returns`, `sync/openinv`: toplu veri, müşteri koduna göre `map`.
    - `sync/month.map[kod]` = [satış, fatura adedi, iade, fiyat farkı, iade adedi, fiyat farkı adedi]; `sync/returns.map[kod]` = [satış, iade, iade adedi, fiyat farkı, fiyat farkı adedi, satış adedi] (yıl başından bu yana).
- `sync` kayıtları istemciden `my_sync()` RPC'siyle okunur.
- Veri menüden içe aktarılır:
  - **Müşterileri içe aktar**: `CRM_Musteriler` Excel'i (müşteri bilgisi).
  - **Satış verisini içe aktar**: iki dosya birlikte, günlük satış (Daily sell-out, belge bazında) + detaylı satış raporu (ürün bazında, Power BI). İki dosyanın müşteri toplamları 1 €'dan fazla tutmazsa yüklenmez. Hesap `planSales()`'ta; yazma tek işlemde `import_sales(p)` RPC'siyle (izin `x_sales` + `v_all`; arada veri değiştiyse `stale` ile reddeder). Aynı ay yeniden yüklenince eski ay çıkarılıp yenisi eklenir; aynı dosyalar iki kez yüklenince sonuç değişmez.
  - **Açık faturaları içe aktar**: ERP "Export" dosyası → `sync/openinv`.

## Roller ve güvenlik

- Roller `allowed_users(email, role, rep)` tablosunda tanımlı: `admin`, `satis`, `muhasebe`.
- İzin anahtarları `PERMS` listesinde, varsayılanları `PDEF` nesnesinde.
- SQL tarafında `has_perm()` aynı varsayılanları içerir; ikisi **birlikte** değiştirilir.
- Kurallar iki katmanda uygulanır ve ikisi de güncellenmelidir:
  - istemcide: `can()`, `viewOk()`, `repLock()`
  - veritabanında: RLS fonksiyonları `can_write_doc`, `sees_customer`, `my_sync`.
- `v_all` izni olmayan satış temsilcisi:
  - yalnız `rep` alanı kendi adı olan müşterileri görür;
  - Hedefler bu kısıtlamanın dışındadır.
- Şema değişikliği `apply_migration` ile yapılır. Sonra kurallar kullanıcı taklidiyle denenir:
  `set local role authenticated` + `request.jwt.claims`, bir `begin … rollback` bloğu içinde.

## İş kuralları

- Eşikler koda sabit yazılmaz.
  - Yeni eşik `RDEF` ve `RULES` listesine eklenir; Yönetici ayarlarından değiştirilir.
  - Ayarın etkisini gösteren metin `ruleImpact()` ile üretilir.
- Bir rakam birden çok yerde gösteriliyorsa **tek bir fonksiyondan** hesaplanır. Kart, liste, Karne ve Excel aynı sonucu verir. Temel fonksiyonlar:
  - `autoSt` (durum), `riskCalc` (kayıp riski), `retOf` (iade)
  - `oiOf` (açık fatura), `credRec` (kredi önerisi), `tgtMap` (hedef)
  - `tempoOf` (tempo)
- Tempo her yerde `sales2026 / (ciro2025 × YF) − 1` formülüyle hesaplanır.
  - Yıl etiketleri dinamiktir: `CY` / `PY`.
  - `YF` verinin tarihinden (`dataTo()`) türetilir.
- Durum önceliği: elle (`statusov`) > Excel (`statusManual`) > otomatik.
- Excel dosyaları:
  - `CRM_Musteriler_<tarih>.xlsx`: tek sayfa "Müşteriler", yalnız müşteri bilgisi (`COLS`). İçe aktarma yalnız bu alanları yazar; satış verisi ve diğer alanlar korunur.
  - `CRM_Satis_<tarih>.xlsx`: tek sayfa "Satış" (`SCOLS`), Kod ile eşleşir. Yalnız dışa aktarılır; değerler sistemden, Tempo `tempoOf` ile.

## Kod kuralları

- Biçim yardımcıları:
  - Para: `eur` / `eurc`.
  - Tarih: `fmt`.
  - Yüzde: `gPct`, `pctEk`.
  - Küçük harf: `low()`.
  - Ondalık giriş: `rnum()`. `num()` noktayı binlik ayırıcı sayar.
- Kullanıcıdan gelen her metin `esc()` ile basılır.
- `render()` açık formları korur. Yeni bir form eklendiğinde koruma listesine de eklenir.
- Her değişiklik 390 px telefon genişliğinde ve gece modunda da çalışmalı. Sayfa yatay taşmamalı.
- Telefonda (≤ 600 px) yazılar, masaüstü ve telefon kurallarının verdiği boyuttan **2 px küçük** gösterilir.
  - Bunu `style.css` sonundaki "TELEFON PUNTOSU" bloğu sağlar; blok elle düzenlenmez.
  - Yeni bir `font-size` eklenince blok `node tests/punto.js` ile yeniden üretilir. Test, blok güncel değilse başarısız olur.

## Test

```bash
node tests/e2e.js
```

- Playwright; bellek içi `tests/mockdb.js` + `tests/fixture.js`.
- Excel testi için `XLSX_LIB=<yol>` verilir.
- Her PR'da ve `main`'e her push'ta GitHub Actions (`.github/workflows/e2e.yml`) aynı testleri Excel testiyle birlikte çalıştırır; ekran görüntüleri iş akışının çıktısı olarak indirilir.
- Yardımcılar: `open(browser, {admin, role, user, seed})`, `goAdm`, `goList`, `doc`.
- Her yeni davranışa test eklenir.
- Hata düzeltilirken önce eski kodda başarısız olan test yazılır.
- Tüm testler geçmeden birleştirme yapılmaz.
- Arayüz değişince `tests/screens/` görüntülerine bakılır.

## Çalışma şekli

- Değişiklik PR ile `main`'e birleştirilir. PR açıklaması özet ve test sonucunu içerir.
- Tüm testler geçince PR, kullanıcıdan onay beklenmeden GitHub'da `main`'e birleştirilir (kullanıcının kalıcı talimatı).
- Her işin sonunda kullanıcıya kısa bir Türkçe özet verilir:
  - ne değişti ve canlıda nasıl görünür;
  - PR bağlantısı ve test sayısı;
  - Ctrl+F5 hatırlatması.
- Canlı sayılar Supabase'den SQL ile doğrulanır; tahmin yazılmaz.
- Repoya müşteri verisi (Excel, CSV) ve gizli anahtar konmaz.
- Yazma işlemleri yalnız izni olan role açıktır:
  - hedef, durum, ayar, izin, içe aktarma;
  - varsayılan olarak yalnız Yönetici.
