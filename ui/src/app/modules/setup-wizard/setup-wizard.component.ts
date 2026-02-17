import { NgOptimizedImage } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core'
import { AbstractControl, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { Title } from '@angular/platform-browser'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { AuthService } from '@/app/core/auth/auth.service'
import { ApiService } from '@/app/core/communication/api.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { SettingsService } from '@/app/core/ui/settings.service'
import { environment } from '@/environments/environment'

@Component({
  imports: [
    TranslatePipe,
    NgOptimizedImage,
    FormsModule,
    ReactiveFormsModule,
  ],
  templateUrl: './setup-wizard.component.html',
  styleUrl: './setup-wizard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetupWizardComponent implements OnInit {
  // Injected dependencies
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $settings = inject(SettingsService)
  private $title = inject(Title)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)

  // Signals
  public readonly step = signal<'welcome' | 'create-account' | 'setup-complete' | 'restore-backup' | 'restoring' | 'restarting' | 'restore-complete'>('welcome')
  public readonly backgroundStyle = signal<string | undefined>(undefined)
  public readonly progress = signal(1)
  public readonly restoreInProgress = signal(false)
  public readonly restoreStarted = signal(false)
  public readonly restoreFailed = signal(false)
  public readonly loading = signal(false)
  public readonly selectedFile = signal<File | undefined>(undefined)
  public readonly restoreUploading = signal(false)

  // Other properties
  private io: IoNamespace
  public createUserForm = new FormGroup({
    username: new FormControl('', [Validators.required]),
    password: new FormControl('', [Validators.compose([Validators.required, Validators.minLength(4)])]),
    passwordConfirm: new FormControl('', [Validators.required]),
  }, this.matchPassword)

  public ngOnInit(): void {
    this.$title.setTitle(this.$translate.instant('setup_wizard_page_title'))
    void this.setBackground()
  }

  public onClickGettingStarted(): void {
    this.step.set('create-account')
    this.progress.set(50)
  }

  public onClickRestoreBackup(): void {
    this.step.set('restore-backup')
    this.progress.set(20)
  }

  public onClickCancelRestore(): void {
    this.selectedFile.set(undefined)
    this.step.set('welcome')
    this.progress.set(1)
  }

  public async createFirstUser(): Promise<void> {
    this.loading.set(true)
    this.progress.set(75)

    const payload = this.createUserForm.getRawValue() as Record<string, string>
    payload.name = payload.username

    try {
      await this.$api.post('/setup-wizard/create-first-user', payload)
      this.$settings.env.setupWizardComplete = true
      this.progress.set(100)
      this.loading.set(false)
      await this.$auth.login({
        username: payload.username,
        password: payload.password,
      })
      this.step.set('setup-complete')
    } catch (error) {
      this.loading.set(false)
      this.progress.set(50)
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  public handleRestoreFileInput(event: Event): void {
    const files = (event.target as HTMLInputElement).files
    if (files?.length) {
      this.selectedFile.set(files[0])
      this.progress.set(40)
    } else {
      this.selectedFile.set(undefined)
      this.progress.set(20)
    }
  }

  public async onRestoreBackupClick(): Promise<void> {
    this.restoreUploading.set(true)
    this.step.set('restoring')
    this.progress.set(60)
    try {
      // get and set a temporary access token
      const authorization = await this.$api.get('/setup-wizard/get-setup-wizard-token')
      window.localStorage.setItem(environment.jwt.tokenKey, authorization.access_token)
      this.$auth.token = authorization.access_token
      this.progress.set(65)

      // upload archive
      const formData: FormData = new FormData()
      const selectedFile = this.selectedFile()
      formData.append('restoreArchive', selectedFile, selectedFile.name)
      await this.$api.post('/backup/restore', formData)
      this.progress.set(70)

      // start restore
      this.io = this.$ws.connectToNamespace('backup')
      const outputBox = document.getElementById('output')
      let spinnerElement: HTMLDivElement | null = null
      const ansiRegex = /\x1B\[[\d;]*[a-z]/gi // eslint-disable-line no-control-regex
      this.io.socket.on('stdout', (data) => {
        const lines = data.split(/[\r\n]+/)
        lines.forEach((line: string) => {
          if (!line) {
            return
          }
          const cleanLine = line.replace(ansiRegex, '').trim()
          if (!cleanLine) {
            return
          }
          const isSpinner = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(cleanLine)
          if (isSpinner) {
            if (!spinnerElement) {
              spinnerElement = document.createElement('div')
              outputBox.appendChild(spinnerElement)
            }
            spinnerElement.textContent = cleanLine
          } else {
            if (spinnerElement) {
              spinnerElement.remove()
              spinnerElement = null
            }
            const lineElement = document.createElement('div')
            lineElement.innerHTML = cleanLine
            if (line.includes('[0;31m')) {
              lineElement.classList.add('red-text')
            } else if (line.includes('[0;32m')) {
              lineElement.classList.add('green-text')
            } else if (line.includes('[0;33m')) {
              lineElement.classList.add('orange-text')
            } else if (line.includes('[0;36m')) {
              lineElement.classList.add('cyan-text')
            }
            outputBox.appendChild(lineElement)
          }
          outputBox.scrollTop = outputBox.scrollHeight
        })
      })
      this.restoreStarted.set(true)
      this.restoreInProgress.set(true)
      this.progress.set(75)
      await firstValueFrom(this.io.request('do-restore'))
      this.progress.set(80)
      this.restoreInProgress.set(false)
      await this.$api.put('/backup/restart', {})
      this.step.set('restarting')
      this.progress.set(85)

      // remove tokens
      window.localStorage.removeItem(environment.jwt.tokenKey)
      this.$auth.token = null

      // show final message in the terminal box
      const restoreMessage = document.createElement('div')
      restoreMessage.classList.add('orange-text')
      restoreMessage.innerHTML = 'Starting Homebridge, please wait...'
      outputBox.appendChild(restoreMessage)
      outputBox.scrollTop = outputBox.scrollHeight

      // wait at least 15 seconds
      await new Promise(resolve => setTimeout(resolve, 3000))
      this.progress.set(88)
      await new Promise(resolve => setTimeout(resolve, 3000))
      this.progress.set(91)
      await new Promise(resolve => setTimeout(resolve, 3000))
      this.progress.set(94)
      await new Promise(resolve => setTimeout(resolve, 3000))
      this.progress.set(97)
      await new Promise(resolve => setTimeout(resolve, 3000))
      this.progress.set(99)

      const checkHomebridgeInterval = setInterval(async () => {
        try {
          await this.$api.get('/auth/settings')
          clearInterval(checkHomebridgeInterval)
          this.progress.set(100)
          this.restoreUploading.set(false)
          this.step.set('restore-complete')
        } catch (error) {
          // not up yet
        }
      }, 1000)
    } catch (error) {
      console.error(error)
      this.restoreUploading.set(false)
      this.restoreFailed.set(true)
      this.progress.set(20)
      this.step.set('restore-backup')
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    } finally {
      if (this.io) {
        this.io.end()
      }
    }
  }

  private async setBackground(): Promise<void> {
    if (!this.$settings.settingsLoaded) {
      await firstValueFrom(this.$settings.onSettingsLoaded)
    }

    if (this.$settings.env.customWallpaperHash) {
      const backgroundImageUrl = `${environment.api.base}/auth/wallpaper/${this.$settings.env.customWallpaperHash}`
      this.backgroundStyle.set(`url('${backgroundImageUrl}') center/cover`)
    }
  }

  private matchPassword(AC: AbstractControl) {
    const password = AC.get('password').value
    const passwordConfirm = AC.get('passwordConfirm').value
    if (password !== passwordConfirm) {
      AC.get('passwordConfirm').setErrors({ matchPassword: true })
    } else {
      return null
    }
  }
}
