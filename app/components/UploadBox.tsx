"use client"

import { useState } from "react"

type Props = {
  onSubmit: (files: File[]) => void
}

export default function UploadBox({ onSubmit }: Props) {
  const [files, setFiles] = useState<File[]>([])

  return (
    <div className="border-2 border-dashed rounded-xl p-6 text-center">
      <input
        type="file"
        multiple
        accept=".pdf,image/*"
        onChange={(e) => setFiles(Array.from(e.target.files || []))}
        className="mb-4"
      />

      <button
        onClick={() => onSubmit(files)}
        disabled={files.length === 0}
        className="px-6 py-2 rounded-lg bg-black text-white disabled:opacity-40"
      >
        Belgeleri analiz et
      </button>
    </div>
  )
}
