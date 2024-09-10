import { ApiService } from '@/app/core/api.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { SettingsService } from '@/app/core/settings.service'
import { RestoreComponent } from '@/app/modules/settings/restore/restore.component'
import { environment } from '@/environments/environment'
import { Component, OnDestroy, OnInit } from '@angular/core'
import { AbstractControl, FormControl, FormGroup, Validators } from '@angular/forms'
import { Title } from '@angular/platform-browser'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './setup-wizard.component.html',
  styleUrls: ['./setup-wizard.component.scss'],
})
export class SetupWizardComponent implements OnInit, OnDestroy {
  public previousTitle: string
  public step: 'welcome' | 'create-account' | 'setup-complete' | 'restore-backup' | 'restarting' = 'welcome'

  public createUserForm = new FormGroup({
    username: new FormControl('', [Validators.required]),
    password: new FormControl('', [Validators.compose([Validators.required, Validators.minLength(4)])]),
    passwordConfirm: new FormControl('', [Validators.required]),
  }, this.matchPassword)

  public loading = false

  public selectedFile: File
  public restoreUploading = false

  constructor(
    private $modal: NgbModal,
    private $translate: TranslateService,
    private $toastr: ToastrService,
    private $title: Title,
    private $api: ApiService,
    private $auth: AuthService,
    private $settings: SettingsService,
  ) {}

  ngOnInit(): void {
    this.previousTitle = this.$title.getTitle()
    this.$title.setTitle('Setup Homebridge')
  }

  matchPassword(AC: AbstractControl) {
    const password = AC.get('password').value
    const passwordConfirm = AC.get('passwordConfirm').value
    if (password !== passwordConfirm) {
      AC.get('passwordConfirm').setErrors({ matchPassword: true })
    } else {
      return null
    }
  }

  ngOnDestroy() {
    this.$title.setTitle(this.previousTitle)
  }

  onClickGettingStarted() {
    this.step = 'create-account'
  }

  onClickRestoreBackup() {
    this.step = 'restore-backup'
  }

  onClickCancelRestore() {
    this.selectedFile = null
    this.step = 'welcome'
  }

  createFirstUser() {
    this.loading = true

    const payload = this.createUserForm.getRawValue() as Record<string, string>
    payload.name = payload.username

    this.$api.post('/setup-wizard/create-first-user', payload).subscribe(
      async () => {
        this.$settings.env.setupWizardComplete = true
        await this.$auth.login({
          username: payload.username,
          password: payload.password,
        })
        this.step = 'setup-complete'
      },
      (err) => {
        this.loading = false
        this.$toastr.error(
          err.error.message || this.$translate.instant('users.toast_failed_to_add_user'),
          this.$translate.instant('toast.title_error'),
        )
      },
    )
  }

  handleRestoreFileInput(files: FileList) {
    if (files.length) {
      this.selectedFile = files[0]
    } else {
      delete this.selectedFile
    }
  }

  onRestoreBackupClick() {
    this.restoreUploading = true
    this.uploadHomebridgeArchive()
  }

  async uploadHomebridgeArchive() {
    try {
      // get and set a temporary access token
      const authorization = await this.$api.get('/setup-wizard/get-setup-wizard-token').toPromise()
      window.localStorage.setItem(environment.jwt.tokenKey, authorization.access_token)
      this.$auth.token = authorization.access_token

      // upload archive
      const formData: FormData = new FormData()
      formData.append('restoreArchive', this.selectedFile, this.selectedFile.name)
      await this.$api.post('/backup/restore', formData).toPromise()

      // open restore modal
      this.openRestoreModal()
      this.restoreUploading = false
    } catch (err) {
      this.restoreUploading = false
      this.$toastr.error(
        err.error.message || this.$translate.instant('users.toast_failed_to_add_user'),
        this.$translate.instant('toast.title_error'),
      )
    }
  }

  openRestoreModal() {
    const ref = this.$modal.open(RestoreComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.setupWizardRestore = true

    ref.result.then((success) => {
      if (success === true) {
        this.waitForHomebridgeToRestart()
      }
    })
  }

  async waitForHomebridgeToRestart() {
    this.step = 'restarting'

    // remove tokens
    window.localStorage.removeItem(environment.jwt.tokenKey)
    this.$auth.token = null

    // wait at least 15 seconds
    await new Promise(resolve => setTimeout(resolve, 15000))

    const checkHomebridgeInterval = setInterval(async () => {
      try {
        await this.$api.get('/auth/settings').toPromise()
        clearInterval(checkHomebridgeInterval)
        location.reload()
      } catch (e) {
        // not up yet
      }
    }, 1000)
  }
}
