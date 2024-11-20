import { ApiService } from '@/app/core/api.service'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { NgClass, TitleCasePipe } from '@angular/common'
import { Component, inject, OnDestroy, OnInit } from '@angular/core'
import { NgbActiveModal, NgbAlert, NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

@Component({
  templateUrl: './unpair-single-bridge.component.html',
  imports: [
    NgbAlert,
    NgClass,
    TitleCasePipe,
    TranslatePipe,
  ],
})
export class UnpairSingleBridgeComponent implements OnInit, OnDestroy {
  $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $modal = inject(NgbModal)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public pairings: any[] = []
  public deleting: null | string = null
  private unpaired = false

  ngOnInit(): void {
    this.loadPairings()
  }

  async loadPairings() {
    try {
      this.pairings = (await firstValueFrom(this.$api.get('/server/pairings')))
        .sort((_a, b) => b._main ? 1 : -1)
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('settings.unpair_bridge.load_error'), this.$translate.instant('toast.title_error'))
      this.$activeModal.close()
    }
  }

  removeAccessory(id: string) {
    this.deleting = id

    this.$api.delete(`/server/pairings/${id}`).subscribe({
      next: async () => {
        await this.loadPairings()

        if (!this.pairings.length) {
          this.$activeModal.close()
        }

        this.deleting = null
        this.unpaired = true

        this.$toastr.success(
          this.$translate.instant('plugins.settings.restart_required'),
          this.$translate.instant('toast.title_success'),
        )
      },
      error: (error) => {
        this.deleting = null
        console.error(error)
        this.$toastr.error(this.$translate.instant('settings.unpair_bridge.unpair_error'), this.$translate.instant('toast.title_error'))
      },
    })
  }

  ngOnDestroy() {
    if (this.unpaired) {
      this.$modal.open(RestartHomebridgeComponent, {
        size: 'lg',
        backdrop: 'static',
      })
    }
  }
}
