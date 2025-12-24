import { RuleStatus } from "../types"

export default function StatusBadge({ status }: { status: RuleStatus }) {
  const map = {
    ok: "bg-green-100 text-green-800",
    warning: "bg-yellow-100 text-yellow-800",
    critical: "bg-red-100 text-red-800",
  }

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${map[status]}`}>
      {status === "ok" && "Uygun"}
      {status === "warning" && "Dikkat"}
      {status === "critical" && "Sorun"}
    </span>
  )
}
