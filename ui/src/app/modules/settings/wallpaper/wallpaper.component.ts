import { Component, ElementRef, inject, ViewChild } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/api.service'
import { SettingsService } from '@/app/core/settings.service'
import { environment } from '@/environments/environment'

@Component({
  templateUrl: './wallpaper.component.html',
  styleUrls: ['./wallpaper.component.scss'],
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class WallpaperComponent {
  $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $modal = inject(NgbModal)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public clicked = false
  public maxFileSizeText = globalThis.backup.maxBackupSizeText
  public selectedFile: File
  public wallpaperUrl: string = null
  public originalWallpaperUrl: string = null

  @ViewChild('wallpaperInput') wallpaperInput!: ElementRef

  constructor() {}

  ngOnInit() {
    if (this.$settings.env.customWallpaperHash) {
      this.wallpaperUrl = `${environment.api.base}/auth/wallpaper/${this.$settings.env.customWallpaperHash}`
      this.originalWallpaperUrl = this.wallpaperUrl
    }
  }

  onFileChange(files: FileList) {
    if (files.length) {
      this.selectedFile = files[0]
      const reader = new FileReader()
      reader.onload = (e: any) => {
        this.wallpaperUrl = e.target.result
      }
      reader.readAsDataURL(this.selectedFile)
    } else {
      delete this.selectedFile
      this.wallpaperUrl = this.originalWallpaperUrl
    }
  }

  saveWallpaper() {
    this.clicked = true
    if (this.selectedFile) {
      const formData: FormData = new FormData()
      formData.append('wallpaper', this.selectedFile, this.selectedFile.name)
      this.$api.post('/server/wallpaper', formData).subscribe({
        next: () => {
          this.$settings.setItem('wallpaper', `ui-wallpaper.${this.selectedFile.name.split('.').pop()}`)
          this.$activeModal.close()
          this.$toastr.success(this.$translate.instant('settings.display.wallpaper_success'), this.$translate.instant('toast.title_success'))
        },
        error: (error) => {
          console.error(error)
          this.$toastr.error(error.error?.message, this.$translate.instant('toast.title_error'))
          this.clicked = false
        },
      })
    } else {
      this.$api.delete('/server/wallpaper').subscribe({
        next: () => {
          this.$activeModal.close()
        },
        error: (error) => {
          console.error(error)
          this.$toastr.error(error.error?.message, this.$translate.instant('toast.title_error'))
          this.clicked = false
        },
      })
    }
  }

  clearWallpaper() {
    this.selectedFile = null
    this.wallpaperUrl = this.wallpaperUrl === this.originalWallpaperUrl
      ? null
      : this.originalWallpaperUrl
    this.wallpaperInput.nativeElement.value = ''
  }

  cancel() {
    this.$activeModal.dismiss()
  }
}
