import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslatePipe } from '@ngx-translate/core'
import { Subject } from 'rxjs'

import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { QrcodeComponent } from '@/app/core/components/qrcode/qrcode.component'
import { HomebridgeStatusResponse } from '@/app/core/server.interfaces'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hap-qrcode-widget.component.html',
  standalone: true,
  imports: [
    QrcodeComponent,
    TranslatePipe,
  ],
})
export class HapQrcodeWidgetComponent implements OnInit, OnDestroy {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)
  private $ws = inject(WsService)

  // Signals
  readonly pincodeElement = viewChild<ElementRef>('pincode')
  readonly qrcodeContainerElement = viewChild<ElementRef>('qrcodecontainer')
  public paired = signal<boolean>(false)
  public pin = signal<string>('')
  public setupUri = signal<string | null>(null)
  public qrCodeHeight = signal<number>(0)
  public qrCodeWidth = signal<number>(0)

  // Other properties
  private io: IoNamespace
  private statusHandler: (data: HomebridgeStatusResponse) => void
  resizeEvent!: Subject<void> // Set directly by ComponentFactoryResolver

  public ngOnInit(): void {
    this.io = this.$ws.getExistingNamespace('status')

    this.statusHandler = (data: HomebridgeStatusResponse) => {
      this.pin.set(data.pin)
      this.paired.set(data.paired)

      if (data.setupUri) {
        this.setupUri.set(data.setupUri)
      }
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

  public ngOnDestroy(): void {
    if (this.io && this.statusHandler) {
      this.io.socket.off('homebridge-status', this.statusHandler)
    }
  }

  private resizeQrCode(): void {
    // Don't resize until we have data to display
    if (!this.setupUri()) {
      return
    }

    const containerHeight = (this.qrcodeContainerElement().nativeElement as HTMLElement).offsetHeight
    const containerWidth = (this.qrcodeContainerElement().nativeElement as HTMLElement).offsetWidth
    const pinCodeHeight = (this.pincodeElement().nativeElement as HTMLElement).offsetHeight

    const newHeight = containerHeight - pinCodeHeight
    const newWidth = containerWidth > newHeight ? newHeight : containerWidth

    this.qrCodeHeight.set(newHeight)
    this.qrCodeWidth.set(newWidth)
  }

  private getPairingPin(): void {
    this.io.request('get-homebridge-pairing-pin')
      .subscribe((data) => {
        this.pin.set(data.pin)
        this.setupUri.set(data.setupUri)
        this.paired.set(data.paired)
        // Resize after data is set and DOM updates
        requestAnimationFrame(() => this.resizeQrCode())
      })
  }
}
