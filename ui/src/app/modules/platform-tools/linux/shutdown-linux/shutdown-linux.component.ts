import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'

@Component({
  selector: 'app-shutdown-linux',
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './shutdown-linux.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShutdownLinuxComponent implements OnInit {
  // Injected dependencies
  private $api = inject(ApiService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  // Signals
  public readonly error = signal<string | false>(false)

  public ngOnInit(): void {
    void this.$api.put('/platform-tools/linux/shutdown-host', {})
      .catch((error) => {
        console.error(error)
        this.error.set(this.$translate.instant('platform.linux.server_shutdown_error'))
        this.$toastr.error(this.$translate.instant('platform.linux.server_shutdown_error'), this.$translate.instant('toast.title_error'))
      })
  }
}
