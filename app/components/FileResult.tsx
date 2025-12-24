import { FileResult } from "../types"
import StatusBadge from "./StatusBadge"
import Link from "next/link"

const DOC_LABELS: Record<string, string> = {
  passport: "Pasaport",
  bank_statement: "Banka Dökümü",
  travel_insurance: "Seyahat Sağlık Sigortası",
  flight_reservation: "Uçuş Rezervasyonu",
  accommodation: "Konaklama Belgesi",
  application_form: "Başvuru Formu",
  unknown: "Tanınmayan Belge",
  irrelevant_document: "İlgisiz Belge",
};

export default function FileResultCard({ result }: { result: FileResult }) {
  const docLabel = DOC_LABELS[result.doc_type] || result.doc_type;
  const isUnknown = result.doc_type === "unknown" || result.doc_type === "irrelevant_document";
  const isCoreRequired = result.doc_role === "CORE_REQUIRED";

  return (
    <div className={`border rounded-xl p-4 space-y-3 ${isUnknown ? "bg-yellow-50 border-yellow-300" : ""}`}>
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">{result.file.filename}</h3>
        <StatusBadge status={result.rule.status} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm text-gray-700">
          <span className="font-medium">Belge türü:</span>{" "}
          <span className={`font-bold ${isUnknown ? "text-red-600" : "text-gray-900"}`}>
            {docLabel}
          </span>
        </p>
        <span className="text-gray-400">·</span>
        <p className="text-sm text-gray-700">
          <span className="font-medium">Rol:</span> {result.doc_role}
        </p>
        {result.pages_processed > 0 && (
          <>
            <span className="text-gray-400">·</span>
            <p className="text-sm text-gray-700">
              <span className="font-medium">Sayfa:</span> {result.pages_processed}
            </p>
          </>
        )}
      </div>

      {isUnknown && isCoreRequired && (
        <div className="bg-yellow-100 border border-yellow-400 rounded-lg p-3 text-sm">
          <p className="font-semibold text-yellow-900 mb-1">⚠️ Belge Tanınamadı</p>
          <p className="text-yellow-800 mb-2">
            Sistem bu belgeyi otomatik olarak tanıyamadı. Belge türünü manuel olarak seçmek için:
          </p>
          <Link
            href={`/upload?focus=${result.doc_type === "unknown" ? "passport" : result.doc_type}`}
            className="inline-block rounded-lg bg-yellow-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-yellow-700 transition"
          >
            Belgeyi Yeniden Yükle
          </Link>
        </div>
      )}

      {result.rule.reasons.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-900 mb-1">Tespit Edilen Durumlar:</p>
          <ul className="list-disc ml-5 text-sm text-gray-700 space-y-1">
            {result.rule.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {result.rule.actions.length > 0 && (
        <div className="bg-gray-50 p-3 rounded-md text-sm">
          <p className="font-semibold text-gray-900 mb-1">Öneriler:</p>
          <ul className="list-disc ml-5 text-gray-700 space-y-1">
            {result.rule.actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
