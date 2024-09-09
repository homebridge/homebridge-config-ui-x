import { ApiService } from '@/app/core/api.service'
import { Component, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './remove-all-accessories.component.html',
})
export class RemoveAllAccessoriesComponent implements OnInit {
  public clicked: boolean
  public cachedAccessories: any[]

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

  onResetCachedAccessoriesClick() {
    this.clicked = true
    return this.$api.put('/server/reset-cached-accessories', {}).subscribe(
      () => {
        this.toastr.success(
          this.translate.instant('reset.toast_clear_cached_accessories_success'),
          this.translate.instant('toast.title_success'),
        )
        this.activeModal.close()
      },
      () => {
        this.toastr.error(this.translate.instant('reset.toast_failed_to_reset'), this.translate.instant('toast.title_error'))
      },
    )
  }
}
