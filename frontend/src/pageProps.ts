import type { User } from './auth/demoAccounts'

/** Props every page receives from App. */
export interface PageProps {
  /** Opens a page by name, optionally with a parameter such as a record id. */
  navigate: (page: string, param?: string) => void
  /** The parameter passed to `navigate`, or null. */
  param: string | null
  user: User
  onUser: (user: User) => void
}
