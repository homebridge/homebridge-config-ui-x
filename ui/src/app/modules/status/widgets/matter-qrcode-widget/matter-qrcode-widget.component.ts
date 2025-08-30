import { NgClass, NgStyle } from '@angular/common'
import { Component, ElementRef, inject, Input, OnInit, viewChild } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { Subject } from 'rxjs'

import { QrcodeComponent } from '@/app/core/components/qrcode/qrcode.component'
import { IoNamespace, WsService } from '@/app/core/ws.service'

@Component({
  templateUrl: './matter-qrcode-widget.component.html',
  standalone: true,
  imports: [
    NgStyle,
    QrcodeComponent,
    TranslatePipe,
    NgClass,
  ],
})
export class MatterQrcodeWidgetComponent implements OnInit {
  private $ws = inject(WsService)
  private io: IoNamespace

  readonly pincodeElement = viewChild<ElementRef>('pincode')
  readonly qrcodeContainerElement = viewChild<ElementRef>('qrcodecontainer')

  @Input() resizeEvent: Subject<any>

  public paired: boolean = false
  public pin = 'Loading...'
  public setupUri: string | null = null
  public qrCodeHeight: number
  public qrCodeWidth: number

  public ngOnInit() {
    this.io = this.$ws.getExistingNamespace('status')

    this.resizeQrCode()

    this.io.socket.on('homebridge-status', (data) => {
      if (data.matter) {
        this.pin = data.matter.pin || 'Matter not configured'
        this.paired = data.matter.paired || false

        if (data.matter.setupUri) {
          this.setupUri = data.matter.setupUri
        }
      }
    })

    if (this.io.socket.connected) {
      this.getMatterPairingInfo()
    }

    // Subscribe to grid resize events
    this.resizeEvent.subscribe({
      next: () => {
        this.resizeQrCode()
      },
    })
  }

  private resizeQrCode() {
    const containerHeight = (this.qrcodeContainerElement().nativeElement as HTMLElement).offsetHeight
    const containerWidth = (this.qrcodeContainerElement().nativeElement as HTMLElement).offsetWidth
    const pinCodeHeight = (this.pincodeElement().nativeElement as HTMLElement).offsetHeight

    this.qrCodeHeight = containerHeight - pinCodeHeight
    this.qrCodeWidth = containerWidth > this.qrCodeHeight ? this.qrCodeHeight : containerWidth
  }

  private getMatterPairingInfo() {
    this.io.request('get-matter-pairing-info').subscribe((data) => {
      if (data && data.enabled) {
        this.pin = data.pin || 'Matter not configured'
        this.setupUri = data.setupUri || null
        this.paired = data.paired || false
      } else {
        this.pin = 'Matter not enabled'
        this.setupUri = null
        this.paired = false
      }
    })
  }
}
