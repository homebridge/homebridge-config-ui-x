/**
 * The pages that restart or shut down the host (or restart the Docker container) act as soon as they open. They
 * must only act when the user clicked the button just now: the browser's Back button, a reload or a restored tab
 * opens the same page again, and would reboot or shut down the machine a second time without asking.
 *
 * The button navigates with `CONFIRMED_ACTION_STATE` in the router state. The page takes it once: it is cleared
 * from the history entry here, so going back to the entry or reloading it finds it gone.
 */
export const CONFIRMED_ACTION_STATE = { uixConfirmedAction: true } as const

export function takeConfirmedAction(): boolean {
  const state = typeof history !== 'undefined'
    ? history.state
    : undefined
  if (state?.uixConfirmedAction !== true) {
    return false
  }
  history.replaceState({ ...state, uixConfirmedAction: false }, '')
  return true
}
