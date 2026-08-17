import type { FakeApi, FakeToastr } from '@/testing'

import { TestBed } from '@angular/core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeApi, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

vi.mock('file-saver', () => ({ saveAs: vi.fn() }))

/**
 * The two settings components the UI ships on behalf of a plugin, both of which
 * do exactly one thing: download that plugin's diagnostic dump.
 *
 * They are near-identical copies of each other, which is precisely the risk —
 * the endpoint, the filename and the error message all name the plugin, and a
 * copy-paste that misses one of them is invisible until a user downloads a hue
 * dump and gets a deconz error. So each rule is asserted against both.
 *
 * ⚠️ Both components are loaded with `await import()` rather than imported at
 * the top of the file. A top-level value import evaluates them against the real
 * `file-saver` before the mock registry is consulted, so `saveAs` records
 * nothing and the failure reads as "the component never saved anything" instead
 * of "the mock never applied". This is the same trap the log/terminal service
 * spec hit with xterm — it is not specific to one library.
 */
describe('the vendored plugin settings components', () => {
  let api: FakeApi
  let toastr: FakeToastr

  interface DumpComponent {
    downloadDumpFile: () => Promise<void>
  }

  /**
   * Build whichever of the two components a case asks for.
   * @param plugin - the plugin name, which is also its directory
   */
  async function create(plugin: 'homebridge-hue' | 'homebridge-deconz'): Promise<DumpComponent> {
    TestBed.resetTestingModule()
    api = fakeApi()
    toastr = toastrStub()

    // The two classes only differ in their private fields, so TypeScript will
    // not accept them as one type - they are only ever created, never compared
    const type: any = plugin === 'homebridge-hue'
      ? (await import('@/app/core/plugins/custom-plugins/homebridge-hue/homebridge-hue.component')).HomebridgeHueComponent
      : (await import('@/app/core/plugins/custom-plugins/homebridge-deconz/homebridge-deconz.component')).HomebridgeDeconzComponent

    TestBed.configureTestingModule({
      imports: [type],
      providers: [
        provideTestTranslate(),
        provideFakes({ api, toastr }),
      ],
    })

    const fixture = TestBed.createComponent(type)
    fixture.detectChanges()
    return fixture.componentInstance as DumpComponent
  }

  async function settle() {
    for (let tick = 0; tick < 10; tick += 1) {
      await Promise.resolve()
    }
  }

  /** The file-saver mock, cleared so each test reads only its own calls. */
  async function saver() {
    const { saveAs } = await import('file-saver')
    return vi.mocked(saveAs)
  }

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
    ;(await saver()).mockClear()
  })

  describe.each([
    ['homebridge-hue' as const, 'plugins.settings.hue.dump_no_exist'],
    ['homebridge-deconz' as const, 'plugins.settings.deconz.dump_no_exist'],
  ])('%s', (plugin, errorKey) => {
    it('asks for its own dump endpoint, as a blob', async () => {
      const component = await create(plugin)
      api.respond('get', `/plugins/custom-plugins/${plugin}/dump-file`, { body: new Blob(['dump']) })

      await component.downloadDumpFile()
      await settle()

      expect(api.lastCall('get')?.url).toBe(`/plugins/custom-plugins/${plugin}/dump-file`)
      // Without these the response arrives parsed as text and the saved file is
      // a corrupt gzip
      expect(api.lastCall('get')?.options).toEqual({ observe: 'response', responseType: 'blob' })
    })

    it('saves it under its own name', async () => {
      const component = await create(plugin)
      api.respond('get', `/plugins/custom-plugins/${plugin}/dump-file`, { body: new Blob(['dump']) })

      await component.downloadDumpFile()
      await settle()

      expect(await saver()).toHaveBeenCalledWith(expect.any(Blob), `${plugin}.json.gz`)
    })

    it('shows its own message when the plugin has never written a dump', async () => {
      const component = await create(plugin)
      api.fail('get', `/plugins/custom-plugins/${plugin}/dump-file`, new Error('404'))

      await component.downloadDumpFile()
      await settle()

      expect(toastr.error).toHaveBeenCalledWith(errorKey, 'toast.title_error')
      expect(console.error).toHaveBeenCalled()
    })

    it('saves nothing when the download failed', async () => {
      const component = await create(plugin)
      api.fail('get', `/plugins/custom-plugins/${plugin}/dump-file`, new Error('404'))

      await component.downloadDumpFile()
      await settle()

      expect(await saver()).not.toHaveBeenCalled()
    })
  })
})
