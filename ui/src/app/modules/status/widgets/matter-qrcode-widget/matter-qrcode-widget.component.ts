import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { Subject } from 'rxjs'

import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { QrcodeComponent } from '@/app/core/components/qrcode/qrcode.component'
import { HomebridgeStatusResponse } from '@/app/core/server.interfaces'

@Component({
  selector: 'app-matter-qrcode-widget',
  imports: [
    QrcodeComponent,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './matter-qrcode-widget.component.html',
  styleUrl: './matter-qrcode-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatterQrcodeWidgetComponent implements OnInit, OnDestroy {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)

  // Signals
  readonly pincodeElement = viewChild<ElementRef>('pincodeMatter')
  readonly qrcodeContainerElement = viewChild<ElementRef>('qrcodecontainerMatter')
  public readonly enabled = signal<boolean>(false)
  public readonly loading = signal<boolean>(true)
  public readonly commissioned = signal<boolean>(false)
  public readonly matterEnabled = signal<boolean>(false)
  public readonly pin = signal<string>('')
  public readonly setupUri = signal<string | null>(null)
  public readonly qrCodeHeight = signal<number>(0)
  public readonly qrCodeWidth = signal<number>(0)

  // Other properties
  private io: IoNamespace
  private statusHandler: (data: HomebridgeStatusResponse) => void
  resizeEvent!: Subject<void> // Set directly by ComponentFactoryResolver

  public ngOnInit(): void {
    // Use existing status namespace instead of matter-bridges
    this.io = this.$ws.getExistingNamespace('status')

    // Listen to homebridge-status events for unified status updates
    this.statusHandler = (data: HomebridgeStatusResponse) => {
      this.applyMatterStatus(data)
    }

    this.io.socket.on('homebridge-status', this.statusHandler)

    // Subscribe to grid resize events
    this.resizeEvent.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.resizeQrCode()
    })

    // Fetch initial data if already connected - defer to avoid NG0100
    if (this.io.socket.connected) {
      queueMicrotask(() => this.getMatterInfo())
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

  private applyMatterStatus(data: HomebridgeStatusResponse): void {
    if (data.matter) {
      this.matterEnabled.set(data.matter.enabled)
      if (data.matter.enabled) {
        this.pin.set(data.matter.pin || this.pin())
        this.commissioned.set(data.matter.commissioned || false)
        this.setupUri.set(data.matter.setupUri || null)
        this.enabled.set(true)
      } else {
        this.pin.set(this.$translate.instant('status.services.matter_not_enabled'))
        this.setupUri.set(null)
        this.commissioned.set(false)
      }
    } else {
      this.matterEnabled.set(false)
      this.pin.set(this.$translate.instant('status.services.matter_not_enabled'))
      this.setupUri.set(null)
      this.commissioned.set(false)
    }
    this.loading.set(false)
  }

  private getMatterInfo(): void {
    // Request homebridge pairing pin which includes Matter info
    this.io.request('get-homebridge-pairing-pin')
      .subscribe({
        next: (data) => {
          this.applyMatterStatus(data)
          // Resize after data is set and DOM updates
          requestAnimationFrame(() => this.resizeQrCode())
        },
      })
  }
}
