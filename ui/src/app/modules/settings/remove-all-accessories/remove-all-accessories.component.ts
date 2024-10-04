import { ApiService } from '@/app/core/api.service'
import { Component, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

@Component({
  templateUrl: './remove-all-accessories.component.html',
})
export class RemoveAllAccessoriesComponent implements OnInit {
  public clicked: boolean
  public cachedAccessories: any[] = []

  constructor(
    public $activeModal: NgbActiveModal,
    private $api: ApiService,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) {}

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

  onResetCachedAccessoriesClick() {
    this.clicked = true
    return this.$api.put('/server/reset-cached-accessories', {}).subscribe({
      next: () => {
        this.$toastr.success(
          this.$translate.instant('reset.delete_success'),
          this.$translate.instant('toast.title_success'),
        )
        this.$activeModal.close()
      },
      error: (error) => {
        this.clicked = false
        console.error(error)
        this.$toastr.error(this.$translate.instant('reset.failed_to_reset'), this.$translate.instant('toast.title_error'))
      },
    })
  }
}
