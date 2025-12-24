export type RuleStatus = "ok" | "warning" | "critical"

export type FileMeta = {
  filename: string
  content_type: string
  size_mb: number
}

export type RuleResult = {
  status: RuleStatus
  reasons: string[]
  actions: string[]
}

export type FileResult = {
  file: FileMeta
  doc_type: string
  doc_role: "CORE_REQUIRED" | "SUPPORTING_OPTIONAL" | "IRRELEVANT"
  pages_processed: number
  fields: Record<string, any>
  rule: RuleResult
}

export type AnalyzeResponse = {
  status: RuleStatus
  reasons: string[]
  actions: string[]
  file_results: FileResult[]
  processing_ms: number
}
