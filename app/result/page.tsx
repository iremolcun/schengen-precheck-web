"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PreparationScore from "../components/PreparationScore";
import DocumentChecklist from "../components/DocumentCheckList";
import ConsistencyCheck from "../components/ConsistencyCheckList";
import FileResultCard from "../components/FileResult";
import { AnalyzeResponse, FileResult } from "../types";

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

const REQUIRED_DOCS = [
  { key: "passport", label: "Pasaport", icon: "🛂" },
  { key: "bank_statement", label: "Banka Dökümü", icon: "💳" },
  { key: "travel_insurance", label: "Seyahat Sağlık Sigortası", icon: "🏥" },
  { key: "flight_reservation", label: "Uçuş Rezervasyonu", icon: "✈️" },
  { key: "accommodation", label: "Konaklama Belgesi", icon: "🏨" },
  { key: "application_form", label: "Başvuru Formu", icon: "📝" },
];

export default function ResultPage() {
  const router = useRouter();
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("analysis_result");
    if (!stored) {
      router.push("/");
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      setData(parsed);
    } catch (err) {
      console.error("Failed to parse analysis result:", err);
      router.push("/");
    } finally {
      setLoading(false);
    }
  }, [router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 p-6">
        <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-xl p-10 text-center">
          <p className="text-gray-600">Yükleniyor...</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 p-6">
        <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-xl p-10 text-center">
          <p className="text-red-600">Sonuç bulunamadı. Lütfen tekrar analiz yapın.</p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-xl bg-black text-white py-3 px-6 font-medium hover:scale-[1.03] transition"
          >
            Ana Sayfaya Dön
          </Link>
        </div>
      </main>
    );
  }

  const coreFiles = data.file_results.filter(
    (f) => f.doc_role === "CORE_REQUIRED"
  );

  // PreparationScore için uyumlu format
  const scoreFiles = coreFiles.map((f) => ({
    doc_type: f.doc_type,
    doc_role: f.doc_role,
    rule: {
      status: f.rule.status,
    },
  }));

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* HEADER */}
        <div className="bg-white rounded-3xl shadow-xl p-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-gray-900">
              📋 Analiz Sonuçları
            </h1>
            <Link
              href="/"
              className="rounded-xl bg-gray-900 text-white py-2 px-4 text-sm font-medium hover:bg-gray-800 transition"
            >
              ← Ana Sayfa
            </Link>
          </div>

          <p className="text-sm text-gray-600">
            Analiz {data.processing_ms}ms sürede tamamlandı.{" "}
            {data.file_results.length} belge işlendi.
          </p>
        </div>

        {/* PREPARATION SCORE */}
        <PreparationScore
          files={scoreFiles}
          onSelectDoc={(doc) => {
            setSelectedDoc(doc);
            document.getElementById(`doc-${doc}`)?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }}
        />

        {/* DOCUMENT CHECKLIST WITH LINKS */}
        <div className="bg-white rounded-3xl shadow-xl p-8 space-y-6">
          <h2 className="text-2xl font-bold text-gray-900">
            Zorunlu Belgeler
          </h2>
          <p className="text-sm text-gray-600">
            Eksik belgeleri yüklemek için aşağıdaki linklere tıklayabilirsin.
          </p>

          {/* BELGE LİNKLERİ (Ana sayfadaki gibi) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {REQUIRED_DOCS.map((doc) => {
              const uploaded = coreFiles.find((f) => f.doc_type === doc.key);
              const status = uploaded?.rule.status;

              let bgColor = "bg-gray-50 border-gray-200";
              let textColor = "text-gray-700";
              let icon = doc.icon;

              if (status === "ok") {
                bgColor = "bg-green-50 border-green-300";
                textColor = "text-green-700";
                icon = "✅";
              } else if (status === "warning") {
                bgColor = "bg-yellow-50 border-yellow-300";
                textColor = "text-yellow-700";
                icon = "⚠️";
              } else if (status === "critical") {
                bgColor = "bg-red-50 border-red-300";
                textColor = "text-red-700";
                icon = "❌";
              }

              return (
                <Link
                  key={doc.key}
                  href={`/upload?focus=${doc.key}`}
                  className={`flex items-center gap-3 rounded-xl border-2 ${bgColor} px-4 py-3 hover:border-black hover:bg-white transition-all text-left group`}
                >
                  <span className="text-2xl">{icon}</span>
                  <span className={`flex-1 font-medium ${textColor} group-hover:text-black`}>
                    {doc.label}
                  </span>
                  {uploaded ? (
                    <span className="text-xs font-semibold">
                      {status === "ok" ? "✓" : status === "warning" ? "⚠" : "✗"}
                    </span>
                  ) : (
                    <span className="text-gray-400 group-hover:text-black">→</span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* DOCUMENT CHECKLIST COMPONENT */}
          <DocumentChecklist
            files={scoreFiles}
            focusDoc={selectedDoc}
          />
        </div>

        {/* CONSISTENCY CHECK */}
        {data.reasons.some((r) => r.startsWith("[CROSS]")) && (
          <ConsistencyCheck reasons={data.reasons} actions={data.actions} />
        )}

        {/* FILE RESULTS */}
        <div className="bg-white rounded-3xl shadow-xl p-8 space-y-6">
          <h2 className="text-2xl font-bold text-gray-900">
            Belge Detayları
          </h2>

          {data.file_results.length === 0 ? (
            <p className="text-gray-600">
              Hiç belge işlenmedi. Lütfen belgeleri tekrar yükleyin.
            </p>
          ) : (
            <div className="space-y-4">
              {/* CORE REQUIRED BELGELER */}
              {data.file_results.filter((f) => f.doc_role === "CORE_REQUIRED").length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Zorunlu Belgeler
                  </h3>
                  <div className="space-y-4">
                    {data.file_results
                      .filter((f) => f.doc_role === "CORE_REQUIRED")
                      .map((result, idx) => (
                        <div key={idx} id={`doc-${result.doc_type}`}>
                          <FileResultCard result={result} />
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* TANINMAYAN BELGELER */}
              {data.file_results.filter(
                (f) => f.doc_type === "unknown" || f.doc_type === "irrelevant_document"
              ).length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Tanınmayan Belgeler
                  </h3>
                  <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 mb-4">
                    <p className="text-sm text-yellow-800">
                      Aşağıdaki belgeler otomatik olarak tanınamadı. Bu belgeleri doğru türle yeniden yüklemek için
                      yukarıdaki belge linklerini kullanabilirsin.
                    </p>
                  </div>
                  <div className="space-y-4">
                    {data.file_results
                      .filter(
                        (f) => f.doc_type === "unknown" || f.doc_type === "irrelevant_document"
                      )
                      .map((result, idx) => (
                        <div key={idx}>
                          <FileResultCard result={result} />
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* DESTEKLEYİCİ BELGELER */}
              {data.file_results.filter((f) => f.doc_role === "SUPPORTING_OPTIONAL").length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Destekleyici Belgeler
                  </h3>
                  <div className="space-y-4">
                    {data.file_results
                      .filter((f) => f.doc_role === "SUPPORTING_OPTIONAL")
                      .map((result, idx) => (
                        <div key={idx}>
                          <FileResultCard result={result} />
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* OVERALL REASONS & ACTIONS */}
        {(data.reasons.length > 0 || data.actions.length > 0) && (
          <div className="bg-white rounded-3xl shadow-xl p-8 space-y-4">
            <h2 className="text-2xl font-bold text-gray-900">
              Genel Değerlendirme
            </h2>

            {data.reasons.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  Tespit Edilen Durumlar
                </h3>
                <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                  {data.reasons
                    .filter((r) => !r.startsWith("[CROSS]"))
                    .map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                </ul>
              </div>
            )}

            {data.actions.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  Önerilen Aksiyonlar
                </h3>
                <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                  {data.actions.map((action, i) => (
                    <li key={i}>{action}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* BACK TO UPLOAD */}
        <div className="bg-white rounded-3xl shadow-xl p-8 text-center">
          <p className="text-gray-600 mb-4">
            Eksik belgeleri yüklemek veya mevcut belgeleri değiştirmek ister misin?
          </p>
          <Link
            href="/upload"
            className="inline-block rounded-xl bg-black text-white py-3 px-6 font-medium hover:scale-[1.03] transition"
          >
            📂 Belgeleri Yükle / Değiştir
          </Link>
        </div>
      </div>
    </main>
  );
}
