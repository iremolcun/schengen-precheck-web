from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any, Tuple, Optional
import time
import re
import io
from datetime import datetime, timedelta

import fitz  # PyMuPDF
from PIL import Image, ImageOps, ImageEnhance
import pytesseract

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------
# KVKK-safe limits
# ----------------------------
MAX_FILE_MB = 10
ALLOWED_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/webp"}
MAX_PDF_PAGES = 6
OCR_DPI = 300

# Belge türü tespiti: güven eşiği (düşürüldü - daha hassas algılama için)
CONFIDENCE_THRESHOLD = 2

# ----------------------------
# Helpers
# ----------------------------
def _mb(n: int) -> float:
    return n / (1024 * 1024)

def _safe_meta(f: UploadFile, size_mb: float) -> Dict[str, Any]:
    return {
        "filename": f.filename,
        "content_type": (f.content_type or "").lower(),
        "size_mb": round(size_mb, 2),
    }

def normalize_text(t: str) -> str:
    t = t.replace("\x00", " ")
    t = t.replace("\r", "\n")
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()

# ----------------------------
# OCR (RAM only)
# ----------------------------
def ocr_image_bytes(img_bytes: bytes, lang: str = "eng") -> str:
    """
    İyileştirilmiş OCR - pasaport ve belgeler için daha iyi sonuç
    """
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")

    # Preprocess (pasaport/MRZ için kritik)
    gray = ImageOps.grayscale(img)
    
    # Daha iyi kontrast ayarı (artırıldı)
    gray = ImageEnhance.Contrast(gray).enhance(3.0)
    gray = ImageEnhance.Sharpness(gray).enhance(2.5)
    gray = ImageEnhance.Brightness(gray).enhance(1.1)
    
    # Daha esnek threshold (140 yerine 130 - daha hassas)
    gray = gray.point(lambda x: 0 if x < 130 else 255, "1")

    # Pasaport için özel PSM modu (tek blok uniform text)
    # PSM 6: tek uniform text bloğu (pasaport sayfası için ideal)
    # PSM 11: sparse text (MRZ için daha iyi)
    # PSM 3: otomatik sayfa segmentasyonu (daha genel)
    config1 = "--oem 3 --psm 6"
    text1 = pytesseract.image_to_string(gray, lang=lang, config=config1)
    
    # MRZ için alternatif PSM denemesi
    config2 = "--oem 3 --psm 11"
    text2 = pytesseract.image_to_string(gray, lang=lang, config=config2)
    
    # Otomatik segmentasyon denemesi
    config3 = "--oem 3 --psm 3"
    text3 = pytesseract.image_to_string(gray, lang=lang, config=config3)
    
    # Üç sonucu birleştir (daha fazla metin yakalama)
    return text1 + "\n" + text2 + "\n" + text3

def ocr_pdf_bytes(pdf_bytes: bytes, max_pages: int = MAX_PDF_PAGES):
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = min(len(doc), max_pages)

    page_texts = []

    for i in range(pages):
        page = doc[i]
        pix = page.get_pixmap(dpi=OCR_DPI)
        img_bytes = pix.tobytes("png")

        # 1) Full page OCR - İngilizce + Türkçe (Türk pasaportları için)
        text_full_eng = ocr_image_bytes(img_bytes, lang="eng")
        try:
            text_full_tur = ocr_image_bytes(img_bytes, lang="tur")
        except:
            text_full_tur = ""
        
        text_full = text_full_eng + "\n" + text_full_tur

        # 2) MRZ için alt bant OCR (pasaport yakalama oranını çok artırır)
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        w, h = img.size
        
        # Alt %40'ı al (daha geniş MRZ bölgesi)
        mrz_crop = img.crop((0, int(h * 0.60), w, h))
        
        # MRZ için özel preprocessing
        mrz_gray = ImageOps.grayscale(mrz_crop)
        mrz_gray = ImageEnhance.Contrast(mrz_gray).enhance(3.0)
        mrz_gray = ImageEnhance.Sharpness(mrz_gray).enhance(3.0)
        mrz_gray = mrz_gray.point(lambda x: 0 if x < 120 else 255, "1")  # Daha düşük threshold MRZ için

        buf = io.BytesIO()
        mrz_gray.save(buf, format="PNG")
        
        # MRZ için özel PSM modu
        mrz_img = Image.open(io.BytesIO(buf.getvalue()))
        mrz_config = "--oem 3 --psm 11"  # Sparse text için
        text_mrz = pytesseract.image_to_string(mrz_img, lang="eng", config=mrz_config)

        text = text_full + "\n" + text_mrz

        page_texts.append({
            "page": i + 1,
            "text": text
        })

        del img_bytes

    doc.close()
    return page_texts, pages

def extract_text_kvkk_safe(file_bytes: bytes, content_type: str) -> Dict[str, Any]:
    """
    KVKK-safe: bytes ve ham OCR text sadece RAM içinde.
    Disk'e yazma yok.
    """
    if content_type == "application/pdf":
        page_list, pages = ocr_pdf_bytes(file_bytes)
        joined_text = "\n".join([p["text"] for p in page_list])
        return {
            "text": joined_text,              # GERİYE UYUMLULUK için
            "pages_processed": pages,
            "pages": page_list                # ✅ page-level
        }
    else:
        # Görüntü için de multi-language OCR
        text_eng = ocr_image_bytes(file_bytes, lang="eng")
        try:
            text_tur = ocr_image_bytes(file_bytes, lang="tur")
        except:
            text_tur = ""
        
        text = text_eng + "\n" + text_tur
        
        return {
            "text": text,                     # GERİYE UYUMLULUK için
            "pages_processed": 1,
            "pages": [{"page": 1, "text": text}]
        }


# ----------------------------
# 0) Belge rol modeli (ürün davranışı)
# ----------------------------
DOC_ROLE: Dict[str, str] = {
    # CORE (kural motoru gerçek risk üretebilir)
    "passport": "CORE_REQUIRED",
    "bank_statement": "CORE_REQUIRED",
    "travel_insurance": "CORE_REQUIRED",
    "flight_reservation": "CORE_REQUIRED",
    "accommodation": "CORE_REQUIRED",
    "application_form": "CORE_REQUIRED",

    # SUPPORTING (kural yok, sadece açıklama)
    "invitation_letter": "SUPPORTING_OPTIONAL",
    "sponsorship_letter": "SUPPORTING_OPTIONAL",
    "sponsor_bank_statement": "SUPPORTING_OPTIONAL",
    "sponsor_id_document": "SUPPORTING_OPTIONAL",
    "employer_letter": "SUPPORTING_OPTIONAL",
    "salary_slip": "SUPPORTING_OPTIONAL",
    "sgk_statement": "SUPPORTING_OPTIONAL",
    "student_certificate": "SUPPORTING_OPTIONAL",
    "transcript": "SUPPORTING_OPTIONAL",
    "residence_permit": "SUPPORTING_OPTIONAL",
    "marriage_certificate": "SUPPORTING_OPTIONAL",
    "family_registry": "SUPPORTING_OPTIONAL",

    # OTHER
    "irrelevant_document": "IRRELEVANT",
    "unknown": "IRRELEVANT",
}

# ----------------------------
# 1) Belge türü tespiti (heuristic, LLM yok)
# ----------------------------
DOC_TYPES = [
    # CORE
    "passport",
    "bank_statement",
    "travel_insurance",
    "flight_reservation",
    "accommodation",
    "application_form",

    # SUPPORTING
    "invitation_letter",
    "sponsorship_letter",
    "sponsor_bank_statement",
    "sponsor_id_document",
    "employer_letter",
    "salary_slip",
    "sgk_statement",
    "student_certificate",
    "transcript",
    "residence_permit",
    "marriage_certificate",
    "family_registry",

    # OTHER
    "irrelevant_document",
    "unknown",
]

def detect_doc_type(text: str) -> str:
    """
    Basit anahtar kelime skorlaması.

    Kritik davranış:
    - max_score == 0 => unknown
    - max_score < CONFIDENCE_THRESHOLD => irrelevant_document
    """
    t = normalize_text(text).lower()

    # unknown/irrelevant skorlanmaz
    scores: Dict[str, int] = {k: 0 for k in DOC_TYPES if k not in ("unknown", "irrelevant_document")}

    # ----------------------------
    # CORE
    # ----------------------------

    # Pasaport - İYİLEŞTİRİLMİŞ ALGILAMA
    passport_keywords = [
        # İngilizce
        "passport", "passport no", "passport number", "passport nr",
        "nationality", "nationality code",
        "birth", "date of birth", "birth date", "born",
        "surname", "family name", "last name",
        "given name", "first name", "name",
        "document no", "document number", "doc no", "doc number",
        "date of issue", "date of expiry", "expiry date", "expires",
        "issue date", "issued", "expiry", "expire",
        "place of birth", "birth place",
        "sex", "gender", "male", "female",
        "authority", "issuing authority",
        "type", "type/p", "type p",
        "republic of turkey", "türkiye cumhuriyeti",
        # Türkçe
        "pasaport", "pasaport no", "pasaport numarası",
        "doğum", "doğum tarihi", "doğum yeri",
        "soyadı", "soy isim",
        "isim", "adı", "ad soyad",
        "belge no", "belge numarası",
        "veriliş tarihi", "veriliş",
        "son geçerlilik", "geçerlilik tarihi",
        "cinsiyet", "erkek", "kadın",
        "veren makam", "makam",
        "türkiye", "türk",
    ]
    
    for kw in passport_keywords:
        if kw in t:
            scores["passport"] += 2
    
    # MRZ Pattern Detection - İYİLEŞTİRİLMİŞ
    tu = t.upper()
    
    # MRZ pattern'leri (çok daha kapsamlı)
    mrz_patterns = [
        r"P<[A-Z<]{2,}",  # P<TUR, P<USA, etc.
        r"P<[A-Z]{3}[A-Z0-9<]{20,}",  # Pasaport MRZ başlangıcı
        r"[A-Z0-9<]{30,}",  # Uzun MRZ satırı
        r"<{5,}",  # Çok sayıda < karakteri (MRZ'de yaygın)
        r"[A-Z]{3}[0-9]{6}[0-9][A-Z0-9]{3}[0-9]{11}[0-9]",  # MRZ formatı
    ]
    
    mrz_score = 0
    for pattern in mrz_patterns:
        if re.search(pattern, tu):
            mrz_score += 5
    
    if mrz_score > 0:
        scores["passport"] += mrz_score
    
    # Ek pattern'ler
    if "MRZ" in tu:
        scores["passport"] += 10
    
    # Türk pasaportu için özel pattern'ler
    if re.search(r"TUR[0-9]{6}", tu) or re.search(r"TURKEY", tu) or re.search(r"TÜRKİYE", tu):
        scores["passport"] += 5
    
    # Pasaport numarası pattern'i (genellikle 6-9 haneli)
    if re.search(r"\b[0-9]{6,9}\b", t) and ("passport" in t or "pasaport" in t):
        scores["passport"] += 3


    # Banka dökümü
    for kw in [
        "account statement", "statement", "ekstre", "banka",
        "iban", "swift", "hesap özeti", "balance", "bakiye",
        "available", "account", "transactions", "transaction",
        "debit", "credit", "opening balance", "closing balance"
    ]:
        if kw in t:
            scores["bank_statement"] += 2
    if re.search(r"\btr\d{2}\b", t):
        scores["bank_statement"] += 2

    # Seyahat sigortası
    for kw in [
        "insurance", "sigorta", "policy", "poliçe", "coverage", "kapsam",
        "medical expenses", "emergency", "schengen",
        "30,000", "30000", "30.000", "30 000", "eur", "euro"
    ]:
        if kw in t:
            scores["travel_insurance"] += 2

    # Uçuş rezervasyonu
    for kw in [
        "itinerary", "flight", "pnr", "e-ticket", "boarding",
        "departure", "arrival", "uçuş", "rezervasyon", "bilet",
        "thy", "pegasus", "lufthansa", "airlines", "ticket number"
    ]:
        if kw in t:
            scores["flight_reservation"] += 2

    # Konaklama
    for kw in [
        "hotel", "reservation", "booking", "check-in", "check out", "check-out",
        "guest", "accommodation", "konaklama", "oda", "gece",
        "airbnb", "host", "property", "nights"
    ]:
        if kw in t:
            scores["accommodation"] += 2

    # Başvuru formu
    for kw in [
        "application form", "visa application", "schengen visa",
        "form", "başvuru formu", "intended date", "intended",
        "number of entries", "duration of stay"
    ]:
        if kw in t:
            scores["application_form"] += 1

    # ----------------------------
    # SUPPORTING
    # ----------------------------

    # Davetiye / evde kalma
    for kw in [
        "invitation", "invited", "davet", "davet mektubu", "invitation letter",
        "hosting", "host", "i will host", "will host",
        "evimde kal", "evimde konaklayacak", "konaklamasını sağlayacağım",
        "address", "adres", "signature", "imza"
    ]:
        if kw in t:
            scores["invitation_letter"] += 2

    # Sponsor dilekçesi
    for kw in [
        "sponsor", "sponsorship", "financial support",
        "will cover expenses", "cover the expenses", "all expenses",
        "masraflarını karşılayacağım", "tüm masraflarını", "finansal destek"
    ]:
        if kw in t:
            scores["sponsorship_letter"] += 2

    # Sponsor banka dökümü
    for kw in ["sponsor bank", "sponsor's bank", "sponsor banka", "guarantor", "guarantee"]:
        if kw in t:
            scores["sponsor_bank_statement"] += 2

    # Sponsor kimlik/pasaport fotokopisi
    for kw in ["copy of id", "id card", "identity card", "kimlik fotokopisi", "nüfus cüzdanı", "passport copy"]:
        if kw in t:
            scores["sponsor_id_document"] += 2

    # İşveren yazısı / izin yazısı
    for kw in [
        "employer", "işveren", "company letter", "employment letter",
        "izin verilmiştir", "paid leave", "unpaid leave", "leave granted",
        "position", "department", "start date", "salary"
    ]:
        if kw in t:
            scores["employer_letter"] += 2

    # Maaş bordrosu
    for kw in ["pay slip", "payslip", "salary slip", "bordro", "maaş bordrosu", "net pay", "gross pay"]:
        if kw in t:
            scores["salary_slip"] += 2

    # SGK dökümü
    for kw in ["sgk", "4a", "hizmet dökümü", "service breakdown", "sigortalılık", "prim"]:
        if kw in t:
            scores["sgk_statement"] += 2

    # Öğrenci belgesi
    for kw in ["student certificate", "öğrenci belgesi", "enrolled", "enrollment", "öğrencidir", "faculty", "department"]:
        if kw in t:
            scores["student_certificate"] += 2

    # Transkript
    for kw in ["transcript", "gpa", "grade point", "not ortalaması", "ders", "course", "credits", "ects"]:
        if kw in t:
            scores["transcript"] += 2

    # Oturum izni
    for kw in ["residence permit", "oturum izni", "ikamet izni", "residence card"]:
        if kw in t:
            scores["residence_permit"] += 2

    # Evlilik belgesi
    for kw in ["marriage certificate", "evlilik cüzdanı", "evlenme kayıt", "marriage registration"]:
        if kw in t:
            scores["marriage_certificate"] += 2

    # Nüfus kayıt örneği
    for kw in ["family registry", "nüfus kayıt örneği", "vukuatlı", "population registry"]:
        if kw in t:
            scores["family_registry"] += 2

    best = max(scores, key=scores.get)
    max_score = scores[best]

    if max_score == 0:
        return "unknown"

    if max_score < CONFIDENCE_THRESHOLD:
        return "irrelevant_document"

    return best

# ----------------------------
# 2) Belgeye özel alan çıkarımı (KVKK-safe)
# ----------------------------
DATE_PATTERNS = [
    r"\b(\d{2}[./-]\d{2}[./-]\d{4})\b",
    r"\b(\d{4}[./-]\d{2}[./-]\d{2})\b",
    r"\b(\d{1,2}[./-]\d{1,2}[./-]\d{4})\b",  # Tek haneli gün/ay
    r"\b(\d{2}[./-]\d{2}[./-]\d{2})\b",  # 2 haneli yıl
    r"\b(\d{4}[./-]\d{1,2}[./-]\d{1,2})\b",  # YYYY-MM-DD tek haneli
    r"(\d{2}\.\d{2}\.\d{4})",  # Nokta ile (boşluk olmadan)
    r"(\d{2}/\d{2}/\d{4})",  # Slash ile (boşluk olmadan)
    r"(\d{2}-\d{2}-\d{4})",  # Tire ile (boşluk olmadan)
    r"(\d{4}\.\d{2}\.\d{2})",  # YYYY.MM.DD
    r"(\d{4}/\d{2}/\d{2})",  # YYYY/MM/DD
    r"(\d{4}-\d{2}-\d{2})",  # YYYY-MM-DD
    r"(\d{1,2}\.\d{1,2}\.\d{4})",  # Tek haneli
    r"(\d{1,2}/\d{1,2}/\d{4})",
    r"(\d{1,2}-\d{1,2}-\d{4})",
    r"(\d{8})",  # YYYYMMDD (boşluksuz, 8 haneli)
    r"(\d{6})",  # YYMMDD (boşluksuz, 6 haneli)
    # Ay isimli formatlar
    r"(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\s+\d{4})",
    r"(\d{4}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\s+\d{1,2})",
]

def parse_date(s: str) -> Optional[datetime]:
    s = s.strip()
    
    # Önce sayısal formatlar
    formats = [
        "%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y",
        "%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d",
        "%d.%m.%y", "%d/%m/%y", "%d-%m-%y",  # 2 haneli yıl
        "%y-%m-%d", "%y/%m/%d", "%y.%m.%d",
        "%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y",
        "%Y.%m.%d", "%Y/%m/%d", "%Y-%m-%d",
        "%d.%m.%y", "%d/%m/%y", "%d-%m-%y",
        "%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(s, fmt)
            # 2 haneli yıl için 1900-2099 arası varsay
            if dt.year < 100:
                if dt.year < 50:
                    dt = dt.replace(year=2000 + dt.year)
                else:
                    dt = dt.replace(year=1900 + dt.year)
            return dt
        except ValueError:
            continue
    
    # Ay isimli formatlar (İngilizce)
    month_names_en = {
        "jan": "01", "feb": "02", "mar": "03", "apr": "04",
        "may": "05", "jun": "06", "jul": "07", "aug": "08",
        "sep": "09", "oct": "10", "nov": "11", "dec": "12",
        "january": "01", "february": "02", "march": "03", "april": "04",
        "june": "06", "july": "07", "august": "08", "september": "09",
        "october": "10", "november": "11", "december": "12"
    }
    
    # Türkçe ay isimleri
    month_names_tr = {
        "ocak": "01", "şubat": "02", "mart": "03", "nisan": "04",
        "mayıs": "05", "haziran": "06", "temmuz": "07", "ağustos": "08",
        "eylül": "09", "ekim": "10", "kasım": "11", "aralık": "12"
    }
    
    s_lower = s.lower()
    
    # Pattern: DD MMM YYYY veya DD MMMM YYYY
    for month_name, month_num in {**month_names_en, **month_names_tr}.items():
        pattern = r"(\d{1,2})\s+" + re.escape(month_name) + r"\s+(\d{4})"
        match = re.search(pattern, s_lower, re.IGNORECASE)
        if match:
            try:
                day = int(match.group(1))
                year = int(match.group(2))
                if 1 <= day <= 31 and 1900 <= year <= 2100:
                    return datetime(year, int(month_num), day)
            except (ValueError, IndexError):
                continue
        
        # Pattern: YYYY MMM DD
        pattern = r"(\d{4})\s+" + re.escape(month_name) + r"\s+(\d{1,2})"
        match = re.search(pattern, s_lower, re.IGNORECASE)
        if match:
            try:
                year = int(match.group(1))
                day = int(match.group(2))
                if 1 <= day <= 31 and 1900 <= year <= 2100:
                    return datetime(year, int(month_num), day)
            except (ValueError, IndexError):
                continue
    
    return None

def extract_dates(text: str, limit: int = 20) -> List[datetime]:
    t = normalize_text(text)
    found: List[datetime] = []
    for p in DATE_PATTERNS:
        for m in re.findall(p, t):
            d = parse_date(m)
            if d:
                found.append(d)
            if len(found) >= limit:
                return found
    return found

def extract_passport_expiry_date(text: str, pages: List[Dict[str, Any]]) -> Optional[datetime]:
    """
    Pasaport için özel geçerlilik tarihi çıkarımı - ÇOK AGRESİF YAKLAŞIM.
    Keyword'lerin yanındaki tarihleri, MRZ'dan tarih ve tüm sayıları tarar.
    """
    t = normalize_text(text)
    tl = t.lower()
    tu = t.upper()
    
    # Tüm tarihleri bul (limit artırıldı)
    all_dates = extract_dates(text, limit=200)
    
    # EĞER HİÇ TARİH BULUNAMADIYSA: Tüm sayıları bul ve tarih gibi görünenleri parse et
    if not all_dates:
        # 8 haneli sayılar (YYYYMMDD veya DDMMYYYY)
        eight_digit_numbers = re.findall(r"\b(\d{8})\b", t)
        for num_str in eight_digit_numbers:
            # YYYYMMDD formatı dene
            try:
                year = int(num_str[0:4])
                month = int(num_str[4:6])
                day = int(num_str[6:8])
                if 1900 <= year <= 2100 and 1 <= month <= 12 and 1 <= day <= 31:
                    dt = datetime(year, month, day)
                    all_dates.append(dt)
            except (ValueError, IndexError):
                pass
            
            # DDMMYYYY formatı dene
            try:
                day = int(num_str[0:2])
                month = int(num_str[2:4])
                year = int(num_str[4:8])
                if 1900 <= year <= 2100 and 1 <= month <= 12 and 1 <= day <= 31:
                    dt = datetime(year, month, day)
                    all_dates.append(dt)
            except (ValueError, IndexError):
                pass
        
        # 6 haneli sayılar (YYMMDD - MRZ formatı)
        six_digit_numbers = re.findall(r"\b(\d{6})\b", t)
        for num_str in six_digit_numbers:
            try:
                year = int(num_str[0:2])
                month = int(num_str[2:4])
                day = int(num_str[4:6])
                
                # Yıl düzeltmesi
                if year < 50:
                    year = 2000 + year
                else:
                    year = 1900 + year
                
                if 1900 <= year <= 2100 and 1 <= month <= 12 and 1 <= day <= 31:
                    dt = datetime(year, month, day)
                    all_dates.append(dt)
            except (ValueError, IndexError):
                pass
    
    # Geçerlilik ile ilgili keyword'ler (genişletilmiş)
    expiry_keywords = [
        "expiry", "expires", "expire", "expiry date", "exp date",
        "date of expiry", "valid until", "valid to", "valid thru",
        "validity", "validity date", "expiration", "expiration date",
        "geçerlilik", "geçerlilik tarihi", "son geçerlilik",
        "geçerli", "geçerli tarih", "bitiş tarihi", "son geçerli",
        "exp", "exp.", "valid", "validity",
    ]
    
    # Keyword'lerin yanındaki tarihleri bul (hem önünde hem arkasında)
    expiry_candidates = []
    
    for keyword in expiry_keywords:
        # Keyword'ün ARKASINDAKİ metni al (200 karakter)
        pattern_after = re.escape(keyword) + r".{0,200}"
        matches_after = re.finditer(pattern_after, tl, re.IGNORECASE)
        for match in matches_after:
            context = match.group(0)
            for date_pattern in DATE_PATTERNS:
                date_matches = re.findall(date_pattern, context)
                for date_str in date_matches:
                    parsed = parse_date(date_str)
                    if parsed:
                        expiry_candidates.append(parsed)
        
        # Keyword'ün ÖNÜNDEKİ metni al (200 karakter) - bazı dillerde tarih önce gelebilir
        pattern_before = r".{0,200}" + re.escape(keyword)
        matches_before = re.finditer(pattern_before, tl, re.IGNORECASE)
        for match in matches_before:
            context = match.group(0)
            for date_pattern in DATE_PATTERNS:
                date_matches = re.findall(date_pattern, context)
                for date_str in date_matches:
                    parsed = parse_date(date_str)
                    if parsed:
                        expiry_candidates.append(parsed)
    
    # MRZ'dan tarih çıkar (YYMMDD formatı) - İYİLEŞTİRİLMİŞ
    # MRZ formatı: P<TUR...YYMMDD...YYMMDD (ilk doğum, ikinci geçerlilik)
    # MRZ genellikle 2 satır, her satırda bir tarih var
    mrz_lines = re.findall(r"P<[A-Z<]{2,}[A-Z0-9<]{20,}", tu)
    mrz_dates = []
    for mrz_line in mrz_lines:
        # MRZ satırından 6 haneli tarih pattern'leri bul
        mrz_date_matches = re.findall(r"(\d{6})", mrz_line)
        for mrz_date in mrz_date_matches:
            try:
                year = int(mrz_date[0:2])
                month = int(mrz_date[2:4])
                day = int(mrz_date[4:6])
                
                # Yıl düzeltmesi
                if year < 50:
                    year = 2000 + year
                else:
                    year = 1900 + year
                
                if 1 <= month <= 12 and 1 <= day <= 31:
                    mrz_dt = datetime(year, month, day)
                    mrz_dates.append(mrz_dt)
            except (ValueError, IndexError):
                continue
    
    # MRZ'dan gelen tarihleri ekle (genellikle ikinci tarih geçerlilik)
    if len(mrz_dates) >= 2:
        # İkinci tarih genellikle geçerlilik tarihi
        expiry_candidates.append(mrz_dates[1])
    elif len(mrz_dates) == 1:
        # Tek tarih varsa, gelecekteyse geçerlilik olabilir
        now = datetime.now()
        if mrz_dates[0] > now:
            expiry_candidates.append(mrz_dates[0])
    
    # Eğer keyword yanında tarih bulunduysa onu kullan
    if expiry_candidates:
        now = datetime.now()
        future_dates = [d for d in expiry_candidates if d > now]
        if future_dates:
            return max(future_dates)
        # Eğer gelecekte tarih yoksa, en büyük tarihi al
        return max(expiry_candidates)
    
    # Eğer keyword yanında tarih yoksa, tüm tarihlerden en büyüğünü al
    # (genellikle geçerlilik tarihi doğum tarihinden daha ileri)
    if all_dates:
        now = datetime.now()
        # Gelecekteki tarihleri önceliklendir
        future_dates = [d for d in all_dates if d > now]
        if future_dates:
            # En büyük gelecekteki tarih genellikle geçerlilik tarihi
            return max(future_dates)
        # Eğer gelecekte tarih yoksa, en büyük tarihi al
        # (belki pasaport eski ama hala geçerli olabilir)
        return max(all_dates)
    
    return None

def extract_amounts(text: str, limit: int = 20) -> List[float]:
    t = normalize_text(text)
    candidates = re.findall(
        r"\b(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d{2,})(?:\s?(?:eur|€|try|tl|usd|\$))?\b",
        t.lower(),
    )
    out: List[float] = []
    for c in candidates[:limit]:
        x = c
        if "," in x and "." in x:
            if x.rfind(",") > x.rfind("."):
                x = x.replace(".", "").replace(",", ".")
            else:
                x = x.replace(",", "")
        else:
            x = x.replace(",", ".")
        try:
            out.append(float(x))
        except Exception:
            pass
    return out

def extract_fields_by_type(
    doc_type: str,
    text: str,
    pages: List[Dict[str, Any]]
) -> Dict[str, Any]:

    # ----------------------------
    # PAGE-LEVEL HITS (NEW)
    # ----------------------------
    page_hits = {}

    if doc_type == "bank_statement":
        iban_pages = []

        for p in pages:
            tl_page = normalize_text(p["text"]).lower()

            has_iban_page = (
                "iban" in tl_page or
                re.search(
                    r"\btr\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{2}\b",
                    tl_page.replace(" ", "")
                )
            )

            if has_iban_page:
                iban_pages.append(p["page"])

        page_hits["iban_pages"] = iban_pages

    # ----------------------------
    # GLOBAL TEXT (OLD LOGIC)
    # ----------------------------
    t = normalize_text(text)
    tl = t.lower()

    dates = extract_dates(t)
    amounts = extract_amounts(t)

    # ----------------------------
    # BANK STATEMENT
    # ----------------------------
    if doc_type == "bank_statement":
        has_iban = bool(
            re.search(
                r"\btr\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{2}\b",
                tl.replace(" ", "")
            )
        ) or ("iban" in tl)

        return {
            "dates_found": len(dates),
            "latest_date": max(dates).date().isoformat() if dates else None,
            "has_iban_term": has_iban,
            "amounts_found": len(amounts),
            "max_amount": max(amounts) if amounts else None,
            "iban_pages": page_hits.get("iban_pages", []),
        }

    # ----------------------------
    # TRAVEL INSURANCE
    # ----------------------------
    if doc_type == "travel_insurance":
        has_schengen = "schengen" in tl
        has_30k = (
            "30000" in tl or
            "30.000" in tl or
            "30,000" in tl or
            "30 000" in tl
        )
        return {
            "dates_found": len(dates),
            "min_date": min(dates).date().isoformat() if dates else None,
            "max_date": max(dates).date().isoformat() if dates else None,
            "has_schengen_term": has_schengen,
            "has_coverage_30k": has_30k,
        }

    # ----------------------------
    # PASSPORT - İYİLEŞTİRİLMİŞ TARİH ÇIKARIMI
    # ----------------------------
    if doc_type == "passport":
        # Özel pasaport geçerlilik tarihi çıkarımı
        expiry_date = extract_passport_expiry_date(text, pages)
        
        # MRZ kontrolü için upper case
        tu = t.upper()
        
        # Debug için: OCR metninin tamamını ve bulunan tüm tarihleri ekle
        text_preview = text[:2000] if len(text) > 2000 else text  # İlk 2000 karakter
        all_dates_str = [d.date().isoformat() for d in dates[:50]]  # İlk 50 tarih
        
        # Tüm sayıları bul (debug için)
        all_numbers = re.findall(r"\b\d{4,8}\b", t)[:30]  # 4-8 haneli sayılar
        
        return {
            "dates_found": len(dates),
            "expiry_candidate": expiry_date.date().isoformat() if expiry_date else None,
            "has_mrz_signal": ("p<" in tl) or ("mrz" in tl) or re.search(r"P<[A-Z<]{2,}", tu),
            "all_dates": all_dates_str,  # Debug için
            "text_preview": text_preview,  # Debug için OCR metni
            "all_numbers": all_numbers,  # Debug için - tüm sayılar
            "text_length": len(text),  # OCR metni uzunluğu
        }

    # ----------------------------
    # FLIGHT / ACCOMMODATION / FORM
    # ----------------------------
    if doc_type in ("flight_reservation", "accommodation", "application_form"):
        return {
            "dates_found": len(dates),
            "min_date": min(dates).date().isoformat() if dates else None,
            "max_date": max(dates).date().isoformat() if dates else None,
        }

    # ----------------------------
    # SUPPORTING / UNKNOWN
    # ----------------------------
    return {
        "dates_found": len(dates),
        "amounts_found": len(amounts),
        "text_length": len(tl),
    }


# ----------------------------
# 3) Kural motoru (role bazlı)
# ----------------------------
def rule_engine(doc_type: str, fields: Dict[str, Any]) -> Dict[str, Any]:

    reasons: List[str] = []
    actions: List[str] = []
    status = "ok"

    now = datetime.now()

    def escalate(new_status: str):
        nonlocal status
        order = {"ok": 0, "warning": 1, "critical": 2}
        if order[new_status] > order[status]:
            status = new_status

    role = DOC_ROLE.get(doc_type, "IRRELEVANT")

    # ----------------------------
    # SUPPORTING
    # ----------------------------
    if role == "SUPPORTING_OPTIONAL":
        return {
            "status": "ok",
            "reasons": [
                "Yüklenen belge destekleyici niteliktedir; zorunlu belge listesinde olmayabilir."
            ],
            "actions": [
                "Durumuna göre dosyanı güçlendirebilir. Ön kontrol için zorunlu belgeleri de yükle."
            ],
        }

    # ----------------------------
    # IRRELEVANT
    # ----------------------------
    if role == "IRRELEVANT":
        return {
            "status": "ok",
            "reasons": [
                "Yüklenen belge, bu uygulamanın hedeflediği Schengen ön kontrol belgeleri kapsamında görünmüyor."
            ],
            "actions": [
                "Ön kontrol için pasaport, banka dökümü, seyahat sağlık sigortası, uçuş rezervasyonu ve konaklama belgesini yükle."
            ],
        }

    # ----------------------------
    # BANK STATEMENT
    if doc_type == "bank_statement":

    # 1️⃣ TARİH KONTROLÜ
        if not fields.get("latest_date"):
            escalate("warning")
            reasons.append("Banka dökümünde tarih tespit edilemedi.")
            actions.append("Banka dökümünü tarih kısmı net görünecek şekilde yeniden yükle.")
        else:
            try:
                latest = datetime.fromisoformat(fields["latest_date"])
                age_days = (now - latest).days
                if age_days > 30:
                    escalate("warning")
                    reasons.append(
                        f"Banka dökümü {age_days} gün önce tarihli görünüyor; güncel olmayabilir."
                    )
                    actions.append("Son 30 gün içinde alınmış banka dökümü yükle.")
            except Exception:
                escalate("warning")
                reasons.append("Banka dökümü tarih formatı okunamadı.")
                actions.append("Banka dökümünü daha net / yüksek çözünürlükte yükle.")

    # 2️⃣ PAGE-LEVEL IBAN FEEDBACK
        iban_pages = set(fields.get("iban_pages", []))
        total_pages = fields.get("pages_processed")

        if not iban_pages:
            escalate("warning")
            reasons.append("Banka dökümünde IBAN bilgisi tespit edilemedi.")
            actions.append("IBAN bilgisinin göründüğü sayfayı ekle.")


    # 3️⃣ GENEL IBAN VAR MI?
        if not fields.get("has_iban_term"):
            escalate("warning")
            reasons.append(
            "Banka dökümünün gerçekten hesap dökümü olduğu doğrulanamadı (IBAN/hesap sinyali zayıf)."
            )
            actions.append("IBAN veya hesap bilgileri görünen sayfayı da ekle.")

    
    # ----------------------------
    # TRAVEL INSURANCE
    # ----------------------------
    elif doc_type == "travel_insurance":
        if not fields.get("min_date") or not fields.get("max_date"):
            escalate("warning")
            reasons.append("Sigorta belgesinde başlangıç/bitiş tarihleri tespit edilemedi.")
            actions.append("Sigorta poliçesinin tarih aralığı görünen sayfasını yükle.")

        if not fields.get("has_coverage_30k"):
            escalate("warning")
            reasons.append("Sigortada 30.000 EUR kapsam sinyali bulunamadı (OCR kaçırmış olabilir).")
            actions.append("Kapsam tutarının göründüğü bölümü net şekilde yükle.")

        if not fields.get("has_schengen_term"):
            escalate("warning")
            reasons.append("Sigortada 'Schengen' ifadesi tespit edilemedi (belge farklı tür olabilir).")
            actions.append("Schengen seyahat sağlık sigortası belgesini yüklediğinden emin ol.")

    # ----------------------------
    # PASSPORT
    # ----------------------------
    elif doc_type == "passport":
        exp = fields.get("expiry_candidate")
        if not exp:
            escalate("critical")
            reasons.append("Pasaport geçerlilik bitiş tarihi tespit edilemedi.")
            actions.append("Pasaport kimlik sayfasını daha net/yüksek çözünürlükte yükle.")
        else:
            try:
                exp_dt = datetime.fromisoformat(exp)
                if exp_dt < now:
                    escalate("critical")
                    reasons.append("Pasaport süresi dolmuş görünüyor.")
                    actions.append("Geçerli pasaport ile başvuru yapmalısın.")
                elif exp_dt < now + timedelta(days=120):
                    escalate("warning")
                    reasons.append(
                        "Pasaport süresi yakında doluyor gibi görünüyor (Schengen için dönüşten sonra 3 ay kuralı var)."
                    )
                    actions.append("Seyahat dönüş tarihine göre pasaport geçerliliğini kontrol et.")
            except Exception:
                escalate("warning")
                reasons.append("Pasaport tarih formatı okunamadı.")
                actions.append("Pasaport sayfasını daha net yükle.")

    # ----------------------------
    # FLIGHT / ACCOMMODATION / FORM
    # ----------------------------
    elif doc_type in ("flight_reservation", "accommodation", "application_form"):
        if not fields.get("min_date") and not fields.get("max_date"):
            escalate("warning")
            reasons.append("Belgede tarih tespit edilemedi.")
            actions.append("Tarihlerin göründüğü sayfayı net şekilde yükle.")

    # ----------------------------
    # FALLBACK
    # ----------------------------
    else:
        escalate("warning")
        reasons.append("Belge türü tespit edilemedi; sadece genel kontrol yapıldı.")
        actions.append("Belgeyi daha net yükle veya doğru belge olduğundan emin ol.")

    return {
        "status": status,
        "reasons": reasons,
        "actions": actions,
    }


# 4) LLM'e sadece anonim JSON (preview)
# ----------------------------
def build_llm_payload(
    doc_type: str,
    fields: Dict[str, Any],
    rule_result: Dict[str, Any]
) -> Dict[str, Any]:
    return {
        "doc_type": doc_type,
        "doc_role": DOC_ROLE.get(doc_type, "IRRELEVANT"),
        "fields": fields,
        "rule_result": rule_result,
        "policy": "no_raw_docs_no_raw_text",
    }


# ----------------------------
# 4.5) Belgeler arası tarih uyumu (cross-document check)
# ----------------------------
def cross_document_date_check(
    file_results: List[Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    """
    Sigorta – Uçuş – Konaklama tarih uyumunu kontrol eder.
    Yeterli belge yoksa None döner.
    """

    def parse(d):
        try:
            return datetime.fromisoformat(d)
        except Exception:
            return None

    flight = None
    accommodation = None
    insurance = None

    for fr in file_results:
        if fr["doc_type"] == "flight_reservation":
            flight = fr
        elif fr["doc_type"] == "accommodation":
            accommodation = fr
        elif fr["doc_type"] == "travel_insurance":
            insurance = fr

    # En az iki belge yoksa kontrol yapma
    available = [x for x in (flight, accommodation, insurance) if x]
    if len(available) < 2:
        return None

    reasons: List[str] = []
    actions: List[str] = []
    status = "ok"

    def warn(msg: str, action: str):
        nonlocal status
        status = "warning"
        reasons.append(msg)
        actions.append(action)

    # ✈️ Uçuş tarihleri
    if flight:
        f_start = parse(flight["fields"].get("min_date"))
        f_end = parse(flight["fields"].get("max_date"))
    else:
        f_start = f_end = None

    # 🛏 Konaklama tarihleri
    if accommodation:
        a_start = parse(accommodation["fields"].get("min_date"))
        a_end = parse(accommodation["fields"].get("max_date"))
    else:
        a_start = a_end = None

    # 🛡 Sigorta tarihleri
    if insurance:
        i_start = parse(insurance["fields"].get("min_date"))
        i_end = parse(insurance["fields"].get("max_date"))
    else:
        i_start = i_end = None

    # 🛏 ↔ ✈️ Konaklama – Uçuş
    if f_start and f_end and a_start and a_end:
        if a_start > f_start or a_end < f_end:
            warn(
                "Konaklama tarihleri uçuş tarihlerini tam kapsamıyor.",
                "Konaklama belgesinin gidiş–dönüş tarihlerini kapsadığından emin ol."
            )

    # 🛡 ↔ ✈️ Sigorta – Uçuş (1 gün tolerans)
    if f_start and f_end and i_start and i_end:
        if i_start > (f_start - timedelta(days=1)) or i_end < (f_end + timedelta(days=1)):
            warn(
                "Seyahat sigortası tarihleri uçuş tarihlerini yeterli tamponla kapsamıyor.",
                "Sigortanın gidişten en az 1 gün önce başlayıp dönüşten 1 gün sonra bitmesi önerilir."
            )

    if not reasons:
        return None

    return {
        "status": status,
        "reasons": reasons,
        "actions": actions,
    }


# ----------------------------
# API
# ----------------------------
@app.get("/")
def root():
    return {"status": "api running"}


@app.post("/analyze")
async def analyze(
    files: List[UploadFile] = File(...)
) -> Dict[str, Any]:

    start = time.time()

    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    file_results: List[Dict[str, Any]] = []
    overall_status = "ok"
    overall_reasons: List[str] = []
    overall_actions: List[str] = []

    def escalate_overall(s: str):
        nonlocal overall_status
        order = {"ok": 0, "warning": 1, "critical": 2}
        if order[s] > order[overall_status]:
            overall_status = s

    for f in files:
        ctype = (f.content_type or "").lower()
        if ctype not in ALLOWED_TYPES:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file type: {ctype}"
            )

        data = await f.read()
        size_mb = _mb(len(data))
        if size_mb > MAX_FILE_MB:
            del data
            raise HTTPException(
                status_code=413,
                detail=f"File too large: {f.filename} ({size_mb:.2f} MB)"
            )

        meta = _safe_meta(f, size_mb)

        # 1) OCR (RAM)
        ocr_out = extract_text_kvkk_safe(data, ctype)
        text = ocr_out["text"]
        pages = ocr_out.get("pages", [])

        # 2) Belge türü + rol
        doc_type = detect_doc_type(text)
        doc_role = DOC_ROLE.get(doc_type, "IRRELEVANT")

        # 3) Alan çıkarımı (PAGE AWARE)
        fields = extract_fields_by_type(doc_type, text, pages)
        fields["pages_processed"] = ocr_out["pages_processed"]

        # 4) Kural motoru
        rule_res = rule_engine(doc_type, fields)

        # Overall birleştirme
        escalate_overall(rule_res["status"])
        overall_reasons += rule_res["reasons"]
        overall_actions += rule_res["actions"]

        file_results.append({
            "file": meta,
            "doc_type": doc_type,
            "doc_role": doc_role,
            "pages_processed": ocr_out["pages_processed"],
            "pages": pages,  # ✅ taşındı
            "fields": fields,
            "rule": rule_res,
            "llm_payload_preview": build_llm_payload(
                doc_type, fields, rule_res
            ),
        })

        # KVKK-safe cleanup
        del text
        del pages
        del ocr_out
        del data
        await f.close()

    # 🔥 5️⃣ Belgeler arası tarih uyumu
    cross = cross_document_date_check(file_results)
    if cross:
        escalate_overall(cross["status"])
        for r in cross["reasons"]:
            overall_reasons.append(f"[CROSS] {r}")
        for a in cross["actions"]:
            overall_actions.append(a)

    # Varsayılan mesajlar
    if not overall_reasons:
        overall_reasons = [
            "Belge ön kontrolü tamamlandı, kritik sorun bulunmadı."
        ]
    if not overall_actions:
        overall_actions = [
            "Başvuru öncesi belge formatlarını tekrar gözden geçir."
        ]

    return {
        "status": overall_status,
        "reasons": overall_reasons,
        "actions": overall_actions,
        "files_received": [fr["file"] for fr in file_results],
        "file_results": file_results,
        "processing_ms": int((time.time() - start) * 1000),
        "storage_policy": "no_persist",
    }