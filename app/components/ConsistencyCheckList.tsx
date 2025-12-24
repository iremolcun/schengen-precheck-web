"use client";

type Props = {
  reasons: string[];
  actions: string[];
};

export default function ConsistencyCheck({ reasons, actions }: Props) {
  const crossReasons = reasons.filter((r) => r.startsWith("[CROSS]"));
  if (crossReasons.length === 0) return null;

  return (
    <div className="rounded-2xl border border-yellow-300 bg-yellow-50 p-6 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">
        📅 Belgeler Arası Tutarlılık Kontrolü
      </h3>

      <p className="text-sm text-gray-700">
        Belgelerdeki tarihlerin birbiriyle uyumu kontrol edildi.
        Aşağıdaki noktalar risk oluşturabilir.
      </p>

      <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
        {crossReasons.map((r, i) => (
          <li key={i}>{r.replace("[CROSS] ", "")}</li>
        ))}
      </ul>

      {actions.length > 0 && (
        <div className="pt-2">
          <div className="text-sm font-medium text-gray-800 mb-1">
            Önerilen Düzeltmeler
          </div>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
            {actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
