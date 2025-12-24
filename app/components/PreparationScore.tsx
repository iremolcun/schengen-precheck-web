"use client";

import { useState } from "react";
import { motion } from "framer-motion";

/* ---------- TYPES ---------- */

type FileRule = {
  status: "ok" | "warning" | "critical";
};

type FileResult = {
  doc_type: string;
  doc_role: "CORE_REQUIRED" | "SUPPORTING_OPTIONAL" | "IRRELEVANT";
  rule: FileRule;
};

type Props = {
  files: FileResult[];
  onSelectDoc?: (doc: string) => void;
};

/* ---------- CONSTANTS ---------- */

const REQUIRED_DOCS = [
  "passport",
  "bank_statement",
  "travel_insurance",
  "flight_reservation",
  "accommodation",
  "application_form",
];

const DOC_LABEL: Record<string, string> = {
  passport: "Pasaport",
  bank_statement: "Banka Dökümü",
  travel_insurance: "Seyahat Sigortası",
  flight_reservation: "Uçuş Rezervasyonu",
  accommodation: "Konaklama Belgesi",
  application_form: "Başvuru Formu",
};

/* ---------- SCORING ---------- */

function baseScoreForStatus(status?: "ok" | "warning" | "critical") {
  if (!status) return 0;
  if (status === "critical") return 20;
  if (status === "warning") return 70;
  return 100;
}

function penaltyForStatus(status?: "ok" | "warning" | "critical") {
  if (status === "critical") return 20;
  if (status === "warning") return 10;
  return 0;
}

/* ---------- COMPONENT ---------- */

export default function PreparationScore({ files, onSelectDoc }: Props) {
  const [open, setOpen] = useState(false);

  const coreFiles = files;

  console.log(
    files.map((f) => ({
      doc_type: f.doc_type,
      role: f.doc_role,
      status: f.rule.status,
    }))
  );

  /* -----------------------------
     1️⃣ BASE SCORE
  ----------------------------- */
  let total = 0;

  REQUIRED_DOCS.forEach((doc) => {
    const found = coreFiles.find((f) => f.doc_type === doc);
    total += baseScoreForStatus(found?.rule.status);
  });

  const baseScore = Math.round(total / REQUIRED_DOCS.length);

  /* -----------------------------
     2️⃣ BREAKDOWN
  ----------------------------- */
  const breakdown = REQUIRED_DOCS.map((doc) => {
    const found = coreFiles.find((f) => f.doc_type === doc);
    const status = found?.rule.status;
    return {
      doc,
      label: DOC_LABEL[doc] ?? doc,
      status,
      penalty: penaltyForStatus(status),
    };
  });

  const penalty = breakdown.reduce((sum, b) => sum + b.penalty, 0);

  const finalScore = Math.max(0, baseScore - penalty);

  /* -----------------------------
     3️⃣ LABEL
  ----------------------------- */
  let label = "Hazırlık Başlangıç Seviyesinde";
  let color = "text-gray-900";
  let bg = "bg-gray-100";

  const recognizedCore = REQUIRED_DOCS.filter((doc) =>
    files.some((f) => f.doc_type === doc)
  ).length;

  // ✅ okunamadı durumu ezilmesin diye else-if zinciri
  if (files.length > 0 && recognizedCore === 0) {
    label = "Belgeler yüklendi ama okunamadı";
    color = "text-red-700";
    bg = "bg-red-50";
  } else if (finalScore >= 85) {
    label = "Başvuruya Oldukça Yakınsın";
    color = "text-green-700";
    bg = "bg-green-50";
  } else if (finalScore >= 60) {
    label = "Belgeler Büyük Ölçüde Hazır";
    color = "text-yellow-700";
    bg = "bg-yellow-50";
  } else if (finalScore > 0) {
    label = "Eksikler Var";
    color = "text-red-700";
    bg = "bg-red-50";
  }

  /* -----------------------------
     4️⃣ UI
  ----------------------------- */
  return (
    <div className={`rounded-2xl border p-6 ${bg} space-y-3`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left space-y-2"
      >
        <h3 className="text-lg font-semibold text-gray-900">
          Başvuru Hazırlık Skoru
        </h3>

        {/* 🔢 SCORE (ANIMATED) */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className={`text-5xl font-bold ${color}`}
        >
          %{finalScore}
        </motion.div>

        {/* 📊 BAR (ANIMATED) */}
        <div className="w-full h-2 bg-gray-200 rounded overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${finalScore}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="h-2 bg-black"
          />
        </div>

        <p className={`text-sm font-medium ${color}`}>
          {label} <span className="text-xs">(detay için tıkla)</span>
        </p>
      </button>

      {penalty > 0 && (
        <p className="text-xs text-gray-600">
          Belge durumu ve tutarlılık kontrolleri skoru düşürdü (−{penalty} puan).
        </p>
      )}

      {/* 🔽 BREAKDOWN */}
      {open && (
        <div className="mt-4 rounded-xl border bg-white p-4 space-y-2 text-sm">
          <div className="font-medium text-gray-900">Skor Düşüş Detayları</div>

          {breakdown.map((b) => (
            <div
              key={b.doc}
              className={`flex items-center justify-between rounded px-2 py-1 ${
                b.penalty > 0
                  ? "cursor-pointer hover:bg-gray-50"
                  : "cursor-default hover:bg-gray-50"
              }`}
              onClick={() => {
                if (b.penalty === 0) return;
                onSelectDoc?.(b.doc);
                document.getElementById(`doc-${b.doc}`)?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }}
            >
              <span className="text-gray-900 font-medium">{b.label}</span>

              {b.penalty > 0 ? (
                <span className="text-red-600 font-medium">−{b.penalty} puan</span>
              ) : (
                <span className="text-green-700 font-medium">OK</span>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-600">
        Bu skor yalnızca teknik ön kontrol ve belge tutarlılığına dayanır. Nihai
        değerlendirme resmi mercilere aittir.
      </p>
    </div>
  );
}
