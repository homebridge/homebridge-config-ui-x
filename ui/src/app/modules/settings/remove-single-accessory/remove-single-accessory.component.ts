import { ApiService } from '@/app/core/api.service'
import { Component, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './remove-single-accessory.component.html',
})
export class RemoveSingleAccessoryComponent implements OnInit {
  public cachedAccessories: any[]
  public deleting: null | string = null

  constructor(
    public activeModal: NgbActiveModal,
    public toastr: ToastrService,
    private translate: TranslateService,
    private $api: ApiService,
  ) {}

  ngOnInit(): void {
    this.loadCachedAccessories()
  }

  async loadCachedAccessories() {
    try {
      this.cachedAccessories = await this.$api.get('/server/cached-accessories').toPromise()
    } catch (e) {
      this.toastr.error(
        this.translate.instant('reset.toast_error_message'),
        this.translate.instant('toast.title_error'),
      )
      this.activeModal.close()
    }
  }

  removeAccessory(item) {
    this.deleting = item.UUID

    this.toastr.info(this.translate.instant('reset.toast_removing_cached_accessory_please_wait'))

    this.$api.delete(`/server/cached-accessories/${item.UUID}`, {
      params: {
        cacheFile: item.$cacheFile,
      },
    }).subscribe(
      async () => {
        await this.loadCachedAccessories()

        this.deleting = null

        if (!this.cachedAccessories.length) {
          this.activeModal.close()
        }

        this.toastr.success(this.translate.instant('reset.toast_cached_accessory_removed'), this.translate.instant('toast.title_success'))
      },
      () => {
        this.deleting = null
        this.toastr.error(this.translate.instant(
          'reset.toast_failed_to_delete_cached_accessory',
        ), this.translate.instant('toast.title_error'))
      },
    )
  }
}
