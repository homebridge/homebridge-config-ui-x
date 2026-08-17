import type { EnvInterface } from '@/app/core/settings.interfaces'
import type { FakeApi, FakeSettings } from '@/testing'

import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'

import { SslSettingsModalComponent } from '@/app/modules/settings/ssl-settings-modal/ssl-settings-modal.component'
import { activeModalStub, fakeApi, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The modal that decides how the UI serves itself over HTTPS.
 *
 * Getting this wrong locks the user out of their own UI: a saved mode with a
 * missing file means the server cannot start its listener, and there is no way
 * back other than editing config.json by hand. So the two things worth pinning
 * are the guard that stops a half-filled mode being saved, and the exact set of
 * config keys each mode writes - every mode has to clear the keys belonging to
 * the others, or a stale path from a previous mode is still sitting in the
 * config when the server next reads it.
 */
describe('sslSettingsModalComponent', () => {
  let api: FakeApi
  let settings: FakeSettings
  let toastr: ReturnType<typeof toastrStub>
  let activeModal: ReturnType<typeof activeModalStub>

  /**
   * Build the modal against a given saved SSL state.
   * @param ssl - the `env.ssl` block as the server would report it
   */
  async function open(ssl: EnvInterface['ssl'] = {}): Promise<SslSettingsModalComponent> {
    TestBed.resetTestingModule()
    api = fakeApi()
    settings = makeSettings({ env: { ssl } })
    toastr = toastrStub()
    activeModal = activeModalStub()

    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        provideFakes({ api, settings, toastr, activeModal }),
      ],
    })

    const fixture = TestBed.createComponent(SslSettingsModalComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    return fixture.componentInstance
  }

  /**
   * A file the modal can attach to a FormData.
   * @param name - the file name
   */
  function makeFile(name: string): File {
    return new File(['-----BEGIN-----'], name)
  }

  /**
   * A change event carrying a file, as a file input would raise.
   * @param files - the selected files, if any
   */
  function fileEvent(files: File[]): Event {
    return { target: { files } } as unknown as Event
  }

  describe('working out the current mode', () => {
    it('is off when nothing is configured', async () => {
      const modal = await open()

      expect(modal.selectedMode()).toBe('off')
      expect(modal.isUnchanged()).toBe(true)
    })

    it('is keycert when a key or a cert is saved', async () => {
      expect((await open({ key: '/etc/key.pem' })).selectedMode()).toBe('keycert')

      // Either one alone is enough: a half-saved pair still has to reopen in
      // the mode it belongs to so the user can finish it
      expect((await open({ cert: '/etc/cert.pem' })).selectedMode()).toBe('keycert')
    })

    it('is pfx when a pfx file is saved', async () => {
      const modal = await open({ pfx: '/etc/cert.pfx' })

      expect(modal.selectedMode()).toBe('pfx')
      expect(modal.pfxPathControl.value).toBe('/etc/cert.pfx')
    })

    it('is pfx when only a passphrase is known', async () => {
      // The server never sends the passphrase back, just the fact it has one,
      // so this flag is the only trace a pfx setup leaves
      expect((await open({ hasPassphrase: true })).selectedMode()).toBe('pfx')
    })

    it('prefers keycert when both kinds are somehow saved', async () => {
      const modal = await open({ key: '/etc/key.pem', cert: '/etc/cert.pem', pfx: '/etc/cert.pfx' })

      expect(modal.selectedMode()).toBe('keycert')
    })

    it('never shows the saved passphrase', async () => {
      const modal = await open({ pfx: '/etc/cert.pfx', hasPassphrase: true })

      // The field starts blank, which means saving pfx mode without retyping it
      // sends an empty passphrase - deliberate, so the user is never editing a
      // value they cannot see
      expect(modal.passphraseControl.value).toBe('')
    })
  })

  describe('the save button', () => {
    it('is available in off mode with nothing filled in', async () => {
      const modal = await open()

      expect(modal.isFormInvalid()).toBe(false)
    })

    it('needs at least one hostname for a self-signed certificate', async () => {
      const modal = await open()
      modal.sslModeControl.setValue('selfsigned')

      // The default is prefilled, so this only bites when the user clears it
      expect(modal.isFormInvalid()).toBe(false)

      modal.hostnamesControl.setValue('   ')

      // A FormControl's value is not a signal, so this only recomputes because
      // the component bumps a revision signal on every edit. Without that the
      // answer stays cached from the last mode change, the save button stays
      // enabled, and an empty hostname list gets posted
      expect(modal.isFormInvalid()).toBe(true)
    })

    it('becomes valid again once a hostname is typed back', async () => {
      const modal = await open()
      modal.sslModeControl.setValue('selfsigned')
      modal.hostnamesControl.setValue('')

      modal.hostnamesControl.setValue('homebridge.local')

      expect(modal.isFormInvalid()).toBe(false)
    })

    it('needs both halves of a key and certificate pair', async () => {
      const modal = await open()
      modal.sslModeControl.setValue('keycert')
      expect(modal.isFormInvalid()).toBe(true)

      modal.onKeyChange(fileEvent([makeFile('key.pem')]))
      expect(modal.isFormInvalid()).toBe(true)

      modal.onCertChange(fileEvent([makeFile('cert.pem')]))
      expect(modal.isFormInvalid()).toBe(false)
    })

    it('accepts a key and certificate that are already saved', async () => {
      const modal = await open({ key: '/etc/key.pem', cert: '/etc/cert.pem' })

      // Reopening the modal on a working setup must not demand the files again
      expect(modal.isFormInvalid()).toBe(false)
    })

    it('needs a pfx file, but not a passphrase', async () => {
      const modal = await open()
      modal.sslModeControl.setValue('pfx')
      expect(modal.isFormInvalid()).toBe(true)

      modal.onPfxChange(fileEvent([makeFile('cert.pfx')]))

      // A pfx without a passphrase is legal, so an empty one cannot block save
      expect(modal.isFormInvalid()).toBe(false)
    })

    it('goes back to invalid when a chosen file is cleared', async () => {
      const modal = await open()
      modal.sslModeControl.setValue('pfx')
      modal.onPfxChange(fileEvent([makeFile('cert.pfx')]))

      modal.onPfxChange(fileEvent([]))

      expect(modal.isFormInvalid()).toBe(true)
    })
  })

  describe('spotting changes', () => {
    it('counts switching mode as a change', async () => {
      const modal = await open()

      modal.sslModeControl.setValue('selfsigned')

      expect(modal.isUnchanged()).toBe(false)
    })

    it('counts choosing a file as a change on its own', async () => {
      const modal = await open({ key: '/etc/key.pem', cert: '/etc/cert.pem' })
      expect(modal.isUnchanged()).toBe(true)

      // Replacing the certificate does not alter any text field, so without the
      // pending-file checks this would look like nothing had happened
      modal.onCertChange(fileEvent([makeFile('newer-cert.pem')]))

      expect(modal.isUnchanged()).toBe(false)
    })

    it('counts typing a passphrase as a change', async () => {
      const modal = await open({ pfx: '/etc/cert.pfx' })

      modal.passphraseControl.setValue('hunter2')

      expect(modal.isUnchanged()).toBe(false)
    })

    it('goes back to unchanged when the mode is switched back', async () => {
      const modal = await open()

      modal.sslModeControl.setValue('pfx')
      modal.sslModeControl.setValue('off')

      expect(modal.isUnchanged()).toBe(true)
    })
  })

  describe('saving off mode', () => {
    it('clears every ssl key in one request', async () => {
      const modal = await open({ key: '/etc/key.pem', cert: '/etc/cert.pem' })
      modal.sslModeControl.setValue('off')

      await modal.saveConfiguration()

      // One PATCH rather than four PUTs, so the config is only rewritten once
      expect(api.callsTo('patch', '/config-editor/ui')).toHaveLength(1)
      expect(api.lastCall('patch', '/config-editor/ui')?.body).toEqual({
        'ssl.key': '',
        'ssl.cert': '',
        'ssl.pfx': '',
        'ssl.passphrase': '',
      })
    })

    it('forgets the paths locally too', async () => {
      const modal = await open({ key: '/etc/key.pem', cert: '/etc/cert.pem' })
      modal.sslModeControl.setValue('off')

      await modal.saveConfiguration()

      // Reopening the modal reads these back, so a stale value here would show
      // keycert mode again on a setup that is now off
      expect(settings.env.ssl?.key).toBe('')
      expect(settings.env.ssl?.cert).toBe('')
      expect(activeModal.close).toHaveBeenCalledWith('off')
    })
  })

  describe('saving a self-signed certificate', () => {
    it('sends the hostnames as a trimmed list', async () => {
      const modal = await open()
      api.respond('post', '/server/ssl/selfsigned/generate', { keyPath: '/gen/key.pem', certPath: '/gen/cert.pem' })
      modal.sslModeControl.setValue('selfsigned')
      modal.hostnamesControl.setValue('localhost, 127.0.0.1 ,  homebridge.local ,')

      await modal.saveConfiguration()

      // Users type these by hand, so the blanks and padding are expected
      expect(api.lastCall('post', '/server/ssl/selfsigned/generate')?.body).toEqual({
        hostnames: ['localhost', '127.0.0.1', 'homebridge.local'],
        mode: 'keycert',
      })
    })

    it('stores the generated paths and closes as keycert', async () => {
      const modal = await open()
      api.respond('post', '/server/ssl/selfsigned/generate', { keyPath: '/gen/key.pem', certPath: '/gen/cert.pem' })
      modal.sslModeControl.setValue('selfsigned')

      await modal.saveConfiguration()

      expect(settings.env.ssl?.key).toBe('/gen/key.pem')
      expect(settings.env.ssl?.cert).toBe('/gen/cert.pem')
      // Self-signed is not a mode the config knows about - it is stored as a
      // key and certificate pair, and the caller's toggle has to agree, or
      // reopening the modal would show a different mode than the one just saved
      expect(activeModal.close).toHaveBeenCalledWith('keycert')
    })

    it('clears any pfx setup it replaces', async () => {
      const modal = await open({ pfx: '/etc/cert.pfx', hasPassphrase: true })
      api.respond('post', '/server/ssl/selfsigned/generate', { keyPath: '/gen/key.pem', certPath: '/gen/cert.pem' })
      modal.sslModeControl.setValue('selfsigned')

      await modal.saveConfiguration()

      expect(settings.env.ssl?.pfx).toBe('')
      // `setEnvItem` takes a dotted string, so it writes keys the typed
      // interface does not declare - `ssl.passphrase` is one of them
      expect((settings.env.ssl as Record<string, unknown>).passphrase).toBe('')
    })

    it('writes no config at all when generating fails', async () => {
      const modal = await open()
      api.fail('post', '/server/ssl/selfsigned/generate', { error: { message: 'openssl missing' } })
      modal.sslModeControl.setValue('selfsigned')

      await modal.saveConfiguration()

      // Pointing the config at a certificate that was never written would stop
      // the server serving the UI at all
      expect(api.callsTo('patch')).toHaveLength(0)
      expect(activeModal.close).not.toHaveBeenCalled()
      expect(toastr.at('error')[0].message).toBe('openssl missing')
      expect(modal.isSaving()).toBe(false)
    })
  })

  describe('saving a key and certificate pair', () => {
    it('uploads both files under the same field name', async () => {
      const modal = await open()
      api.respond('post', '/server/ssl/keycert', { keyPath: '/up/key.pem', certPath: '/up/cert.pem' })
      modal.sslModeControl.setValue('keycert')
      modal.onKeyChange(fileEvent([makeFile('key.pem')]))
      modal.onCertChange(fileEvent([makeFile('cert.pem')]))

      await modal.saveConfiguration()

      const form = api.lastCall('post', '/server/ssl/keycert')?.body as FormData
      // The server takes them as one multi-file field, in key-then-cert order
      expect(form.getAll('uploads').map(entry => (entry as File).name)).toEqual(['key.pem', 'cert.pem'])
    })

    it('saves the paths the server gave back, not the local file names', async () => {
      const modal = await open()
      api.respond('post', '/server/ssl/keycert', { keyPath: '/up/key.pem', certPath: '/up/cert.pem' })
      modal.sslModeControl.setValue('keycert')
      modal.onKeyChange(fileEvent([makeFile('key.pem')]))
      modal.onCertChange(fileEvent([makeFile('cert.pem')]))

      await modal.saveConfiguration()

      expect(api.lastCall('patch', '/config-editor/ui')?.body).toEqual({
        'ssl.key': '/up/key.pem',
        'ssl.cert': '/up/cert.pem',
        'ssl.pfx': '',
        'ssl.passphrase': '',
      })
    })

    it('refuses to upload one half of a pair', async () => {
      const modal = await open({ key: '/etc/key.pem', cert: '/etc/cert.pem' })
      modal.onKeyChange(fileEvent([makeFile('newer-key.pem')]))

      await modal.saveConfiguration()

      // The saved pair has to match. Replacing only the key would leave a
      // certificate that no longer verifies against it
      expect(api.callsTo('post', '/server/ssl/keycert')).toHaveLength(0)
      expect(api.callsTo('patch')).toHaveLength(0)
      expect(toastr.at('error')[0].message).toBe('settings.security.upload_both_files')
    })

    it('keeps the saved paths when no new files were chosen', async () => {
      const modal = await open({ key: '/etc/key.pem', cert: '/etc/cert.pem' })
      modal.passphraseControl.setValue('irrelevant')

      await modal.saveConfiguration()

      expect(api.callsTo('post', '/server/ssl/keycert')).toHaveLength(0)
      expect(api.lastCall('patch', '/config-editor/ui')?.body).toMatchObject({
        'ssl.key': '/etc/key.pem',
        'ssl.cert': '/etc/cert.pem',
      })
    })

    it('forgets the chosen files once they are uploaded', async () => {
      const modal = await open()
      api.respond('post', '/server/ssl/keycert', { keyPath: '/up/key.pem', certPath: '/up/cert.pem' })
      modal.sslModeControl.setValue('keycert')
      modal.onKeyChange(fileEvent([makeFile('key.pem')]))
      modal.onCertChange(fileEvent([makeFile('cert.pem')]))

      await modal.saveConfiguration()

      // Otherwise a second save would upload the same files again
      expect(modal.pendingKeyFile()).toBeNull()
      expect(modal.pendingCertFile()).toBeNull()
    })
  })

  describe('saving a pfx bundle', () => {
    it('sends the passphrase with the upload', async () => {
      const modal = await open()
      api.respond('post', '/server/ssl/pfx', { pfxPath: '/up/cert.pfx' })
      modal.sslModeControl.setValue('pfx')
      modal.onPfxChange(fileEvent([makeFile('cert.pfx')]))
      modal.passphraseControl.setValue('hunter2')

      await modal.saveConfiguration()

      const form = api.lastCall('post', '/server/ssl/pfx')?.body as FormData
      expect((form.get('upload') as File).name).toBe('cert.pfx')
      // The server needs it to decrypt the bundle's MAC and check the file is
      // usable before the config points at it
      expect(form.get('passphrase')).toBe('hunter2')
    })

    it('clears any key and certificate setup it replaces', async () => {
      const modal = await open({ key: '/etc/key.pem', cert: '/etc/cert.pem' })
      api.respond('post', '/server/ssl/pfx', { pfxPath: '/up/cert.pfx' })
      modal.sslModeControl.setValue('pfx')
      modal.onPfxChange(fileEvent([makeFile('cert.pfx')]))
      modal.passphraseControl.setValue('hunter2')

      await modal.saveConfiguration()

      expect(api.lastCall('patch', '/config-editor/ui')?.body).toEqual({
        'ssl.key': '',
        'ssl.cert': '',
        'ssl.pfx': '/up/cert.pfx',
        'ssl.passphrase': 'hunter2',
      })
      expect(activeModal.close).toHaveBeenCalledWith('pfx')
    })

    it('writes no config when the bundle is rejected', async () => {
      const modal = await open()
      api.fail('post', '/server/ssl/pfx', { error: { message: 'wrong passphrase' } })
      modal.sslModeControl.setValue('pfx')
      modal.onPfxChange(fileEvent([makeFile('cert.pfx')]))

      await modal.saveConfiguration()

      expect(api.callsTo('patch')).toHaveLength(0)
      expect(toastr.at('error')[0].message).toBe('wrong passphrase')
    })

    it('lets the user try again after a failure', async () => {
      const modal = await open({ key: '/etc/key.pem', cert: '/etc/cert.pem' })
      api.fail('patch', '/config-editor/ui', new Error('read only file system'))
      modal.sslModeControl.setValue('off')

      await modal.saveConfiguration()

      // The spinner is cleared in a finally block, so a failed save does not
      // leave the button stuck
      expect(modal.isSaving()).toBe(false)
      expect(activeModal.close).not.toHaveBeenCalled()
    })
  })
})
