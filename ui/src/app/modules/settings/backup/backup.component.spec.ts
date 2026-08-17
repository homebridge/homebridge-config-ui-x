import type { EnvInterface } from '@/app/core/settings.interfaces'
import type { FakeApi, FakeModalService, FakeSettings } from '@/testing'

import { TestBed } from '@angular/core/testing'
import { saveAs } from 'file-saver'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RESTORE_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { BackupComponent } from '@/app/modules/settings/backup/backup.component'
import { RestoreComponent } from '@/app/modules/settings/backup/restore/restore.component'
import { activeModalStub, fakeApi, makeSettings, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

// Downloads are the one thing a spec cannot let happen for real: jsdom has no
// file system, and saveAs would try to click an anchor
vi.mock('file-saver', () => ({ saveAs: vi.fn() }))

/**
 * The backup modal: download a backup now, manage the scheduled ones, and hand
 * over to the restore modal.
 *
 * The scheduled-backup switches write straight to config.json through a
 * debounce, which is the part worth pinning - the debounce exists so typing a
 * path does not write a file per keystroke, and it is easy to lose in a
 * refactor without anything looking broken.
 */
describe('backupComponent', () => {
  let api: FakeApi
  let settings: FakeSettings
  let toastr: ReturnType<typeof toastrStub>
  let activeModal: ReturnType<typeof activeModalStub>
  let modal: FakeModalService

  const scheduledBackups = [
    { id: 'backup-1', fileName: 'homebridge-backup-1.tar.gz', timestamp: '2026-08-16T02:00:00.000Z', size: '1.2MB' },
    { id: 'backup-2', fileName: 'homebridge-backup-2.tar.gz', timestamp: '2026-08-15T02:00:00.000Z', size: '1.1MB' },
  ]

  /**
   * A blob response of a claimed size, as the download endpoints return.
   * @param size - the size to report in bytes
   * @param fileName - the value of the File-Name header, if any
   */
  function blobResponse(size: number, fileName?: string) {
    return {
      body: { size },
      headers: { get: (name: string) => (name === 'File-Name' ? fileName ?? null : null) },
    }
  }

  function configure(env: Partial<EnvInterface> = {}) {
    TestBed.resetTestingModule()
    api = fakeApi()
      .respond('get', '/backup/scheduled-backups', scheduledBackups)
      .respond('get', '/backup/scheduled-backups/next', { next: '2026-08-18T02:00:00.000Z' })
    settings = makeSettings({ env })
    toastr = toastrStub()
    activeModal = activeModalStub()
    modal = modalServiceSpy()

    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        provideFakes({ api, settings, toastr, activeModal, modal }),
      ],
    })
  }

  /** Build the modal and let its two initial reads settle. */
  async function open(): Promise<BackupComponent> {
    const fixture = TestBed.createComponent(BackupComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    return fixture.componentInstance
  }

  beforeEach(() => {
    configure()
    vi.mocked(saveAs).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('opening the modal', () => {
    it('lists the scheduled backups and when the next one is due', async () => {
      const backup = await open()

      expect(backup.scheduledBackups()).toHaveLength(2)
      expect(backup.backupTime()).toBe('2026-08-18T02:00:00.000Z')
    })

    it('shows the schedule as enabled when it is not disabled', async () => {
      const backup = await open()

      // The config key is a negative (`scheduledBackupDisable`) and the switch
      // is a positive, so this reads inverted on purpose
      expect(backup.currentSettingEnabled()).toBe(true)
      expect(backup.enabledFormControl.value).toBe(true)
    })

    it('shows the schedule as disabled when the config turns it off', async () => {
      configure({ scheduledBackupDisable: true })
      const backup = await open()

      expect(backup.currentSettingEnabled()).toBe(false)
    })

    it('prefills the configured backup path', async () => {
      configure({ scheduledBackupPath: '/mnt/nas/backups' })
      const backup = await open()

      expect(backup.pathFormControl.value).toBe('/mnt/nas/backups')
    })

    it('stays usable when the backup list cannot be read', async () => {
      configure()
      api.fail('get', '/backup/scheduled-backups', new Error('offline'))
      const backup = await open()

      // Only the list is missing; downloading a fresh backup still works, so
      // this failure is logged rather than shown
      expect(backup.scheduledBackups()).toEqual([])
      expect(toastr.at('error')).toHaveLength(0)
    })
  })

  describe('downloading a backup now', () => {
    it('asks for the archive as a blob', async () => {
      api.respond('get', '/backup/download', blobResponse(1024, 'my-backup.tar.gz'))
      const backup = await open()

      await backup.onDownloadBackupClick()

      expect(api.lastCall('get', '/backup/download')?.options).toEqual({
        observe: 'response',
        responseType: 'blob',
      })
      expect(saveAs).toHaveBeenCalledWith({ size: 1024 }, 'my-backup.tar.gz')
    })

    it('falls back to a default file name', async () => {
      api.respond('get', '/backup/download', blobResponse(1024))
      const backup = await open()

      await backup.onDownloadBackupClick()

      expect(vi.mocked(saveAs).mock.calls[0][1]).toBe('homebridge-backup.tar.gz')
    })

    it('warns about an archive too big to restore, but still saves it', async () => {
      api.respond('get', '/backup/download', blobResponse(globalThis.backup.maxBackupSize + 1, 'huge.tar.gz'))
      const backup = await open()

      await backup.onDownloadBackupClick()

      // The upload limit only applies to restoring it again through the UI, so
      // the user still gets the file - they just need to know
      expect(toastr.at('warning')).toHaveLength(1)
      expect(saveAs).toHaveBeenCalled()
    })

    it('re-enables the button when the download fails', async () => {
      api.fail('get', '/backup/download', new Error('offline'))
      const backup = await open()

      await backup.onDownloadBackupClick()

      expect(backup.clicked()).toBe(false)
      expect(toastr.at('error')).toHaveLength(1)
    })
  })

  describe('the scheduled backups list', () => {
    it('downloads one by id', async () => {
      api.respond('get', '/backup/scheduled-backups/backup-1', blobResponse(1024))
      const backup = await open()

      await backup.download(scheduledBackups[0] as any)

      expect(saveAs).toHaveBeenCalledWith({ size: 1024 }, 'homebridge-backup-1.tar.gz')
    })

    it('tells the user when one cannot be downloaded', async () => {
      api.fail('get', '/backup/scheduled-backups/backup-1', new Error('gone'))
      const backup = await open()

      await backup.download(scheduledBackups[0] as any)

      expect(toastr.at('error')[0].message).toBe('backup.backup_download_failed')
      expect(saveAs).not.toHaveBeenCalled()
    })

    it('deletes one and reloads the list', async () => {
      const backup = await open()
      api.clearCalls()

      await backup.delete(scheduledBackups[0] as any)

      expect(api.callsTo('delete', '/backup/scheduled-backups/backup-1')).toHaveLength(1)
      expect(api.callsTo('get', '/backup/scheduled-backups')).toHaveLength(1)
    })

    it('clears the deleting marker even when the delete fails', async () => {
      api.fail('delete', '/backup/scheduled-backups/backup-1', new Error('read only'))
      const backup = await open()

      await backup.delete(scheduledBackups[0] as any)

      // Otherwise that one row keeps its spinner for as long as the modal is open
      expect(backup.deleting()).toBeNull()
      expect(toastr.at('error')[0].message).toBe('backup.backup_delete_failed')
    })

    it('creates a backup on demand and reloads the list', async () => {
      const backup = await open()
      api.clearCalls()

      await backup.onCreateBackupClick()

      expect(api.lastCall('post', '/backup')?.body).toEqual({})
      expect(api.callsTo('get', '/backup/scheduled-backups')).toHaveLength(1)
      expect(backup.clicked()).toBe(false)
    })
  })

  describe('handing over to the restore modal', () => {
    it('closes itself first, then opens restore', async () => {
      const backup = await open()

      backup.restore(scheduledBackups[0] as any)

      // Both are `size: 'lg'` modals; leaving this one open would stack them
      expect(activeModal.close).toHaveBeenCalled()
      expect(modal.lastOpened()?.content).toBe(RestoreComponent)
    })

    it('passes the chosen backup through the modal data token', async () => {
      const backup = await open()

      backup.restore(scheduledBackups[1] as any)

      expect(modal.dataFor(RESTORE_MODAL_DATA)?.selectedBackup).toEqual(scheduledBackups[1])
    })

    it('passes nothing when the user wants to upload their own file', async () => {
      const backup = await open()

      backup.restore(null)

      // Restore switches between "restore this scheduled backup" and "upload an
      // archive" purely on whether this is null
      expect(modal.dataFor(RESTORE_MODAL_DATA)?.selectedBackup).toBeNull()
    })

    it('opens restore so it cannot be dismissed by a stray click', async () => {
      const backup = await open()

      backup.restore(null)

      // A restore that is half done and then dismissed leaves an unusable install
      expect(modal.lastOpened()?.options?.backdrop).toBe('static')
    })
  })

  describe('changing the backup schedule', () => {
    it('waits for the user to stop before writing the config', async () => {
      vi.useFakeTimers()
      const backup = await open()
      api.clearCalls()

      backup.pathFormControl.setValue('/mnt')
      backup.pathFormControl.setValue('/mnt/nas')
      backup.pathFormControl.setValue('/mnt/nas/backups')
      await vi.advanceTimersByTimeAsync(1500)

      // One write for three keystrokes: each one otherwise rewrites config.json
      expect(api.callsTo('patch', '/config-editor/ui')).toHaveLength(1)
      expect(api.lastCall('patch', '/config-editor/ui')?.body).toEqual({
        scheduledBackupPath: '/mnt/nas/backups',
      })
    })

    it('saves the switch as the inverse config key', async () => {
      vi.useFakeTimers()
      const backup = await open()
      api.clearCalls()

      backup.enabledFormControl.setValue(false)
      await vi.advanceTimersByTimeAsync(500)

      // Switching the schedule off means writing `disable: true`
      expect(api.lastCall('patch', '/config-editor/ui')?.body).toEqual({
        scheduledBackupDisable: true,
      })
      expect(settings.env.scheduledBackupDisable).toBe(true)
    })

    it('asks the user to restart after a schedule change', async () => {
      vi.useFakeTimers()
      const backup = await open()

      backup.enabledFormControl.setValue(false)
      await vi.advanceTimersByTimeAsync(500)

      // The schedule is read at startup, so the change does nothing until then
      expect(settings.showRestartToast).toHaveBeenCalled()
    })

    it('does not claim a restart is needed when the write failed', async () => {
      vi.useFakeTimers()
      api.fail('patch', '/config-editor/ui', new Error('read only file system'))
      const backup = await open()

      backup.enabledFormControl.setValue(false)
      await vi.advanceTimersByTimeAsync(500)

      expect(settings.showRestartToast).not.toHaveBeenCalled()
      expect(toastr.at('error')).toHaveLength(1)
    })
  })
})
