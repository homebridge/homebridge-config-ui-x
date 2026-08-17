import type { FakeApi, FakeModalService, FakeSettings, FakeToastr } from '@/testing'
import type { ComponentFixture } from '@angular/core/testing'

import { LOCALE_ID } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { ACCESSORY_CONTROL_LISTS_MODAL_DATA, CONFIRM_MODAL_DATA, NETWORK_INTERFACES_MODAL_DATA, REMOVE_INDIVIDUAL_ACCESSORIES_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { TerminalService } from '@/app/core/utilities/terminal.service'
import { AccessoryControlListsComponent } from '@/app/modules/settings/accessory-control-lists/accessory-control-lists.component'
import { BackupComponent } from '@/app/modules/settings/backup/backup.component'
import { PortOverviewModalComponent } from '@/app/modules/settings/port-overview-modal/port-overview-modal.component'
import { RemoveAllAccessoriesComponent } from '@/app/modules/settings/remove-all-accessories/remove-all-accessories.component'
import { RemoveBridgeAccessoriesComponent } from '@/app/modules/settings/remove-bridge-accessories/remove-bridge-accessories.component'
import { RemoveIndividualAccessoriesComponent } from '@/app/modules/settings/remove-individual-accessories/remove-individual-accessories.component'
import { ResetAllBridgesComponent } from '@/app/modules/settings/reset-all-bridges/reset-all-bridges.component'
import { ResetIndividualBridgesComponent } from '@/app/modules/settings/reset-individual-bridges/reset-individual-bridges.component'
import { SettingsComponent } from '@/app/modules/settings/settings.component'
import { WallpaperComponent } from '@/app/modules/settings/wallpaper/wallpaper.component'
import { fakeApi, locationReload, makeSettings, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The settings page has no save button: every control writes as soon as it
 * settles. That makes a mis-wired control silent - the user changes one thing
 * and something else is written, with nothing on screen to say so.
 *
 * These specs pin each control to the request it makes. Values are put in
 * through the form controls exactly as the template does, then the debounce
 * and the coalescing window are advanced by hand.
 */
describe('SettingsComponent', () => {
  let api: FakeApi
  let settings: FakeSettings
  let modal: FakeModalService
  let toastr: FakeToastr
  let fixture: ComponentFixture<SettingsComponent>
  let component: SettingsComponent
  // Stubbed rather than faked at the socket level: the page only asks whether a
  // terminal session is open, and the real one would pull the whole websocket and
  // auth chain into every case here. Rebuilt by each `create()` so a case can say
  // there is a live session before the page is built
  let terminal: { hasActiveSession: () => boolean, destroyPersistentSession: ReturnType<typeof vi.fn> }

  /** Longest debounce (1500ms) plus the 150ms coalescing window, with room. */
  const SETTLE_MS = 2000

  /**
   * Build the settings page.
   * @param env - environment overrides for the settings fake
   * @param locale - the locale the app booted with, when a case cares
   * @param breakApi - a chance to make a startup read fail. It has to happen here
   * rather than after the call: the reads go out from the constructor, so anything
   * arranged afterwards is too late and the page has already seen a good answer.
   */
  function create(env: Record<string, any> = {}, locale?: string, breakApi?: (api: FakeApi) => void): SettingsComponent {
    // ⚠️ Reset first: a second `create()` inside a test otherwise dies on "cannot
    // configure the test module when it has already been instantiated"
    TestBed.resetTestingModule()
    api = fakeApi()
      .respond('get', '/platform-tools/hb-service/homebridge-startup-settings', { HOMEBRIDGE_DEBUG: false, HOMEBRIDGE_KEEP_ORPHANS: false, HOMEBRIDGE_INSECURE: true, ENV_DEBUG: '', ENV_NODE_OPTIONS: '' })
      .respond('get', '/server/network-interfaces/system', [])
      .respond('get', '/server/network-interfaces/bridge', [])
      .respond('get', '/server/mdns-advertiser', { advertiser: 'ciao' })
      .respond('get', '/server/port', { port: 51826 })
      .respond('get', '/server/ports', { start: 52100, end: 52200 })
      .respond('get', '/config-editor/matter', { enabled: true, port: 5540 })
      .respond('get', '/config-editor/matter/ports', { start: 5550, end: 5560 })
      .respond('get', '/config-editor/hap', { enabled: true, externalsOnly: false, disableIdentifyingMaterial: false })
      .respond('get', '/server/port/new/matter', { port: 5541 })

    breakApi?.(api)

    settings = makeSettings({ env })
    toastr = toastrStub()
    modal = modalServiceSpy()
    terminal = { hasActiveSession: () => false, destroyPersistentSession: vi.fn() }

    TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({ api, settings, toastr, modal }),
        // Stubbed rather than faked at the socket level: the page only asks
        // whether a terminal session is open, and the real one would pull the
        // whole websocket and auth chain into every case here
        {
          provide: TerminalService,
          useValue: terminal,
        },
        // Only when a case cares: the real LOCALE_ID comes from the language
        // stored at bootstrap, so leaving Angular's 'en-US' default in place
        // would make every language change look like a locale change
        ...(locale ? [{ provide: LOCALE_ID, useValue: locale }] : []),
      ],
    })

    // ⚠️ The page navigates to /restart with a bare `void`, and no route is
    // registered here. Left to the real router that is an unhandled rejection
    // per case, which fails the whole run on its exit code while every test still
    // reports as passing. Cases that care about the navigation re-spy on top.
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)

    fixture = TestBed.createComponent(SettingsComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
    return component
  }

  /**
   * The component's private helpers, which the search tests read directly.
   *
   * The searchable text is built from translation keys, so a test that hard-coded
   * the labels would only be asserting the fixture's own copy of them.
   */
  function privates(): {
    getItemsContent: () => Record<string, string>
    getSectionContent: () => Record<string, string>
    getUnavailableItems: () => string[]
  } {
    return component as any
  }

  /** Let the awaits inside a save settle, without advancing any timers. */
  async function settleMicrotasks() {
    for (let tick = 0; tick < 12; tick += 1) {
      await Promise.resolve()
    }
  }

  /** Change a control the way the template does, then let it settle. */
  async function change(control: string, value: unknown): Promise<void> {
    api.clearCalls();
    (component as any)[control].setValue(value)
    await vi.advanceTimersByTimeAsync(SETTLE_MS)
  }

  /** The body of the single coalesced PATCH to the ui config. */
  function uiPatch(): Record<string, any> | undefined {
    return api.lastCall('patch', '/config-editor/ui')?.body
  }

  beforeEach(async () => {
    vi.useFakeTimers()
    create()
    // Let the parallel startup reads resolve before a spec touches anything
    await vi.advanceTimersByTimeAsync(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('settings stored in the ui config', () => {
    it.each([
      ['uiLangFormControl', 'de', 'lang', 'de'],
      ['uiThemeFormControl', 'teal', 'theme', 'teal'],
      ['uiTempFormControl', 'f', 'tempUnits', 'f'],
      ['uiMenuFormControl', 'freeze', 'menuMode', 'freeze'],
      ['hbPackageFormControl', '/usr/lib/homebridge', 'homebridgePackagePath', '/usr/lib/homebridge'],
      ['uiHostFormControl', '192.168.1.10', 'host', '192.168.1.10'],
      ['uiProxyHostFormControl', 'proxy.local', 'proxyHost', 'proxy.local'],
      ['uiTerminalBufferSizeFormControl', 5000, 'terminal.bufferSize', 5000],
      ['uiAccDebugFormControl', true, 'accessoryControl.debug', true],
      ['hbLinuxShutdownFormControl', '/sbin/poweroff', 'linux.shutdown', '/sbin/poweroff'],
      ['hbLinuxRestartFormControl', '/sbin/reboot', 'linux.restart', '/sbin/reboot'],
      ['uiTempFileFormControl', '/sys/class/thermal/thermal_zone0/temp', 'temp', '/sys/class/thermal/thermal_zone0/temp'],
      ['enableMdnsAdvertiseFormControl', false, 'enableMdnsAdvertise', false],
    ])('%s writes %s', async (control, value, key, expected) => {
      await change(control, value)

      expect(uiPatch()).toMatchObject({ [key]: expected })
    })

    it('turns the metrics switch into the disable flag the server stores', async () => {
      // The switch reads "monitoring on", the config key means the opposite
      await change('uiMetricsFormControl', false)

      expect(uiPatch()).toMatchObject({ disableServerMetricsMonitoring: true })
    })

    it('turns the login switch into an auth mode', async () => {
      await change('uiAuthFormControl', false)

      expect(uiPatch()).toMatchObject({ auth: 'none' })
    })

    it('sends one request when several settings settle together', async () => {
      api.clearCalls()
      component.uiLangFormControl.setValue('fr')
      component.uiTempFormControl.setValue('f')
      component.uiAccDebugFormControl.setValue(true)
      await vi.advanceTimersByTimeAsync(SETTLE_MS)

      // The coalescing window is what stops three quick changes becoming
      // three writes to the same file
      expect(api.callsTo('patch', '/config-editor/ui')).toHaveLength(1)
      expect(uiPatch()).toMatchObject({ 'lang': 'fr', 'tempUnits': 'f', 'accessoryControl.debug': true })
    })
  })

  /**
   * Changing the language has to reload the page.
   *
   * ⚠️ Translated text switches straight away, but `LOCALE_ID` — which every
   * date, time and number pipe reads — is resolved once by Angular at bootstrap
   * and cannot be resolved again in a running app. Without the reload the page
   * keeps formatting for the previous language until the user happens to refresh:
   * German labels above English date order.
   *
   * The reload must come **after** the choice has been saved, and must not happen
   * when the formats would not change anyway.
   */
  describe('changing the language', () => {
    /**
     * Set the page up with a known bootstrap locale and browser language.
     * @param options - the state to start from
     * @param options.locale - the locale the app booted with
     * @param options.browser - the browser language, for the 'auto' cases
     */
    async function open(options: { locale: string, browser?: string }) {
      TestBed.resetTestingModule()
      window.localStorage.clear()
      vi.spyOn(TranslateService.prototype, 'getBrowserLang').mockReturnValue(options.browser)
      vi.spyOn(TranslateService.prototype, 'getBrowserCultureLang').mockReturnValue(options.browser)

      create({}, options.locale)
      // Same as the outer setup: let the page's startup reads resolve, or the
      // form control change is swallowed by the values they patch in
      await vi.advanceTimersByTimeAsync(0)
      // The real SettingsService persists the choice, which is what the reload
      // decision is read back from; the fake only records the call
      vi.mocked(settings.setLang).mockImplementation((lang: string) => {
        window.localStorage.setItem('uix.lang', lang)
      })
      locationReload.mockClear()
    }

    it('reloads so dates and numbers follow the new language', async () => {
      await open({ locale: 'en' })

      await change('uiLangFormControl', 'de')

      expect(locationReload).toHaveBeenCalled()
    })

    it('saves the choice before reloading it away', async () => {
      // A reload with the write still in flight loses the language the user just
      // picked, and they would have to pick it again in whatever locale the page
      // came back in
      await open({ locale: 'en' })

      await change('uiLangFormControl', 'de')

      expect(uiPatch()).toMatchObject({ lang: 'de' })
      expect(vi.mocked(api.patch).mock.invocationCallOrder[0])
        .toBeLessThan(locationReload.mock.invocationCallOrder[0])
    })

    it('does not reload when the save failed', async () => {
      // The old language is still the saved one, so there is nothing to reload
      // into - and the error toast would be wiped off the screen
      await open({ locale: 'en' })
      api.fail('patch', '/config-editor/ui', new Error('config not writable'))

      await change('uiLangFormControl', 'de')

      expect(locationReload).not.toHaveBeenCalled()
    })

    it('does not reload when both languages format the same way', async () => {
      // Portuguese and Brazilian portuguese share one angular locale: the text
      // changes, the dates and numbers do not
      await open({ locale: 'pt' })

      await change('uiLangFormControl', 'pt-BR')

      expect(locationReload).not.toHaveBeenCalled()
    })

    it('does not reload when auto lands on the language already in use', async () => {
      // The browser is set to german and the user switches from german to auto
      await open({ locale: 'de', browser: 'de' })

      await change('uiLangFormControl', 'auto')

      expect(locationReload).not.toHaveBeenCalled()
    })

    it('reloads when auto lands on a different language', async () => {
      await open({ locale: 'de', browser: 'fr' })

      await change('uiLangFormControl', 'auto')

      expect(locationReload).toHaveBeenCalled()
    })

    it('still tells the settings service, so the ui text changes at once', async () => {
      // The reload makes the formats right; this is what makes the labels right
      // in the meantime
      await open({ locale: 'en' })

      await change('uiLangFormControl', 'de')

      expect(settings.setLang).toHaveBeenCalledWith('de')
    })
  })

  describe('settings with their own endpoint', () => {
    it('sends the homebridge name to the server endpoint', async () => {
      await change('hbNameFormControl', 'Front Room')

      expect(api.lastCall('put', '/server/name')?.body).toEqual({ name: 'Front Room' })
    })

    it('sends the mdns advertiser', async () => {
      await change('hbMDnsFormControl', 'avahi')

      expect(api.lastCall('put', '/server/mdns-advertiser')?.body).toEqual({ advertiser: 'avahi' })
    })

    it('sends the homebridge port', async () => {
      await change('hbPortFormControl', 51830)

      expect(api.lastCall('put', '/server/port')?.body).toEqual({ port: 51830 })
    })

    it('sends the homebridge port range', async () => {
      await change('hbStartPortFormControl', 52000)

      expect(api.lastCall('put', '/server/ports')?.body).toMatchObject({ start: 52000 })
    })
  })

  /**
   * The rows the page locks, and the stored values it refuses to trust.
   *
   * ⚠️ **Some of these settings can make the UI unreachable from the very window
   * you are changing them in.** Installed as a home-screen app there is no address
   * bar to type the new one into, so a wrong port leaves the user with an app icon
   * that opens a blank page and no way back.
   */
  describe('the rows the page will not let you change', () => {
    /**
     * Build the page as an installed app.
     *
     * ⚠️ `isPwa` is read part-way through the startup, after the first await, so
     * setting it here lands in time. Mocking the module it comes from does not
     * work - it stops intercepting as soon as this file grows another import.
     */
    async function asInstalledApp() {
      create()
      component.isPwa = true
      await vi.advanceTimersByTimeAsync(0)
      return component
    }

    it.each([
      ['the ui port', 'uiPortFormControl'],
      ['the host it binds to', 'uiHostFormControl'],
      ['the proxy host', 'uiProxyHostFormControl'],
      ['the certificate mode', 'uiSslTypeFormControl'],
    ])('locks %s in an installed app', async (_case, control) => {
      const page = await asInstalledApp()

      expect((page as any)[control].disabled).toBe(true)
    })

    it('leaves them alone in an ordinary browser tab', async () => {
      create()
      await vi.advanceTimersByTimeAsync(0)

      expect(component.uiPortFormControl.disabled).toBe(false)
      expect(component.uiHostFormControl.disabled).toBe(false)
    })

    it('locks the certificate mode on the raspberry pi image', async () => {
      // The image manages its own certificates, so a change here would be undone
      create({ runningOnRaspbianImage: true })
      await vi.advanceTimersByTimeAsync(0)

      expect(component.uiSslTypeFormControl.disabled).toBe(true)
    })

    it('locks the terminal colours when the whole ui is dark', async () => {
      // A light terminal inside a dark page is the one combination that is not
      // offered, so the box is disabled rather than silently ignored
      create()
      settings.actualLightingMode = 'dark'
      await vi.advanceTimersByTimeAsync(0)

      expect(component.uiTerminalLightingModeFormControl.disabled).toBe(true)
    })
  })

  /**
   * Values already in the config that the page will not use.
   *
   * ⚠️ **A bad value is deleted, not just ignored.** Left in place it would be
   * read again on every load, and the box would keep showing the default while the
   * file said something else.
   */
  describe('stored values it refuses to trust', () => {
    /** Which config key the page asked the server to delete. */
    function deleted(): string[] {
      return api.callsTo('delete').map(call => call.url)
    }

    it.each([
      ['a font size below the smallest offered', { fontSize: 8 }, 'terminal.fontSize'],
      ['a font size above the largest offered', { fontSize: 24 }, 'terminal.fontSize'],
      ['a font weight that is not one of the choices', { fontWeight: '450' }, 'terminal.fontWeight'],
    ])('deletes %s', async (_case, terminal, key) => {
      create({ terminal })
      await vi.advanceTimersByTimeAsync(0)

      expect(deleted()).toContain(`/config-editor/ui/${key}`)
    })

    it.each([
      ['the font size', { fontSize: 8 }, 'uiTerminalFontSizeFormControl', 13],
      ['the font weight', { fontWeight: '450' }, 'uiTerminalFontWeightFormControl', '400'],
    ])('falls back to the default for %s', async (_case, terminal, control, expected) => {
      create({ terminal })
      await vi.advanceTimersByTimeAsync(0)

      expect((component as any)[control].value).toBe(expected)
    })

    it.each([
      ['a font size inside the range', { fontSize: 16 }],
      ['a listed font weight', { fontWeight: 'bold' }],
      ['nothing stored at all', {}],
    ])('leaves %s alone', async (_case, terminal) => {
      create({ terminal })
      await vi.advanceTimersByTimeAsync(0)

      expect(deleted()).toEqual([])
    })

    it('keeps the stored value when it is a good one', async () => {
      create({ terminal: { fontSize: 16, fontWeight: 'bold' } })
      await vi.advanceTimersByTimeAsync(0)

      expect(component.uiTerminalFontSizeFormControl.value).toBe(16)
      expect(component.uiTerminalFontWeightFormControl.value).toBe('bold')
    })

    it('carries on when the delete itself fails', async () => {
      // ⚠️ Deliberately quiet: the user did not ask for this, and a toast about a
      // setting they have never heard of on every page load would be noise. The
      // box still shows the default, which is what they actually see
      vi.spyOn(console, 'error').mockImplementation(() => {})
      create({ terminal: { fontSize: 8 } }, undefined, broken =>
        broken.fail('delete', '/config-editor/ui/terminal.fontSize', new Error('config not writable')))
      await vi.advanceTimersByTimeAsync(0)

      expect(toastr.error).not.toHaveBeenCalled()
      expect(component.uiTerminalFontSizeFormControl.value).toBe(13)
      expect(component.loading()).toBe(false)
    })
  })

  describe('startup settings', () => {
    it.each([
      ['hbDebugFormControl', 'HOMEBRIDGE_DEBUG'],
      ['hbInsecureFormControl', 'HOMEBRIDGE_INSECURE'],
      ['hbKeepFormControl', 'HOMEBRIDGE_KEEP_ORPHANS'],
    ])('%s writes the whole startup block', async (control, key) => {
      await change(control, true)

      const body = api.lastCall('put', '/platform-tools/hb-service/homebridge-startup-settings')?.body
      // The endpoint replaces the block wholesale, so every field has to be
      // sent or the others are wiped
      expect(body).toMatchObject({ [key]: true })
      expect(Object.keys(body!)).toEqual(expect.arrayContaining(['HOMEBRIDGE_DEBUG', 'HOMEBRIDGE_INSECURE', 'HOMEBRIDGE_KEEP_ORPHANS', 'ENV_DEBUG', 'ENV_NODE_OPTIONS']))
    })

    it.each([
      ['hbDebugFormControl', true],
      ['hbEnvDebugFormControl', 'homebridge*'],
      ['uiMetricsFormControl', false],
      ['uiTempFileFormControl', '/tmp/temp'],
      ['hbLinuxShutdownFormControl', '/sbin/poweroff'],
    ])('%s asks for a full service restart', async (control, value) => {
      await change(control, value)
      await vi.advanceTimersByTimeAsync(2000)

      // These only take effect when the whole service restarts, not when
      // homebridge alone bounces
      expect(api.callsTo('put', '/platform-tools/hb-service/set-full-service-restart-flag')).toHaveLength(1)
    })
  })

  describe('refusing values that would break things', () => {
    it.each([
      ['an empty homebridge name', 'hbNameFormControl', ''],
      ['a homebridge name with a leading space', 'hbNameFormControl', ' Front Room'],
      ['a homebridge name of punctuation', 'hbNameFormControl', '***'],
    ])('rejects %s', async (_case, control, value) => {
      await change(control, value)

      // HAP refuses these outright, so the accessory would never publish
      expect(api.callsTo('put', '/server/name')).toHaveLength(0)
      expect(component.hbNameIsInvalid()).toBe(true)
    })

    it.each([
      ['below the reserved range', 1024],
      ['above the maximum', 65534],
      ['not a whole number', 8581.5],
    ])('rejects a ui port %s', async (_case, port) => {
      await change('uiPortFormControl', port)

      expect(uiPatch()?.port).toBeUndefined()
      expect(component.uiPortIsInvalid()).toBe(true)
    })

    it('refuses to put the ui on the homebridge port', async () => {
      // They are two servers; sharing a port means one of them fails to bind
      await change('uiPortFormControl', component.hbPortFormControl.value)

      expect(uiPatch()?.port).toBeUndefined()
      expect(component.uiPortIsInvalid()).toBe(true)
    })

    it('refuses a homebridge port range that ends before it starts', async () => {
      component.hbEndPortFormControl.setValue(52000)
      await vi.advanceTimersByTimeAsync(SETTLE_MS)
      await change('hbStartPortFormControl', 53000)

      expect(api.callsTo('put', '/server/ports')).toHaveLength(0)
    })

    it.each([5353, 8080, 8443])('refuses the reserved matter port %s', async (port) => {
      await change('matterPortFormControl', port)

      expect(api.callsTo('put', '/config-editor/matter')).toHaveLength(0)
      expect(component.matterPortIsInvalid()).toBe(true)
    })

    it.each([
      ['too few fields', '* * *'],
      ['a letter in a field', '0 4 * * MON'],
    ])('rejects a restart schedule with %s', async (_case, cron) => {
      await change('scheduledRestartCronFormControl', cron)

      expect(uiPatch()?.scheduledRestartCron).toBeUndefined()
      expect(component.scheduledRestartCronIsInvalid()).toBe(true)
    })

    it('accepts a valid restart schedule', async () => {
      await change('scheduledRestartCronFormControl', '0 4 * * *')

      expect(uiPatch()).toMatchObject({ scheduledRestartCron: '0 4 * * *' })
    })

    it('clears the schedule when the field is emptied', async () => {
      await change('scheduledRestartCronFormControl', '')

      expect(uiPatch()).toMatchObject({ scheduledRestartCron: null })
    })

    it('rejects a log size below the unlimited marker', async () => {
      await change('hbLogSizeFormControl', -2)

      expect(uiPatch()?.['log.maxSize']).toBeUndefined()
    })

    it('clears the truncate size when the log is set to unlimited', async () => {
      await change('hbLogSizeFormControl', -1)

      // A truncate size means nothing without a maximum, and leaving it set
      // would keep trimming a log the user asked to keep. The clear is awaited
      // before the size is written, so the two arrive as separate requests
      const written = Object.assign({}, ...api.callsTo('patch', '/config-editor/ui').map(call => call.body))
      expect(written).toMatchObject({ 'log.maxSize': -1, 'log.truncateSize': null })
    })
  })

  describe('the session timeout', () => {
    it('adds the three fields up into seconds', async () => {
      component.uiSessionTimeoutHoursFormControl.setValue(2)
      component.uiSessionTimeoutMinutesFormControl.setValue(30)
      await change('uiSessionTimeoutDaysFormControl', 1)

      expect(uiPatch()).toMatchObject({ sessionTimeout: 95400 })
    })

    it('refuses a timeout shorter than ten minutes', async () => {
      component.uiSessionTimeoutDaysFormControl.setValue(0)
      component.uiSessionTimeoutHoursFormControl.setValue(0)
      await change('uiSessionTimeoutMinutesFormControl', 5)

      // Anything shorter logs the user out mid-task
      expect(uiPatch()?.sessionTimeout).toBeUndefined()
      expect(component.uiSessionTimeoutMinutesIsInvalid()).toBe(true)
    })

    it.each([
      ['more days than a year', 'uiSessionTimeoutDaysFormControl', 400, 'uiSessionTimeoutDaysIsInvalid'],
      ['more hours than a day', 'uiSessionTimeoutHoursFormControl', 24, 'uiSessionTimeoutHoursIsInvalid'],
      ['more minutes than an hour', 'uiSessionTimeoutMinutesFormControl', 60, 'uiSessionTimeoutMinutesIsInvalid'],
      ['part of a day', 'uiSessionTimeoutDaysFormControl', 1.5, 'uiSessionTimeoutDaysIsInvalid'],
      ['a negative number of hours', 'uiSessionTimeoutHoursFormControl', -1, 'uiSessionTimeoutHoursIsInvalid'],
    ])('refuses %s', async (_case, control, value, invalid) => {
      // Each field carries its own units, so 90 minutes has to be entered as an
      // hour and a half rather than overflowing into the next field
      await change(control, value)

      expect(uiPatch()?.sessionTimeout).toBeUndefined()
      expect((component as any)[invalid]()).toBe(true)
    })

    it.each([
      ['a year of days', 'uiSessionTimeoutDaysFormControl', 365, 31536000],
      ['the last hour of a day', 'uiSessionTimeoutHoursFormControl', 23, 82800],
      ['the last minute of an hour', 'uiSessionTimeoutMinutesFormControl', 59, 3540],
    ])('accepts %s', async (_case, control, value, expected) => {
      // The top of each field's range is a valid entry, not one past it
      component.uiSessionTimeoutDaysFormControl.setValue(0, { emitEvent: false })
      component.uiSessionTimeoutHoursFormControl.setValue(0, { emitEvent: false })
      component.uiSessionTimeoutMinutesFormControl.setValue(0, { emitEvent: false })

      await change(control, value)

      expect(uiPatch()).toMatchObject({ sessionTimeout: expected })
    })

    it('treats an emptied field as zero', async () => {
      // Clearing the days box should mean "no days", not "no timeout"
      component.uiSessionTimeoutDaysFormControl.setValue(null)
      component.uiSessionTimeoutMinutesFormControl.setValue(0)
      await change('uiSessionTimeoutHoursFormControl', 12)

      expect(uiPatch()).toMatchObject({ sessionTimeout: 43200 })
      expect(component.uiSessionTimeoutDaysIsInvalid()).toBe(false)
    })

    it('puts the zero back in an emptied box', async () => {
      // The page reads a blank box as zero, so it writes the zero back rather than
      // leaving the user looking at a blank that means something
      component.uiSessionTimeoutDaysFormControl.setValue(null, { emitEvent: false })

      await change('uiSessionTimeoutHoursFormControl', 12)

      expect(component.uiSessionTimeoutDaysFormControl.value).toBe(0)
    })

    it('asks for a restart, because sessions are minted at startup', async () => {
      await change('uiSessionTimeoutHoursFormControl', 12)
      await vi.advanceTimersByTimeAsync(1000)

      expect(settings.showRestartToast).toHaveBeenCalled()
    })

    it('saves the inactivity setting on its own', async () => {
      await change('uiSessionTimeoutInactivityBasedFormControl', true)

      expect(uiPatch()).toMatchObject({ sessionTimeoutInactivityBased: true })
      expect(settings.setItem).toHaveBeenCalledWith('sessionTimeoutInactivityBased', true)
    })
  })

  /**
   * What the page does when a write fails.
   *
   * ⚠️ **There is no save button, so the error toast and the spinner stopping are
   * the only things telling the user a setting did not stick.** Every control has
   * to let the failure reach its own catch block.
   *
   * ⚠️ **A helper used to report the failure and then resolve anyway**, which left
   * every control running its success path over a write that never landed: the
   * "invalid" marker cleared over a value the server had rejected, a restart asked
   * for that would apply nothing, and the menu mode reloading the page over the
   * top of its own error toast. These cases are what stop that coming back.
   */
  describe('when a write fails', () => {
    const UI_CONFIG = { method: 'patch', url: '/config-editor/ui' }
    const STARTUP = { method: 'put', url: '/platform-tools/hb-service/homebridge-startup-settings' }

    /** Every control, the write it makes, and the spinner it owns. */
    const CONTROLS = [
      { control: 'uiThemeFormControl', value: 'teal', saving: 'uiThemeIsSaving', ...UI_CONFIG },
      { control: 'uiLightFormControl', value: 'dark', saving: 'uiLightIsSaving', ...UI_CONFIG },
      { control: 'uiMenuFormControl', value: 'freeze', saving: 'uiMenuIsSaving', ...UI_CONFIG },
      { control: 'uiTempFormControl', value: 'f', saving: 'uiTempIsSaving', ...UI_CONFIG },
      { control: 'uiTerminalPersistenceFormControl', value: true, saving: 'uiTerminalPersistenceIsSaving', ...UI_CONFIG },
      { control: 'uiTerminalHideWarningFormControl', value: true, saving: 'uiTerminalHideWarningIsSaving', ...UI_CONFIG },
      { control: 'uiTerminalBufferSizeFormControl', value: 5000, saving: 'uiTerminalBufferSizeIsSaving', ...UI_CONFIG },
      { control: 'uiTerminalFontSizeFormControl', value: 14, saving: 'uiTerminalFontSizeIsSaving', ...UI_CONFIG },
      { control: 'uiTerminalFontWeightFormControl', value: '600', saving: 'uiTerminalFontWeightIsSaving', ...UI_CONFIG },
      { control: 'uiTerminalLightingModeFormControl', value: 'light', saving: 'uiTerminalLightingModeIsSaving', ...UI_CONFIG },
      { control: 'hbLogSizeFormControl', value: 100, saving: 'hbLogSizeIsSaving', ...UI_CONFIG },
      { control: 'hbLogTruncateFormControl', value: 50, saving: 'hbLogTruncateIsSaving', ...UI_CONFIG },
      { control: 'enableMdnsAdvertiseFormControl', value: true, saving: 'enableMdnsAdvertiseIsSaving', ...UI_CONFIG },
      { control: 'uiPortFormControl', value: 8582, saving: 'uiPortIsSaving', ...UI_CONFIG },
      { control: 'uiAuthFormControl', value: false, saving: 'uiAuthIsSaving', ...UI_CONFIG },
      { control: 'uiSessionTimeoutInactivityBasedFormControl', value: true, saving: 'uiSessionTimeoutInactivityBasedIsSaving', ...UI_CONFIG },
      { control: 'uiSessionTimeoutHoursFormControl', value: 12, saving: 'uiSessionTimeoutIsSaving', ...UI_CONFIG },
      { control: 'uiHostFormControl', value: '192.168.1.5', saving: 'uiHostIsSaving', ...UI_CONFIG },
      { control: 'uiProxyHostFormControl', value: 'proxy.local', saving: 'uiProxyHostIsSaving', ...UI_CONFIG },
      { control: 'hbPackageFormControl', value: '/usr/lib/homebridge', saving: 'hbPackageIsSaving', ...UI_CONFIG },
      { control: 'uiMetricsFormControl', value: false, saving: 'uiMetricsIsSaving', ...UI_CONFIG },
      { control: 'uiAccDebugFormControl', value: true, saving: 'uiAccDebugIsSaving', ...UI_CONFIG },
      { control: 'uiTempFileFormControl', value: '/tmp/temp', saving: 'uiTempFileIsSaving', ...UI_CONFIG },
      { control: 'hbLinuxShutdownFormControl', value: '/sbin/poweroff', saving: 'hbLinuxShutdownIsSaving', ...UI_CONFIG },
      { control: 'hbLinuxRestartFormControl', value: '/sbin/reboot', saving: 'hbLinuxRestartIsSaving', ...UI_CONFIG },
      { control: 'scheduledRestartCronFormControl', value: '0 4 * * *', saving: 'scheduledRestartCronIsSaving', ...UI_CONFIG },
      { control: 'hbNameFormControl', value: 'Front Room', saving: 'hbNameIsSaving', method: 'put', url: '/server/name' },
      { control: 'hbMDnsFormControl', value: 'avahi', saving: 'hbMDnsIsSaving', method: 'put', url: '/server/mdns-advertiser' },
      { control: 'hbPortFormControl', value: 51830, saving: 'hbPortIsSaving', method: 'put', url: '/server/port' },
      { control: 'hbStartPortFormControl', value: 52000, saving: 'hbStartPortIsSaving', method: 'put', url: '/server/ports' },
      { control: 'hbEndPortFormControl', value: 52500, saving: 'hbEndPortIsSaving', method: 'put', url: '/server/ports' },
      { control: 'hbDebugFormControl', value: true, saving: 'hbDebugIsSaving', ...STARTUP },
      { control: 'hbInsecureFormControl', value: false, saving: 'hbInsecureIsSaving', ...STARTUP },
      { control: 'hbKeepFormControl', value: true, saving: 'hbKeepIsSaving', ...STARTUP },
      { control: 'hbEnvDebugFormControl', value: 'homebridge*', saving: 'hbEnvDebugIsSaving', ...STARTUP },
      { control: 'hbEnvNodeFormControl', value: '--max-old-space-size=256', saving: 'hbEnvNodeIsSaving', ...STARTUP },
    ]

    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(console.error).mockClear()
      vi.mocked(settings.showRestartToast).mockClear()
      vi.mocked(toastr.error).mockClear()
      locationReload.mockClear()
    })

    it.each(CONTROLS)('tells the user $control could not be saved', async ({ control, value, method, url, saving }) => {
      api.fail(method as any, url, new Error('config not writable'))

      await change(control, value)
      // Past the one-second delay the success path uses, so a spinner cleared
      // there rather than in the catch would look the same as one cleared here
      await vi.advanceTimersByTimeAsync(2000)

      expect(toastr.error).toHaveBeenCalledOnce()
      expect(console.error).toHaveBeenCalled()
      expect((component as any)[saving]()).toBe(false)
    })

    it.each(CONTROLS)('does not ask for a restart when $control fails', async ({ control, value, method, url }) => {
      // A restart applies what is on disk, and the failed write is not on disk:
      // restarting would only make the user watch homebridge go down and come
      // back with the setting they just changed still on its old value
      api.fail(method as any, url, new Error('config not writable'))

      await change(control, value)
      await vi.advanceTimersByTimeAsync(2000)

      expect(settings.showRestartToast).not.toHaveBeenCalled()
    })

    it('does not reload the page when the menu mode fails to save', async () => {
      // ⚠️ The reload is how the frozen menu takes effect, and it wipes the error
      // toast off the screen on its way. The user would be left with the menu
      // unchanged and nothing at all to say why
      api.fail('patch', '/config-editor/ui', new Error('config not writable'))

      await change('uiMenuFormControl', 'freeze')

      expect(locationReload).not.toHaveBeenCalled()
      expect(toastr.error).toHaveBeenCalledOnce()
    })

    it.each([
      ['hbStartPortFormControl', 52000, 'hbStartPortIsInvalid'],
      ['hbEndPortFormControl', 52500, 'hbEndPortIsInvalid'],
    ])('marks %s as unsaved when the range write fails', async (control, value, invalid) => {
      // The value in the box is not the value in use, and the two port boxes are
      // the ones where that gap actually breaks pairing
      api.fail('put', '/server/ports', new Error('config not writable'))

      await change(control, value)

      expect((component as any)[invalid]()).toBe(true)
    })

    it('leaves the log size marked invalid when its write fails', async () => {
      api.fail('patch', '/config-editor/ui', new Error('config not writable'))
      component.hbLogSizeIsInvalid.set(true)

      await change('hbLogSizeFormControl', 100)

      expect(component.hbLogSizeIsInvalid()).toBe(true)
    })

    it('stops the theme fading back in when the theme fails to save', async () => {
      // The fade-out is the page dimming while the theme changes. Left on, the
      // whole page stays half-transparent with no way back but a reload
      api.fail('patch', '/config-editor/ui', new Error('config not writable'))

      await change('uiThemeFormControl', 'teal')

      expect(component.isThemeTransitioning()).toBe(false)
      expect(component.uiThemeIsSaving()).toBe(false)
    })
  })

  /**
   * Turning off the terminal session that survives navigation.
   *
   * ⚠️ **Switching this off throws away whatever is running in the terminal.** A
   * long install or a tail that has been going for an hour is gone, so the user is
   * asked first — but only when there is actually a session to lose.
   */
  describe('turning off the persistent terminal', () => {
    beforeEach(() => {
      // Set after `create()`, which is fine: the page asks at save time, not at
      // startup, so there is nothing to arrange beforehand
      terminal.hasActiveSession = () => true
    })

    it('asks before throwing a live session away', async () => {
      component.uiTerminalPersistenceFormControl.setValue(false)
      await vi.advanceTimersByTimeAsync(SETTLE_MS)

      expect(modal.lastOpened()!.content).toBe(ConfirmComponent)
      expect(modal.dataFor(CONFIRM_MODAL_DATA)).toMatchObject({ confirmButtonClass: 'btn-primary' })
    })

    it('cannot be clicked away, so the answer is deliberate', async () => {
      component.uiTerminalPersistenceFormControl.setValue(false)
      await vi.advanceTimersByTimeAsync(SETTLE_MS)

      expect(modal.lastOpened()!.options).toMatchObject({ size: 'lg', backdrop: 'static' })
    })

    it('closes the session and saves once the user agrees', async () => {
      component.uiTerminalPersistenceFormControl.setValue(false)
      await vi.advanceTimersByTimeAsync(SETTLE_MS)

      modal.lastOpened()!.ref.close()
      await vi.advanceTimersByTimeAsync(SETTLE_MS)

      expect(terminal.destroyPersistentSession).toHaveBeenCalled()
      expect(uiPatch()).toMatchObject({ 'terminal.persistence': false })
    })

    it('puts the switch back and keeps the session when they change their mind', async () => {
      // ⚠️ Silently, and without a write: the session is still there, so the switch
      // has to match it again
      component.uiTerminalPersistenceFormControl.setValue(false)
      await vi.advanceTimersByTimeAsync(SETTLE_MS)

      modal.lastOpened()!.ref.dismiss()
      await vi.advanceTimersByTimeAsync(SETTLE_MS)

      expect(component.uiTerminalPersistenceFormControl.value).toBe(true)
      expect(terminal.destroyPersistentSession).not.toHaveBeenCalled()
      expect(uiPatch()?.['terminal.persistence']).toBeUndefined()
    })

    it('asks nothing when there is no session to lose', async () => {
      terminal.hasActiveSession = () => false

      await change('uiTerminalPersistenceFormControl', false)

      expect(modal.opened).toEqual([])
      expect(uiPatch()).toMatchObject({ 'terminal.persistence': false })
    })

    it('asks nothing when the setting is being switched on', async () => {
      // Nothing is lost by keeping sessions, so there is nothing to warn about
      await change('uiTerminalPersistenceFormControl', true)

      expect(modal.opened).toEqual([])
      expect(terminal.destroyPersistentSession).not.toHaveBeenCalled()
      expect(uiPatch()).toMatchObject({ 'terminal.persistence': true })
    })
  })

  /**
   * The two settings that dim the page while they apply.
   */
  describe('changing the theme and the lighting mode', () => {
    it.each([
      ['uiThemeFormControl', 'teal', 'setTheme', 'uiThemeIsSaving'],
      ['uiLightFormControl', 'dark', 'setLightingMode', 'uiLightIsSaving'],
    ])('%s applies at once and clears its spinner afterwards', async (control, value, setter, saving) => {
      await change(control, value)

      // Applied straight away rather than after the write: the point of these two
      // is that the user sees the change as they pick it
      expect(settings[setter as 'setTheme']).toHaveBeenCalled()
      expect((component as any)[saving]()).toBe(true)

      await vi.advanceTimersByTimeAsync(1000)
      expect((component as any)[saving]()).toBe(false)
      expect(component.isThemeTransitioning()).toBe(false)
    })

    it('dims the page while the theme is being applied', async () => {
      component.uiThemeFormControl.setValue('teal')
      // Into the fade-out, before the write goes anywhere
      await vi.advanceTimersByTimeAsync(800)

      expect(component.isThemeTransitioning()).toBe(true)
    })

    it('reloads the page for a menu mode that did save', async () => {
      // The counterpart to the failure case above, so that a reload which never
      // fires at all cannot make it pass
      locationReload.mockClear()

      await change('uiMenuFormControl', 'freeze')

      expect(settings.setMenuMode).toHaveBeenCalledWith('freeze')
      expect(locationReload).toHaveBeenCalled()
    })

    it('writes the lighting mode down as a deliberate choice', async () => {
      // ⚠️ The second argument is the source. Saved as anything else, the page
      // would go on following the system setting and undo what the user picked
      await change('uiLightFormControl', 'dark')

      expect(settings.setLightingMode).toHaveBeenCalledWith('dark', 'user')
      expect(uiPatch()).toMatchObject({ lightingMode: 'dark' })
    })
  })

  /**
   * The search box at the top of the settings page.
   *
   * ⚠️ **Hiding a row is not the same as it not being there.** A section is shown
   * when at least one of its rows is still visible, so anything the template was
   * never rendering — a linux-only path on macOS, a matter setting while matter is
   * off — has to be counted as hidden too, or a search leaves behind an empty
   * section with a heading and nothing under it.
   */
  describe('searching the settings', () => {
    /**
     * Type a query and let it filter.
     * @param query - what the user typed
     */
    function search(query: string) {
      component.onSearchChange(query)
    }

    it('opens the box on the search button', () => {
      component.toggleSearch()

      expect(component.showSearchBar()).toBe(true)
    })

    it('clears the query when the box is closed again', () => {
      component.toggleSearch()
      search('backup')

      component.toggleSearch()

      expect(component.showSearchBar()).toBe(false)
      expect(component.searchQuery()).toBe('')
      expect(component.isItemHidden('setting-lang')).toBe(false)
    })

    it('shows everything before anything is typed', () => {
      expect(component.isItemHidden('setting-name')).toBe(false)
      expect(component.isSectionVisible('display')).toBe(true)
    })

    it('keeps a row whose name matches', () => {
      search('language')
      // The row is matched on its own translated label
      component.searchQuery.set('')
      search(privates().getItemsContent()['setting-lang'])

      expect(component.isItemHidden('setting-lang')).toBe(false)
    })

    it('hides the rows that do not match', () => {
      search(privates().getItemsContent()['setting-lang'])

      expect(component.isItemHidden('setting-name')).toBe(true)
    })

    it('ignores the case of what was typed', () => {
      const label = privates().getItemsContent()['setting-lang']

      search(label.toUpperCase())

      expect(component.isItemHidden('setting-lang')).toBe(false)
    })

    it('keeps a whole section when the section name matches', () => {
      // Searching "display" should give the display section, not just the one row
      // inside it whose label happens to contain the word
      search(privates().getSectionContent().display)

      expect(component.isSectionVisible('display')).toBe(true)
      expect(component.isItemHidden('setting-theme')).toBe(false)
      expect(component.isItemHidden('setting-menu')).toBe(false)
    })

    it('hides a section with nothing left in it', () => {
      search(privates().getItemsContent()['setting-lang'])

      expect(component.isSectionVisible('general')).toBe(false)
    })

    it('hides every section when nothing matches at all', () => {
      search('a-string-no-setting-contains')

      expect(component.isSectionVisible('general')).toBe(false)
      expect(component.isSectionVisible('display')).toBe(false)
    })

    it('shows a section it has no row list for', () => {
      // A new section added to the template but not to the map should not vanish
      search('anything')

      expect(component.isSectionVisible('a-section-nobody-mapped')).toBe(true)
    })

    it('brings everything back when the box is cleared', () => {
      search('a-string-no-setting-contains')

      component.clearSearch()

      expect(component.isItemHidden('setting-name')).toBe(false)
      expect(component.isSectionVisible('general')).toBe(true)
    })

    describe('rows the page was not showing anyway', () => {
      /**
       * The rows counted as unavailable in the current state.
       */
      function unavailable(): string[] {
        return privates().getUnavailableItems()
      }

      it('counts the linux rows out on any other platform', () => {
        // ⚠️ Without this a search for "restart" on macOS shows a Startup section
        // whose only match is a row the template never rendered
        ;(component as any).platform = 'darwin'

        expect(unavailable()).toContain('setting-linux-shutdown')
        expect(unavailable()).toContain('setting-linux-restart')
        expect(unavailable()).toContain('setting-linux-temp')
      })

      it('counts the temperature file out on linux that is not a pi', () => {
        ;(component as any).platform = 'linux'
        ;(component as any).runningOnRaspberryPi = false

        expect(unavailable()).toContain('setting-linux-temp')
        expect(unavailable()).not.toContain('setting-linux-restart')
      })

      it('keeps all three on a raspberry pi', () => {
        ;(component as any).platform = 'linux'
        ;(component as any).runningOnRaspberryPi = true

        expect(unavailable()).not.toContain('setting-linux-temp')
      })

      it('counts the docker startup script out when not in docker', () => {
        ;(component as any).runningInDocker = false

        expect(unavailable()).toContain('setting-docker-startup')
      })

      it('counts the matter rows out while matter is off', () => {
        component.matterEnabledFormControl.setValue(false)

        expect(unavailable()).toContain('setting-matter-port')
        expect(unavailable()).toContain('setting-matter-port-range')
      })

      it('counts the log truncate row out when no log size is set', () => {
        // It only means anything alongside a size limit
        component.hbLogSizeFormControl.setValue(0)

        expect(unavailable()).toContain('setting-terminal-log-truncate')
      })

      it('counts the terminal rows out when terminal access is off', () => {
        ;(component as any).enableTerminalAccess = false

        expect(unavailable()).toContain('setting-terminal-persistence')
        expect(unavailable()).toContain('setting-terminal-warning')
        expect(unavailable()).toContain('setting-terminal-buffer')
      })

      it('counts the unload warning out when the session persists anyway', () => {
        ;(component as any).enableTerminalAccess = true
        component.uiTerminalPersistenceFormControl.setValue(true)

        expect(unavailable()).toContain('setting-terminal-warning')
        expect(unavailable()).not.toContain('setting-terminal-persistence')
      })

      it('counts the buffer size out when the session does not persist', () => {
        ;(component as any).enableTerminalAccess = true
        component.uiTerminalPersistenceFormControl.setValue(false)

        expect(unavailable()).toContain('setting-terminal-buffer')
        expect(unavailable()).not.toContain('setting-terminal-warning')
      })

      it('counts the session rows out when login is switched off', () => {
        // There is no session to time out
        component.uiAuthFormControl.setValue(false)

        expect(unavailable()).toContain('setting-session-inactivity')
        expect(unavailable()).toContain('setting-security-session')
      })

      it('hides them from a search that would otherwise match them', () => {
        ;(component as any).platform = 'darwin'
        search(privates().getItemsContent()['setting-linux-restart'])

        expect(component.isItemHidden('setting-linux-restart')).toBe(true)
      })
    })
  })

  describe('the modals it opens', () => {
    it.each([
      ['the backup modal', 'openBackupModal', BackupComponent],
      ['the wallpaper picker', 'openWallpaperModal', WallpaperComponent],
      ['the full bridge reset', 'resetHomebridgeState', ResetAllBridgesComponent],
      ['the single bridge reset', 'unpairAccessory', ResetIndividualBridgesComponent],
      ['the remove-all-accessories modal', 'removeAllCachedAccessories', RemoveAllAccessoriesComponent],
      ['the remove-bridge-accessories modal', 'removeBridgeAccessories', RemoveBridgeAccessoriesComponent],
      ['the port overview', 'openPortOverview', PortOverviewModalComponent],
    ])('opens %s', (_label, method, expected) => {
      ;(component as any)[method]()

      expect(modal.lastOpened()!.content).toBe(expected)
      expect(modal.lastOpened()!.options).toMatchObject({ size: 'lg', backdrop: 'static' })
    })

    it('sends the user to the config editor to restore a config backup', () => {
      // The backups live with the editor, not here
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)

      component.openConfigBackup()

      expect(navigate).toHaveBeenCalledWith(['/config'], { queryParams: { action: 'restore' } })
      expect(modal.open).not.toHaveBeenCalled()
    })

    it('opens the individual-accessory removal with no bridge chosen', () => {
      // Reached from settings rather than from one accessory, so the picker starts
      // with nothing selected
      component.removeSingleCachedAccessories()

      expect(modal.lastOpened()!.content).toBe(RemoveIndividualAccessoriesComponent)
      expect(modal.dataFor(REMOVE_INDIVIDUAL_ACCESSORIES_MODAL_DATA)?.selectedBridge).toBe('')
    })

    describe('the ssl modal', () => {
      it('shows the mode the modal saved', async () => {
        // The modal does the saving; this control only has to catch up with it.
        // It is the one setting on the page with no `valueChanges` subscription of
        // its own, so nothing here writes to the server - which is also why the
        // `emitEvent: false` on the patch is belt-and-braces rather than
        // load-bearing. Asserted after the debounce window so a subscription
        // added later would show up here as an unexpected write
        const pending = component.openSslModal()
        await Promise.resolve()
        api.clearCalls()
        modal.lastOpened()!.ref.close('letsencrypt')
        await pending
        await vi.advanceTimersByTimeAsync(SETTLE_MS)

        expect(component.uiSslTypeFormControl.value).toBe('letsencrypt')
        expect(api.calls).toEqual([])
      })

      it('asks for a restart, because certificates load at startup', async () => {
        const pending = component.openSslModal()
        await Promise.resolve()
        modal.lastOpened()!.ref.close('selfsigned')
        await pending

        expect(settings.showRestartToast).toHaveBeenCalled()
      })

      it('changes nothing when it is dismissed', async () => {
        const before = component.uiSslTypeFormControl.value

        const pending = component.openSslModal()
        await Promise.resolve()
        modal.lastOpened()!.ref.dismiss()
        await pending

        expect(component.uiSslTypeFormControl.value).toBe(before)
        expect(settings.showRestartToast).not.toHaveBeenCalled()
      })
    })

    describe('the accessory control lists', () => {
      it('hands over the blacklist as it stands', async () => {
        settings.env.accessoryControl = { instanceBlacklist: ['0E:11:22:33:44:55'] }

        const pending = component.accessoryUiControl()
        await Promise.resolve()

        expect(modal.lastOpened()!.content).toBe(AccessoryControlListsComponent)
        expect(modal.dataFor(ACCESSORY_CONTROL_LISTS_MODAL_DATA)?.existingBlacklist).toEqual(['0E:11:22:33:44:55'])

        modal.lastOpened()!.ref.close()
        await pending
      })

      it('starts from an empty list when nothing is blacklisted', async () => {
        const pending = component.accessoryUiControl()
        await Promise.resolve()

        expect(modal.dataFor(ACCESSORY_CONTROL_LISTS_MODAL_DATA)?.existingBlacklist).toEqual([])

        modal.lastOpened()!.ref.close()
        await pending
      })

      it('asks for a restart once the list is saved', async () => {
        const pending = component.accessoryUiControl()
        await Promise.resolve()
        modal.lastOpened()!.ref.close()
        await pending

        expect(settings.showRestartToast).toHaveBeenCalled()
      })

      it('says nothing when the user simply closed it', async () => {
        // 'Dismiss' is the modal's own close reason, not a failure
        const pending = component.accessoryUiControl()
        await Promise.resolve()
        modal.lastOpened()!.ref.dismiss('Dismiss')
        await pending

        expect(toastr.error).not.toHaveBeenCalled()
        expect(settings.showRestartToast).not.toHaveBeenCalled()
      })

      it('reports a real failure', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})

        const pending = component.accessoryUiControl()
        await Promise.resolve()
        modal.lastOpened()!.ref.dismiss(new Error('server unavailable'))
        await pending

        expect(toastr.error).toHaveBeenCalled()
      })
    })

    describe('choosing which network interfaces the bridge uses', () => {
      it('offers what is available and what is already chosen', async () => {
        component.adaptersAvailable.set([{ iface: 'eth0', ip4: '192.168.1.10' }] as any)
        component.adaptersSelected.set([{ iface: 'eth0' }] as any)

        const pending = component.selectNetworkInterfaces()
        await Promise.resolve()

        const data = modal.dataFor(NETWORK_INTERFACES_MODAL_DATA)
        expect(data?.adaptersAvailable).toHaveLength(1)
        expect(data?.adaptersSelected).toHaveLength(1)

        modal.lastOpened()!.ref.dismiss('Dismiss')
        await pending
      })

      it('marks an adapter the machine no longer has', async () => {
        // ⚠️ A network card that has been removed, or renamed by a system update.
        // Dropping it silently would take the bridge off an interface the user
        // deliberately chose; marking it lets the page say so and keep the choice
        create({}, undefined, (broken) => {
          broken.respond('get', '/server/network-interfaces/system', [{ iface: 'eth0', ip4: '192.168.1.10' }])
          broken.respond('get', '/server/network-interfaces/bridge', ['eth0', 'wlan0'])
        })
        await vi.advanceTimersByTimeAsync(0)

        expect(component.adaptersSelected()).toEqual([
          expect.objectContaining({ iface: 'eth0', selected: true, missing: false }),
          expect.objectContaining({ iface: 'wlan0', selected: true, missing: true }),
        ])
      })

      it('selects nothing when the bridge is on no particular interface', async () => {
        create({}, undefined, (broken) => {
          broken.respond('get', '/server/network-interfaces/system', [{ iface: 'eth0', ip4: '192.168.1.10' }])
          broken.respond('get', '/server/network-interfaces/bridge', [])
        })
        await vi.advanceTimersByTimeAsync(0)

        expect(component.adaptersSelected()).toEqual([])
      })

      it('saves the chosen adapters and asks for a restart', async () => {
        // The bridge binds its interfaces at startup
        const pending = component.selectNetworkInterfaces()
        await Promise.resolve()
        modal.lastOpened()!.ref.close(['eth0'])
        await pending

        expect(api.lastCall('put', '/server/network-interfaces/bridge')?.body).toEqual({ adapters: ['eth0'] })
        expect(settings.showRestartToast).toHaveBeenCalled()
      })

      it('saves nothing when the picker is dismissed', async () => {
        const pending = component.selectNetworkInterfaces()
        await Promise.resolve()
        modal.lastOpened()!.ref.dismiss('Dismiss')
        await pending

        expect(api.callsTo('put', '/server/network-interfaces/bridge')).toEqual([])
      })

      it('reports a failed save', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        api.fail('put', '/server/network-interfaces/bridge', new Error('config not writable'))

        const pending = component.selectNetworkInterfaces()
        await Promise.resolve()
        modal.lastOpened()!.ref.close(['eth0'])
        await pending

        expect(toastr.error).toHaveBeenCalled()
        expect(settings.showRestartToast).not.toHaveBeenCalled()
      })
    })
  })

  /**
   * Turning HAP and Matter on and off.
   *
   * ⚠️ **At least one protocol has to stay on.** With both off, Homebridge exposes
   * nothing at all — so disabling the last one is refused outright unless the
   * running Homebridge is new enough to allow it.
   *
   * ⚠️ **Disabling Matter used to destroy its commissioning.** On a newer
   * Homebridge it is disabled *in place*, so the pairing survives and re-enabling
   * needs no re-pairing; on an older one the block and its storage are deleted, and
   * that path asks the user to confirm first. Taking the wrong path silently loses
   * every Matter pairing on the box.
   */
  describe('turning the protocols on and off', () => {
    /**
     * Build the page with the protocol feature flags set.
     * @param options - which capabilities the running homebridge has
     * @param options.disableInPlace - matter can be disabled without losing pairings
     * @param options.disableAll - both protocols may be off at once
     * @param options.externalsOnly - the externals-only flag is supported
     */
    async function withProtocols(options: { disableInPlace?: boolean, disableAll?: boolean, externalsOnly?: boolean } = {}) {
      create({
        featureFlags: {
          matterSupport: true,
          matterDisableInPlace: options.disableInPlace ?? true,
          disableAllProtocols: options.disableAll ?? false,
          protocolExternalsOnly: options.externalsOnly ?? false,
        },
      })
      // ⚠️ Let the page's startup reads land first. They patch the matter port and
      // fill the config cache, so a value set before this is quietly overwritten
      // partway through the test
      await vi.advanceTimersByTimeAsync(0)
      return component as any
    }

    /** Run one of the private save methods and let it settle. */
    async function save(method: string, value: unknown) {
      await (component as any)[method](value)
      await vi.advanceTimersByTimeAsync(SETTLE_MS)
    }

    describe('refusing to leave the box with no protocol', () => {
      it('will not switch matter off while hap is already off', async () => {
        const page = await withProtocols({ disableAll: false })
        page.hapEnabledFormControl.setValue(false, { emitEvent: false })
        page.matterEnabledFormControl.setValue(true, { emitEvent: false })

        await save('matterEnabledSave', false)

        expect(toastr.info).toHaveBeenCalled()
        expect(page.matterEnabledFormControl.value).toBe(true)
        expect(api.callsTo('put')).toEqual([])
      })

      it('will not switch hap off while matter is already off', async () => {
        const page = await withProtocols({ disableAll: false })
        page.matterEnabledFormControl.setValue(false, { emitEvent: false })
        page.hapEnabledFormControl.setValue(true, { emitEvent: false })

        await save('hapEnabledSave', false)

        expect(toastr.info).toHaveBeenCalled()
        expect(page.hapEnabledFormControl.value).toBe(true)
      })

      it('allows it on a homebridge that supports having neither', async () => {
        const page = await withProtocols({ disableAll: true })
        page.hapEnabledFormControl.setValue(false, { emitEvent: false })

        await save('matterEnabledSave', false)

        expect(api.lastCall('put', '/config-editor/matter/enabled')).toBeDefined()
      })
    })

    describe('matter, on a homebridge that disables it in place', () => {
      it('keeps the commissioning when switched off', async () => {
        // ⚠️ Marked disabled rather than deleted: the pairing survives, so turning
        // it back on does not mean re-pairing every controller
        const page = await withProtocols({ disableInPlace: true })
        page.hapEnabledFormControl.setValue(true, { emitEvent: false })
        page.matterPortFormControl.setValue(5540, { emitEvent: false })

        await save('matterEnabledSave', false)

        expect(api.lastCall('put', '/config-editor/matter/enabled')?.body)
          .toMatchObject({ enabled: false, restart: false })
        expect(api.callsTo('delete', '/config-editor/matter')).toEqual([])
      })

      it('asks for nothing before doing it, because nothing is lost', async () => {
        const page = await withProtocols({ disableInPlace: true })
        page.hapEnabledFormControl.setValue(true, { emitEvent: false })

        await save('matterEnabledSave', false)

        expect(modal.opened).toEqual([])
      })

      it('remembers the port it was on, to restore it later', async () => {
        const page = await withProtocols({ disableInPlace: true })
        page.hapEnabledFormControl.setValue(true, { emitEvent: false })
        page.matterPortFormControl.setValue(5555, { emitEvent: false })

        await save('matterEnabledSave', false)
        api.clearCalls()
        await save('matterEnabledSave', true)

        expect(api.lastCall('put', '/config-editor/matter')?.body).toMatchObject({ port: 5555 })
      })

      it('asks the server for a port the first time it is switched on', async () => {
        const page = await withProtocols({ disableInPlace: true })
        api.respond('get', '/server/port/new/matter', { port: 5541 })
        page.matterConfigCache = {}

        await save('matterEnabledSave', true)

        expect(api.lastCall('put', '/config-editor/matter')?.body).toMatchObject({ port: 5541 })
      })

      it('falls back to a port in the matter range when the server cannot pick one', async () => {
        // Better than writing no port at all, which leaves matter unable to start
        const page = await withProtocols({ disableInPlace: true })
        api.fail('get', '/server/port/new/matter', new Error('server unavailable'))
        page.matterConfigCache = {}

        await save('matterEnabledSave', true)

        const port = api.lastCall('put', '/config-editor/matter')?.body.port
        expect(port).toBeGreaterThanOrEqual(5530)
        expect(port).toBeLessThanOrEqual(5541)
      })

      it('falls back to a port when tearing matter down and building it again', async () => {
        // ⚠️ The same fallback as the in-place case, but on the destructive route.
        // These are two separate copies of the logic, so one can be fixed without
        // the other — and matter with no port cannot start at all
        const page = await withProtocols({ disableInPlace: false })
        api.fail('get', '/server/port/new/matter', new Error('server unavailable'))
        page.matterConfigCache = {}
        vi.spyOn(console, 'error').mockImplementation(() => {})

        await save('matterEnabledSave', true)

        const port = api.lastCall('put', '/config-editor/matter')?.body.port
        expect(port).toBeGreaterThanOrEqual(5530)
        expect(port).toBeLessThanOrEqual(5541)
      })

      it('clears the externals-only flag when matter comes back on', async () => {
        // The backend rejects enabled together with externalsOnly
        const page = await withProtocols({ disableInPlace: true, externalsOnly: true })
        page.matterExternalsOnlyFormControl.setValue(true, { emitEvent: false })
        page.matterConfigCache = { port: 5540 }

        await save('matterEnabledSave', true)

        expect(page.matterExternalsOnlyFormControl.value).toBe(false)
      })

      it('sends the externals-only flag when matter goes off', async () => {
        const page = await withProtocols({ disableInPlace: true, externalsOnly: true })
        page.hapEnabledFormControl.setValue(true, { emitEvent: false })
        page.matterExternalsOnlyFormControl.setValue(true, { emitEvent: false })

        await save('matterEnabledSave', false)

        expect(api.lastCall('put', '/config-editor/matter/enabled')?.body)
          .toMatchObject({ enabled: false, externalsOnly: true })
      })

      it('flags a full service restart rather than restarting there and then', async () => {
        const page = await withProtocols({ disableInPlace: true })
        page.hapEnabledFormControl.setValue(true, { emitEvent: false })

        await save('matterEnabledSave', false)

        expect(api.lastCall('put', '/platform-tools/hb-service/set-full-service-restart-flag')).toBeDefined()
        expect(settings.showRestartToast).toHaveBeenCalled()
      })

      it('puts the toggle back when the write fails', async () => {
        // Otherwise the switch says off and matter is still running
        const page = await withProtocols({ disableInPlace: true })
        page.hapEnabledFormControl.setValue(true, { emitEvent: false })
        api.fail('put', '/config-editor/matter/enabled', new Error('config not writable'))

        await save('matterEnabledSave', false)

        expect(page.matterEnabledFormControl.value).toBe(true)
        expect(toastr.error).toHaveBeenCalled()
      })
    })

    describe('matter, on an older homebridge that has to tear it down', () => {
      it('asks the user first, and says it is destructive', async () => {
        const page = await withProtocols({ disableInPlace: false })
        page.hapEnabledFormControl.setValue(true, { emitEvent: false })

        void (component as any).matterEnabledSave(false)
        await settleMicrotasks()

        expect(modal.lastOpened()!.content).toBe(ConfirmComponent)
        expect(modal.dataFor(CONFIRM_MODAL_DATA)).toMatchObject({ confirmButtonClass: 'btn-danger' })
      })

      it('deletes the matter block once confirmed', async () => {
        const page = await withProtocols({ disableInPlace: false })
        page.hapEnabledFormControl.setValue(true, { emitEvent: false })

        void (component as any).matterEnabledSave(false)
        await settleMicrotasks()
        modal.lastOpened()!.ref.close()
        await settleMicrotasks()

        expect(api.callsTo('delete', '/config-editor/matter')).toHaveLength(1)
      })

      it('sends the user to the restart page, already restarting', async () => {
        const page = await withProtocols({ disableInPlace: false })
        // ⚠️ After withProtocols, which resets the TestBed and with it the injector
        const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)
        page.hapEnabledFormControl.setValue(true, { emitEvent: false })

        void (component as any).matterEnabledSave(false)
        await settleMicrotasks()
        modal.lastOpened()!.ref.close()
        await settleMicrotasks()

        expect(navigate).toHaveBeenCalledWith(['/restart'], { queryParams: { alreadyRestarting: 'true' } })
      })

      it('puts the toggle back when the user changes their mind', async () => {
        const page = await withProtocols({ disableInPlace: false })
        page.hapEnabledFormControl.setValue(true, { emitEvent: false })

        void (component as any).matterEnabledSave(false)
        await settleMicrotasks()
        modal.lastOpened()!.ref.dismiss('Dismiss')
        await settleMicrotasks()

        expect(page.matterEnabledFormControl.value).toBe(true)
        expect(api.callsTo('delete', '/config-editor/matter')).toEqual([])
      })

      it('writes the port and asks for a restart when switched on', async () => {
        const page = await withProtocols({ disableInPlace: false })
        page.matterConfigCache = { port: 5540 }

        await save('matterEnabledSave', true)

        expect(api.lastCall('put', '/config-editor/matter')?.body).toMatchObject({ port: 5540 })
        expect(settings.showRestartToast).toHaveBeenCalled()
      })
    })

    describe('hap', () => {
      it('writes the new state and flags a restart', async () => {
        const page = await withProtocols({ disableInPlace: true })
        page.matterEnabledFormControl.setValue(true, { emitEvent: false })

        await save('hapEnabledSave', false)

        expect(api.lastCall('put', '/config-editor/hap')?.body).toMatchObject({ enabled: false, restart: false })
        expect(settings.showRestartToast).toHaveBeenCalled()
      })

      it('clears externals-only when hap comes back on', async () => {
        const page = await withProtocols({ disableInPlace: true, externalsOnly: true })
        page.hapExternalsOnlyFormControl.setValue(true, { emitEvent: false })

        await save('hapEnabledSave', true)

        expect(page.hapExternalsOnlyFormControl.value).toBe(false)
      })

      it('sends externals-only when hap goes off', async () => {
        const page = await withProtocols({ disableInPlace: true, externalsOnly: true })
        page.matterEnabledFormControl.setValue(true, { emitEvent: false })
        page.hapExternalsOnlyFormControl.setValue(true, { emitEvent: false })

        await save('hapEnabledSave', false)

        expect(api.lastCall('put', '/config-editor/hap')?.body).toMatchObject({ externalsOnly: true })
      })

      it('puts the toggle back when the write fails', async () => {
        const page = await withProtocols({ disableInPlace: true })
        page.matterEnabledFormControl.setValue(true, { emitEvent: false })
        api.fail('put', '/config-editor/hap', new Error('config not writable'))

        await save('hapEnabledSave', false)

        expect(page.hapEnabledFormControl.value).toBe(true)
        expect(toastr.error).toHaveBeenCalled()
      })

      it('asks first on an older homebridge, because pairings are lost', async () => {
        const page = await withProtocols({ disableInPlace: false })
        page.matterEnabledFormControl.setValue(true, { emitEvent: false })

        void (component as any).hapEnabledSave(false)
        await settleMicrotasks()

        expect(modal.lastOpened()!.content).toBe(ConfirmComponent)
      })

      it('writes the change once confirmed on an older homebridge', async () => {
        const page = await withProtocols({ disableInPlace: false })
        page.matterEnabledFormControl.setValue(true, { emitEvent: false })

        void (component as any).hapEnabledSave(false)
        await settleMicrotasks()
        modal.lastOpened()!.ref.close()
        await settleMicrotasks()

        expect(api.lastCall('put', '/config-editor/hap')?.body).toMatchObject({ enabled: false })
      })

      it('puts the toggle back when the user cancels', async () => {
        const page = await withProtocols({ disableInPlace: false })
        page.matterEnabledFormControl.setValue(true, { emitEvent: false })

        void (component as any).hapEnabledSave(false)
        await settleMicrotasks()
        modal.lastOpened()!.ref.dismiss('Dismiss')
        await settleMicrotasks()

        expect(page.hapEnabledFormControl.value).toBe(true)
      })
    })

    describe('the matter port', () => {
      it('writes the port alongside the ipv4 preference', async () => {
        // ⚠️ PUT /config-editor/matter replaces the whole block, so the other field
        // has to be sent with it or it is wiped
        const page = await withProtocols()
        page.matterDisableIpv4FormControl.setValue(true, { emitEvent: false })

        await save('matterPortSave', 5555)

        expect(api.lastCall('put', '/config-editor/matter')?.body).toEqual({ port: 5555, disableIpv4: true })
      })

      it('accepts an empty port, because it is optional', async () => {
        const page = await withProtocols()
        page.matterDisableIpv4FormControl.setValue(false, { emitEvent: false })

        await save('matterPortSave', null)

        expect(api.lastCall('put', '/config-editor/matter')?.body).toEqual({ port: undefined, disableIpv4: undefined })
        expect(page.matterPortIsInvalid()).toBe(false)
      })

      it('keeps the port when only the ipv4 preference changes', async () => {
        const page = await withProtocols()
        page.matterPortFormControl.setValue(5540, { emitEvent: false })

        await save('matterDisableIpv4Save', true)

        expect(api.lastCall('put', '/config-editor/matter')?.body).toEqual({ port: 5540, disableIpv4: true })
      })

      it('puts the ipv4 toggle back when its write fails', async () => {
        const page = await withProtocols()
        api.fail('put', '/config-editor/matter', new Error('config not writable'))
        page.matterDisableIpv4FormControl.setValue(false, { emitEvent: false })

        await save('matterDisableIpv4Save', true)

        expect(page.matterDisableIpv4FormControl.value).toBe(false)
        expect(toastr.error).toHaveBeenCalled()
      })
    })

    /**
     * The destructive route: an older Homebridge cannot mark a protocol off, so
     * switching one off tears its configuration down.
     *
     * ⚠️ **The pairings go with it.** The user has to re-add every accessory in the
     * Home app afterwards, so the confirmation is the only thing standing between a
     * mis-click and an evening of re-pairing.
     */
    describe('tearing a protocol down on an older homebridge', () => {
      /**
       * Build the page, then answer the confirmation.
       * @param method - the save method to run
       * @param answer - how the user answers the confirmation
       * @param restartToastId - the id of a restart notice already on screen. Set
       * here rather than by the caller: `withProtocols` rebuilds the settings fake,
       * so anything arranged before the call is thrown away.
       */
      async function confirmTeardown(method: string, answer: 'confirm' | 'cancel' | Error, restartToastId?: number) {
        const page = await withProtocols({ disableInPlace: false })
        if (restartToastId !== undefined) {
          settings.restartToastRef = { toastId: restartToastId } as any
        }
        page.hapEnabledFormControl.setValue(true, { emitEvent: false })
        page.matterEnabledFormControl.setValue(true, { emitEvent: false })
        vi.spyOn(console, 'error').mockImplementation(() => {})

        void page[method](false)
        await settleMicrotasks()

        const ref = modal.lastOpened()!.ref
        if (answer === 'confirm') {
          ref.close()
        } else if (answer === 'cancel') {
          // ⚠️ Dismissed with the string the modal service uses, not an Error: the
          // page tells a cancellation apart from a real failure by that exact value
          ref.dismiss('Dismiss')
        } else {
          ref.dismiss(answer)
        }
        await settleMicrotasks()
        return page
      }

      it.each([
        ['matterEnabledSave', 'matter'],
        ['hapEnabledSave', 'hap'],
      ])('takes the restart notice off the screen before restarting for %s', async (method) => {
        // ⚠️ The page is about to navigate to the restart screen itself. Leaving the
        // old "restart to apply" toast up would put a second restart button over the
        // top of a restart already under way
        await confirmTeardown(method, 'confirm', 7)

        expect(toastr.clear).toHaveBeenCalledWith(7)
        expect(settings.restartToastRef).toBeNull()
      })

      it('tears the matter block down once confirmed, with no notice to clear', async () => {
        await confirmTeardown('matterEnabledSave', 'confirm')

        // The block goes rather than being marked off: an older homebridge has no
        // way to read `enabled: false`
        expect(api.callsTo('delete', '/config-editor/matter')).toHaveLength(1)
        expect(toastr.clear).not.toHaveBeenCalled()
      })

      it('writes hap off once confirmed, with no notice to clear', async () => {
        await confirmTeardown('hapEnabledSave', 'confirm')

        expect(api.lastCall('put', '/config-editor/hap')?.body).toMatchObject({ enabled: false })
        expect(toastr.clear).not.toHaveBeenCalled()
      })

      it.each([
        ['matterEnabledSave', 'matterEnabledFormControl', 'matterEnabledIsSaving'],
        ['hapEnabledSave', 'hapEnabledFormControl', 'hapEnabledIsSaving'],
      ])('puts %s back without a word when the user changes their mind', async (method, control, saving) => {
        // ⚠️ Not an error: a cancelled confirmation is the user deciding, and an
        // error toast would read as though something had gone wrong
        const page = await confirmTeardown(method, 'cancel')

        expect(page[control].value).toBe(true)
        expect(page[saving]()).toBe(false)
        expect(toastr.error).not.toHaveBeenCalled()
      })

      it.each([
        ['matterEnabledSave', 'matterEnabledFormControl', 'matterEnabledIsSaving'],
        ['hapEnabledSave', 'hapEnabledFormControl', 'hapEnabledIsSaving'],
      ])('reports a real failure during %s and puts the toggle back', async (method, control, saving) => {
        const page = await confirmTeardown(method, new Error('config not writable'))

        expect(toastr.error).toHaveBeenCalled()
        expect(page[control].value).toBe(true)
        expect(page[saving]()).toBe(false)
      })
    })

    describe('the matter port on its own', () => {
      it('sends the port alongside the ipv4 preference', async () => {
        const page = await withProtocols()
        page.matterDisableIpv4FormControl.setValue(true, { emitEvent: false })

        await save('matterPortSave', 5545)

        expect(api.lastCall('put', '/config-editor/matter')?.body)
          .toEqual({ port: 5545, disableIpv4: true })
      })

      it.each([null, undefined, ''])('accepts %s, because the port is optional', async (value) => {
        // Homebridge picks one itself when the box is empty. ⚠️ Zero is NOT one of
        // these: it takes the validated route and is refused, so a typed 0 cannot
        // be mistaken for an empty box
        const page = await withProtocols()

        await save('matterPortSave', value)

        expect(api.lastCall('put', '/config-editor/matter')?.body?.port).toBeUndefined()
        expect(page.matterPortIsInvalid()).toBe(false)
      })

      it.each([
        ['zero', 0],
        ['below the reserved range', 1023],
        ['above the maximum', 65536],
        ['not a whole number', 5545.5],
      ])('refuses a port %s', async (_case, port) => {
        const page = await withProtocols()

        await save('matterPortSave', port)

        expect(api.callsTo('put', '/config-editor/matter')).toEqual([])
        expect(page.matterPortIsInvalid()).toBe(true)
      })

      it('marks the port unsaved when the write fails', async () => {
        const page = await withProtocols()
        api.fail('put', '/config-editor/matter', new Error('config not writable'))

        await save('matterPortSave', 5545)

        expect(toastr.error).toHaveBeenCalled()
        expect(page.matterPortIsSaving()).toBe(false)
        expect(page.matterPortIsInvalid()).toBe(true)
      })

      it('reports a failure to clear the port too', async () => {
        // The empty-port case has its own write, and its own way of going wrong
        const page = await withProtocols()
        api.fail('put', '/config-editor/matter', new Error('config not writable'))

        await save('matterPortSave', null)

        expect(toastr.error).toHaveBeenCalled()
        expect(page.matterPortIsSaving()).toBe(false)
      })

      it('asks for a restart once the port is written', async () => {
        await withProtocols()
        vi.mocked(settings.showRestartToast).mockClear()

        await save('matterPortSave', 5545)

        expect(settings.showRestartToast).toHaveBeenCalled()
      })
    })

    describe('the externals-only flag on its own', () => {
      it('writes it while the protocol is off', async () => {
        const page = await withProtocols({ disableInPlace: true, externalsOnly: true })
        page.matterEnabledFormControl.setValue(false, { emitEvent: false })

        await save('matterExternalsOnlySave', true)

        expect(api.lastCall('put', '/config-editor/matter/enabled')?.body)
          .toMatchObject({ enabled: false, externalsOnly: true })
      })

      it('does nothing while the protocol is still on', async () => {
        // It only means anything for a disabled protocol
        const page = await withProtocols({ disableInPlace: true, externalsOnly: true })
        page.matterEnabledFormControl.setValue(true, { emitEvent: false })

        await save('matterExternalsOnlySave', true)

        expect(api.callsTo('put', '/config-editor/matter/enabled')).toEqual([])
      })

      it('puts the flag back when the write fails', async () => {
        const page = await withProtocols({ disableInPlace: true, externalsOnly: true })
        page.matterEnabledFormControl.setValue(false, { emitEvent: false })
        page.matterExternalsOnlyFormControl.setValue(false, { emitEvent: false })
        api.fail('put', '/config-editor/matter/enabled', new Error('config not writable'))

        await save('matterExternalsOnlySave', true)

        expect(page.matterExternalsOnlyFormControl.value).toBe(false)
      })
    })

    /**
     * The port range matter hands out to its own bridges.
     *
     * ⚠️ **Both boxes send both ends.** The endpoint replaces the pair, so a save
     * that sent only the box that changed would wipe the other one — and a matter
     * bridge with no range to draw from cannot publish at all.
     */
    describe('the matter port range', () => {
      it.each([
        ['matterStartPortSave', 5551, { start: 5551, end: 5560 }],
        ['matterEndPortSave', 5559, { start: 5550, end: 5559 }],
      ])('%s sends both ends of the range', async (method, value, expected) => {
        await withProtocols()

        await save(method, value)

        expect(api.lastCall('put', '/config-editor/matter/ports')?.body).toEqual(expected)
      })

      it.each([
        ['a start below the reserved range', 'matterStartPortSave', 1024, 'matterStartPortIsInvalid'],
        ['a start above the maximum', 'matterStartPortSave', 65534, 'matterStartPortIsInvalid'],
        ['a start that is not a whole number', 'matterStartPortSave', 5551.5, 'matterStartPortIsInvalid'],
        ['an end below the reserved range', 'matterEndPortSave', 1024, 'matterEndPortIsInvalid'],
        ['an end above the maximum', 'matterEndPortSave', 65534, 'matterEndPortIsInvalid'],
        ['an end that is not a whole number', 'matterEndPortSave', 5559.5, 'matterEndPortIsInvalid'],
      ])('refuses %s', async (_case, method, value, invalid) => {
        const page = await withProtocols()

        await save(method, value)

        expect(api.callsTo('put', '/config-editor/matter/ports')).toEqual([])
        expect(page[invalid]()).toBe(true)
      })

      it('refuses a start at or past the end', async () => {
        const page = await withProtocols()

        await save('matterStartPortSave', 5560)

        expect(api.callsTo('put', '/config-editor/matter/ports')).toEqual([])
        expect(page.matterStartPortIsInvalid()).toBe(true)
      })

      it('refuses an end at or before the start', async () => {
        const page = await withProtocols()

        await save('matterEndPortSave', 5550)

        expect(api.callsTo('put', '/config-editor/matter/ports')).toEqual([])
        expect(page.matterEndPortIsInvalid()).toBe(true)
      })

      it.each([
        ['matterStartPortSave', 'start'],
        ['matterEndPortSave', 'end'],
      ])('sends no %s when its box is emptied', async (method, key) => {
        // An empty box means "no preference". Sent as undefined it drops out of
        // the request body altogether; sent as 0 or null the server would take it
        // as a real port and hand matter a range starting at zero
        await withProtocols()

        await save(method, null)

        expect(api.lastCall('put', '/config-editor/matter/ports')?.body?.[key]).toBeUndefined()
      })

      it.each([
        ['matterStartPortSave', 5551, 'matterStartPortIsSaving', 'matterStartPortIsInvalid'],
        ['matterEndPortSave', 5559, 'matterEndPortIsSaving', 'matterEndPortIsInvalid'],
      ])('marks %s unsaved when the write fails', async (method, value, saving, invalid) => {
        const page = await withProtocols()
        api.fail('put', '/config-editor/matter/ports', new Error('config not writable'))

        await save(method, value)

        expect(toastr.error).toHaveBeenCalled()
        expect(page[saving]()).toBe(false)
        expect(page[invalid]()).toBe(true)
      })

      it.each(['matterStartPortSave', 'matterEndPortSave'])('asks for a restart after %s', async (method) => {
        await withProtocols()
        vi.mocked(settings.showRestartToast).mockClear()

        await save(method, 5555)

        expect(settings.showRestartToast).toHaveBeenCalled()
      })
    })

    /**
     * Leaving the bridge username out of the names HAP publishes.
     */
    describe('the hap identifying material flag', () => {
      /** Build the page with the flag's feature gate on. */
      async function withFlag(hapEnabled = true) {
        create({ featureFlags: { matterSupport: true, hapDisableIdentifyingMaterial: true } })
        await vi.advanceTimersByTimeAsync(0)
        const page = component as any
        page.hapEnabledFormControl.setValue(hapEnabled, { emitEvent: false })
        return page
      }

      it('sends the whole hap block, not just the flag', async () => {
        // ⚠️ The endpoint replaces the block, so sending the flag alone would turn
        // hap off as a side effect of a naming preference
        await withFlag()

        await save('hapDisableIdentifyingMaterialSave', true)

        expect(api.lastCall('put', '/config-editor/hap')?.body)
          .toEqual({ enabled: true, externalsOnly: false, disableIdentifyingMaterial: true, restart: false })
      })

      it('keeps hap off when it was already off', async () => {
        const page = await withFlag(false)

        await save('hapDisableIdentifyingMaterialSave', true)

        expect(api.lastCall('put', '/config-editor/hap')?.body).toMatchObject({ enabled: false })
        expect(page.hapDisableIdentifyingMaterialIsSaving()).toBe(false)
      })

      it('flags a full service restart rather than restarting there and then', async () => {
        // The names are built at startup, so nothing changes until the service
        // itself comes back
        await withFlag()

        await save('hapDisableIdentifyingMaterialSave', true)

        expect(api.callsTo('put', '/platform-tools/hb-service/set-full-service-restart-flag')).toHaveLength(1)
      })

      it('puts the toggle back when the write fails', async () => {
        const page = await withFlag()
        page.hapDisableIdentifyingMaterialFormControl.setValue(false, { emitEvent: false })
        api.fail('put', '/config-editor/hap', new Error('config not writable'))

        await save('hapDisableIdentifyingMaterialSave', true)

        expect(page.hapDisableIdentifyingMaterialFormControl.value).toBe(false)
        expect(page.hapDisableIdentifyingMaterialIsSaving()).toBe(false)
        expect(toastr.error).toHaveBeenCalled()
      })
    })

    describe('the hap externals-only flag', () => {
      /** Build the page with the externals-only gate on and hap off. */
      async function withExternalsOnly(hapEnabled = false) {
        create({ featureFlags: { matterSupport: true, protocolExternalsOnly: true } })
        await vi.advanceTimersByTimeAsync(0)
        const page = component as any
        page.hapEnabledFormControl.setValue(hapEnabled, { emitEvent: false })
        return page
      }

      it('writes it while hap is off', async () => {
        await withExternalsOnly()

        await save('hapExternalsOnlySave', true)

        expect(api.lastCall('put', '/config-editor/hap')?.body)
          .toMatchObject({ enabled: false, externalsOnly: true })
      })

      it('does nothing while hap is still on', async () => {
        // It only means anything for a disabled protocol, and writing it here
        // would send `enabled: false` and switch hap off
        await withExternalsOnly(true)

        await save('hapExternalsOnlySave', true)

        expect(api.callsTo('put', '/config-editor/hap')).toEqual([])
      })

      it('puts the flag back when the write fails', async () => {
        const page = await withExternalsOnly()
        page.hapExternalsOnlyFormControl.setValue(false, { emitEvent: false })
        api.fail('put', '/config-editor/hap', new Error('config not writable'))

        await save('hapExternalsOnlySave', true)

        expect(page.hapExternalsOnlyFormControl.value).toBe(false)
        expect(page.hapExternalsOnlyIsSaving()).toBe(false)
      })
    })

    /**
     * What the page shows when it cannot read the protocol settings at startup.
     */
    describe('when the protocol settings cannot be read', () => {
      /** Build the page with the hap read failing. */
      async function withBrokenHapRead() {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        create(
          { featureFlags: { matterSupport: true, hapDisableIdentifyingMaterial: true } },
          undefined,
          broken => broken.fail('get', '/config-editor/hap', new Error('server unavailable')),
        )
        await vi.advanceTimersByTimeAsync(0)
        return component as any
      }

      it('assumes hap is on, so the user can still switch it off', async () => {
        // ⚠️ A page that assumed off would show hap disabled on a working install,
        // and the first thing the user did to "fix" it would write that guess to
        // the config
        const page = await withBrokenHapRead()

        expect(page.hapEnabledFormControl.value).toBe(true)
        expect(page.hapExternalsOnlyFormControl.value).toBe(false)
        expect(page.hapDisableIdentifyingMaterialFormControl.value).toBe(false)
      })

      it('still wires the toggles up', async () => {
        // ⚠️ The subscriptions are made whether the read worked or not. Wired only
        // on success, a failed read would leave the page looking normal with every
        // hap control silently doing nothing
        const page = await withBrokenHapRead()
        api.clearCalls()

        page.hapDisableIdentifyingMaterialFormControl.setValue(true)
        await vi.advanceTimersByTimeAsync(SETTLE_MS)

        expect(api.callsTo('put', '/config-editor/hap')).toHaveLength(1)
      })

      it('says nothing about matter that is simply not set up yet', async () => {
        // ⚠️ No toast here, unlike the other startup reads: a fresh install has no
        // matter block at all, and an error on every visit to the settings page
        // would be reporting the normal case as a fault
        vi.spyOn(console, 'error').mockImplementation(() => {})

        create(
          { featureFlags: { matterSupport: true } },
          undefined,
          broken => broken.fail('get', '/config-editor/matter', new Error('not configured')),
        )
        await vi.advanceTimersByTimeAsync(0)

        expect(toastr.error).not.toHaveBeenCalled()
        expect(component.matterEnabledFormControl.value).toBe(false)
      })
    })
  })
})
