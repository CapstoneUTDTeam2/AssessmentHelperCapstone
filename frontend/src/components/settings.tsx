import { Children, useState } from 'react'
import type { ReactNode } from 'react'

// Building blocks shared by the AC and faculty Settings pages.

export interface SettingsSection {
  id: string
  title: string
  description: string
  content: ReactNode
  /** Overrides the "N settings" count, for a section whose content renders its own rows. */
  settingsCount?: number
}

interface SettingsLayoutProps {
  title: string
  subtitle: string
  sections: SettingsSection[]
  dirty: boolean
  onSave: () => void
  onDiscard: () => void
  /** Collapsible panels (AC page) or always-open panels (faculty page). */
  collapsible?: boolean
  /** Panels open on first render when collapsible. */
  initiallyOpen?: string[]
}

export function SettingsLayout({
  title,
  subtitle,
  sections,
  dirty,
  onSave,
  onDiscard,
  collapsible = false,
  initiallyOpen = [],
}: SettingsLayoutProps) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(initiallyOpen))
  const [active, setActive] = useState(sections[0].id)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const isOpen = (id: string) => !collapsible || open.has(id)

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const jumpTo = (id: string) => {
    setActive(id)
    setOpen((prev) => new Set(prev).add(id))
    // Wait for the panel to open before scrolling to it.
    requestAnimationFrame(() =>
      document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }

  const save = () => {
    onSave()
    setSavedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
  }

  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
          <p className="mt-1 text-xs text-neutral-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? (
            <span className="text-[11px] text-[#c4561a]">Unsaved changes</span>
          ) : (
            savedAt && <span className="text-[11px] text-neutral-500">Saved at {savedAt}</span>
          )}
          <button
            type="button"
            onClick={onDiscard}
            disabled={!dirty}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Discard changes
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty}
            className="rounded-md bg-[#e0791a] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#c96a12] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save changes
          </button>
        </div>
      </header>

      <div className="mt-5 flex flex-col items-start gap-5 lg:flex-row">
        <nav
          aria-label="Settings sections"
          className="w-full shrink-0 rounded-lg border border-neutral-200 bg-white p-1.5 lg:sticky lg:top-6 lg:w-48"
        >
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => jumpTo(s.id)}
              aria-current={active === s.id ? 'true' : undefined}
              className={`block w-full rounded-md px-3 py-2 text-left text-xs transition-colors ${
                active === s.id ? 'bg-neutral-100 font-medium text-neutral-900' : 'text-neutral-500 hover:bg-neutral-50'
              }`}
            >
              {s.title}
            </button>
          ))}
        </nav>

        <div className="flex w-full min-w-0 flex-col gap-4">
          {sections.map((s) => {
            const count = s.settingsCount ?? Children.toArray(s.content).filter((c) => !isNotice(c)).length
            const expanded = isOpen(s.id)
            const heading = (
              <>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-neutral-900">{s.title}</h2>
                  <p className="mt-0.5 text-[11px] text-neutral-500">{s.description}</p>
                </div>
                {collapsible && (
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500">
                      {count} settings
                    </span>
                    <span
                      className={`text-neutral-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
                      aria-hidden="true"
                    >
                      ›
                    </span>
                  </div>
                )}
              </>
            )
            return (
              <section
                key={s.id}
                id={`settings-${s.id}`}
                className="scroll-mt-6 rounded-lg border border-neutral-200 bg-white"
              >
                {collapsible ? (
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    aria-expanded={expanded}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left"
                  >
                    {heading}
                  </button>
                ) : (
                  <div className="flex items-center justify-between gap-4 px-4 py-3.5">{heading}</div>
                )}
                {expanded && <div className="divide-y divide-neutral-100 border-t border-neutral-100 px-4">{s.content}</div>}
              </section>
            )
          })}
        </div>
      </div>
    </main>
  )
}

function isNotice(node: unknown) {
  return typeof node === 'object' && node !== null && 'type' in node && node.type === Notice
}

interface RowProps {
  label: string
  description?: ReactNode
  children?: ReactNode
  /** Puts the control under the label instead of beside it. */
  stacked?: boolean
}

export function Row({ label, description, children, stacked = false }: RowProps) {
  return (
    <div className={`flex gap-x-6 gap-y-2 py-3 ${stacked ? 'flex-col' : 'flex-wrap items-center justify-between'}`}>
      <div className="min-w-0 max-w-md">
        <p className="text-xs font-medium text-neutral-900">{label}</p>
        {description && <p className="mt-0.5 text-[11px] text-neutral-500">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

/** Informational callout inside a panel. Not counted as a setting. */
export function Notice({ title, children, tone = 'neutral' }: { title: string; children: ReactNode; tone?: 'neutral' | 'warn' }) {
  return (
    <div
      className={`my-3 rounded-md px-3 py-2.5 ${
        tone === 'warn' ? 'bg-[#fbe8d6] text-[#8a3d12]' : 'bg-[#e3efe6] text-[#1c4532]'
      }`}
    >
      <p className="text-xs font-medium">{title}</p>
      <div className="mt-0.5 text-[11px] opacity-90">{children}</div>
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-[#2e7d4f]' : 'bg-neutral-300'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${checked ? 'left-[18px]' : 'left-0.5'}`}
      />
    </button>
  )
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  format = String,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  label: string
  format?: (v: T) => string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md border border-neutral-200 bg-neutral-50 p-0.5">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          role="radio"
          aria-checked={o === value}
          onClick={() => onChange(o)}
          className={`rounded px-2.5 py-1 text-[11px] transition-colors ${
            o === value ? 'bg-white font-medium text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
          }`}
        >
          {format(o)}
        </button>
      ))}
    </div>
  )
}

export function Select<T extends string | number>({
  options,
  value,
  onChange,
  label,
  format = String,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  label: string
  format?: (v: T) => string
}) {
  return (
    <select
      aria-label={label}
      value={String(value)}
      onChange={(e) => onChange(options.find((o) => String(o) === e.target.value)!)}
      className="min-w-36 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-900"
    >
      {options.map((o) => (
        <option key={String(o)} value={String(o)}>
          {format(o)}
        </option>
      ))}
    </select>
  )
}

export function NumberField({
  value,
  onChange,
  label,
  prefix,
  suffix,
  min = 0,
  max,
}: {
  value: number
  onChange: (v: number) => void
  label: string
  prefix?: string
  suffix?: string
  min?: number
  max?: number
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-neutral-500">
      {prefix}
      <input
        type="number"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (!Number.isNaN(n)) onChange(Math.min(max ?? n, Math.max(min, n)))
        }}
        className="w-16 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-900"
      />
      {suffix}
    </label>
  )
}

export function DateField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <input
      type="date"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-900"
    />
  )
}

export interface Channels {
  email: boolean
  inApp: boolean
}

export function ChannelToggles({ value, onChange, label }: { value: Channels; onChange: (v: Channels) => void; label: string }) {
  const chip = (key: keyof Channels, text: string) => (
    <button
      type="button"
      aria-pressed={value[key]}
      aria-label={`${label}: ${text}`}
      onClick={() => onChange({ ...value, [key]: !value[key] })}
      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
        value[key] ? 'border-[#1c4532] bg-[#1c4532] text-white' : 'border-neutral-200 bg-white text-neutral-500'
      }`}
    >
      {text}
    </button>
  )
  return (
    <>
      {chip('email', 'Email')}
      {chip('inApp', 'In-app')}
    </>
  )
}

/** Removable chips with an inline "add" field. */
export function ChipList({
  items,
  onChange,
  label,
  addLabel,
  suggestions,
}: {
  items: string[]
  onChange: (v: string[]) => void
  label: string
  addLabel: string
  /** When set, new chips are picked from these instead of typed. */
  suggestions?: string[]
}) {
  const [draft, setDraft] = useState('')
  const remaining = suggestions?.filter((s) => !items.includes(s))

  const add = (value: string) => {
    const v = value.trim()
    if (v && !items.includes(v)) onChange([...items, v])
    setDraft('')
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={label}>
      {items.map((item) => (
        <span key={item} className="flex items-center gap-1 rounded-full bg-[#1c4532] py-1 pl-2.5 pr-1.5 text-[11px] text-white">
          {item}
          <button
            type="button"
            aria-label={`Remove ${item}`}
            onClick={() => onChange(items.filter((i) => i !== item))}
            className="rounded-full px-1 text-white/80 hover:bg-white/15 hover:text-white"
          >
            ×
          </button>
        </span>
      ))}
      {remaining ? (
        remaining.length > 0 && (
          <select
            aria-label={addLabel}
            value=""
            onChange={(e) => add(e.target.value)}
            className="rounded-full border border-dashed border-neutral-300 bg-white px-2.5 py-1 text-[11px] text-neutral-500"
          >
            <option value="">+ {addLabel}</option>
            {remaining.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            add(draft)
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => add(draft)}
            placeholder={`+ ${addLabel}`}
            aria-label={addLabel}
            className="w-36 rounded-full border border-dashed border-neutral-300 bg-white px-2.5 py-1 text-[11px] text-neutral-900 placeholder:text-neutral-500"
          />
        </form>
      )}
    </div>
  )
}

export function ActionButton({ children, onClick, tone = 'neutral' }: { children: ReactNode; onClick: () => void; tone?: 'neutral' | 'danger' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
        tone === 'danger'
          ? 'border-[#b3261e]/30 bg-white text-[#b3261e] hover:bg-[#b3261e]/5'
          : 'border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50'
      }`}
    >
      {children}
    </button>
  )
}
