import { ApiService } from '@/app/core/api.service'
import { Component, OnInit } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './shutdown-linux.component.html',
})
export class ShutdownLinuxComponent implements OnInit {
  error: any = false

  constructor(
    private $api: ApiService,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) {}

  ngOnInit() {
    this.$api.put('/platform-tools/linux/shutdown-host', {}).subscribe({
      error: (error) => {
        console.error(error)
        this.error = this.$translate.instant('platform.linux.server_restart_error')
        this.$toastr.error(this.$translate.instant('platform.linux.server_restart_error'), this.$translate.instant('toast.title_error'))
      },
    })
  }
}
