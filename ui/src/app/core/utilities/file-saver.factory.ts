import { InjectionToken } from '@angular/core'
import { saveAs } from 'file-saver'

/**
 * How a file is handed to the browser to download.
 *
 * ⚠️ Injected rather than imported directly so a spec can see what would have
 * been saved. `vi.mock('file-saver')` cannot reach it: the unit-test builder
 * bundles third-party imports into the app, so the module mock never applies
 * and the spec would trigger a real download instead.
 */
export type SaveAs = (data: Blob | string, filename?: string) => void

export const SAVE_AS = new InjectionToken<SaveAs>('SAVE_AS', {
  providedIn: 'root',
  factory: () => (data, filename) => saveAs(data as Blob, filename),
})
