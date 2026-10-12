import type { Sort } from '../hooks/useSortedRows'

interface SortHeaderProps<K extends string> {
  label: string
  sortKey: K
  sort: Sort<K>
  onSort: (key: K) => void
  first?: boolean
  last?: boolean
}

/** A table header cell that sorts its column when clicked. */
function SortHeader<K extends string>({ label, sortKey, sort, onSort, first, last }: SortHeaderProps<K>) {
  const active = sort.key === sortKey
  return (
    <th
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={`px-2 py-1.5 text-left font-normal ${first ? 'rounded-l' : ''} ${last ? 'rounded-r' : ''}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-1 whitespace-nowrap ${active ? 'font-medium text-neutral-900' : ''}`}
      >
        {label}
        <span className={active ? 'text-[#e0791a]' : ''} aria-hidden="true">
          {active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )
}

export default SortHeader
