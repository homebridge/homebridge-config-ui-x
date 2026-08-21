import type { SaveAs } from '@/app/core/utilities/file-saver.factory'
import type { TerminalFactory } from '@/app/core/utilities/terminal.factory'

import { vi } from 'vitest'

/**
 * A stand-in for xterm's Terminal, recording everything written and handing
 * back the disposables the services hold onto.
 *
 * ⚠️ Every method the app calls has to exist here. A missing one shows up as a
 * failure during the *cleanup* of later tests rather than on its own
 * assertion, which reads as a dozen broken tests instead of one gap.
 */
export class FakeTerminal {
  public written: string[] = []
  public cols = 80
  public rows = 24
  public buffer = { active: { length: 42 } }
  public dataHandlers: Array<(data: string) => void> = []
  public resizeHandlers: Array<(size: { cols: number, rows: number }) => void> = []
  public dataDisposed = false

  public loadAddon = vi.fn()
  public open = vi.fn()
  public reset = vi.fn()
  public clear = vi.fn()
  public focus = vi.fn()
  public dispose = vi.fn()
  public scrollToLine = vi.fn()

  constructor(public options: any) {}

  public write(data: string): void {
    this.written.push(String(data))
  }

  public onData(handler: (data: string) => void) {
    this.dataHandlers.push(handler)
    return {
      dispose: () => {
        this.dataDisposed = true
      },
    }
  }

  public onResize(handler: (size: { cols: number, rows: number }) => void) {
    this.resizeHandlers.push(handler)
    return { dispose: vi.fn() }
  }
}

export class FakeFitAddon {
  public fit = vi.fn()
}

export interface FakeTerminals {
  factory: TerminalFactory
  /** Every terminal built, in order. */
  terminals: FakeTerminal[]
  /** Every fit addon built, in order. */
  fits: FakeFitAddon[]
  /** The most recently built terminal. */
  term: () => FakeTerminal
  /** The most recently built fit addon. */
  fit: () => FakeFitAddon
  /** Forget everything built so far. */
  reset: () => void
}

/**
 * A stand-in for the terminal factory the app injects.
 *
 * ⚠️ This replaces `vi.mock('@xterm/xterm')`, which cannot work here: the
 * unit-test builder compiles the app through its build target, so xterm is
 * bundled into the app code and a module mock registered in the spec's own
 * graph never reaches it — the app quietly builds a real terminal and every
 * assertion reads `undefined`. Providing the token is the seam that survives
 * bundling.
 */
export function fakeTerminals(): FakeTerminals {
  const terminals: FakeTerminal[] = []
  const fits: FakeFitAddon[] = []

  const factory: TerminalFactory = {
    createTerminal: (options) => {
      const terminal = new FakeTerminal(options)
      terminals.push(terminal)
      return terminal as unknown as ReturnType<TerminalFactory['createTerminal']>
    },
    createFitAddon: () => {
      const addon = new FakeFitAddon()
      fits.push(addon)
      return addon as unknown as ReturnType<TerminalFactory['createFitAddon']>
    },
    createWebLinksAddon: () => ({}) as unknown as ReturnType<TerminalFactory['createWebLinksAddon']>,
  }

  return {
    factory,
    terminals,
    fits,
    term: () => terminals.at(-1)!,
    fit: () => fits.at(-1)!,
    reset: () => {
      terminals.length = 0
      fits.length = 0
    },
  }
}

/** A stand-in for the file-saver seam, recording what would have been saved. */
export function fakeSaveAs() {
  return vi.fn() as unknown as SaveAs & ReturnType<typeof vi.fn>
}
