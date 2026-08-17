/// <reference types="vite/client" />

import { TestBed } from '@angular/core/testing'
import { ToastrService } from 'ngx-toastr'
import { describe, expect, it } from 'vitest'

import { AppToastComponent } from '@/app/core/components/app-toast/app-toast.component'
import { provideUiLibraries } from '@/app/core/providers/ui-libraries.providers'

/**
 * The third-party UI libraries, and the build configuration one of them depends
 * on.
 *
 * ⚠️ **Monaco is copied into the bundle by hand-written globs.** The editor is
 * not imported like a normal dependency: `angular.json` copies about twenty
 * named files out of `node_modules/monaco-editor` into `assets/monaco`, and
 * several of those names carry a build hash (`jsonMode-BQrCHXpg.js`). When a
 * monaco upgrade changes a hash or renames a chunk, the glob matches nothing.
 * Nothing fails — not the build, not the type check, not any other test — and
 * the config editor ships as a blank grey box. That has happened before.
 *
 * The check below is the cheap version of that: every glob in the build config
 * has to match at least one file that is actually installed.
 */
describe('the ui library configuration', () => {
  /**
   * The build configuration, read as text so the spec does not depend on the
   * json module resolution settings of the app.
   */
  const angularJson = JSON.parse(
    Object.values(import.meta.glob<string>('/angular.json', { query: '?raw', import: 'default', eager: true }))[0],
  )

  /**
   * Everything installed under the directories the asset globs copy from.
   *
   * `eager: false` so these are only ever a list of paths — nothing here is
   * imported, which matters because most of them are minified bundles and one
   * is a licence file.
   */
  const installed = Object.keys({
    ...import.meta.glob('/node_modules/monaco-editor/*', { eager: false }),
    ...import.meta.glob('/node_modules/monaco-editor/min/vs/*', { eager: false }),
    ...import.meta.glob('/node_modules/monaco-editor/min/vs/editor/**/*', { eager: false }),
    ...import.meta.glob('/node_modules/monaco-editor/min/vs/assets/*', { eager: false }),
    ...import.meta.glob('/node_modules/monaco-editor/min/vs/basic-languages/*', { eager: false }),
    ...import.meta.glob('/node_modules/@homebridge/plugin-ui-utils/dist/*', { eager: false }),
  }).map(path => path.replace(/^\//, ''))

  /** The copy instructions, ignoring the two plain directory entries. */
  const assets: Array<{ glob: string, input: string, output: string }> = angularJson
    .projects
    .ui
    .architect
    .build
    .options
    .assets
    .filter((asset: unknown) => typeof asset === 'object')

  /**
   * Turn one of the build's globs into something matchable.
   *
   * Only the two forms the config actually uses are handled - `*` within a
   * single path segment and a whole-tree `**\/*`.
   * @param pattern - the glob from angular.json
   */
  function globToRegExp(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\//g, '§§')
      .replace(/\*/g, '[^/]*')
      .replace(/§§/g, '(?:.*/)?')
    return new RegExp(`^${escaped}$`)
  }

  /**
   * Every installed file an asset entry would copy.
   * @param asset - one entry from the build config
   * @param asset.glob - the file name pattern it copies
   * @param asset.input - the directory it copies from
   */
  function matchesFor(asset: { glob: string, input: string }): string[] {
    const pattern = globToRegExp(asset.glob)
    return installed
      .filter(path => path.startsWith(`${asset.input}/`))
      .map(path => path.slice(asset.input.length + 1))
      .filter(path => pattern.test(path))
  }

  it('reads the build configuration it is checking', () => {
    // If this fails the rest of the block is checking an empty list, and would
    // pass no matter how broken the globs were
    expect(assets.length).toBeGreaterThan(15)
    expect(installed.length).toBeGreaterThan(50)
  })

  it.each(
    // Labelled by input and glob, so a failure names the file that went missing
    assets.map(asset => [`${asset.input.replace('node_modules/', '')} ${asset.glob}`, asset] as const),
  )('copies at least one file for %s', (_label, asset) => {
    expect(matchesFor(asset).length).toBeGreaterThan(0)
  })

  it('copies the json language support the config editor needs', () => {
    // The config editor is a json editor. Without jsonMode the file loads with
    // no schema, no validation and no completion - which looks like a broken
    // editor rather than a missing asset
    const jsonAssets = assets.filter(asset => asset.glob.includes('json'))

    expect(jsonAssets.length).toBeGreaterThan(0)
    for (const asset of jsonAssets) {
      expect(matchesFor(asset).length, `nothing matches ${asset.glob}`).toBeGreaterThan(0)
    }
  })

  it('loads the editor from where the build puts it', () => {
    // The two halves of the same decision, in different files: monaco's loader
    // is told a url, and the build has to copy the files to exactly that place
    const vsOutputs = assets
      .filter(asset => asset.input.includes('monaco-editor/min/vs'))
      .map(asset => asset.output)

    expect(vsOutputs).toContain('./assets/monaco/min/vs')
  })

  describe('the toasts', () => {
    it('shows them with the app toast component', () => {
      // The app has its own toast markup. Losing this leaves the default
      // ngx-toastr styling, which does not match the theme
      TestBed.resetTestingModule()
      TestBed.configureTestingModule({ providers: [provideUiLibraries()] })

      expect(TestBed.inject(ToastrService).toastrConfig.toastComponent).toBe(AppToastComponent)
    })

    it('keeps at most two on screen at once', () => {
      // A failing plugin can raise a toast per accessory; without a cap they
      // cover the page
      TestBed.resetTestingModule()
      TestBed.configureTestingModule({ providers: [provideUiLibraries()] })

      const config = TestBed.inject(ToastrService).toastrConfig
      expect(config.maxOpened).toBe(2)
      expect(config.autoDismiss).toBe(true)
    })

    it('stacks them oldest first in the bottom right', () => {
      TestBed.resetTestingModule()
      TestBed.configureTestingModule({ providers: [provideUiLibraries()] })

      const config = TestBed.inject(ToastrService).toastrConfig
      expect(config.positionClass).toBe('toast-bottom-right')
      expect(config.newestOnTop).toBe(false)
      expect(config.closeButton).toBe(true)
    })
  })
})
