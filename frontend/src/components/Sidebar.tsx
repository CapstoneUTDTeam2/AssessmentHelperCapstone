import type { Role, User } from '../auth/demoAccounts'

const NAV_ITEMS: Record<Role, string[]> = {
  coordinator: ['Dashboard', 'Faculty', 'Courses', 'Evaluations', 'Reports', 'Evaluation Criteria', 'Settings'],
  faculty: ['Dashboard', 'My Profile', 'Evaluations', 'Settings'],
}

interface SidebarProps {
  user: User
  active: string
  onNavigate: (item: string) => void
  onSignOut: () => void
}

function Sidebar({ user, active, onNavigate, onSignOut }: SidebarProps) {
  return (
    <aside className="flex w-44 shrink-0 flex-col bg-[#1c4532] px-3 py-5 text-white">
      <div className="flex items-center gap-3 px-1.5">
        <div className="h-9 w-9 shrink-0 rounded-lg bg-[#e0791a]" aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">Assessment Helper</p>
          <p className="text-[10px] text-white/70">UT Dallas · CS</p>
        </div>
      </div>

      <nav className="mt-6 flex flex-col gap-1" aria-label="Main">
        {NAV_ITEMS[user.role].map((item) => {
          const isActive = item === active
          return (
            <a
              key={item}
              href="#"
              aria-current={isActive ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault()
                onNavigate(item)
              }}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-xs transition-colors ${
                isActive ? 'bg-[#e0791a] text-white' : 'text-white/85 hover:bg-white/10'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-white' : 'bg-white/60'}`}
                aria-hidden="true"
              />
              {item}
            </a>
          )
        })}
      </nav>

      <div className="mt-auto px-1.5">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 shrink-0 rounded-full bg-[#c4561a]" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{user.name}</p>
            <p className="truncate text-[10px] text-white/70">{user.title}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-4 flex w-full items-center gap-3 rounded-md px-1.5 py-2 text-xs text-white/85 transition-colors hover:bg-white/10"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-white/60" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
