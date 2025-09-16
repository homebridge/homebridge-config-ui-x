import { Component, inject, OnInit } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal, NgbAlert } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'

@Component({
  templateUrl: './remove-all-accessories.component.html',
  standalone: true,
  imports: [
    NgbAlert,
    TranslatePipe,
  ],
})
export class RemoveAllAccessoriesComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $router = inject(Router)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public clicked: boolean = false
  public cachedAccessories: any[] = []

  public ngOnInit(): void {
    this.loadCachedAccessories()
  }

  public onResetCachedAccessoriesClick() {
    this.clicked = true
    return this.$api.put('/server/reset-cached-accessories', {}).subscribe({
      next: () => {
        this.$toastr.success(
          this.$translate.instant('reset.delete_success'),
          this.$translate.instant('toast.title_success'),
        )
        this.$activeModal.close()
        void this.$router.navigate(['/restart'], {
          queryParams: { restarting: true },
        })
      },
      error: (error) => {
        this.clicked = false
        console.error(error)
        this.$toastr.error(this.$translate.instant('reset.failed_to_reset'), this.$translate.instant('toast.title_error'))
      },
    })
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private async loadCachedAccessories() {
    try {
      this.cachedAccessories = await firstValueFrom(this.$api.get('/server/cached-accessories'))
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('reset.error_message'), this.$translate.instant('toast.title_error'))
      this.$activeModal.close()
    }
  }
}
