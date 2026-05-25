import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { HttpErrorService } from '@/app/core/utilities/http-error.service'

interface NetworkOverviewEntry {
  service: string
  port: number
  protocol: string
  bridge: string
  status: string
  matterPort?: number
  commissioned?: boolean
  deviceCount?: number
}

@Component({
  selector: 'app-port-overview-modal',
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './port-overview-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortOverviewModalComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $errors = inject(HttpErrorService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public readonly loading = signal(true)
  public readonly entries = signal<NetworkOverviewEntry[]>([])
  public readonly conflicts = signal<string[]>([])

  public ngOnInit(): void {
    void this.loadData()
  }

  private async loadData(): Promise<void> {
    try {
      const data = await this.$api.get('/server/network/overview')
      this.entries.set(this.sortEntries(data.entries))
      this.conflicts.set(data.conflicts)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
    } finally {
      this.loading.set(false)
    }
  }

  public displayName(entry: NetworkOverviewEntry): string {
    if (entry.service === 'Config UI') {
      return 'Homebridge UI'
    }
    return entry.bridge
  }

  private sortEntries(entries: NetworkOverviewEntry[]): NetworkOverviewEntry[] {
    return entries.sort((a, b) => {
      if (a.service === 'Homebridge') {
        return -1
      }
      if (b.service === 'Homebridge') {
        return 1
      }
      if (a.service === 'Config UI') {
        return -1
      }
      if (b.service === 'Config UI') {
        return 1
      }
      return a.bridge.localeCompare(b.bridge)
    })
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }
}
