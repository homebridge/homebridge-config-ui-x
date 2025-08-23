import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { ChildBridge } from '@/app/core/manage-plugins/manage-plugins.interfaces'

@Component({
  templateUrl: './reset-accessories.component.html',
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class ResetAccessoriesComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $router = inject(Router)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  @Input() childBridges: ChildBridge[] = []

  public clicked: boolean = false
  public pairings: any[] = []
  public toDelete: string[] = []

  public ngOnInit(): void {
    this.loadPairings()
  }

  public toggleList(id: string) {
    if (this.toDelete.includes(id)) {
      this.toDelete = this.toDelete.filter((item: string) => item !== id)
    } else {
      this.toDelete.push(id)
    }
  }

  public cleanBridges() {
    this.clicked = true
    return this.$api.delete('/server/pairings/accessories', {
      body: this.toDelete.map((id: string) => ({
        id,
      })),
    }).subscribe({
      next: () => {
        this.$toastr.success(this.$translate.instant('reset.accessory_ind.done'), this.$translate.instant('toast.title_success'))
        this.$activeModal.close()
        void this.$router.navigate(['/restart'], {
          queryParams: { restarting: true },
        })
      },
      error: (error) => {
        this.clicked = false
        console.error(error)
        this.$toastr.error(this.$translate.instant('reset.accessory_ind.fail'), this.$translate.instant('toast.title_error'))
      },
    })
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private async loadPairings() {
    try {
      this.pairings = (await firstValueFrom(this.$api.get('/server/pairings')))
        .filter((pairing: any) => {
          return pairing._category === 'bridge' && !pairing._main && this.childBridges.find(childBridge => childBridge.username === pairing._username)
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('settings.unpair_bridge.load_error'), this.$translate.instant('toast.title_error'))
      this.$activeModal.close()
    }
  }
}
