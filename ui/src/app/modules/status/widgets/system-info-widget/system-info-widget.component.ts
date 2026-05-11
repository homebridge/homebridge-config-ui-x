import { TitleCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslatePipe } from '@ngx-translate/core'

import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { NodeJsInfo, ServerInfo, Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  selector: 'app-system-info-widget',
  imports: [
    TitleCasePipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './system-info-widget.component.html',
  styleUrl: './system-info-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SystemInfoWidgetComponent implements OnInit {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)
  private $ws = inject(WsService)

  // Signals
  readonly widget = input.required<Widget>()
  public readonly serverInfo = signal<ServerInfo>({ network: {}, os: {}, time: {} } as ServerInfo)
  public readonly nodejsInfo = signal<NodeJsInfo>({} as NodeJsInfo)

  // Other properties
  private io!: IoNamespace
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

  public ngOnInit(): void {
    this.io = this.$ws.getExistingNamespace('status')

    this.io.connected!.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.getSystemInfo()
    })
  }

  private getSystemInfo(): void {
    this.io.request('get-homebridge-server-info').subscribe((data) => {
      this.serverInfo.set(data)
    })

    this.io.request('nodejs-version-check').subscribe((data) => {
      this.nodejsInfo.set(data)
    })
  }
}
