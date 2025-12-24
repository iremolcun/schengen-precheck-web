"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type UploadState = "idle" | "uploading";
type ModalType = "privacy" | "consent" | "clarification" | null;

/**
 * Belge türleri ve etiketleri
 */
const DOC_LABELS: Record<string, string> = {
  passport: "Pasaport",
  bank_statement: "Banka Dökümü",
  travel_insurance: "Seyahat Sağlık Sigortası",
  flight_reservation: "Uçuş Rezervasyonu",
  accommodation: "Konaklama Belgesi",
  application_form: "Başvuru Formu",
};

export default function UploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // QUERY PARAMS
  const replaceDoc = searchParams.get("replace"); // passport
  const focusDoc = searchParams.get("focus");     // passport

  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [state, setState] = useState<UploadState>("idle");

  const [ackOfficial, setAckOfficial] = useState(false);
  const [ackDelete, setAckDelete] = useState(false);
  const [ackPrivacy, setAckPrivacy] = useState(false);

  const [openModal, setOpenModal] = useState<ModalType>(null);

  const canSubmit =
    ackOfficial && ackDelete && ackPrivacy && files.length > 0;

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files ?? []));
    setError("");
  }

  async function onSubmit() {
    if (!canSubmit) {
      setError("Devam edebilmek için tüm onayları vermen gerekir.");
      return;
    }

    setState("uploading");
    setError("");

    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });

    try {
      const res = await fetch("http://127.0.0.1:8000/analyze", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        // Backend'den gelen hata mesajını oku
        let errorMessage = "Analiz sırasında hata oluştu.";
        try {
          const errorData = await res.json();
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {
          // JSON parse edilemezse status text'i kullan
          errorMessage = `Hata ${res.status}: ${res.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const result = await res.json();

      // Backend'den gelen sonucu kontrol et
      if (!result || !result.file_results || result.file_results.length === 0) {
        throw new Error("Backend'den beklenmeyen yanıt alındı.");
      }

      sessionStorage.setItem("analysis_result", JSON.stringify(result));

      router.push("/result");
    } catch (err) {
      // Daha detaylı hata mesajı göster
      const errorMsg = err instanceof Error ? err.message : "Bilinmeyen bir hata oluştu.";
      
      // Network hatası kontrolü
      if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError")) {
        setError("Backend sunucusuna bağlanılamadı. Lütfen backend'in çalıştığından emin olun (http://127.0.0.1:8000)");
      } else {
        setError(`Analiz yapılamadı: ${errorMsg}`);
      }
      
      console.error("Upload error:", err);
    } finally {
      setState("idle");
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-3xl shadow-xl p-10 space-y-8">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">
          Belgeleri Yükle
        </h2>

        {/* QUERY INFO - Hangi belge yüklenecek */}
        {(replaceDoc || focusDoc) && (
          <div className="rounded-xl bg-blue-50 border-2 border-blue-300 p-5 text-sm">
            {replaceDoc && (
              <p className="text-blue-900">
                <span className="font-semibold">Yenilenecek belge:</span>{" "}
                <strong className="text-lg">
                  {DOC_LABELS[replaceDoc] || replaceDoc}
                </strong>
              </p>
            )}
            {focusDoc && (
              <div className="text-blue-900 space-y-2">
                <p className="font-semibold">📄 Yüklenecek Belge Türü:</p>
                <p className="text-lg font-bold">
                  {DOC_LABELS[focusDoc] || focusDoc}
                </p>
                <p className="text-xs text-blue-700 mt-2">
                  Bu belge türünü yüklediğinde sistem otomatik olarak algılayacak ve kontrol edecek.
                </p>
              </div>
            )}
          </div>
        )}

        {/* UPLOAD */}
        <div className="border-2 border-dashed rounded-2xl p-8 text-center space-y-3 hover:border-black transition">
          <input
            type="file"
            multiple
            accept="application/pdf,image/*"
            onChange={onSelect}
            className="mx-auto block text-sm font-medium text-gray-900 file:mr-4 file:rounded-lg
                       file:border-0 file:bg-gray-900 file:px-4 file:py-2
                       file:text-sm file:font-semibold file:text-white
                       hover:file:bg-gray-800 cursor-pointer"
          />
          <p className="text-sm text-gray-800 font-medium">
            PDF veya görsel formatında belge yükleyebilirsin
          </p>
        </div>

        {/* INFO */}
        <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700">
          Yüklenen belgeler yalnızca teknik ön kontrol ve risk değerlendirmesi
          amacıyla geçici olarak işlenir. Analiz tamamlandıktan sonra{" "}
          <strong>kalıcı olarak saklanmaz</strong>.
        </div>

        {/* CHECKBOXES */}
        <div className="space-y-3 text-sm text-gray-800">
          <label className="flex gap-2">
            <input
              type="checkbox"
              onChange={(e) => setAckOfficial(e.target.checked)}
            />
            Bu uygulamanın resmi bir kurum olmadığını ve bağlayıcı karar
            vermediğini anladım.
          </label>

          <label className="flex gap-2">
            <input
              type="checkbox"
              onChange={(e) => setAckDelete(e.target.checked)}
            />
            Belgelerimin analiz tamamlandıktan sonra otomatik olarak silineceğini
            kabul ediyorum.
          </label>

          <label className="flex items-start gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              className="mt-1"
              onChange={(e) => setAckPrivacy(e.target.checked)}
            />
            <span>
              <button
                type="button"
                onClick={() => setOpenModal("privacy")}
                className="underline font-medium hover:text-black"
              >
                Gizlilik Politikası
              </button>
              ,{" "}
              <button
                type="button"
                onClick={() => setOpenModal("clarification")}
                className="underline font-medium hover:text-black"
              >
                Aydınlatma Metni
              </button>{" "}
              ve{" "}
              <button
                type="button"
                onClick={() => setOpenModal("consent")}
                className="underline font-medium hover:text-black"
              >
                Açık Rıza Metni
              </button>
              ’ni okuduğumu ve kabul ettiğimi beyan ederim.
            </span>
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* BUTTONS */}
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/")}
            className="flex-1 rounded-xl px-5 py-3 bg-gray-900 text-white font-medium hover:bg-gray-800 transition"
          >
            ← Geri Dön
          </button>

          <button
            onClick={onSubmit}
            disabled={!canSubmit || state === "uploading"}
            className="flex-1 rounded-xl px-5 py-3 bg-black text-white font-medium hover:scale-[1.02] transition disabled:opacity-50"
          >
            {state === "uploading" ? "Analiz Ediliyor..." : "Analiz Et"}
          </button>
        </div>
      </div>

      {/* MODAL */}
      {openModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
          <div className="bg-white max-w-lg w-full rounded-2xl p-6 space-y-4 overflow-y-auto max-h-[80vh]">
            <h3 className="text-xl font-semibold text-gray-900">
              {openModal === "privacy" && "Gizlilik Politikası"}
              {openModal === "clarification" && "KVKK Aydınlatma Metni"}
              {openModal === "consent" && "Açık Rıza Metni"}
            </h3>

            {openModal === "privacy" && (
              <div className="text-sm text-gray-700 space-y-3 leading-relaxed">
                <p><strong>Gizlilik Politikası</strong></p>
                <p>
                  Bu gizlilik politikası, bu web uygulaması (“Uygulama”) üzerinden
                  kullanıcılar tarafından yüklenen belge ve verilerin
                  işlenmesine ilişkin esasları açıklamaktadır.
                </p>
                <p><strong>1. Hizmetin Niteliği</strong></p>
                <p>
                  Bu Uygulama, Almanya Schengen vizesi başvurularında kullanılan
                  belgeler için ön kontrol ve risk değerlendirmesi yapan teknik
                  bir destek aracıdır. Resmi makam, konsolosluk veya yetkili vize
                  değerlendirme kurumu değildir. Uygulama çıktıları bağlayıcı
                  değildir ve nihai karar yetkili mercilere aittir.
                </p>
                <p><strong>2. İşlenen Veriler</strong></p>
                <ul className="list-disc pl-5">
                  <li>Yüklenen belgelerin içeriği (pasaport, banka dökümü, sigorta vb.)</li>
                  <li>Belgeye ilişkin teknik alanlar (tarih, geçerlilik süresi, tutar varlığı gibi)</li>
                  <li>İşlem zamanı ve kullanıcı onay bilgileri</li>
                </ul>
                <p><strong>3. Veri İşleme Amacı</strong></p>
                <p>
                  Kişisel veriler yalnızca belgelerin biçimsel ve teknik ön
                  kontrolünün yapılması ve eksik veya riskli durumların tespit
                  edilmesi amacıyla işlenir. Bu veriler profil çıkarma,
                  otomatik karar verme veya hukuki sonuç doğuracak
                  değerlendirme amacıyla kullanılmaz.
                </p>
                <p><strong>4. Veri Saklama ve Silme</strong></p>
                <p>
                  Yüklenen belgeler kalıcı olarak saklanmaz, analiz süreci
                  tamamlandıktan sonra sistemden otomatik olarak silinir ve
                  yedekleme, arşivleme veya tekrar kullanım amacıyla tutulmaz.
                </p>
                <p><strong>5. Veri Paylaşımı</strong></p>
                <p>
                  Kullanıcı verileri üçüncü kişi veya kurumlarla paylaşılmaz,
                  reklam, pazarlama veya ticari amaçlarla kullanılmaz ve
                  yetkili resmi mercilere aktarılmaz.
                </p>
                <p><strong>6. Güvenlik</strong></p>
                <p>
                  Veriler yetkisiz erişime karşı teknik ve idari güvenlik
                  önlemleriyle korunur. Ancak internet ortamında veri
                  iletiminin tamamen risksiz olmadığı kullanıcı tarafından
                  kabul edilir.
                </p>
              </div>
            )}

            {openModal === "clarification" && (
              <div className="text-sm text-gray-700 space-y-3 leading-relaxed">
                <p><strong>KVKK Aydınlatma Metni</strong></p>
                <p>
                  6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) uyarınca,
                  bu metin veri sorumlusu sıfatıyla tarafımızca hazırlanmıştır.
                </p>
                <p><strong>1. Veri Sorumlusu</strong></p>
                <p>
                  Bu Uygulama kapsamında işlenen kişisel veriler bakımından veri
                  sorumlusu, Uygulamayı işleten gerçek/tüzel kişidir.
                </p>
                <p><strong>2. İşlenen Kişisel Veriler</strong></p>
                <ul className="list-disc pl-5">
                  <li>Kimlik ve belge bilgileri</li>
                  <li>Finansal belge içerikleri</li>
                  <li>Seyahat ve sigorta bilgileri</li>
                </ul>
                <p><strong>3. İşleme Amaçları</strong></p>
                <p>
                  Kişisel verileriniz belgelerin teknik ön kontrolünün yapılması
                  ve kullanıcıya risk ve eksiklik bilgilendirmesi sunulması
                  amacıyla işlenmektedir.
                </p>
                <p><strong>4. Hukuki Sebep</strong></p>
                <p>
                  Kişisel verileriniz, KVKK’nın 5/1 maddesi uyarınca açık
                  rızanıza dayanılarak işlenmektedir.
                </p>
                <p><strong>5. Aktarım</strong></p>
                <p>
                  Kişisel verileriniz herhangi bir kişi veya kuruma
                  aktarılmamaktadır.
                </p>
                <p><strong>6. Saklama Süresi</strong></p>
                <p>
                  Veriler, işleme amacı tamamlandıktan sonra derhal silinir,
                  yok edilir veya anonim hale getirilir.
                </p>
                <p><strong>7. Haklarınız</strong></p>
                <p>
                  KVKK’nın 11. maddesi uyarınca kişisel verilerinizin işlenip
                  işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini,
                  silinmesini veya yok edilmesini talep etme haklarına
                  sahipsiniz.
                </p>
              </div>
            )}

            {openModal === "consent" && (
              <div className="text-sm text-gray-700 space-y-3 leading-relaxed">
                <p><strong>Açık Rıza Metni</strong></p>
                <p>
                  Bu Uygulama kapsamında yüklediğim belgelerde yer alan kişisel
                  ve özel nitelikli kişisel verilerimin; belgelerin teknik ön
                  kontrolünün yapılması, eksik veya riskli durumların tespit
                  edilmesi ve sonucun tarafıma bilgilendirme amacıyla sunulması
                  amaçlarıyla işlenmesine açık rıza verdiğimi kabul ederim.
                </p>
                <p>
                  Ayrıca bu Uygulamanın resmi bir kurum olmadığını, sunulan
                  sonuçların bağlayıcı veya kesin nitelik taşımadığını,
                  belgelerimin analiz sonrası otomatik olarak silineceğini ve
                  nihai kararın yetkili mercilere ait olduğunu bildiğimi ve
                  kabul ettiğimi beyan ederim.
                </p>
              </div>
            )}

            <div className="text-right">
              <button
                onClick={() => setOpenModal(null)}
                className="rounded-lg bg-gray-900 text-white px-4 py-2 text-sm hover:bg-gray-800"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
