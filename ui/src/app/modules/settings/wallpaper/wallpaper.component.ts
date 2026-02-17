import { Component, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { SettingsService } from '@/app/core/ui/settings.service'
import { environment } from '@/environments/environment'

@Component({
  templateUrl: './wallpaper.component.html',
  styleUrl: './wallpaper.component.scss',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class WallpaperComponent implements OnInit {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  // Signals
  readonly wallpaperInput = viewChild<ElementRef>('wallpaperInput')
  public clicked = signal(false)
  public selectedFile = signal<File | null>(null)
  public wallpaperUrl = signal<string | null>(null)
  public originalWallpaperUrl = signal<string | null>(null)

  // Other properties
  public maxFileSizeText = globalThis.backup.maxBackupSizeText

  public ngOnInit(): void {
    if (this.$settings.env.customWallpaperHash) {
      this.wallpaperUrl.set(`${environment.api.base}/auth/wallpaper/${this.$settings.env.customWallpaperHash}`)
      this.originalWallpaperUrl.set(this.wallpaperUrl())
    }
  }

  public onFileChange(event: Event): void {
    const files = (event.target as HTMLInputElement).files
    if (files?.length) {
      this.selectedFile.set(files[0])
      const reader = new FileReader()
      reader.onload = (e: any) => {
        this.wallpaperUrl.set(e.target.result)
      }
      reader.readAsDataURL(this.selectedFile())
    } else {
      this.selectedFile.set(null)
      this.wallpaperUrl.set(this.originalWallpaperUrl())
    }
  }

  public async saveWallpaper(): Promise<void> {
    this.clicked.set(true)
    try {
      if (this.selectedFile()) {
        const formData: FormData = new FormData()
        formData.append('wallpaper', this.selectedFile(), this.selectedFile()?.name)
        await this.$api.post('/server/wallpaper', formData)
        this.$settings.setItem('wallpaper', `ui-wallpaper.${this.selectedFile()?.name.split('.').pop()}`)
        this.$activeModal.close()
        this.$toastr.success(this.$translate.instant('settings.display.wallpaper_success'), this.$translate.instant('toast.title_success'))
      } else {
        await this.$api.delete('/server/wallpaper')
        this.$activeModal.close()
      }
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.error?.message, this.$translate.instant('toast.title_error'))
      this.clicked.set(false)
    }
  }

  public clearWallpaper(): void {
    this.selectedFile.set(null)
    this.wallpaperUrl.set(this.wallpaperUrl() === this.originalWallpaperUrl()
      ? null
      : this.originalWallpaperUrl())
    const input = this.wallpaperInput()
    if (input) {
      input.nativeElement.value = ''
    }
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }
}
