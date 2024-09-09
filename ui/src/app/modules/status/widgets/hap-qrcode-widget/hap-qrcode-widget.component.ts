import { IoNamespace, WsService } from '@/app/core/ws.service'
import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core'
import { Subject } from 'rxjs'

@Component({
  templateUrl: './hap-qrcode-widget.component.html',
})
export class HapQrcodeWidgetComponent implements OnInit {
  @ViewChild('pincode', { static: true }) pincodeElement: ElementRef
  @ViewChild('qrcodecontainer', { static: true }) qrcodeContainerElement: ElementRef

  @Input() resizeEvent: Subject<any>

  public pin = 'Loading...'
  public setupUri: string | null = null
  public qrCodeHeight: number
  public qrCodeWidth: number

  private io: IoNamespace

  constructor(
    private $ws: WsService,
  ) {}

  ngOnInit() {
    this.io = this.$ws.getExistingNamespace('status')

    this.resizeQrCode()

    this.io.socket.on('homebridge-status', (data) => {
      this.pin = data.pin

      if (data.setupUri) {
        this.setupUri = data.setupUri
      }
    })

    if (this.io.socket.connected) {
      this.getPairingPin()
    }

    // subscribe to grid resize events
    this.resizeEvent.subscribe({
      next: () => {
        this.resizeQrCode()
      },
    })
  }

  resizeQrCode() {
    const containerHeight = (this.qrcodeContainerElement.nativeElement as HTMLElement).offsetHeight
    const containerWidth = (this.qrcodeContainerElement.nativeElement as HTMLElement).offsetWidth
    const pinCodeHeight = (this.pincodeElement.nativeElement as HTMLElement).offsetHeight

    this.qrCodeHeight = containerHeight - pinCodeHeight
    this.qrCodeWidth = containerWidth > this.qrCodeHeight ? this.qrCodeHeight : containerWidth
  }

  getPairingPin() {
    this.io.request('get-homebridge-pairing-pin').subscribe((data) => {
      this.pin = data.pin
      this.setupUri = data.setupUri
    })
  }
}
