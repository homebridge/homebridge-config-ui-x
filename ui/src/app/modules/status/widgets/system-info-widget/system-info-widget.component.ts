import { NgClass, TitleCasePipe } from '@angular/common'
import { Component, DestroyRef, inject, Input, OnInit } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslatePipe } from '@ngx-translate/core'

import { IoNamespace, WsService } from '@/app/core/ws.service'
import { NodeJsInfo, ServerInfo, Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  templateUrl: './system-info-widget.component.html',
  styleUrls: ['./system-info-widget.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    TitleCasePipe,
    TranslatePipe,
  ],
})
export class SystemInfoWidgetComponent implements OnInit {
  private $destroyRef = inject(DestroyRef)
  private $ws = inject(WsService)
  private io: IoNamespace

  @Input() widget: Widget

  public serverInfo: ServerInfo = { network: {}, os: {}, time: {} } as ServerInfo
  public nodejsInfo: NodeJsInfo = {} as NodeJsInfo
  public arch64bitList = [
    'x64',
    'amd64',
    'arm64',
    'aarch64',
    'ppc64',
    'ppc64le',
    's390x',
    'riscv64',
    'loongarch64',
    'mips64el',
    'mips64',
    'sparc64',
  ]

  public ngOnInit() {
    this.io = this.$ws.getExistingNamespace('status')
    this.io.connected
      .pipe(takeUntilDestroyed(this.$destroyRef))
      .subscribe(async () => {
        this.getSystemInfo()
      })

    if (this.io.socket.connected) {
      this.getSystemInfo()
    }
  }

  private getSystemInfo() {
    this.io.request('get-homebridge-server-info')
      .pipe(takeUntilDestroyed(this.$destroyRef))
      .subscribe((data) => {
        this.serverInfo = data
      })

    this.io.request('nodejs-version-check')
      .pipe(takeUntilDestroyed(this.$destroyRef))
      .subscribe((data) => {
        this.nodejsInfo = data
      })
  }
}
