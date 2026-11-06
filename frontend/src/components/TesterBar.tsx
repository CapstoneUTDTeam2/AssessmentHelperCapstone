import { useEffect, useMemo, useState } from 'react'
import type { Role, User } from '../auth/demoAccounts'
import { getEvaluationStatuses } from '../api/evaluationStatus'
import type { ProfessorEvaluationStatus } from '../api/evaluationStatus'
import {
  advanceTestDays,
  getDemoPair,
  getTestHarness,
  getTestPipeline,
  randomizeUnknowns,
  setTestClock,
  setTestProfessor,
  toDateTimeLocal,
} from '../api/testHarness'
import type { DemoPairPerson, TestPipeline } from '../api/testHarness'
import { MockDataBadge } from './MockData'

interface TesterBarProps {
  user: User
  onUser: (user: User) => void
  onReload: () => void
}

const OPEN_KEY = 'assessment-helper-tester-bar-open'

function loadOpen() {
  try {
    return sessionStorage.getItem(OPEN_KEY) !== '0'
  } catch {
    return true
  }
}

type Pair = { a: DemoPairPerson; b: DemoPairPerson }

// The API only suggests people who haven't signed up, so keep the pair being walked through.
const PAIR_KEY = 'assessment-helper-tester-pair'

function loadPair(): Pair | null {
  try {
    return JSON.parse(localStorage.getItem(PAIR_KEY) ?? 'null') as Pair | null
  } catch {
    return null
  }
}

function savePair(pair: Pair | null) {
  try {
    if (pair) localStorage.setItem(PAIR_KEY, JSON.stringify(pair))
    else localStorage.removeItem(PAIR_KEY)
  } catch {
    // Storage unavailable; the pair may change after a refresh.
  }
}

function progressLines(pipeline: TestPipeline | undefined) {
  if (!pipeline) return ['Loading status…']
  if (!pipeline.signup) return ['Not signed up']
  const chosen = pipeline.requests.find((r) => r.status === 'Accepted')
  return [
    `Signed up · ${pipeline.signup.status}`,
    pipeline.observers.length > 0
      ? `Observer list: ${pipeline.observers.map((o) => o.name).join(', ')}`
      : 'No observer list yet',
    ...(chosen ? [`Confirmed by ${chosen.observer_name}`] : []),
  ]
}

function TesterBar({ user, onUser, onReload }: TesterBarProps) {
  const keepPair = (pair: Pair | null) => {
    savePair(pair)
    setDemoPair(pair)
  }

  const [open, setOpen] = useState(loadOpen)
  const [professors, setProfessors] = useState<ProfessorEvaluationStatus[]>([])
  const [professorId, setProfessorId] = useState(user.professorId ?? 1)
  const [view, setView] = useState<Role>(user.role === 'coordinator' ? 'coordinator' : 'faculty')
  const [filter, setFilter] = useState('')
  const [clock, setClock] = useState('')
  const [frozen, setFrozen] = useState(false)
  const [level, setLevel] = useState('')
  const [terms, setTerms] = useState<{ term_id: number; semester: string; year: number }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [randomizeNote, setRandomizeNote] = useState<string | null>(null)
  const [demoPair, setDemoPair] = useState<Pair | null>(loadPair)
  const [pairProgress, setPairProgress] = useState<Record<number, TestPipeline>>({})
  const [progressTick, setProgressTick] = useState(0)

  const selected = professors.find((row) => row.professor_id === professorId)
  const startTerm = terms.find((term) => term.term_id === selected?.start_term_id)
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return professors
    return professors.filter(
      (row) => row.professor_id === professorId || row.name.toLowerCase().includes(q),
    )
  }, [filter, professorId, professors])

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      getTestHarness(controller.signal),
      getEvaluationStatuses(undefined, controller.signal),
      getDemoPair(controller.signal),
    ])
      .then(([harness, status, pair]) => {
        setClock(toDateTimeLocal(harness.now))
        setFrozen(harness.frozen)
        setTerms(harness.terms)
        setProfessors(status.professors)
        if (!loadPair()) keepPair(pair.pair)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load the test harness')
      })
    return () => controller.abort()
  }, [])

  const pairA = demoPair?.a.professor_id
  const pairB = demoPair?.b.professor_id

  useEffect(() => {
    if (pairA === undefined || pairB === undefined) return
    const controller = new AbortController()
    Promise.all([getTestPipeline(pairA, controller.signal), getTestPipeline(pairB, controller.signal)])
      .then(([a, b]) => setPairProgress({ [pairA]: a, [pairB]: b }))
      .catch(() => {
        // Progress is a convenience; the pair itself still works.
      })
    return () => controller.abort()
  }, [pairA, pairB, progressTick, user.professorId, user.role])

  useEffect(() => {
    if (user.professorId != null) setProfessorId(user.professorId)
    setView(user.role === 'coordinator' ? 'coordinator' : 'faculty')
  }, [user.professorId, user.role])

  useEffect(() => {
    const row = professors.find((item) => item.professor_id === professorId)
    if (!row) return
    setLevel(row.current_level ?? '')
  }, [professorId, professors])

  const impersonate = (row: ProfessorEvaluationStatus, nextView: Role) => {
    onUser({
      ...user,
      role: nextView,
      name: row.name,
      title: nextView === 'coordinator' ? 'Assessment Committee' : (row.current_level || 'Faculty'),
      professorId: row.professor_id,
      tester: true,
      demo: true,
    })
    onReload()
  }

  const switchProfessor = (id: number) => {
    setProfessorId(id)
    const row = professors.find((item) => item.professor_id === id)
    if (!row) return
    if (id === user.professorId && view === user.role) return
    impersonate(row, view)
  }

  const switchView = (nextView: Role) => {
    setView(nextView)
    const row = professors.find((item) => item.professor_id === professorId)
    if (!row) return
    if (nextView === user.role && professorId === user.professorId) return
    impersonate(row, nextView)
  }

  const freezeClock = async () => {
    setBusy(true)
    setError(null)
    try {
      await setTestClock(clock ? `${clock}:00` : null)
      onReload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not set the clock')
    } finally {
      setBusy(false)
    }
  }

  const bumpDays = async (days: number) => {
    setBusy(true)
    setError(null)
    try {
      const result = await advanceTestDays(days)
      setClock(toDateTimeLocal(result.now))
      setFrozen(result.frozen)
      onReload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not move the clock')
    } finally {
      setBusy(false)
    }
  }

  const changeRank = async (next: string) => {
    setLevel(next)
    setBusy(true)
    setError(null)
    try {
      await setTestProfessor(professorId, { current_level: next || null })
      const status = await getEvaluationStatuses()
      setProfessors(status.professors)
      const row = status.professors.find((item) => item.professor_id === professorId)
      if (row) impersonate(row, view)
      else onReload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not set rank')
    } finally {
      setBusy(false)
    }
  }

  const toggleOpen = () => {
    const next = !open
    setOpen(next)
    try {
      sessionStorage.setItem(OPEN_KEY, next ? '1' : '0')
    } catch {
      // Session storage unavailable; collapse just lasts this render.
    }
  }

  const fillUnknowns = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await randomizeUnknowns()
      setRandomizeNote(
        `Filled ${result.filled} of ${result.unknown_before} Unknown; ${result.past_observations} past observations; cleared ${result.current_signups_cleared} current signups.`,
      )
      const [status, pair] = await Promise.all([getEvaluationStatuses(), getDemoPair()])
      setProfessors(status.professors)
      keepPair(pair.pair)
      onReload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not randomize Unknown professors')
    } finally {
      setBusy(false)
    }
  }

  const pickNewPair = async () => {
    setBusy(true)
    setError(null)
    try {
      const { pair } = await getDemoPair()
      if (pair && pair.a.professor_id === pairA && pair.b.professor_id === pairB) {
        setRandomizeNote('No other pair yet: this is still the first available pair. Sign them up to move on.')
      } else if (pair) {
        keepPair(pair)
        setRandomizeNote(null)
      } else {
        setRandomizeNote('No other Due pair is available, so the current pair was kept.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not pick a new pair')
    } finally {
      setBusy(false)
    }
  }

  const viewLabel = view === 'coordinator' ? 'AC' : 'Faculty'

  const lookAsPair = (person: DemoPairPerson) => {
    const row = professors.find((item) => item.professor_id === person.professor_id)
    if (row) {
      setView('faculty')
      impersonate(row, 'faculty')
      return
    }
    onUser({
      ...user,
      role: 'faculty',
      name: person.name,
      title: 'Faculty',
      professorId: person.professor_id,
      tester: true,
      demo: true,
    })
    onReload()
  }

  const classLabel = (person: DemoPairPerson) =>
    `${person.course_code}.${person.section_name} ${person.meeting_days ?? ''} ${person.start_time ?? ''}–${person.end_time ?? ''}`.trim()

  return (
    <div className="border-b border-[#c4561a]/30 bg-[#fdf1e6] px-4 py-2 text-[11px] text-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 flex-wrap items-center gap-1.5 font-medium">
          Tester · {user.name} · {viewLabel}
          <MockDataBadge />
          {demoPair && (
            <span className="font-normal text-neutral-700">
              Pair: {demoPair.a.name} ⇄ {demoPair.b.name}
            </span>
          )}
        </p>
        <button
          type="button"
          aria-expanded={open}
          onClick={toggleOpen}
          className="rounded border border-neutral-300 bg-white px-2 py-1"
        >
          {open ? 'Minimize' : 'Show tester controls'}
        </button>
      </div>
      {open && (
        <>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-0.5">
              Find
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Name"
                className="w-36 rounded border border-neutral-300 bg-white px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              Looking as
              <select
                value={professorId}
                onChange={(e) => switchProfessor(Number(e.target.value))}
                className="w-64 rounded border border-neutral-300 bg-white px-2 py-1"
              >
                {visible.map((row) => (
                  <option key={row.professor_id} value={row.professor_id}>
                    {row.name} · {row.status}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              View
              <select
                value={view}
                onChange={(e) => switchView(e.target.value as Role)}
                className="rounded border border-neutral-300 bg-white px-2 py-1"
              >
                <option value="faculty">Faculty (observee / observer)</option>
                <option value="coordinator">Assessment Committee</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              Dallas date/time {frozen ? '(frozen)' : '(live)'}
              <input
                type="datetime-local"
                value={clock}
                onChange={(e) => setClock(e.target.value)}
                className="rounded border border-neutral-300 bg-white px-2 py-1"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void freezeClock()}
              className="rounded bg-[#c4561a] px-3 py-1.5 font-medium text-white disabled:opacity-60"
            >
              {busy ? 'Working…' : 'Set date'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void bumpDays(1)}
              className="rounded border border-neutral-300 bg-white px-2 py-1.5"
            >
              +1 day
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void bumpDays(7)}
              className="rounded border border-neutral-300 bg-white px-2 py-1.5"
            >
              +7 days
            </button>
            <label className="flex flex-col gap-0.5">
              Rank
              <select
                value={level}
                onChange={(e) => void changeRank(e.target.value)}
                className="rounded border border-neutral-300 bg-white px-2 py-1"
              >
                <option value="">Unknown (no rank)</option>
                <option value="Assistant Professor">Assistant (yearly)</option>
                <option value="Associate Professor">Associate (every 2 years)</option>
                <option value="Full Professor">Full (every 2 years)</option>
              </select>
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void fillUnknowns()}
              className="rounded border border-neutral-300 bg-white px-2 py-1.5"
            >
              Randomize Unknown
            </button>
            {selected && (
              <span className="text-neutral-600">
                Due view: {selected.status}
                {selected.next_due_year ? ` · next ${selected.next_due_semester} ${selected.next_due_year}` : ''}
                {startTerm ? ` · started ${startTerm.semester} ${startTerm.year}` : ''}
              </span>
            )}
          </div>
          <p className="mt-1 text-neutral-600">
            Swap Looking as to sign up, send requests, or accept as someone else. Faculty vs AC
            changes the sidebar. Set date / +days moves the Dallas clock for signup and
            observation deadlines.
          </p>
          {randomizeNote && <p className="mt-1 text-neutral-600">{randomizeNote}</p>}
          <div className="mt-2 rounded border border-[#c4561a]/25 bg-white/70 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">Demo pair · stays the same until you pick a new one</p>
              <div className="flex gap-1.5">
                {demoPair && (
                  <button
                    type="button"
                    onClick={() => setProgressTick((n) => n + 1)}
                    className="rounded border border-[#c4561a]/40 px-2 py-0.5"
                  >
                    Refresh status
                  </button>
                )}
                <button
                  type="button"
                  onClick={pickNewPair}
                  disabled={busy}
                  className="rounded border border-[#c4561a]/40 px-2 py-0.5 disabled:opacity-50"
                >
                  Pick new pair
                </button>
              </div>
            </div>
            {demoPair ? (
              <div className="mt-1.5 flex flex-wrap items-start gap-3">
                {([demoPair.a, demoPair.b] as const).map((person) => (
                  <div key={person.professor_id} className="min-w-56 flex-1">
                    <p>
                      {person.name} · {person.course_level}-level
                    </p>
                    <p className="text-neutral-600">{classLabel(person)}</p>
                    {progressLines(pairProgress[person.professor_id]).map((line) => (
                      <p key={line} className="text-neutral-800">
                        {line}
                      </p>
                    ))}
                    <button
                      type="button"
                      onClick={() => lookAsPair(person)}
                      className="mt-1 rounded bg-[#c4561a] px-2 py-1 font-medium text-white"
                    >
                      Look as {person.name}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-neutral-600">
                No Due pair is free to observe each other yet. Randomize Unknown if ranks are
                missing, and keep this cycle’s signups empty.
              </p>
            )}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="mt-1 text-[#b3261e]">
          {error}
        </p>
      )}
    </div>
  )
}

export default TesterBar
