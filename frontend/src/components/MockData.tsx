import type { ReactNode } from 'react'

/** Visible marker for placeholder rows that are not from a backend API. */
export function MockDataBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-[#c4561a] bg-[#fdf1e6] px-2 py-0.5 text-[9px] font-semibold tracking-wide text-[#c4561a] uppercase">
      Mock data
    </span>
  )
}

export function MockDataNote({ children }: { children?: ReactNode }) {
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-500">
      <MockDataBadge />
      <span>{children ?? 'Placeholder until this API exists. Not live data.'}</span>
    </p>
  )
}
