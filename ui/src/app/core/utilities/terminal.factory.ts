import type { ITerminalOptions, Terminal as TerminalType } from '@xterm/xterm'

import { InjectionToken } from '@angular/core'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'

/**
 * How the terminal and its addons get built.
 *
 * ⚠️ This exists so a spec can substitute a fake terminal. `vi.mock('@xterm/xterm')`
 * cannot: the unit-test builder compiles the app through its build target, which
 * bakes third-party imports into the app bundle, so a module mock registered in
 * the spec's own module graph never reaches the copy of xterm the component
 * holds — it quietly builds a real terminal instead, and every assertion reads
 * `undefined`. Angular DI is the one seam that survives bundling.
 */
export interface TerminalFactory {
  createTerminal: (options: ITerminalOptions) => TerminalType
  createFitAddon: () => FitAddon
  createWebLinksAddon: (handler?: (event: MouseEvent, uri: string) => void) => WebLinksAddon
}

export const TERMINAL_FACTORY = new InjectionToken<TerminalFactory>('TERMINAL_FACTORY', {
  providedIn: 'root',
  factory: () => ({
    createTerminal: options => new Terminal(options),
    createFitAddon: () => new FitAddon(),
    createWebLinksAddon: handler => new WebLinksAddon(handler),
  }),
})
