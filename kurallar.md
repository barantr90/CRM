# Kurallar ve İzinler

Bu dosya projenin **tek kural kaynağıdır**. Roller, izinler, ayarlar, veri yazma kuralları, hesap kuralları ve bilinen riskler burada tutulur.

- `CLAUDE.md` nasıl çalışılacağını anlatır; bu dosya **neye izin verildiğini ve sistemin nasıl davranması gerektiğini** anlatır.
- Kodla bu dosya çelişirse ikisinden biri hatalıdır: önce kullanıcıya sorulur, sonra ikisi birlikte düzeltilir.
- `tests/e2e.js` bu dosyanın güncel olup olmadığını denetler. Tablolarda her izin anahtarı, her ayar ve varsayılan değerler koddakiyle aynı olmalıdır.

Son güncelleme: 27.11.2026

---

## 1. Yeni bir özellik eklenirken izlenecek yol

Yeni görev, özellik ya da fonksiyon eklenmeden **önce**:

1. Bu dosya okunur. Özelliğin hangi kurallara dokunduğu belirlenir: izin, görünürlük, yazma, ayar ya da hesap.
2. Kullanıcıya **izin önerisi** sunulur ve onayı beklenir. Öneri şunları içerir:
   - Yeni izin gerekiyor mu, yoksa mevcut bir izin mi kullanılacak?
   - Varsayılan olarak hangi rollerde açık olacak? (Yönetici her zaman açık.)
   - Veritabanında hangi koleksiyona yazılacak, sunucu hangi koşulda reddedecek?
   - Satış temsilcisi kendi müşterileriyle sınırlı kalıyor mu?
   - Yeni eşik var mı? Varsa koda sabit yazılmaz, Yönetici ayarlarına eklenir.
3. Onaydan sonra uygulanır. İzin iki katmanda birlikte eklenir:
   - **İstemci:** `PERMS`, `PDEF`, `can()`.
   - **Veritabanı:** `has_perm()` varsayılanları ile `can_write_doc` / `can_delete_doc` ya da ilgili RPC.
4. Kural, sunucuda kullanıcı taklidiyle denenir (`begin … rollback`).
5. Bu dosya güncellenir: ilgili tablolar ve **8. Değişiklik kaydı**.
6. Test eklenir, PR açılır, testler geçince birleştirilir.

Bir ayrıntı kesin değilse varsayılan karar şudur: **yeni yazma işlemi yalnız Yönetici'ye açık**, okuma ise temsilcinin kendi müşterileriyle sınırlı.

---

## 2. Roller

Roller `allowed_users(email, role, rep)` tablosunda tanımlıdır. Listede olmayan e-posta giriş yapamaz.

| Rol | Anahtar | Not |
|---|---|---|
| Yönetici | `admin` | Bütün izinler her zaman açık; değiştirilemez. |
| Satış temsilcisi | `satis` | `rep` alanı CRM'deki temsilci adıyla aynı yazılmalıdır, örneğin "Özgür Firat". |
| Muhasebe | `muhasebe` | Temsilci adı yok. |

- **Ana yönetici** `baran.sengul@akar-group.com`. Bu adres hem `is_admin()` içinde hem `MAIN_ADMIN` sabitinde koda yazılıdır. Rolü değiştirilemez ve listeden silinemez.
- **Yalnız Yönetici yapabilir** (izin tablosundan bağımsız):
  - Kullanıcı izinleri sayfası: rollerin izinleri, kullanıcı ekleme ve silme, rol ve temsilci atama.
  - Veritabanında `allowed_users` tablosuna yazma.
  - `settings/perms` kaydına yazma.

---

## 3. İzinler

İzinler "Kullanıcı izinleri" sayfasından rol bazında değiştirilir ve `settings/perms` kaydında saklanır. Kayıtta değeri olmayan bir izin için varsayılan geçerlidir. Varsayılanlar istemcide `PDEF`, sunucuda `has_perm()` içinde tutulur ve bu ikisi **aynı olmalıdır**.

| Anahtar | İzin | Grup | Varsayılan Satış | Varsayılan Muhasebe | İstemcide | Veritabanında |
|---|---|---|---|---|---|---|
| `v_targets` | Hedefler sekmesini görür | Görüntüleme | ✓ | – | `viewOk('targets')` | Okuma herkese açık (`qtargets`) |
| `v_board` | Karne sekmesini görür | Görüntüleme | – | – | `viewOk('board')` | – (ekran) |
| `v_overdue` | Açık faturaları ve Vadesi Geçen sekmesini görür | Görüntüleme | ✓ | ✓ | `viewOk('overdue')`, kart | – (ekran) |
| `v_credit` | Kredi Limiti sekmesini görür | Görüntüleme | – | ✓ | `viewOk('credit')` | – (ekran) |
| `v_all` | Tüm temsilcilerin müşterilerini görür | Görüntüleme | – | ✓ | `repLock()` | `sees_all()`, `sees_customer()`, `my_sync()` |
| `e_notes` | Telefon ve yetkili kişi bilgisini düzenler; ziyaret kaydı ve takip | Düzenleme | ✓ | ✓ | `canNote()` | `can_write_doc`: `contacts`, `activities` |
| `e_status` | Müşteri durumunu (Aktif / Pasif) elle değiştirir | Düzenleme | – | – | durum seçimi | `can_write_doc` / `can_delete_doc`: `statusov` |
| `e_targets` | Hedefleri girer ve değiştirir | Düzenleme | – | – | Hedefler formu | `can_write_doc`: `qtargets` |
| `e_arag` | ARAG sürecini başlatır ve kapatır | Düzenleme | – | ✓ | ARAG düğmesi | `can_write_doc` / `can_delete_doc`: `arag` |
| `x_export` | Excel'e aktarır (müşteri ve satış dosyası) | Veri aktarımı | – | ✓ | menü | – (yalnız görebildiği veri) |
| `x_import` | Excel'den müşteri içe aktarır | Veri aktarımı | – | – | menü | `can_write_doc` / `can_delete_doc`: `customers`, `activities` |
| `x_sales` | Satış verisini içe aktarır (`v_all` de gerekir) | Veri aktarımı | – | – | menü | `import_sales()` RPC |
| `x_openinv` | Açık faturaları içe aktarır | Veri aktarımı | – | ✓ | menü | `can_write_doc`: `sync/openinv` |
| `e_rules` | Yönetici ayarlarını görür ve değiştirir | Yönetim | – | – | `viewOk('admin')` | `can_write_doc`: `settings/rules` |

**27.11.2026 canlı durum.** Kayıtlı izinler varsayılandan farklıdır; güncel hâli her zaman "Kullanıcı izinleri" sayfasındadır.

- **Satış:** `v_targets`, `v_board`, `v_overdue`, `e_notes` açık; diğerleri kapalı.
- **Muhasebe:** `v_all`, `v_board`, `v_targets`, `v_overdue`, `v_credit`, `e_notes`, `e_status`, `e_arag` açık. `x_export` ve `x_openinv` kapatılmış. `x_sales` kayıtta yok, bu yüzden varsayılan (kapalı) geçerli.

---

## 4. Görünürlük ve veri yazma

### Görünürlük
- **`v_all` izni olmayan kullanıcı** yalnız `rep` alanı kendi adı olan müşterileri görür. Bu kural sunucuda uygulanır; başka temsilcinin verisi tarayıcıya hiç gönderilmez.
  - `customers`: kendi müşterileri.
  - `contacts`, `statusov`, `arag`, `activities`: `sees_customer()` ile, yalnız kendi müşterilerine ait olanlar.
  - `sync/*` (aylık satış, iade, açık faturalar): `my_sync()` yalnız kendi müşterilerinin satırlarını döndürür.
- **Herkese açık okumalar** (listedeki her kullanıcı): `settings` ve `qtargets`. Hedefler bilerek tüm ekibe açıktır.
- **CRM'de olmayan müşteri kodları** (açık faturada var, müşteri listesinde yok) yalnız `v_all` izni olana gösterilir.

### Yazma (`docs` tablosu, RLS)

| Koleksiyon / kayıt | Yazma | Silme | Ek koşul |
|---|---|---|---|
| `customers` | `x_import` | `x_import` | `v_all` yoksa yalnız kendi müşterisi |
| `contacts` | `e_notes` | – | kendi müşterisi |
| `activities` | `e_notes` | `x_import` | kendi müşterisi |
| `statusov` | `e_status` | `e_status` | kendi müşterisi |
| `arag` | `e_arag` | `e_arag` | kendi müşterisi |
| `qtargets` | `e_targets` | – | – |
| `settings/rules` | `e_rules` | – | – |
| `settings/perms` | Yönetici | – | – |
| `sync/openinv` | `x_openinv` | – | – |
| `sync/month`, `sync/returns` | yalnız `import_sales()` RPC'si (ya da Yönetici) | – | RPC: `x_sales` + `v_all` |
| `allowed_users` (tablo) | Yönetici | Yönetici | – |

- Yönetici bütün koleksiyonlara yazabilir.
- `import_sales()` (SECURITY DEFINER) şunları uygular:
  - Müşteri kaydında yalnız `sales2026`, `invoices2026`, `lastInvoice` ve `lastInvoiceNo` alanlarına yazar.
  - Hedeflerde yalnız gerçekleşen (`a`) ve rakam tarihini (`asOf`) değiştirir.
  - Önizleme açıldıktan sonra veri değiştiyse `stale` hatasıyla reddeder.
  - `anon` rolü bu fonksiyonu çalıştıramaz.

---

## 5. Yönetici ayarları (eşikler)

Eşikler koda sabit yazılmaz. Her eşik `RDEF` (varsayılan) ve `RULES` (ad, birim, alt-üst sınır) listesindedir. Değeri Yönetici ayarlarından değiştirilir ve `settings/rules` kaydında saklanır. Ayarın etkisini gösteren metin `ruleImpact()` ile üretilir.

| Anahtar | Ayar | Birim | Aralık | Varsayılan | Canlı (27.11.2026) | Grup |
|---|---|---|---|---|---|---|
| `pasif` | Pasif gün sınırı | gün | 7–730 | 120 | 120 | Durum ve temas |
| `temas` | Temas günü | gün | 1–365 | 30 | 35 | Durum ve temas |
| `arag` | ARAG süreç günü | gün | 1–365 | 30 | 21 | Açık faturalar |
| `credDays` | Kredi limiti: ek gün | gün | 1–180 | 15 | 15 | Kredi limiti |
| `credCut` | Kredi limiti: gecikme kesintisi | % | 1–100 | 50 | 50 | Kredi limiti |
| `iade` | İade uyarı eşiği | % | 0,1–50 | 2.5 | 2.5 | İade |
| `riskPace` | Kayıp riski: ciro temposu | % | 10–100 | 70 | 20 | Kayıp riski |
| `dropMin` | Ciro temposu: en az geçen yıl cirosu | € | 0–10.000.000 | 3000 | 3000 | Kayıp riski |
| `riskSilent` | Kayıp riski: faturasız gün | gün | 7–365 | 45 | 35 | Kayıp riski |
| `silentMax` | Faturasız gün: en fazla | gün | 30–3650 | 365 | 365 | Kayıp riski |
| `silentMin` | Faturasız gün: en az yıllık ciro | € | 0–10.000.000 | 1000 | 1000 | Kayıp riski |

`silentMax` değeri `riskSilent` değerinden büyük olmalıdır; form bunu denetler.

---

## 6. Hesap ve iş kuralları

- **Tek fonksiyon kuralı:** bir rakam birden çok yerde görünüyorsa (kart, liste, Karne, Excel) tek bir fonksiyondan hesaplanır.

  | Fonksiyon | Hesapladığı |
  |---|---|
  | `autoSt` | otomatik durum |
  | `riskCalc` / `riskOf` | kayıp riski |
  | `retOf` | iade oranı |
  | `oiOf` | açık faturalar |
  | `credRec` | önerilen kredi limiti |
  | `tgtMap` | aylık hedef |
  | `tempoOf` | tempo |

- **Tempo** = `sales2026 / (ciro2025 × YF) − 1`.
  - `YF`: verinin tarihine göre yılın geçen kısmı (`dataTo()`).
  - Yıl etiketleri `CY` / `PY` ile dinamiktir.
  - Geçen yıl cirosu olmayan müşteride tempo hesaplanmaz.
- **Durum önceliği:** elle (`statusov`) > Excel (`statusManual`) > otomatik. Otomatik durum: son satış faturası `pasif` günden eskiyse ya da hiç fatura yoksa **Pasif**.
- **Kayıp riski:** yalnız aktif müşteriler için, iki kuraldan biri yeterlidir.
  - Ciro temposu `riskPace`'in altında ve geçen yıl cirosu ≥ `dropMin`.
  - `riskSilent` ile `silentMax` arasında gündür fatura yok ve yıllık ciro ≥ `silentMin`.
- **İade oranı:** |iade| / aynı dönemdeki satış faturaları. `iade` eşiğini aşan müşteri kırmızı gösterilir.
- **Açık faturalar:** vadesi geçen = kalanı pozitif ve vadesi geçmiş kalemler. İade ve fiyat farkı alacakları ayrı tutulur. Net bakiye = tüm kalanlar.
- **ARAG:** en eski vadesi geçen faturası `arag` günü aşan müşteride başlatılabilir.
- **Kredi önerisi** = aylık ortalama satış × (vade + `credDays`) ÷ 30, € 500'e yukarı yuvarlanır.
  - Gecikme `arag` günü aşıyorsa öneri `credCut` oranında düşürülür.
  - ARAG süreci aktifse öneri 0 olur.
  - Vadesi bilinmeyen müşteride 30 gün alınır.

---

## 7. Veri akışı ve içe aktarma kontrolleri

Tüm içe aktarmalar önce **önizleme** gösterir; kullanıcı "Uygula" demeden hiçbir şey yazılmaz.

### Müşterileri içe aktar (`x_import`)
- **Dosya:** `CRM_Musteriler` Excel'i, "Müşteriler" sayfası.
- **Eşleştirme:** Kod ile; numaralardaki baştaki sıfırlar atılır.
- **Okunan sütunlar:** yalnız müşteri bilgisi (`COLS`).
- **Okunmayan sütunlar:** Durum ve satış sütunları.
- **Yazma:** yalnız değişen alanlar yazılır. Dosyada olmayan sütun değişmez; dolu sütundaki boş hücre o bilgiyi siler.
- **⚠ Excel'de olmayan müşteriler, ziyaret ve notlarıyla birlikte kalıcı olarak silinir.** Önizlemede kırmızı uyarıyla gösterilir ve düğmenin adı "Uygula ve sil" olur.

### Satış verisini içe aktar (`x_sales` + `v_all`)
- **İki dosya birlikte seçilir:**
  - günlük satış (Daily sell-out, belge bazında);
  - detaylı satış raporu (ürün bazında, Power BI).
- **Yüklemeyi engelleyen kontroller:**
  - iki dosya yok;
  - farklı ay ya da dosyada birden çok ay;
  - sistemdekinden eski veri;
  - başka yıl;
  - tanınmayan belge türü ya da kategori;
  - herhangi bir müşterinin toplamı iki dosyada 1 €'dan fazla farklı.
- **Önizlemedeki uyarılar:**
  - CRM'de olmayan kodlar;
  - bu ay satışı kaybolan müşteriler;
  - bu ay satışı olmayan temsilciler (gerçekleşenleri 0 olur).
- **Yazılanlar:** `sync/month`, `sync/returns`, müşterilerin yıl toplamları ve hedef gerçekleşenleri. Hepsi tek işlemde yazılır.
- **Hesap:** aynı ay yeniden yüklenince eski ay çıkarılıp yenisi eklenir. Aynı dosyalar iki kez yüklenirse sonuç değişmez.

### Açık faturaları içe aktar (`x_openinv`)
- **Dosya:** ERP "Export" dosyası.
- **Zorunlu sütunlar:** Müsteri Kodu, Fatura No, Rest Offen, Faelligkeit.
- **Yazma:** `sync/openinv` kaydı tümüyle değiştirilir.
- **Kontrol:** CRM'de olmayan kodlar onay penceresinde tutarlarıyla listelenir.

### Excel'e aktar (`x_export`)
- `CRM_Musteriler_<tarih>.xlsx`: yalnız müşteri bilgisi, formül yok.
- `CRM_Satis_<tarih>.xlsx`: satış verisi ve Tempo; Kod ile eşleşir. Yalnız kontrol amaçlıdır, içe aktarılmaz.

### Veri kuralları
- Repoya müşteri verisi (Excel, CSV) ve gizli anahtar konmaz.
- Canlı sayılar Supabase'den SQL ile doğrulanır; tahmin yazılmaz.
- Elle SQL ile veri düzeltmesi yapıldıysa önce eski hâlin bir kopyası alınır (ör. kişisel geçici klasöre), sonra sonuç dosyayla karşılaştırılarak doğrulanır.

---

## 8. Arayüz ve kod kuralları

- **Dil:** arayüz, kod yorumları, commit ve PR metinleri Türkçe.
- **Ekran:**
  - Her ekran 390 px telefon genişliğinde ve gece modunda çalışır; sayfa yatay taşmaz.
  - Telefonda yazılar 2 px küçüktür ("TELEFON PUNTOSU" bloğu, `node tests/punto.js`).
- **Güvenlik:**
  - Kullanıcıdan gelen her metin `esc()` ile basılır.
  - Kaydedilmemiş değişiklik varken sayfadan çıkılırsa uyarı verilir.
  - `render()` açık formları korur; yeni form koruma listesine eklenir.
- **Biçim yardımcıları:**
  - para: `eur` / `eurc`;
  - tarih: `fmt`;
  - yüzde: `gPct` / `pctEk`;
  - ondalık giriş: `rnum`.

---

## 9. Bilinen riskler ve açık konular

| Konu | Durum |
|---|---|
| Müşteri içe aktarma, dosyada olmayan müşterileri siliyor. | Bilerek böyle; önizlemede uyarılıyor. İstenirse "silme yerine uyar" yapılabilir. |
| Telefon ve yetkili hem karttan hem Excel'den yazılabiliyor; daha yeni tarihli kayıt geçerli. | Eski bir Excel geç yüklenirse karttaki yeni bilgiyi ezebilir. |
| Ana yönetici e-postası koda yazılı (`is_admin()`, `MAIN_ADMIN`). | Değişirse iki yer birlikte güncellenmeli. |
| Alan adları yıla bağlı (`sales2026`, `ciro2025`). | Yıl sonunda yeni yıla geçiş ayrıca yapılacak; satış içe aktarma başka yılın dosyasını reddeder. |
| Açık fatura dosyasında olup CRM'de olmayan kodlar | Vadesi Geçen sekmesinde ayrı listede gösteriliyor. |

---

## 10. Değişiklik kaydı

Her yeni özellik buraya, izin kararıyla birlikte eklenir.

| Tarih | Özellik | İzin kararı | Onay |
|---|---|---|---|
| 27.11.2026 | Satış verisini içe aktar (iki dosya) | Yeni `x_sales`, ayrıca `v_all` gerekir; varsayılan yalnız Yönetici. Yazma `import_sales()` RPC'siyle. | Bu dosyanın oluşturulmasından önce eklendi; kullanıcıya bildirildi. |
| 27.11.2026 | Excel ayrımı: müşteri ve satış dosyaları | Mevcut `x_export` / `x_import`; yeni izin yok. | Kullanıcı isteği. |
| 27.11.2026 | Merch ve Dizim bilgisi | Mevcut `x_import` (yazma); kartta herkes görür. | Kullanıcı isteği. |
| 27.11.2026 | CRM'de olmayan müşteri kodları listesi | Yalnız `v_all` izni olan görür. | Kullanıcı seçimi. |
