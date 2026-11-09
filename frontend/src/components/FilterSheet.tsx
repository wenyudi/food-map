import type { ReactNode } from 'react'
import Icon from '../ui/Icon'
import SheetShell from '../ui/SheetShell'
import Button from '../ui/Button'
import { STATUS_OPTS, filterCount } from '../lib/browse'
import type { Browse } from '../lib/useBrowse'
import { MOODS } from '../lib/moods'

type FilterSheetProps = Readonly<{
  browse: Browse
  myUsername?: string
  onClose: () => void
}>

/** 多维筛选（地图 / 列表共用同一份筛选状态） */
export default function FilterSheet({ browse, myUsername, onClose }: FilterSheetProps) {
  const { filters, facets, toggleFilter, visible, clearFilters } = browse
  const { moodCount, statusCount, cuisineList, authorList } = facets
  const activeCount = filterCount(filters)
  return (
    <SheetShell onClose={onClose}>
      <div className="flex items-center gap-3 mb-5 pr-10">
        <h3 className="text-xl font-bold tracking-tight">筛选</h3>
        {activeCount > 0 && (
          <button onClick={clearFilters} className="text-sm font-medium text-on-surface-variant flex items-center gap-1 press-sm animate-fade-in">
            <Icon name="restart_alt" className="text-base" /> 清空
          </button>
        )}
      </div>

      {MOODS.some((m) => moodCount[m] > 0) && (
        <FilterGroup title="好吃吗">
          {MOODS.filter((m) => moodCount[m] > 0).map((m) => (
            <FilterChip key={m} active={filters.moods.includes(m)} onClick={() => toggleFilter('moods', m)} label={m} count={moodCount[m]} big />
          ))}
        </FilterGroup>
      )}

      {STATUS_OPTS.some((s) => statusCount[s.key] > 0) && (
        <FilterGroup title="状态">
          {STATUS_OPTS.filter((s) => statusCount[s.key] > 0).map((s) => (
            <FilterChip key={s.key} active={filters.status.includes(s.key)} onClick={() => toggleFilter('status', s.key)} icon={s.icon} label={s.label} count={statusCount[s.key]} />
          ))}
        </FilterGroup>
      )}

      {cuisineList.length > 0 && (
        <FilterGroup title="菜系">
          {cuisineList.map((c) => (
            <FilterChip key={c.name} active={filters.cuisines.includes(c.name)} onClick={() => toggleFilter('cuisines', c.name)} label={c.name} count={c.n} />
          ))}
        </FilterGroup>
      )}

      {authorList.length > 1 && (
        <FilterGroup title="谁记的">
          {authorList.map((a) => (
            <FilterChip key={a.u} active={filters.authors.includes(a.u)} onClick={() => toggleFilter('authors', a.u)} label={a.u === myUsername ? `${a.nick}（我）` : a.nick} />
          ))}
        </FilterGroup>
      )}

      <Button full className="mt-2" onClick={onClose}>
        查看 <span key={visible.length} className="font-num tabular-nums inline-block animate-pop-in">{visible.length}</span> 家
      </Button>
    </SheetShell>
  )
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <div className="section-label mb-2.5">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function FilterChip({ active, onClick, icon, label, count, big }: { active: boolean; onClick: () => void; icon?: string; label: string; count?: number; big?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`chip press-sm ${big ? '!text-lg !py-1' : ''} ${active ? 'chip-on' : 'bg-white ring-1 ring-line text-on-surface'}`}
    >
      {icon && <Icon name={icon} filled={active} className="text-base" />}
      {label} {count != null && <em className={`not-italic text-xs font-num ${active ? 'text-white/75' : 'text-on-surface-variant'}`}>{count}</em>}
    </button>
  )
}
