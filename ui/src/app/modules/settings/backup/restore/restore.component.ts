import { HttpEventType, HttpResponse } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { RESTORE_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SettingsService } from '@/app/core/ui/settings.service'
import { hideXtermInputFromScreenReader } from '@/app/core/utilities/log.service'
import { BackupComponent } from '@/app/modules/settings/backup/backup.component'
import { ScheduledBackup } from '@/app/modules/settings/backup/backup.interfaces'

@Component({
  selector: 'app-restore',
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './restore.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RestoreComponent implements OnInit, OnDestroy {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $modal = inject(NgbModal)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private modalData = inject(RESTORE_MODAL_DATA)

  // Public properties (from injected data)
  public setupWizardRestore = this.modalData.setupWizardRestore ?? false
  public selectedBackup: ScheduledBackup | null = this.modalData.selectedBackup ?? null

  // Signals
  public readonly clicked = signal(false)
  public readonly selectedFile = signal<File | null>(null)
  public readonly restoreInProgress = signal(false)
  public readonly restoreStarted = signal(false)
  public readonly restoreFailed = signal(false)
  public readonly restoreArchiveType = signal<'homebridge' | 'hbfx'>('homebridge')
  public readonly uploadPercent = signal(0)

  // Other properties
  private io!: IoNamespace
  private term!: Terminal
  private termTarget!: HTMLElement
  private fitAddon = new FitAddon()
  private webLinksAddon = new WebLinksAddon()
  private xtermA11yDisposer: (() => void) | null = null
  public maxFileSizeText: string = globalThis.backup.maxBackupSizeText

  public get isLightTerminalTheme(): boolean {
    return this.$settings.getEffectiveTerminalLightingMode() === 'light'
  }

  public ngOnInit(): void {
    void this.initialize()
  }

  private async initialize(): Promise<void> {
    this.io = this.$ws.connectToNamespace('backup')
    this.termTarget = document.getElementById('plugin-log-output')!

    this.term = new Terminal(this.$settings.getTerminalOptions({ disableStdin: true }))
    this.term.loadAddon(this.fitAddon)
    this.term.loadAddon(this.webLinksAddon)
    this.term.open(this.termTarget)
    this.xtermA11yDisposer = hideXtermInputFromScreenReader(this.termTarget)
    this.fitAddon.fit()

    this.io.socket.on('stdout', (data) => {
      this.term.write(data)
    })

    if (this.setupWizardRestore) {
      this.restoreStarted.set(true)
      this.restoreInProgress.set(true)
      void this.startRestore()
    }
  }

  public onRestoreBackupClick(): void {
    if (this.selectedBackup) {
      // Prepopulated with a backup from the backup modal
      void this.restoreScheduledBackup()
    } else {
      // Restore from uploaded file
      if (this.restoreArchiveType() === 'homebridge') {
        void this.uploadHomebridgeArchive()
      } else if (this.restoreArchiveType() === 'hbfx') {
        void this.uploadHbfxArchive()
      }
    }
  }

  public handleRestoreFileInput(event: Event): void {
    const files = (event.target as HTMLInputElement).files
    if (files?.length) {
      this.selectedFile.set(files[0])
      if (this.selectedFile()?.name.endsWith('.hbfx')) {
        this.restoreArchiveType.set('hbfx')
      } else {
        this.restoreArchiveType.set('homebridge')
      }
    } else {
      this.selectedFile.set(null)
    }
  }

  public async postBackupRestart(): Promise<void> {
    try {
      await this.$api.put('/backup/restart', {})
      this.$activeModal.close(true)
      void this.$router.navigate(['/'])
    } catch {
      /* do nothing */
    }
  }

  public reopenBackupModal(): void {
    this.$activeModal.dismiss()
    this.$modal.open(BackupComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public ngOnDestroy(): void {
    this.io.end!()
    this.xtermA11yDisposer?.()
    this.term?.dispose()
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  private async uploadHomebridgeArchive(): Promise<void> {
    this.term.reset()
    this.clicked.set(true)
    const formData: FormData = new FormData()
    formData.append('restoreArchive', this.selectedFile()!, this.selectedFile()?.name)
    try {
      await this.$api.post('/backup/restore', formData)
      this.restoreStarted.set(true)
      this.restoreInProgress.set(true)
      setTimeout(() => {
        void this.startRestore()
      }, 500)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(error.error?.message || this.$translate.instant('backup.restore_failed'), this.$translate.instant('toast.title_error'))
    } finally {
      this.clicked.set(false)
    }
  }

  private async restoreScheduledBackup(): Promise<void> {
    this.term.reset()
    this.clicked.set(true)
    try {
      await this.$api.post(`/backup/scheduled-backups/${this.selectedBackup!.id}/restore`, {})
      this.restoreStarted.set(true)
      this.restoreInProgress.set(true)
      setTimeout(() => {
        void this.startRestore()
      }, 500)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(error.error?.message || this.$translate.instant('backup.restore_failed'), this.$translate.instant('toast.title_error'))
    } finally {
      this.clicked.set(false)
    }
  }

  private async startRestore(): Promise<void> {
    this.io.request('do-restore')
      .subscribe({
        next: () => {
          this.restoreInProgress.set(false)
          this.$toastr.success(this.$translate.instant('backup.backup_restored'), this.$translate.instant('toast.title_success'))
          if (this.setupWizardRestore) {
            this.postBackupRestart()
          }
        },
        error: (error) => {
          this.restoreFailed.set(true)
          console.error(error)
          this.$toastr.error(this.$translate.instant('backup.restore_failed'), this.$translate.instant('toast.title_error'))
        },
      })
  }

  private async uploadHbfxArchive(): Promise<void> {
    this.term.reset()
    this.clicked.set(true)
    const formData: FormData = new FormData()
    formData.append('restoreArchive', this.selectedFile()!, this.selectedFile()?.name)
    try {
      const event = await this.$api.post('/backup/restore/hbfx', formData, {
        reportProgress: true,
        observe: 'events',
      })
      if (event.type === HttpEventType.UploadProgress) {
        this.uploadPercent.set(Math.round(100 * event.loaded / event.total!))
      } else if (event instanceof HttpResponse) {
        this.restoreStarted.set(true)
        this.restoreInProgress.set(true)
        setTimeout(() => {
          void this.startHbfxRestore()
        }, 500)
      }
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(error.error?.message || this.$translate.instant('backup.restore_failed'), this.$translate.instant('toast.title_error'))
    } finally {
      this.clicked.set(false)
    }
  }

  private async startHbfxRestore(): Promise<void> {
    this.io.request('do-restore-hbfx')
      .subscribe({
        next: () => {
          this.restoreInProgress.set(false)
          this.$toastr.success(this.$translate.instant('backup.backup_restored'), this.$translate.instant('toast.title_success'))
        },
        error: (error) => {
          this.restoreFailed.set(true)
          console.error(error)
          this.$toastr.error(this.$translate.instant('backup.restore_failed'), this.$translate.instant('toast.title_error'))
        },
      })
  }
}
