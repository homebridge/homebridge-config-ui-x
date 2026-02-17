import type { SslKeyCertResponse, SslPfxResponse } from '@/app/modules/settings/settings.interfaces'

import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ssl-settings-modal.component.html',
  standalone: true,
  imports: [TranslatePipe, ReactiveFormsModule],
})
export class SslSettingsModalComponent implements OnInit {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)
  private $api = inject(ApiService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  public $activeModal = inject(NgbActiveModal)

  // View children
  readonly keyInput = viewChild<ElementRef<HTMLInputElement>>('keyInput')
  readonly certInput = viewChild<ElementRef<HTMLInputElement>>('certInput')
  readonly pfxInput = viewChild<ElementRef<HTMLInputElement>>('pfxInput')

  // Signals
  public readonly selectedMode = signal<'off' | 'selfsigned' | 'keycert' | 'pfx'>('off')
  public readonly isSaving = signal(false)
  public readonly isUnchanged = signal(true)

  // Form controls
  public sslModeControl = new FormControl<'off' | 'selfsigned' | 'keycert' | 'pfx'>('off', { nonNullable: true })
  public hostnamesControl = new FormControl<string>('', { nonNullable: true })
  public keyPathControl = new FormControl<string>('', { nonNullable: true })
  public certPathControl = new FormControl<string>('', { nonNullable: true })
  public pfxPathControl = new FormControl<string>('', { nonNullable: true })
  public passphraseControl = new FormControl<string>('', { nonNullable: true })

  // Computed validation
  public readonly isFormInvalid = computed(() => {
    const mode = this.selectedMode()

    switch (mode) {
      case 'selfsigned': {
        // Hostnames field must not be empty
        const hostnames = this.hostnamesControl.value.trim()
        return !hostnames
      }
      case 'keycert': {
        // Both key and cert paths must be present
        const keyPath = this.keyPathControl.value
        const certPath = this.certPathControl.value
        return !keyPath || !certPath
      }
      case 'pfx': {
        // PFX path must be present
        const pfxPath = this.pfxPathControl.value
        return !pfxPath
      }
      case 'off':
      default:
        return false
    }
  })

  // Store original configuration for change detection
  private originalConfig: {
    mode: 'off' | 'selfsigned' | 'keycert' | 'pfx'
    hostnames: string
    keyPath: string
    certPath: string
    pfxPath: string
    passphrase: string
  } = {
    mode: 'off',
    hostnames: '',
    keyPath: '',
    certPath: '',
    pfxPath: '',
    passphrase: '',
  }

  public ngOnInit(): void {
    // Initialize form controls with current values
    this.keyPathControl.patchValue(this.$settings.env.ssl?.key || '', { emitEvent: false })
    this.certPathControl.patchValue(this.$settings.env.ssl?.cert || '', { emitEvent: false })
    this.pfxPathControl.patchValue(this.$settings.env.ssl?.pfx || '', { emitEvent: false })
    this.passphraseControl.patchValue(this.$settings.env.ssl?.passphrase || '', { emitEvent: false })
    this.hostnamesControl.patchValue('localhost, 127.0.0.1', { emitEvent: false })

    // Determine current SSL mode
    const currentMode = this.keyPathControl.value || this.certPathControl.value
      ? 'keycert'
      : (this.pfxPathControl.value || this.passphraseControl.value) ? 'pfx' : 'off'

    this.selectedMode.set(currentMode)
    this.sslModeControl.patchValue(currentMode, { emitEvent: false })

    // Store original configuration for change detection
    this.originalConfig = {
      mode: currentMode,
      hostnames: this.hostnamesControl.value,
      keyPath: this.keyPathControl.value,
      certPath: this.certPathControl.value,
      pfxPath: this.pfxPathControl.value,
      passphrase: this.passphraseControl.value,
    }

    // Subscribe to SSL mode control changes
    this.sslModeControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((mode) => {
      this.selectMode(mode)
    })

    // Subscribe to form control changes for change detection
    this.hostnamesControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.detectChanges())
    this.keyPathControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.detectChanges())
    this.certPathControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.detectChanges())
    this.pfxPathControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.detectChanges())
    this.passphraseControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.detectChanges())
  }

  public selectMode(mode: 'off' | 'selfsigned' | 'keycert' | 'pfx'): void {
    this.selectedMode.set(mode)
    // Initialize default hostnames for self-signed mode if empty
    if (mode === 'selfsigned' && !this.hostnamesControl.value) {
      this.hostnamesControl.patchValue('localhost, 127.0.0.1', { emitEvent: false })
    }
    this.detectChanges()
  }

  private detectChanges(): void {
    const currentConfig = {
      mode: this.selectedMode(),
      hostnames: this.hostnamesControl.value,
      keyPath: this.keyPathControl.value,
      certPath: this.certPathControl.value,
      pfxPath: this.pfxPathControl.value,
      passphrase: this.passphraseControl.value,
    }

    // Compare current config with original config
    const hasChanges
      = currentConfig.mode !== this.originalConfig.mode
        || currentConfig.hostnames !== this.originalConfig.hostnames
        || currentConfig.keyPath !== this.originalConfig.keyPath
        || currentConfig.certPath !== this.originalConfig.certPath
        || currentConfig.pfxPath !== this.originalConfig.pfxPath
        || currentConfig.passphrase !== this.originalConfig.passphrase

    this.isUnchanged.set(!hasChanges)
  }

  public async onKeyChange(event: Event): Promise<void> {
    const files = (event.target as HTMLInputElement).files
    if (!files || files.length === 0) {
      return
    }

    this.isSaving.set(true)
    try {
      const formData: FormData = new FormData()
      formData.append('uploads', files[0], files[0].name)

      const res = await this.$api.post<SslKeyCertResponse>('/server/ssl/keycert', formData)
      if (res?.keyPath) {
        this.keyPathControl.patchValue(res.keyPath)
        this.detectChanges()
      }
    } catch (err: any) {
      console.error(err)
      const errorMessage = err?.error?.message || err?.message || 'Unknown error'
      this.$toastr.error(errorMessage, this.$translate.instant('toast.title_error'))
    } finally {
      this.isSaving.set(false)
      const input = this.keyInput()
      if (input) {
        input.nativeElement.value = ''
      }
    }
  }

  public async onCertChange(event: Event): Promise<void> {
    const files = (event.target as HTMLInputElement).files
    if (!files || files.length === 0) {
      return
    }

    this.isSaving.set(true)
    try {
      const formData: FormData = new FormData()
      formData.append('uploads', files[0], files[0].name)

      const res = await this.$api.post<SslKeyCertResponse>('/server/ssl/keycert', formData)
      if (res?.certPath) {
        this.certPathControl.patchValue(res.certPath)
        this.detectChanges()
      }
    } catch (err: any) {
      console.error(err)
      const errorMessage = err?.error?.message || err?.message || 'Unknown error'
      this.$toastr.error(errorMessage, this.$translate.instant('toast.title_error'))
    } finally {
      this.isSaving.set(false)
      const input = this.certInput()
      if (input) {
        input.nativeElement.value = ''
      }
    }
  }

  public async onPfxChange(event: Event): Promise<void> {
    const files = (event.target as HTMLInputElement).files
    if (!files || files.length === 0) {
      return
    }

    this.isSaving.set(true)
    try {
      const formData: FormData = new FormData()
      formData.append('upload', files[0], files[0].name)

      const res = await this.$api.post<SslPfxResponse>('/server/ssl/pfx', formData)
      if (res?.pfxPath) {
        this.pfxPathControl.patchValue(res.pfxPath)
      }
      this.selectedMode.set('pfx')
      this.detectChanges()
    } catch (err: any) {
      console.error(err)
      const errorMessage = err?.error?.message || err?.message || 'Unknown error'
      this.$toastr.error(errorMessage, this.$translate.instant('toast.title_error'))
    } finally {
      this.isSaving.set(false)
      const input = this.pfxInput()
      if (input) {
        input.nativeElement.value = ''
      }
    }
  }

  public async saveConfiguration(): Promise<void> {
    this.isSaving.set(true)
    try {
      const changes: Record<string, unknown> = {}

      switch (this.selectedMode()) {
        case 'off':
          // Clear all SSL settings
          changes['ssl.key'] = ''
          changes['ssl.cert'] = ''
          changes['ssl.pfx'] = ''
          changes['ssl.passphrase'] = ''
          break

        case 'selfsigned': {
          // Generate the self-signed certificate first
          const hostnames = this.hostnamesControl.value
            .split(',')
            .map(s => s.trim())
            .filter(s => !!s)

          const res = await this.$api.post<SslKeyCertResponse>('/server/ssl/selfsigned/generate', { hostnames, mode: 'keycert' })

          // Update local settings with the generated certificate paths
          if (res?.keyPath) {
            this.$settings.setEnvItem('ssl.key', res.keyPath)
          }
          if (res?.certPath) {
            this.$settings.setEnvItem('ssl.cert', res.certPath)
          }
          // Clear other SSL settings
          this.$settings.setEnvItem('ssl.pfx', '')
          this.$settings.setEnvItem('ssl.passphrase', '')

          // Return 'keycert' mode since that's how it's saved in the config
          // This ensures the toggle shows enabled and reopening the modal shows the correct state
          this.$activeModal.close('keycert')
          return
        }
        case 'keycert':
          // Clear pfx settings
          changes['ssl.pfx'] = ''
          changes['ssl.passphrase'] = ''
          // Set keycert settings
          changes['ssl.key'] = this.keyPathControl.value
          changes['ssl.cert'] = this.certPathControl.value
          break

        case 'pfx':
          // Clear keycert settings
          changes['ssl.key'] = ''
          changes['ssl.cert'] = ''
          // Set pfx settings
          changes['ssl.pfx'] = this.pfxPathControl.value
          changes['ssl.passphrase'] = this.passphraseControl.value
          break
      }

      // Save each setting individually using the same pattern as settings.component
      for (const [key, value] of Object.entries(changes)) {
        await this.$api.put('/config-editor/ui', { key, value })
        this.$settings.setEnvItem(key, value)
      }

      // Return the selected mode so the parent can update the toggle and show restart notification
      this.$activeModal.close(this.selectedMode())
    } catch (error: any) {
      console.error(error)
      const errorMessage = error?.error?.message || error?.message || 'Unknown error'
      this.$toastr.error(errorMessage, this.$translate.instant('toast.title_error'))
    } finally {
      this.isSaving.set(false)
    }
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }
}
