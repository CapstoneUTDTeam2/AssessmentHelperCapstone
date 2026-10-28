import { useMemo, useRef, useState } from 'react'
import { MockDataNote } from '../components/MockData'
import { CRITERIA, CURRENT_CYCLE, RATING_SCALE, SECTIONS } from '../data/criteriaMock'
import type { CriteriaSection, Criterion, Modality } from '../data/criteriaMock'

const MODALITY_LABELS: Record<Modality, string> = {
  All: 'All modalities',
  'In person': 'In person',
  'Online / Hybrid': 'Online / Hybrid',
}

const MODALITY_BADGES: Record<Modality, string> = {
  All: 'bg-[#e3efe6] text-[#1c4532]',
  'In person': 'bg-[#fbe8d6] text-[#c4561a]',
  'Online / Hybrid': 'bg-[#e4e8f6] text-[#34437a]',
}

const SCALE_CHIPS = {
  green: 'bg-[#e3efe6] text-[#1c4532]',
  orange: 'bg-[#fbe8d6] text-[#c4561a]',
  neutral: 'bg-neutral-100 text-neutral-600',
}

const MODALITIES: Modality[] = ['All', 'In person', 'Online / Hybrid']

type FilterKey = 'all' | Modality | 'hidden'

const FILTERS: { key: FilterKey; label: string; match: (c: Criterion) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'All', label: 'All modalities', match: (c) => c.appliesTo === 'All' },
  { key: 'Online / Hybrid', label: 'Online / Hybrid', match: (c) => c.appliesTo === 'Online / Hybrid' },
  { key: 'In person', label: 'In person', match: (c) => c.appliesTo === 'In person' },
  { key: 'hidden', label: 'Hidden', match: (c) => !c.active },
]

function EvaluationCriteriaPage() {
  const [criteria, setCriteria] = useState<Criterion[]>(CRITERIA)
  const [sections, setSections] = useState<CriteriaSection[]>(SECTIONS)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selectedId, setSelectedId] = useState<number | null>(7)
  const [draft, setDraft] = useState<Criterion | null>(() => CRITERIA.find((c) => c.id === 7) ?? null)
  const dragId = useRef<number | null>(null)

  const activeCount = criteria.filter((c) => c.active).length

  // Form numbers follow list order (section by section), so they never skip after removing or reordering.
  const numbers = useMemo(() => {
    const ordered = sections.flatMap((s) => criteria.filter((c) => c.sectionId === s.id))
    return new Map(ordered.map((c, i) => [c.id, i + 1]))
  }, [criteria, sections])
  const saved = criteria.find((c) => c.id === selectedId) ?? null
  const dirty = draft !== null && saved !== null && JSON.stringify({ ...draft, active: saved.active }) !== JSON.stringify(saved)

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const match = FILTERS.find((f) => f.key === filter)!.match
    return criteria.filter((c) => match(c) && (!q || [c.text, ...c.points].some((t) => t.toLowerCase().includes(q))))
  }, [criteria, search, filter])

  const isFiltering = filter !== 'all' || search.trim() !== ''

  const select = (c: Criterion) => {
    setSelectedId(c.id)
    setDraft({ ...c })
  }

  const setActive = (id: number, active: boolean) =>
    setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, active } : c)))

  const addCriterion = (sectionId: string) => {
    const created: Criterion = {
      id: Math.max(0, ...criteria.map((c) => c.id)) + 1,
      sectionId,
      text: 'New criterion',
      points: [],
      guidance: '',
      appliesTo: 'All',
      usedIn: 0,
      active: true,
      required: true,
      notesOnLowRating: true,
    }
    setCriteria((prev) => {
      const lastInSection = prev.findLastIndex((c) => c.sectionId === sectionId)
      const at = lastInSection === -1 ? prev.length : lastInSection + 1
      return [...prev.slice(0, at), created, ...prev.slice(at)]
    })
    setFilter('all')
    setSearch('')
    select(created)
  }

  const addSection = () => {
    const name = window.prompt('Section name')?.trim()
    if (!name) return
    setSections((prev) => [...prev, { id: `section-${Date.now()}`, name }])
  }

  const save = () => {
    if (!draft) return
    setCriteria((prev) => prev.map((c) => (c.id === draft.id ? { ...draft, active: c.active } : c)))
  }

  // Moves the dragged criterion in front of the target, joining the target's section.
  const dropOn = (target: Criterion) => {
    const id = dragId.current
    dragId.current = null
    if (id === null || id === target.id) return
    setCriteria((prev) => {
      const moving = prev.find((c) => c.id === id)!
      const rest = prev.filter((c) => c.id !== id)
      const at = rest.findIndex((c) => c.id === target.id)
      return [...rest.slice(0, at), { ...moving, sectionId: target.sectionId }, ...rest.slice(at)]
    })
    setDraft((d) => (d && d.id === id ? { ...d, sectionId: target.sectionId } : d))
  }

  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Evaluation Criteria</h1>
          <p className="mt-1 text-xs text-neutral-500">
            {CURRENT_CYCLE} cycle · {activeCount} active criteria in {sections.length} sections · used on every
            class observation form
          </p>
          <MockDataNote>Criteria save/load has no API yet. Edits stay in this browser session.</MockDataNote>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 transition-colors hover:bg-neutral-50"
          >
            Preview Form
          </button>
          <button
            type="button"
            onClick={() => addCriterion(sections[0].id)}
            className="rounded-md bg-[#e0791a] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#c96a12]"
          >
            + Add Criterion
          </button>
        </div>
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <label className="flex min-w-56 flex-1 basis-56 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 lg:max-w-60">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-neutral-400" aria-hidden="true" />
          <span className="sr-only">Search criteria</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search criteria"
            className="w-full bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
          />
        </label>

        {FILTERS.map((f) => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
                active
                  ? 'border-[#1c4532] bg-[#1c4532] text-white'
                  : 'border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50'
              }`}
            >
              {f.label} · {criteria.filter(f.match).length}
            </button>
          )
        })}

        <label className="ml-auto flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-[11px] text-neutral-500">
          Cycle:
          <select className="bg-transparent text-neutral-900 focus:outline-none">
            <option>{CURRENT_CYCLE}</option>
          </select>
        </label>
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[1fr_264px]">
        <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[11px]">
              <thead>
                <tr className="bg-neutral-100 text-[10px] text-neutral-600">
                  <th className="w-12 rounded-l py-2 pl-6 text-left font-normal">#</th>
                  <th className="px-2 py-2 text-left font-normal">Criterion</th>
                  <th className="w-28 px-2 py-2 text-left font-normal">Applies to</th>
                  <th className="w-20 px-2 py-2 text-left font-normal">Used in</th>
                  <th className="w-14 rounded-r px-2 py-2 text-left font-normal">Active</th>
                </tr>
              </thead>
              {sections.map((section) => {
                const rows = visible.filter((c) => c.sectionId === section.id)
                if (isFiltering && rows.length === 0) return null
                return (
                  <tbody key={section.id}>
                    <tr>
                      <th colSpan={4} scope="rowgroup" className="px-2 pt-4 pb-1.5 text-left text-[9px] font-semibold tracking-wide text-neutral-500 uppercase">
                        {section.name} · {rows.length}
                      </th>
                      <td className="px-2 pt-4 pb-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => addCriterion(section.id)}
                          className="text-[9px] whitespace-nowrap text-[#e0791a] hover:underline"
                        >
                          + Add here
                        </button>
                      </td>
                    </tr>
                    {rows.map((c) => {
                      const selected = c.id === selectedId
                      return (
                        <tr
                          key={c.id}
                          draggable
                          onDragStart={() => (dragId.current = c.id)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => dropOn(c)}
                          onClick={() => select(c)}
                          className={`cursor-pointer border-t border-neutral-100 ${
                            selected ? 'bg-[#fdf1e6] shadow-[inset_2px_0_0_#e0791a]' : 'hover:bg-neutral-50'
                          } ${c.active ? '' : 'opacity-50'}`}
                        >
                          <td className="py-2 pl-1">
                            <span className="flex items-center gap-1.5">
                              <span className="cursor-grab text-[10px] text-neutral-300" aria-hidden="true">
                                ⠿
                              </span>
                              <span
                                className={`flex h-5 w-5 items-center justify-center rounded text-[10px] ${
                                  selected ? 'bg-[#e0791a] text-white' : 'bg-neutral-100 text-neutral-700'
                                }`}
                              >
                                {numbers.get(c.id)}
                              </span>
                            </span>
                          </td>
                          <td className="max-w-0 px-2 py-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                select(c)
                              }}
                              title={c.text}
                              className="block w-full truncate text-left text-neutral-900"
                            >
                              {c.text}
                            </button>
                            {c.points.length > 0 && (
                              <ul className="mt-0.5 list-disc pl-4 text-[10px] text-neutral-600">
                                {c.points.map((point, i) => (
                                  <li key={i} className="truncate" title={point}>
                                    {point}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <span className={`rounded px-1.5 py-0.5 text-[9px] whitespace-nowrap ${MODALITY_BADGES[c.appliesTo]}`}>
                              {MODALITY_LABELS[c.appliesTo]}
                            </span>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-neutral-500">{c.usedIn} reports</td>
                          <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                            <Toggle
                              checked={c.active}
                              onChange={(v) => setActive(c.id, v)}
                              label={`Criterion ${numbers.get(c.id)} active`}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                )
              })}
            </table>
            {isFiltering && visible.length === 0 && (
              <p className="py-10 text-center text-[11px] text-neutral-500">No criteria match these filters.</p>
            )}
          </div>
          <p className="mt-4 text-center text-[9px] text-neutral-500">
            Drag ⠿ to reorder · numbers update on the observation form automatically ·{' '}
            <button type="button" onClick={addSection} className="text-[#e0791a] hover:underline">
              + Add section
            </button>
          </p>
        </section>

        <div className="flex flex-col gap-4">
          {draft ? (
            <CriterionEditor
              key={draft.id}
              draft={draft}
              number={numbers.get(draft.id) ?? draft.id}
              sections={sections}
              dirty={dirty}
              onChange={setDraft}
              onCancel={() => saved && setDraft({ ...saved })}
              onSave={save}
            />
          ) : (
            <section className="rounded-lg border border-neutral-200 bg-white p-4 text-[11px] text-neutral-500">
              Select a criterion to edit it.
            </section>
          )}

          <section className="flex gap-3 rounded-lg border border-neutral-200 bg-white p-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#e3efe6] text-xs" aria-hidden="true">
              🔒
            </span>
            <div>
              <p className="flex items-center gap-2 text-[11px] font-semibold text-neutral-900">
                {CURRENT_CYCLE} version
                <span className="rounded-full bg-[#e0791a] px-2 py-px text-[9px] font-medium text-white">Draft</span>
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-neutral-500">
                Locks when the first report of the cycle is submitted. Past cycles keep their own criteria, so old
                reports never change.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

interface CriterionEditorProps {
  draft: Criterion
  number: number
  sections: CriteriaSection[]
  dirty: boolean
  onChange: (draft: Criterion) => void
  onCancel: () => void
  onSave: () => void
}

function CriterionEditor({ draft, number, sections, dirty, onChange, onCancel, onSave }: CriterionEditorProps) {
  const set = <K extends keyof Criterion>(key: K, value: Criterion[K]) => onChange({ ...draft, [key]: value })
  const field = 'mt-1.5 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-[11px] text-neutral-900 focus:border-[#1c4532] focus:outline-none'

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Edit criterion #{number}</h2>
      <p className="text-[10px] text-neutral-500">Changes apply to new observation forms only</p>

      <label className="mt-4 block text-[10px] font-medium text-neutral-700">
        Criterion
        <input value={draft.text} onChange={(e) => set('text', e.target.value)} className={field} />
      </label>

      <label className="mt-3 block text-[10px] font-medium text-neutral-700">
        Section
        <select value={draft.sectionId} onChange={(e) => set('sectionId', e.target.value)} className={field}>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="mt-3">
        <legend className="text-[10px] font-medium text-neutral-700">Bullet points (optional)</legend>
        <ul className="mt-1.5 space-y-1.5">
          {draft.points.map((point, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <span className="text-neutral-400" aria-hidden="true">
                •
              </span>
              <input
                value={point}
                aria-label={`Bullet point ${i + 1}`}
                onChange={(e) => set('points', draft.points.map((p, j) => (j === i ? e.target.value : p)))}
                className={field.replace('mt-1.5 ', '')}
              />
              <button
                type="button"
                aria-label={`Remove bullet point ${i + 1}`}
                onClick={() => set('points', draft.points.filter((_, j) => j !== i))}
                className="rounded px-1.5 py-1 text-neutral-400 hover:bg-neutral-100 hover:text-[#b3261e]"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => set('points', [...draft.points, ''])}
          className="mt-1.5 text-[10px] text-[#e0791a] hover:underline"
        >
          + Add bullet point
        </button>
      </fieldset>

      <label className="mt-3 block text-[10px] font-medium text-neutral-700">
        Guidance for observers (optional)
        <textarea
          rows={3}
          value={draft.guidance}
          onChange={(e) => set('guidance', e.target.value)}
          className={`${field} resize-y leading-relaxed`}
        />
      </label>

      <fieldset className="mt-3">
        <legend className="text-[10px] font-medium text-neutral-700">Applies to</legend>
        <div className="mt-1.5 grid grid-cols-3 overflow-hidden rounded-md border border-neutral-200">
          {MODALITIES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={draft.appliesTo === m}
              onClick={() => set('appliesTo', m)}
              className={`border-l border-neutral-200 py-1.5 text-[10px] first:border-l-0 ${
                draft.appliesTo === m ? 'bg-[#1c4532] text-white' : 'text-neutral-800 hover:bg-neutral-50'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-3">
        <p className="text-[10px] font-medium text-neutral-700">Rating scale</p>
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {RATING_SCALE.map((r) => (
            <li key={r.label} className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${SCALE_CHIPS[r.tone]}`}>
              {r.label}
            </li>
          ))}
        </ul>
      </div>

      <SettingRow
        title="Required"
        detail="Observer must rate before submitting"
        checked={draft.required}
        onChange={(v) => set('required', v)}
      />
      <SettingRow
        title="Notes required for 1–2 ratings"
        detail="Ask for a growth note when rated 1 or 2"
        checked={draft.notesOnLowRating}
        onChange={(v) => set('notesOnLowRating', v)}
      />

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={!dirty}
          className="rounded-md border border-neutral-200 bg-white py-2 text-xs text-neutral-900 transition-colors hover:bg-neutral-50 disabled:text-neutral-400"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || draft.text.trim() === ''}
          className="rounded-md bg-[#e0791a] py-2 text-xs font-medium text-white transition-colors hover:bg-[#c96a12] disabled:opacity-50 disabled:hover:bg-[#e0791a]"
        >
          Save Changes
        </button>
      </div>
    </section>
  )
}

function SettingRow({
  title,
  detail,
  checked,
  onChange,
}: {
  title: string
  detail: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 border-b border-neutral-100 pb-2.5">
      <div>
        <p className="text-[11px] font-medium text-neutral-900">{title}</p>
        <p className="text-[9px] text-neutral-500">{detail}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${checked ? 'bg-[#3f8a55]' : 'bg-neutral-300'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-3' : ''
        }`}
      />
    </button>
  )
}

export default EvaluationCriteriaPage
