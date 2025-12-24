"use client";

import Link from "next/link";

/* ---------- TYPES ---------- */

type FileResult = {
  doc_type: string;
  doc_role: "CORE_REQUIRED" | "SUPPORTING_OPTIONAL" | "IRRELEVANT";
  rule: {
    status: "ok" | "warning" | "critical";
  };
};

type Props = {
  files: FileResult[];
  focusDoc?: string | null;
};

/**
 * Schengen için genellikle istenen temel (zorunlu) belgeler.
 * Bu liste BİLGİLENDİRME amaçlıdır.
 */
const REQUIRED_DOCS = [
  { key: "passport", label: "Pasaport" },
  { key: "bank_statement", label: "Banka Dökümü" },
  { key: "travel_insurance", label: "Seyahat Sağlık Sigortası" },
  { key: "flight_reservation", label: "Uçuş Rezervasyonu" },
  { key: "accommodation", label: "Konaklama Belgesi" },
  { key: "application_form", label: "Başvuru Formu" },
];

export default function DocumentChecklist({ files, focusDoc }: Props) {
  /**
   * Yüklenen CORE belgeleri hızlı erişim için map’liyoruz.
   * Aynı türden birden fazla varsa ilk bulunan esas alınır.
   */
  const uploadedMap = new Map<string, FileResult>();

  files.forEach((f) => {
    if (f.doc_role === "CORE_REQUIRED" && !uploadedMap.has(f.doc_type)) {
      uploadedMap.set(f.doc_type, f);
    }
  });

  return (
    <div className="rounded-2xl border bg-white p-6 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">
        Zorunlu Belgeler – Bilgi Kontrol Listesi
      </h3>

      <p className="text-sm text-gray-600">
        Bu liste bilgilendirme amaçlıdır. Belgeleri tek tek veya parça parça
        kontrol edebilirsin.
      </p>

      <ul className="space-y-2">
        {REQUIRED_DOCS.map((doc) => {
          const uploaded = uploadedMap.get(doc.key);
          const isFocused = focusDoc === doc.key;

          /* =====================================================
             ❌ YÜKLENMEDİ → YÜKLE CTA
          ===================================================== */
          if (!uploaded) {
            return (
              <li
                key={doc.key}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 transition
                  ${
                    isFocused
                      ? "bg-yellow-100 border-yellow-400 ring-2 ring-yellow-300 animate-pulse"
                      : "bg-gray-50 text-gray-700"
                  }`}
              >
                <span className="flex items-center gap-2">
                  <span>ℹ️</span>
                  <span>{doc.label}</span>
                </span>

                <Link
                  href={`/upload?focus=${doc.key}`}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  Yükle
                </Link>
              </li>
            );
          }

          /* =====================================================
             YÜKLENMİŞ → DURUMA GÖRE
          ===================================================== */
          const statusUI =
            uploaded.rule.status === "critical"
              ? {
                  icon: "❌",
                  text: "Kritik sorun",
                  cls: "bg-red-50 text-red-700 border-red-300",
                }
              : uploaded.rule.status === "warning"
              ? {
                  icon: "⚠️",
                  text: "Kontrol öneriliyor",
                  cls: "bg-yellow-50 text-yellow-700 border-yellow-300",
                }
              : {
                  icon: "✅",
                  text: "Uygun",
                  cls: "bg-green-50 text-green-700 border-green-300",
                };

          return (
            <li
              key={doc.key}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 transition
                ${statusUI.cls}
                ${
                  isFocused
                    ? "ring-2 ring-yellow-300 animate-pulse"
                    : ""
                }`}
            >
              <span className="flex items-center gap-2">
                <span>{statusUI.icon}</span>
                <span>{doc.label}</span>
              </span>

              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold">
                  {statusUI.text}
                </span>

                {isFocused && (
                  <button
                    className="text-xs font-medium text-blue-600 hover:underline"
                    onClick={() => {
                      document
                        .getElementById(`doc-${doc.key}`)
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                    }}
                  >
                    Bu belgeyi düzelt
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
