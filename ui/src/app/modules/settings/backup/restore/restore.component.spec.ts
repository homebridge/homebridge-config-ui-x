import type { FakeApi, FakeIoNamespace, FakeSettings, FakeWs } from '@/testing'

import { HttpEventType, provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RESTORE_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { TERMINAL_FACTORY } from '@/app/core/utilities/terminal.factory'
import { BackupComponent } from '@/app/modules/settings/backup/backup.component'
import { RestoreComponent } from '@/app/modules/settings/backup/restore/restore.component'
import { environment } from '@/environments/environment'
import { activeModalStub, fakeApi, fakeTerminals, fakeWs, makeSettings, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

// Every terminal the component built, so a spec can read what was written to it

/**
 * The restore modal, which is the most destructive screen in the app: it
 * replaces the whole Homebridge storage directory and then restarts the
 * service. Once the archive is unpacked there is no undo.
 *
 * There are four routes into a restore (uploaded .tar.gz, uploaded .hbfx, a
 * scheduled backup, and the setup wizard) and each one has a different upload
 * step but the same websocket handoff afterwards. The point of these specs is
 * that each route reaches the right endpoint and then really does trigger the
 * unpack - the .hbfx one in particular used to look fine while never starting,
 * because ApiService resolves on the first upload event rather than the response.
 */
describe('restoreComponent', () => {
  let xterm: ReturnType<typeof fakeTerminals>
  let api: FakeApi
  let http: HttpTestingController
  let settings: FakeSettings
  let toastr: ReturnType<typeof toastrStub>
  let activeModal: ReturnType<typeof activeModalStub>
  let modal: ReturnType<typeof modalServiceSpy>
  let ws: FakeWs
  let io: FakeIoNamespace
  let navigate: ReturnType<typeof vi.fn>
  let termTarget: HTMLElement

  const scheduledBackup = { id: 'backup-1', fileName: 'homebridge-backup-1.tar.gz' }

  /**
   * Build the modal.
   *
   * `arrange` runs after the fakes are built but before the component is
   * created, which is the only window for registering a response the modal
   * will reach for during its own initialisation.
   * @param modalData - the restore modal data token's value
   * @param arrange - registers responses on the freshly built fakes
   */
  async function open(modalData: Record<string, any> = {}, arrange?: () => void): Promise<RestoreComponent> {
    TestBed.resetTestingModule()
    api = fakeApi()
    settings = makeSettings()
    toastr = toastrStub()
    activeModal = activeModalStub()
    modal = modalServiceSpy()
    ws = fakeWs()
    io = ws.namespace('backup')

    xterm = fakeTerminals()

    TestBed.configureTestingModule({
      providers: [
        { provide: TERMINAL_FACTORY, useValue: xterm.factory },
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTestTranslate(),
        provideFakes({ api, settings, toastr, activeModal, modal, ws }),
        { provide: RESTORE_MODAL_DATA, useValue: { selectedBackup: null, ...modalData } },
      ],
    })

    http = TestBed.inject(HttpTestingController)
    navigate = vi.fn(async () => true)
    vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigate as any)

    arrange?.()

    const fixture = TestBed.createComponent(RestoreComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    return fixture.componentInstance
  }

  /**
   * A change event carrying a file, as the archive picker would raise.
   * @param names - the names of the selected files
   */
  function fileEvent(names: string[]): Event {
    return { target: { files: names.map(name => new File(['archive'], name)) } } as unknown as Event
  }

  beforeEach(() => {
    // The component reaches for this by id rather than a view child, so it has
    // to exist before the modal is created
    termTarget = document.createElement('div')
    termTarget.id = 'plugin-log-output'
    document.body.appendChild(termTarget)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  afterAll(() => {
    // Removed here, not in afterEach: the fixture is destroyed after a spec's
    // own hooks run, and ngOnDestroy still reads this element
    termTarget.remove()
  })

  describe('opening the modal', () => {
    it('opens its own websocket namespace', async () => {
      await open()

      // Not `getExistingNamespace`: nothing else in the app opens 'backup', so
      // the modal is responsible for connecting it
      expect(ws.connectToNamespace).toHaveBeenCalledWith('backup')
    })

    it('shows the server output as it arrives', async () => {
      await open()

      io.socket.fire('stdout', 'Extracting archive...')

      expect(xterm.terminals[0].written).toEqual(['Extracting archive...'])
    })

    it('builds a read-only terminal', async () => {
      await open()

      // The user cannot type into a restore, and an enabled stdin would send
      // keystrokes to a socket with nothing listening
      expect(settings.getTerminalOptions).toHaveBeenCalledWith({ disableStdin: true })
    })

    it('starts with nothing chosen when opened for an upload', async () => {
      const restore = await open()

      expect(restore.selectedBackup).toBeNull()
      expect(restore.restoreStarted()).toBe(false)
    })
  })

  describe('choosing an archive', () => {
    it('spots an hbfx archive by its extension', async () => {
      const restore = await open()

      restore.handleRestoreFileInput(fileEvent(['old-install.hbfx']))

      // .hbfx is a Homebridge for Docker export, which the server unpacks
      // through a different endpoint entirely
      expect(restore.restoreArchiveType()).toBe('hbfx')
    })

    it('treats anything else as a homebridge archive', async () => {
      const restore = await open()

      restore.handleRestoreFileInput(fileEvent(['homebridge-backup.tar.gz']))

      expect(restore.restoreArchiveType()).toBe('homebridge')
    })

    it('forgets the file when the picker is cleared', async () => {
      const restore = await open()
      restore.handleRestoreFileInput(fileEvent(['old-install.hbfx']))

      restore.handleRestoreFileInput(fileEvent([]))

      expect(restore.selectedFile()).toBeNull()
    })
  })

  describe('restoring an uploaded homebridge archive', () => {
    it('uploads the archive and then asks for the unpack', async () => {
      vi.useFakeTimers()
      const restore = await open()
      restore.handleRestoreFileInput(fileEvent(['homebridge-backup.tar.gz']))

      restore.onRestoreBackupClick()
      await vi.advanceTimersByTimeAsync(500)

      const call = api.lastCall('post', '/backup/restore')
      expect((call?.body as FormData).get('restoreArchive')).toBeInstanceOf(File)
      // Uploading is only half of it: the archive sits on disk until this asks
      // for it to be unpacked
      expect(io.requests.map(request => request.resource)).toContain('do-restore')
    })

    it('reports success once the unpack finishes', async () => {
      vi.useFakeTimers()
      const restore = await open({}, () => io.socket.respondTo('do-restore', {}))
      restore.handleRestoreFileInput(fileEvent(['homebridge-backup.tar.gz']))

      restore.onRestoreBackupClick()
      await vi.advanceTimersByTimeAsync(500)

      expect(restore.restoreInProgress()).toBe(false)
      expect(restore.restoreFailed()).toBe(false)
      expect(toastr.at('success')[0].message).toBe('backup.backup_restored')
    })

    it('marks the restore as failed when the unpack errors', async () => {
      vi.useFakeTimers()
      const restore = await open({}, () => io.socket.respondTo('do-restore', { error: 'not a homebridge backup' }))
      restore.handleRestoreFileInput(fileEvent(['homebridge-backup.tar.gz']))

      restore.onRestoreBackupClick()
      await vi.advanceTimersByTimeAsync(500)

      // The install is half-replaced at this point, so the modal has to say so
      // rather than quietly offering the restart button
      expect(restore.restoreFailed()).toBe(true)
      expect(toastr.at('error')[0].message).toBe('backup.restore_failed')
    })

    it('never asks for the unpack when the upload is rejected', async () => {
      vi.useFakeTimers()
      const restore = await open({}, () => api.fail('post', '/backup/restore', { error: { message: 'archive too large' } }))
      restore.handleRestoreFileInput(fileEvent(['homebridge-backup.tar.gz']))

      restore.onRestoreBackupClick()
      await vi.advanceTimersByTimeAsync(500)

      expect(io.requests).toHaveLength(0)
      expect(restore.restoreStarted()).toBe(false)
      expect(toastr.at('error')[0].message).toBe('archive too large')
      expect(restore.clicked()).toBe(false)
    })

    it('clears the terminal so a second attempt starts fresh', async () => {
      const restore = await open()
      restore.handleRestoreFileInput(fileEvent(['homebridge-backup.tar.gz']))

      restore.onRestoreBackupClick()

      expect(xterm.terminals[0].reset).toHaveBeenCalled()
    })
  })

  describe('restoring an uploaded hbfx archive', () => {
    /**
     * Answer the hbfx upload, optionally reporting progress first.
     * @param loaded - bytes uploaded so far, if a progress event is wanted
     * @param total - total bytes
     */
    function respondToUpload(loaded?: number, total?: number) {
      const request = http.expectOne(`${environment.api.base}/backup/restore/hbfx`)
      if (loaded !== undefined) {
        request.event({ type: HttpEventType.UploadProgress, loaded, total })
      }
      request.flush({ status: 'ok' })
      return request
    }

    it('subscribes to the upload events rather than a single value', async () => {
      vi.useFakeTimers()
      const restore = await open()
      restore.handleRestoreFileInput(fileEvent(['old-install.hbfx']))

      restore.onRestoreBackupClick()
      respondToUpload()
      await vi.advanceTimersByTimeAsync(500)

      // The regression this guards: going through ApiService resolves on the
      // first (Sent) event, so the restore appeared to upload and then simply
      // never started
      expect(io.requests.map(request => request.resource)).toContain('do-restore-hbfx')
      expect(restore.restoreStarted()).toBe(true)
    })

    it('reports upload progress as a percentage', async () => {
      vi.useFakeTimers()
      const restore = await open()
      restore.handleRestoreFileInput(fileEvent(['old-install.hbfx']))

      restore.onRestoreBackupClick()
      respondToUpload(512, 2048)
      await vi.advanceTimersByTimeAsync(500)

      // An hbfx export can be hundreds of megabytes, so the bar is the only
      // sign anything is happening
      expect(restore.uploadPercent()).toBe(25)
    })

    it('uses its own unpack request, not the homebridge one', async () => {
      vi.useFakeTimers()
      const restore = await open()
      restore.handleRestoreFileInput(fileEvent(['old-install.hbfx']))

      restore.onRestoreBackupClick()
      respondToUpload()
      await vi.advanceTimersByTimeAsync(500)

      expect(io.requests.map(request => request.resource)).not.toContain('do-restore')
    })

    it('lets the user try again when the upload fails', async () => {
      const restore = await open()
      restore.handleRestoreFileInput(fileEvent(['old-install.hbfx']))

      restore.onRestoreBackupClick()
      http.expectOne(`${environment.api.base}/backup/restore/hbfx`)
        .flush({ message: 'not a valid hbfx file' }, { status: 400, statusText: 'Bad Request' })

      expect(restore.clicked()).toBe(false)
      expect(restore.restoreStarted()).toBe(false)
    })
  })

  describe('restoring a scheduled backup', () => {
    it('restores by id without uploading anything', async () => {
      vi.useFakeTimers()
      const restore = await open({ selectedBackup: scheduledBackup })

      restore.onRestoreBackupClick()
      await vi.advanceTimersByTimeAsync(500)

      expect(api.lastCall('post', '/backup/scheduled-backups/backup-1/restore')?.body).toEqual({})
      expect(api.callsTo('post', '/backup/restore')).toHaveLength(0)
      expect(io.requests.map(request => request.resource)).toContain('do-restore')
    })

    it('ignores the archive type when a backup was chosen', async () => {
      vi.useFakeTimers()
      const restore = await open({ selectedBackup: scheduledBackup })
      restore.restoreArchiveType.set('hbfx')

      restore.onRestoreBackupClick()
      await vi.advanceTimersByTimeAsync(500)

      // A scheduled backup is always a homebridge archive, so the radio the
      // user may have touched must not divert it
      expect(api.callsTo('post', '/backup/scheduled-backups/backup-1/restore')).toHaveLength(1)
    })
  })

  describe('the setup wizard route', () => {
    it('starts restoring as soon as it opens', async () => {
      vi.useFakeTimers()
      const restore = await open({ setupWizardRestore: true }, () => io.socket.respondTo('do-restore', {}))
      await vi.advanceTimersByTimeAsync(0)

      // The wizard has already uploaded the archive, so there is nothing for
      // the user to press
      expect(restore.restoreStarted()).toBe(true)
      expect(io.requests.map(request => request.resource)).toContain('do-restore')
    })

    it('restarts by itself once the unpack finishes', async () => {
      vi.useFakeTimers()
      await open({ setupWizardRestore: true }, () => io.socket.respondTo('do-restore', {}))
      await vi.advanceTimersByTimeAsync(0)

      expect(api.callsTo('put', '/backup/restart')).toHaveLength(1)
    })

    it('waits for the user on the ordinary route', async () => {
      vi.useFakeTimers()
      await open({}, () => io.socket.respondTo('do-restore', {}))
      await vi.advanceTimersByTimeAsync(500)

      expect(io.requests).toHaveLength(0)
    })
  })

  describe('finishing up', () => {
    it('restarts the server and goes back to the status page', async () => {
      const restore = await open()

      await restore.postBackupRestart()

      expect(api.lastCall('put', '/backup/restart')?.body).toEqual({})
      expect(activeModal.close).toHaveBeenCalledWith(true)
      expect(navigate).toHaveBeenCalledWith(['/'])
    })

    it('stays put when the restart request fails', async () => {
      const restore = await open({}, () => api.fail('put', '/backup/restart', new Error('offline')))

      await restore.postBackupRestart()

      // Swallowed on purpose: the server going away mid-request is the normal
      // case here, and the page reload is what actually recovers
      expect(activeModal.close).not.toHaveBeenCalled()
      expect(navigate).not.toHaveBeenCalled()
    })

    it('goes back to the backup modal on request', async () => {
      const restore = await open()

      restore.reopenBackupModal()

      expect(activeModal.dismiss).toHaveBeenCalled()
      expect(modal.lastOpened()?.content).toBe(BackupComponent)
    })

    it('closes the socket and the terminal on teardown', async () => {
      TestBed.resetTestingModule()
      await open()
      const term = xterm.terminals[0]

      TestBed.resetTestingModule()

      // The namespace is this modal's alone, and an undisposed terminal keeps
      // its buffer and listeners alive for as long as the page is open
      expect(io.end).toHaveBeenCalled()
      expect(term.dispose).toHaveBeenCalled()
    })
  })

  describe('the terminal theme', () => {
    it('follows the effective terminal lighting mode', async () => {
      const restore = await open()

      settings.getEffectiveTerminalLightingMode = vi.fn(() => 'light') as any
      expect(restore.isLightTerminalTheme).toBe(true)

      settings.getEffectiveTerminalLightingMode = vi.fn(() => 'dark') as any
      expect(restore.isLightTerminalTheme).toBe(false)
    })
  })
})
