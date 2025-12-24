# GitHub'a Ekleme Kılavuzu

## Adım 1: GitHub'da Repository Oluştur

1. GitHub.com'a git ve giriş yap
2. Sağ üstteki "+" butonuna tıkla → "New repository"
3. Repository adı: `schengen-precheck-web` (veya istediğin isim)
4. Açıklama: "Almanya Schengen vizesi için belge ön kontrol uygulaması"
5. Public veya Private seç (önerilen: Private)
6. **"Initialize this repository with a README" seçme** (zaten README var)
7. "Create repository" butonuna tıkla

## Adım 2: Terminal Komutları

Aşağıdaki komutları sırayla çalıştır:

```bash
# 1. Proje dizinine git
cd ~/schengen-precheck-web

# 2. Tüm değişiklikleri ekle
git add .

# 3. Commit yap
git commit -m "Initial commit: Schengen precheck web application"

# 4. GitHub repository URL'ini ekle (KENDİ URL'İNİ KULLAN)
# Örnek: git remote add origin https://github.com/KULLANICI_ADIN/schengen-precheck-web.git
git remote add origin https://github.com/KULLANICI_ADIN/REPO_ADI.git

# 5. Main branch'i push et
git push -u origin main
```

## Adım 3: GitHub Repository URL'ini Bulma

GitHub'da oluşturduğun repository sayfasında:
- Yeşil "Code" butonuna tıkla
- HTTPS URL'ini kopyala
- Yukarıdaki komutta `git remote add origin` satırındaki URL'yi değiştir

## Alternatif: SSH Kullanımı

Eğer SSH key'in varsa:

```bash
# SSH URL ile remote ekle
git remote add origin git@github.com:KULLANICI_ADIN/REPO_ADI.git

# Push et
git push -u origin main
```

## Sorun Giderme

### "remote origin already exists" hatası:
```bash
git remote remove origin
git remote add origin https://github.com/KULLANICI_ADIN/REPO_ADI.git
```

### "Authentication failed" hatası:
- GitHub Personal Access Token kullan
- Settings → Developer settings → Personal access tokens → Generate new token
- `repo` yetkisini seç
- Token'ı şifre olarak kullan

### "Permission denied" hatası:
```bash
# SSH key kontrolü
ssh -T git@github.com

# SSH key yoksa oluştur
ssh-keygen -t ed25519 -C "email@example.com"
# Sonra GitHub'a ekle: Settings → SSH and GPG keys
```

