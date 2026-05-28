import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input, OnDestroy, OnInit, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslatePipe } from '@ngx-translate/core'
import { Subject } from 'rxjs'

import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { QrcodeComponent } from '@/app/core/components/qrcode/qrcode.component'
import { HomebridgeStatusResponse } from '@/app/core/server.interfaces'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  selector: 'app-hap-qrcode-widget',
  imports: [
    QrcodeComponent,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './hap-qrcode-widget.component.html',
  styleUrl: './hap-qrcode-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HapQrcodeWidgetComponent implements OnInit, OnDestroy {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)
  private $ws = inject(WsService)

  // Inputs (set by the dashboard's dynamic widget loader via setInput)
  public readonly widget = input.required<Widget>()

  // Signals
  readonly pincodeElement = viewChild<ElementRef>('pincode')
  readonly qrcodeContainerElement = viewChild<ElementRef>('qrcodecontainer')
  public readonly enabled = signal<boolean>(true)
  /**
   * True when the main bridge is in HAP externalsOnly mode — the bridge
   * accessory itself isn't published, but plugins may still publish external
   * HAP accessories. The widget hides the QR/PIN and shows an externalsOnly
   * notice instead, since there's no main bridge to pair.
   */
  public readonly externalsOnly = signal<boolean>(false)
  public readonly loading = signal<boolean>(true)
  public readonly paired = signal<boolean>(false)
  public readonly pin = signal<string>('')
  public readonly setupUri = signal<string | null>(null)
  public readonly qrCodeHeight = signal<number>(0)
  public readonly qrCodeWidth = signal<number>(0)

  // Other properties
  private io!: IoNamespace
  private statusHandler!: (data: HomebridgeStatusResponse) => void
  resizeEvent!: Subject<void> // Set directly by ComponentFactoryResolver

  public ngOnInit(): void {
    this.io = this.$ws.getExistingNamespace('status')

    this.statusHandler = (data: HomebridgeStatusResponse) => {
      this.applyHapStatus(data)
      requestAnimationFrame(() => this.resizeQrCode())
    }

    this.io.socket.on('homebridge-status', this.statusHandler)

    // Subscribe to grid resize events
    this.resizeEvent.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.resizeQrCode()
    })

    // Fetch initial data if already connected - defer to avoid NG0100
    if (this.io.socket.connected) {
      queueMicrotask(() => this.getPairingPin())
    }
  }

  private applyHapStatus(data: HomebridgeStatusResponse): void {
    // HAP defaults to enabled when the status payload doesn't carry the flag.
    // externalsOnly is only meaningful when the bridge accessory is not being
    // published — in that mode we hide the QR/PIN since there's nothing to pair.
    const hapEnabled = data.hap ? data.hap.enabled : true
    const externalsOnly = data.hap?.externalsOnly === true
    this.enabled.set(hapEnabled)
    this.externalsOnly.set(externalsOnly)
    if (hapEnabled && !externalsOnly) {
      this.pin.set(data.pin)
      this.paired.set(data.paired)
      if (data.setupUri) {
        this.setupUri.set(data.setupUri)
      }
    } else {
      this.pin.set('')
      this.paired.set(false)
      this.setupUri.set(null)
    }
    this.loading.set(false)
  }

  public ngOnDestroy(): void {
    if (this.io && this.statusHandler) {
      this.io.socket.off('homebridge-status', this.statusHandler)
    }
  }

  private resizeQrCode(): void {
    const containerHeight = (this.qrcodeContainerElement()!.nativeElement as HTMLElement).offsetHeight
    const containerWidth = (this.qrcodeContainerElement()!.nativeElement as HTMLElement).offsetWidth
    const pinCodeHeight = (this.pincodeElement()!.nativeElement as HTMLElement).offsetHeight

    const newHeight = containerHeight - pinCodeHeight
    const newWidth = containerWidth > newHeight ? newHeight : containerWidth

    this.qrCodeHeight.set(newHeight)
    this.qrCodeWidth.set(newWidth)
  }

  private getPairingPin(): void {
    this.io.request('get-homebridge-pairing-pin')
      .subscribe({
        next: (data) => {
          this.applyHapStatus(data)
          // Resize after data is set and DOM updates
          requestAnimationFrame(() => this.resizeQrCode())
        },
      })
  }
}
