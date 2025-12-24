"use client";

import Link from "next/link";

/**
 * Schengen için genellikle istenen temel (zorunlu) belgeler.
 */
const REQUIRED_DOCS = [
  { key: "passport", label: "Pasaport", icon: "🛂" },
  { key: "bank_statement", label: "Banka Dökümü", icon: "💳" },
  { key: "travel_insurance", label: "Seyahat Sağlık Sigortası", icon: "🏥" },
  { key: "flight_reservation", label: "Uçuş Rezervasyonu", icon: "✈️" },
  { key: "accommodation", label: "Konaklama Belgesi", icon: "🏨" },
  { key: "application_form", label: "Başvuru Formu", icon: "📝" },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-white/90 backdrop-blur rounded-3xl shadow-2xl p-10 space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">
            🇩🇪 Schengen Evrak Ön Kontrolü
          </h1>

          <p className="mt-4 text-gray-800 leading-relaxed">
            Almanya Schengen vizesi için evraklarını yükle.  
            Sistem yalnızca <span className="font-medium">teknik ön kontrol</span> ve
            <span className="font-medium"> risk değerlendirmesi</span> yapar.
          </p>
        </div>

        {/* HOW IT WORKS */}
        <div className="bg-gray-50 rounded-2xl p-4 text-sm text-gray-700 space-y-1">
          <div>1️⃣ Belgelerini yüklersin</div>
          <div>2️⃣ Sistem teknik kontroller yapar</div>
          <div>3️⃣ Olası riskler ve eksikler raporlanır</div>
        </div>

        {/* REQUIRED DOCUMENTS */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 text-center">
            Zorunlu Belgeler
          </h2>
          <p className="text-sm text-gray-600 text-center">
            Hangi belgeyi yüklemek istiyorsun? Belge türüne göre sistem otomatik olarak algılayacak.
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {REQUIRED_DOCS.map((doc) => (
              <Link
                key={doc.key}
                href={`/upload?focus=${doc.key}`}
                className="flex items-center gap-3 rounded-xl border-2 border-gray-200 bg-white px-4 py-3 hover:border-black hover:bg-gray-50 transition-all text-left group"
              >
                <span className="text-2xl">{doc.icon}</span>
                <span className="flex-1 font-medium text-gray-900 group-hover:text-black">
                  {doc.label}
                </span>
                <span className="text-gray-400 group-hover:text-black">→</span>
              </Link>
            ))}
          </div>
        </div>

        {/* ALTERNATIVE: UPLOAD ALL */}
        <div className="border-t pt-6 text-center">
          <Link
            href="/upload"
            className="inline-flex items-center justify-center rounded-xl bg-black text-white py-3 px-6 font-medium hover:scale-[1.03] transition"
          >
            📂 Tüm Belgeleri Toplu Yükle
          </Link>
        </div>

        {/* LEGAL NOTICE */}
        <div className="text-xs text-gray-600 border-t pt-4 text-center">
          <strong>Resmi bir kurum değildir.</strong><br />
          Konsolosluk veya aracı kurum yerine geçmez.  
          Nihai karar yetkili makamlara aittir.
        </div>
      </div>
    </main>
  );
}
