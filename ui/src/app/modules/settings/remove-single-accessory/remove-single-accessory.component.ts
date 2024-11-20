import { ApiService } from '@/app/core/api.service'
import { NgClass } from '@angular/common'
import { Component, inject, OnInit } from '@angular/core'
import { NgbActiveModal, NgbAlert } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

@Component({
  templateUrl: './remove-single-accessory.component.html',
  imports: [
    NgbAlert,
    NgClass,
    TranslatePipe,
  ],
})
export class RemoveSingleAccessoryComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public cachedAccessories: any[] = []
  public deleting: null | string = null

  ngOnInit(): void {
    this.loadCachedAccessories()
  }

  async loadCachedAccessories() {
    try {
      this.cachedAccessories = await firstValueFrom(this.$api.get('/server/cached-accessories'))
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('reset.error_message'), this.$translate.instant('toast.title_error'))
      this.$activeModal.close()
    }
  }

  removeAccessory(item: any) {
    this.deleting = item.UUID

    this.$toastr.info(this.$translate.instant('reset.removing_cached_accessory_please_wait'))

    this.$api.delete(`/server/cached-accessories/${item.UUID}`, {
      params: {
        cacheFile: item.$cacheFile,
      },
    }).subscribe({
      next: async () => {
        await this.loadCachedAccessories()

        this.deleting = null

        if (!this.cachedAccessories.length) {
          this.$activeModal.close()
        }

        this.$toastr.success(this.$translate.instant('reset.cached_accessory_removed'), this.$translate.instant('toast.title_success'))
      },
      error: (error) => {
        this.deleting = null
        console.error(error)
        this.$toastr.error(this.$translate.instant('reset.delete_failed'), this.$translate.instant('toast.title_error'))
      },
    })
  }
}
