import { ApiService } from '@/app/core/api.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { SettingsService } from '@/app/core/settings.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { environment } from '@/environments/environment'
import { Component, OnInit } from '@angular/core'
import { AbstractControl, FormControl, FormGroup, Validators } from '@angular/forms'
import { Title } from '@angular/platform-browser'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

@Component({
  templateUrl: './setup-wizard.component.html',
  styleUrls: ['./setup-wizard.component.scss'],
})
export class SetupWizardComponent implements OnInit {
  private io: IoNamespace

  public step: 'welcome' | 'create-account' | 'setup-complete' | 'restore-backup' | 'restoring' | 'restarting' | 'restore-complete' = 'welcome'
  public progress = 1
  public restoreInProgress = false
  public restoreStarted = false
  public restoreFailed = false
  public loading = false
  public selectedFile: File
  public restoreUploading = false
  public createUserForm = new FormGroup({
    username: new FormControl('', [Validators.required]),
    password: new FormControl('', [Validators.compose([Validators.required, Validators.minLength(4)])]),
    passwordConfirm: new FormControl('', [Validators.required]),
  }, this.matchPassword)

  constructor(
    private $api: ApiService,
    private $auth: AuthService,
    private $settings: SettingsService,
    private $title: Title,
    private $toastr: ToastrService,
    private $translate: TranslateService,
    private $ws: WsService,
  ) {}

  ngOnInit(): void {
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

  onClickGettingStarted() {
    this.step = 'create-account'
    this.progress = 50
  }

  onClickRestoreBackup() {
    this.step = 'restore-backup'
    this.progress = 20
  }

  onClickCancelRestore() {
    this.selectedFile = null
    this.step = 'welcome'
    this.progress = 1
  }

  async createFirstUser() {
    this.loading = true
    this.progress = 75

    const payload = this.createUserForm.getRawValue() as Record<string, string>
    payload.name = payload.username

    try {
      await firstValueFrom(this.$api.post('/setup-wizard/create-first-user', payload))
      this.$settings.env.setupWizardComplete = true
      this.progress = 100
      this.loading = false
      await this.$auth.login({
        username: payload.username,
        password: payload.password,
      })
      this.step = 'setup-complete'
    } catch (error) {
      this.loading = false
      this.progress = 50
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  handleRestoreFileInput(files: FileList) {
    if (files.length) {
      this.selectedFile = files[0]
      this.progress = 40
    } else {
      delete this.selectedFile
      this.progress = 20
    }
  }

  async onRestoreBackupClick() {
    this.restoreUploading = true
    this.step = 'restoring'
    this.progress = 60
    try {
      // get and set a temporary access token
      const authorization = await firstValueFrom(this.$api.get('/setup-wizard/get-setup-wizard-token'))
      window.localStorage.setItem(environment.jwt.tokenKey, authorization.access_token)
      this.$auth.token = authorization.access_token
      this.progress = 65

      // upload archive
      const formData: FormData = new FormData()
      formData.append('restoreArchive', this.selectedFile, this.selectedFile.name)
      await firstValueFrom(this.$api.post('/backup/restore', formData))
      this.progress = 70

      // start restore
      this.io = this.$ws.connectToNamespace('backup')
      const outputBox = document.getElementById('output')
      this.io.socket.on('stdout', (data) => {
        const lines = data.split('\n\r')
        lines.forEach((line: string) => {
          if (line) {
            const lineElement = document.createElement('div')
            const regex = /\x1B\[(\d{1,2}(;\d{1,2})?)?[mGK]/g // eslint-disable-line no-control-regex
            lineElement.innerHTML = line.replace(regex, '')
            if (line.includes('[0;31m')) {
              lineElement.classList.add('red-text')
            } else if (line.includes('[0;32m')) {
              lineElement.classList.add('green-text')
            } else if (line.includes('[0;33m')) {
              lineElement.classList.add('yellow-text')
            } else if (line.includes('[0;36m')) {
              lineElement.classList.add('cyan-text')
            }
            outputBox.appendChild(lineElement)
            outputBox.scrollTop = outputBox.scrollHeight
          }
        })
      })
      this.restoreStarted = true
      this.restoreInProgress = true
      this.progress = 75
      await firstValueFrom(this.io.request('do-restore'))
      this.progress = 80
      this.restoreInProgress = false
      await firstValueFrom(this.$api.put('/backup/restart', {}))
      this.step = 'restarting'
      this.progress = 85

      // remove tokens
      window.localStorage.removeItem(environment.jwt.tokenKey)
      this.$auth.token = null

      // wait at least 15 seconds
      await new Promise(resolve => setTimeout(resolve, 3000))
      this.progress = 88
      await new Promise(resolve => setTimeout(resolve, 3000))
      this.progress = 91
      await new Promise(resolve => setTimeout(resolve, 3000))
      this.progress = 94
      await new Promise(resolve => setTimeout(resolve, 3000))
      this.progress = 97
      await new Promise(resolve => setTimeout(resolve, 3000))
      this.progress = 99

      const checkHomebridgeInterval = setInterval(async () => {
        try {
          await firstValueFrom(this.$api.get('/auth/settings'))
          clearInterval(checkHomebridgeInterval)
          this.progress = 100
          this.restoreUploading = false
          this.step = 'restore-complete'
        } catch (error) {
          // not up yet
        }
      }, 1000)
    } catch (error) {
      console.error(error)
      this.restoreUploading = false
      this.restoreFailed = true
      this.progress = 20
      this.step = 'restore-backup'
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    } finally {
      if (this.io) {
        this.io.end()
      }
    }
  }
}
