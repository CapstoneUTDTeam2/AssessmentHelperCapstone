import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { getCurrentCycle } from '../api/cycles'
import { NOT_APPLICABLE } from '../api/observations'
import type { RatingOption } from '../api/observations'
import {
  addCriterion as createCriterion,
  addSection as createSection,
  createTemplateVersion,
  deleteCriterion,
  getCurrentTemplate,
  getTemplate,
  listTemplates,
  setCycleTemplate,
  updateCriterion,
} from '../api/templates'
import type { AppliesTo, FullTemplate, TemplateCriterion, TemplateInfo } from '../api/templates'

type Modality = AppliesTo

interface CriteriaSection {
  /** Section id as a string, or NO_SECTION for criteria without one. */
  id: string
  name: string
}

interface Criterion {
  id: number
  sectionId: string
  text: string
  /** Sub-points listed under the criterion on the observation form. */
  points: string[]
  guidance: string
  appliesTo: Modality
  /** Number of ratings that used this criterion. */
  usedIn: number
  active: boolean
  required: boolean
  /** Ask the observer for a comment when rated 1 or 2. */
  notesOnLowRating: boolean
  displayOrder: number
}

const NO_SECTION = 'none'

const sectionKey = (id: number | null) => (id === null ? NO_SECTION : String(id))
const sectionIdOf = (key: string) => (key === NO_SECTION ? null : Number(key))

function toCriterion(c: TemplateCriterion): Criterion {
  return {
    id: c.criterion_id,
    sectionId: sectionKey(c.section_id),
    text: c.name,
    points: c.bullets,
    guidance: c.guidance ?? '',
    appliesTo: c.applies_to,
    usedIn: c.used_in,
    active: c.is_active,
    required: c.is_required,
    notesOnLowRating: c.notes_on_low_rating,
    displayOrder: c.display_order ?? 0,
  }
}

function sectionsOf(template: FullTemplate): CriteriaSection[] {
  const list = [...template.sections]
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((s) => ({ id: String(s.section_id), name: s.name }))
  if (list.length === 0 || template.criteria.some((c) => c.section_id === null)) {
    list.push({ id: NO_SECTION, name: list.length ? 'No section' : 'Criteria' })
  }
  return list
}

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

function scaleTone(value: number): keyof typeof SCALE_CHIPS {
  if (value === NOT_APPLICABLE) return 'neutral'
  return value <= 2 ? 'orange' : 'green'
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

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError || err instanceof Error ? err.message : fallback
}

function EvaluationCriteriaPage() {
  const [template, setTemplate] = useState<FullTemplate | null>(null)
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [cycle, setCycle] = useState<{ id: number; label: string; templateId: number | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Criterion | null>(null)
  const dragId = useRef<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    Promise.all([
      getCurrentTemplate(signal).catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }),
      listTemplates(signal),
      getCurrentCycle(signal).catch(() => null),
    ])
      .then(async ([current, list, currentCycle]) => {
        setTemplates(list.templates)
        if (currentCycle) {
          setCycle({
            id: currentCycle.cycle_id,
            label: `${currentCycle.semester} ${currentCycle.year}`,
            templateId: current?.template_id ?? null,
          })
        }
        // A cycle without a template yet: show the newest one so it can be edited and picked.
        const shown = current ?? (list.templates[0] ? await getTemplate(list.templates[0].template_id, signal) : null)
        if (!shown) {
          setError('No observation templates exist yet.')
          return
        }
        setTemplate(shown)
        const first = [...shown.criteria].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))[0]
        if (first) {
          setSelectedId(first.criterion_id)
          setDraft(toCriterion(first))
        }
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setError(errorText(err, 'Failed to load the template'))
      })
    return () => controller.abort()
  }, [])

  const criteria = useMemo(
    () =>
      [...(template?.criteria ?? [])]
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.criterion_id - b.criterion_id)
        .map(toCriterion),
    [template],
  )
  const sections = useMemo(() => (template ? sectionsOf(template) : []), [template])
  const locked = template?.is_locked ?? false
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

  /** Runs one change against the API, then reloads the template so the page shows what was saved. */
  const run = async (action: (templateId: number) => Promise<void>) => {
    if (!template) return
    setBusy(true)
    setError(null)
    try {
      await action(template.template_id)
      setTemplate(await getTemplate(template.template_id))
    } catch (err) {
      setError(errorText(err, 'The change could not be saved'))
    } finally {
      setBusy(false)
    }
  }

  const setActive = (id: number, active: boolean) =>
    run(async () => {
      await updateCriterion(id, { is_active: active })
    })

  const addCriterion = (sectionId: string) =>
    run(async (templateId) => {
      const created = await createCriterion(templateId, { name: 'New criterion', section_id: sectionIdOf(sectionId) })
      setFilter('all')
      setSearch('')
      select(toCriterion(created))
    })

  const addSection = () => {
    const name = window.prompt('Section name')?.trim()
    if (!name) return
    void run(async (templateId) => {
      await createSection(templateId, name)
    })
  }

  const save = () => {
    if (!draft) return
    void run(async () => {
      const updated = await updateCriterion(draft.id, {
        name: draft.text.trim(),
        section_id: sectionIdOf(draft.sectionId),
        bullets: draft.points.map((p) => p.trim()).filter(Boolean),
        guidance: draft.guidance.trim() || null,
        applies_to: draft.appliesTo,
        is_required: draft.required,
        notes_on_low_rating: draft.notesOnLowRating,
      })
      setDraft(toCriterion(updated))
    })
  }

  const remove = () => {
    if (!draft || !window.confirm(`Delete "${draft.text}"? This can't be undone.`)) return
    void run(async () => {
      await deleteCriterion(draft.id)
      setSelectedId(null)
      setDraft(null)
    })
  }

  // Moves the dragged criterion in front of the target, joining the target's section, and renumbers the form.
  const dropOn = (target: Criterion) => {
    const id = dragId.current
    dragId.current = null
    if (id === null || id === target.id || locked) return
    const moving = criteria.find((c) => c.id === id)!
    const rest = criteria.filter((c) => c.id !== id)
    const at = rest.findIndex((c) => c.id === target.id)
    const reordered = [...rest.slice(0, at), { ...moving, sectionId: target.sectionId }, ...rest.slice(at)]
    void run(async () => {
      for (const [i, c] of reordered.entries()) {
        const original = criteria.find((o) => o.id === c.id)!
        if (original.displayOrder !== i + 1 || original.sectionId !== c.sectionId) {
          await updateCriterion(c.id, { display_order: i + 1, section_id: sectionIdOf(c.sectionId) })
        }
      }
      setDraft((d) => (d && d.id === id ? { ...d, sectionId: target.sectionId } : d))
    })
  }

  const showTemplate = async (templateId: number) => {
    setBusy(true)
    setError(null)
    try {
      setTemplate(await getTemplate(templateId))
      setSelectedId(null)
      setDraft(null)
    } catch (err) {
      setError(errorText(err, 'Failed to load the template'))
    } finally {
      setBusy(false)
    }
  }

  const newVersion = async () => {
    if (!template) return
    const version = window.prompt('Name for the new version', `${template.version} (copy)`)?.trim()
    if (!version) return
    setBusy(true)
    setError(null)
    try {
      const created = await createTemplateVersion(template.template_id, version)
      setTemplate(created)
      setTemplates((await listTemplates()).templates)
      setSelectedId(null)
      setDraft(null)
    } catch (err) {
      setError(errorText(err, 'Could not create a new version'))
    } finally {
      setBusy(false)
    }
  }

  const useForCycle = async () => {
    if (!template || !cycle) return
    setBusy(true)
    setError(null)
    try {
      await setCycleTemplate(cycle.id, template.template_id)
      setCycle({ ...cycle, templateId: template.template_id })
      setTemplates((await listTemplates()).templates)
    } catch (err) {
      setError(errorText(err, 'Could not change the cycle’s template'))
    } finally {
      setBusy(false)
    }
  }

  const isCycleTemplate = template !== null && cycle?.templateId === template.template_id

  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Evaluation Criteria</h1>
          <p className="mt-1 text-xs text-neutral-500">
            {template ? `Template ${template.version}` : 'Loading template…'}
            {cycle && ` · ${isCycleTemplate ? `used by the ${cycle.label} cycle` : `not the ${cycle.label} cycle’s template`}`} ·{' '}
            {activeCount} active criteria in {sections.length} sections
          </p>
          {error && (
            <p role="alert" className="mt-1 text-[11px] text-[#b3261e]">
              {error}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => sections[0] && addCriterion(sections[0].id)}
            disabled={busy || locked || !template}
            className="rounded-md bg-[#e0791a] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#c96a12] disabled:opacity-50"
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
          Template:
          <select
            value={template?.template_id ?? ''}
            onChange={(e) => showTemplate(Number(e.target.value))}
            disabled={busy}
            className="bg-transparent text-neutral-900 focus:outline-none"
          >
            {templates.map((t) => (
              <option key={t.template_id} value={t.template_id}>
                {t.version}
                {t.template_id === cycle?.templateId ? ` (${cycle.label})` : ''}
                {t.is_locked ? ' · locked' : ''}
              </option>
            ))}
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
                        {!locked && (
                          <button
                            type="button"
                            onClick={() => addCriterion(section.id)}
                            disabled={busy}
                            className="text-[9px] whitespace-nowrap text-[#e0791a] hover:underline"
                          >
                            + Add here
                          </button>
                        )}
                      </td>
                    </tr>
                    {rows.map((c) => {
                      const selected = c.id === selectedId
                      return (
                        <tr
                          key={c.id}
                          draggable={!locked && !busy}
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
                              <span className={`text-[10px] text-neutral-300 ${locked ? 'invisible' : 'cursor-grab'}`} aria-hidden="true">
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
                          <td className="px-2 py-2 whitespace-nowrap text-neutral-500">{c.usedIn} ratings</td>
                          <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                            <Toggle
                              checked={c.active}
                              disabled={locked || busy}
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
          {!locked && (
            <p className="mt-4 text-center text-[9px] text-neutral-500">
              Drag ⠿ to reorder · numbers update on the observation form automatically ·{' '}
              <button type="button" onClick={addSection} disabled={busy} className="text-[#e0791a] hover:underline">
                + Add section
              </button>
            </p>
          )}
        </section>

        <div className="flex flex-col gap-4">
          {draft && template ? (
            <CriterionEditor
              key={draft.id}
              draft={draft}
              number={numbers.get(draft.id) ?? draft.id}
              sections={sections}
              scale={template.rating_scale}
              dirty={dirty}
              locked={locked}
              busy={busy}
              onChange={setDraft}
              onCancel={() => saved && setDraft({ ...saved })}
              onSave={save}
              onDelete={remove}
            />
          ) : (
            <section className="rounded-lg border border-neutral-200 bg-white p-4 text-[11px] text-neutral-500">
              Select a criterion to {locked ? 'view' : 'edit'} it.
            </section>
          )}

          {template && (
            <section className="flex gap-3 rounded-lg border border-neutral-200 bg-white p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#e3efe6] text-xs" aria-hidden="true">
                🔒
              </span>
              <div>
                <p className="flex items-center gap-2 text-[11px] font-semibold text-neutral-900">
                  {template.version}
                  <span
                    className={`rounded-full px-2 py-px text-[9px] font-medium text-white ${locked ? 'bg-[#1c4532]' : 'bg-[#e0791a]'}`}
                  >
                    {locked ? 'Locked' : 'Editable'}
                  </span>
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-neutral-500">
                  {locked
                    ? 'A completed observation used this version, so it can’t change. Old reports keep their criteria; edit a new version instead.'
                    : 'Locks once a completed observation uses it. Past versions are kept, so old reports never change.'}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={newVersion}
                    disabled={busy}
                    className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[10px] text-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    New version from this
                  </button>
                  {cycle && !isCycleTemplate && (
                    <button
                      type="button"
                      onClick={useForCycle}
                      disabled={busy}
                      className="rounded-md bg-[#1c4532] px-2.5 py-1 text-[10px] font-medium text-white disabled:opacity-50"
                    >
                      Use for {cycle.label}
                    </button>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  )
}

interface CriterionEditorProps {
  draft: Criterion
  number: number
  sections: CriteriaSection[]
  scale: RatingOption[]
  dirty: boolean
  locked: boolean
  busy: boolean
  onChange: (draft: Criterion) => void
  onCancel: () => void
  onSave: () => void
  onDelete: () => void
}

function CriterionEditor({ draft, number, sections, scale, dirty, locked, busy, onChange, onCancel, onSave, onDelete }: CriterionEditorProps) {
  const set = <K extends keyof Criterion>(key: K, value: Criterion[K]) => onChange({ ...draft, [key]: value })
  const field = 'mt-1.5 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-[11px] text-neutral-900 focus:border-[#1c4532] focus:outline-none'

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">
        {locked ? 'Criterion' : 'Edit criterion'} #{number}
      </h2>
      <p className="text-[10px] text-neutral-500">
        {locked ? 'This version is locked · create a new version to change it' : 'Changes apply to new observation forms only'}
      </p>

      <fieldset disabled={locked || busy} className="contents">
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
            {scale.map((r) => (
              <li key={r.value} className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${SCALE_CHIPS[scaleTone(r.value)]}`}>
                {r.value === NOT_APPLICABLE ? r.label : `${r.value} · ${r.label}`}
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
          detail="Ask for a comment when rated 1 or 2"
          checked={draft.notesOnLowRating}
          onChange={(v) => set('notesOnLowRating', v)}
        />
      </fieldset>

      {!locked && (
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
            disabled={!dirty || busy || draft.text.trim() === ''}
            className="rounded-md bg-[#e0791a] py-2 text-xs font-medium text-white transition-colors hover:bg-[#c96a12] disabled:opacity-50 disabled:hover:bg-[#e0791a]"
          >
            Save Changes
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy || draft.usedIn > 0}
            title={draft.usedIn > 0 ? 'Already rated on an observation · turn it off instead' : undefined}
            className="col-span-2 rounded-md py-1.5 text-[11px] text-[#b3261e] hover:bg-red-50 disabled:text-neutral-400 disabled:hover:bg-transparent"
          >
            Delete criterion
          </button>
        </div>
      )}
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

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors disabled:opacity-60 ${checked ? 'bg-[#3f8a55]' : 'bg-neutral-300'}`}
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
