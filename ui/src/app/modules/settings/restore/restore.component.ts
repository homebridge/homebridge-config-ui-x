import { ApiService } from '@/app/core/api.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { HttpEventType, HttpResponse } from '@angular/common/http'
import { Component, Input, OnDestroy, OnInit } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'

@Component({
  templateUrl: './restore.component.html',
})
export class RestoreComponent implements OnInit, OnDestroy {
  @Input() setupWizardRestore = false

  public clicked = false
  public maxFileSizeText = globalThis.backup.maxBackupSizeText
  public selectedFile: File
  public restoreInProgress = false
  public restoreStarted = false
  public restoreFailed = false
  public restoreArchiveType: 'homebridge' | 'hbfx' = 'homebridge'
  public uploadPercent = 0

  private term = new Terminal()
  private termTarget: HTMLElement
  private fitAddon = new FitAddon()

  private io: IoNamespace

  constructor(
    private $route: Router,
    public activeModal: NgbActiveModal,
    private translate: TranslateService,
    public $toastr: ToastrService,
    private $api: ApiService,
    private $ws: WsService,
  ) {}

  async ngOnInit() {
    this.io = this.$ws.connectToNamespace('backup')
    this.termTarget = document.getElementById('plugin-log-output')
    this.term.open(this.termTarget)
    this.fitAddon.fit()

    this.io.socket.on('stdout', (data) => {
      this.term.write(data)
    })

    if (this.setupWizardRestore) {
      this.restoreStarted = true
      this.restoreInProgress = true
      this.startRestore()
    }
  }

  onRestoreBackupClick() {
    if (this.restoreArchiveType === 'homebridge') {
      this.uploadHomebridgeArchive()
    } else if (this.restoreArchiveType === 'hbfx') {
      this.uploadHbfxArchive()
    }
  }

  uploadHomebridgeArchive() {
    this.term.reset()
    this.clicked = true
    const formData: FormData = new FormData()
    formData.append('restoreArchive', this.selectedFile, this.selectedFile.name)
    this.$api.post('/backup/restore', formData).subscribe(
      () => {
        this.restoreStarted = true
        this.restoreInProgress = true
        setTimeout(() => {
          this.startRestore()
        }, 500)
        this.clicked = false
      },
      (err) => {
        this.$toastr.error(
          err?.error?.message || this.translate.instant('backup.message_restore_failed'),
          this.translate.instant('toast.title_error'),
        )
        this.clicked = false
      },
    )
  }

  async startRestore() {
    await this.io.request('do-restore').subscribe(
      () => {
        this.restoreInProgress = false
        this.$toastr.success(this.translate.instant('backup.message_backup_restored'), this.translate.instant('toast.title_success'))
        if (this.setupWizardRestore) {
          this.postBackupRestart()
        }
      },
      () => {
        this.restoreFailed = true
        this.$toastr.error(this.translate.instant('backup.message_restore_failed'), this.translate.instant('toast.title_error'))
      },
    )
  }

  uploadHbfxArchive() {
    this.term.reset()
    this.clicked = true
    const formData: FormData = new FormData()
    formData.append('restoreArchive', this.selectedFile, this.selectedFile.name)
    this.$api.post('/backup/restore/hbfx', formData, {
      reportProgress: true,
      observe: 'events',
    }).subscribe(
      (event) => {
        if (event.type === HttpEventType.UploadProgress) {
          this.uploadPercent = Math.round(100 * event.loaded / event.total)
        } else if (event instanceof HttpResponse) {
          this.restoreStarted = true
          this.restoreInProgress = true
          setTimeout(() => {
            this.startHbfxRestore()
          }, 500)
          this.clicked = false
        }
      },
      (err) => {
        this.$toastr.error(
          err?.error?.message || this.translate.instant('backup.message_restore_failed'),
          this.translate.instant('toast.title_error'),
        )
        this.clicked = false
      },
    )
  }

  async startHbfxRestore() {
    this.io.request('do-restore-hbfx').subscribe(
      () => {
        this.restoreInProgress = false
        this.$toastr.success(this.translate.instant('backup.message_backup_restored'), this.translate.instant('toast.title_success'))
      },
      () => {
        this.restoreFailed = true
        this.$toastr.error(this.translate.instant('backup.message_restore_failed'), this.translate.instant('toast.title_error'))
      },
    )
  }

  handleRestoreFileInput(files: FileList) {
    if (files.length) {
      this.selectedFile = files[0]
      if (this.selectedFile.name.endsWith('.hbfx')) {
        this.restoreArchiveType = 'hbfx'
      } else {
        this.restoreArchiveType = 'homebridge'
      }
    } else {
      delete this.selectedFile
    }
  }

  postBackupRestart() {
    this.$api.put('/backup/restart', {}).subscribe(
      () => {
        this.activeModal.close(true)
        this.$route.navigate(['/'])
      },
      () => {},
    )
  }

  ngOnDestroy() {
    this.io.end()
  }
}
