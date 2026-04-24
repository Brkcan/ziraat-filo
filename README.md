# Ziraat Filo Finans

PDF kapsamına göre hazırlanmış kurulumsuz MVP web uygulaması.

## Çalıştırma

```bash
python3 -m http.server 4173
```

Tarayıcıdan `http://localhost:4173` adresini açın.

## Kapsam

- Kullanıcı girişi ve rol bazlı salt okuma / işlem yetkisi
- 5 kredi türü: eşit taksitli, eşit anapara, BCH, balon ödemeli, TLREF
- Otomatik ödeme planı, faiz, BSMV ve günlük finansman yükü hesaplama
- Araç / şasi ana kartı
- Kredi-araç eşleştirme ve ağırlıklı dağıtım
- Tarih bazlı araç güncel maliyet sorgusu
- Dashboard, rapor ekranları ve CSV dışa aktarma

Veriler tarayıcı `localStorage` alanında tutulur; backend ve veritabanı eklenmeden demo/MVP doğrulaması için kullanılabilir.
