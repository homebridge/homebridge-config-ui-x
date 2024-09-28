import { ApiService } from '@/app/core/api.service'
import { RestartChildBridgesComponent } from '@/app/core/components/restart-child-bridges/restart-child-bridges.component'
import { Component, OnDestroy, OnInit } from '@angular/core'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

@Component({
  templateUrl: './remove-bridge-accessories.component.html',
})
export class RemoveBridgeAccessoriesComponent implements OnInit, OnDestroy {
  public pairings: any[] = []
  public deleting: null | string = null
  public deleted: string[] = []

  constructor(
    public $activeModal: NgbActiveModal,
    private $api: ApiService,
    private $modal: NgbModal,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.loadPairings()
  }

  async loadPairings() {
    try {
      this.pairings = (await firstValueFrom(this.$api.get('/server/pairings')))
        .filter((pairing: any) => pairing._category === 'bridge' && !pairing._main)
        .sort((_a, b) => b._main ? 1 : -1)
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('settings.unpair_bridge.load_error'), this.$translate.instant('toast.title_error'))
      this.$activeModal.close()
    }
  }

  removeAccessories(id: string) {
    this.deleting = id

    this.$api.delete(`/server/pairings/${id}/accessories`).subscribe({
      next: async () => {
        await this.loadPairings()

        this.deleting = null
        this.deleted.push(id)

        this.$toastr.success('', this.$translate.instant('toast.title_success'))
      },
      error: (error) => {
        this.deleting = null
        console.error(error)
        this.$toastr.error(this.$translate.instant('settings.unpair_bridge.unpair_error'), this.$translate.instant('toast.title_error'))
      },
    })
  }

  ngOnDestroy() {
    if (this.deleted.length) {
      const ref = this.$modal.open(RestartChildBridgesComponent, {
        size: 'lg',
        backdrop: 'static',
      })

      ref.componentInstance.bridges = this.deleted.map((id) => {
        const { _username: username, displayName } = this.pairings.find(pairing => pairing._id === id)
        return { displayName, username }
      })
    }
  }
}
