import { NgClass, NgStyle } from '@angular/common'
import { Component, ElementRef, inject, Input, OnInit, viewChild } from '@angular/core'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { Subject } from 'rxjs'

import { QrcodeComponent } from '@/app/core/components/qrcode/qrcode.component'
import { HomebridgeStatusResponse } from '@/app/core/server.interfaces'
import { IoNamespace, WsService } from '@/app/core/ws.service'

@Component({
  templateUrl: './matter-qrcode-widget.component.html',
  standalone: true,
  imports: [
    NgStyle,
    QrcodeComponent,
    NgClass,
    TranslatePipe,
  ],
})
export class MatterQrcodeWidgetComponent implements OnInit {
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private io: IoNamespace

  readonly pincodeElement = viewChild<ElementRef>('pincodeMatter')
  readonly qrcodeContainerElement = viewChild<ElementRef>('qrcodecontainerMatter')

  @Input() resizeEvent: Subject<any>

  public enabled = false
  public loading = true
  public commissioned: boolean = false
  public matterEnabled: boolean = false
  public pin = ''
  public setupUri: string | null = null
  public qrCodeHeight: number
  public qrCodeWidth: number

  public ngOnInit() {
    // Use existing status namespace instead of matter-bridges
    this.io = this.$ws.getExistingNamespace('status')
    this.resizeQrCode()

    // Listen to homebridge-status events for unified status updates
    this.io.socket.on('homebridge-status', (data: HomebridgeStatusResponse) => {
      // Extract Matter info from unified status
      if (data.matter) {
        this.matterEnabled = data.matter.enabled
        if (data.matter.enabled) {
          this.pin = data.matter.pin || this.pin
          this.commissioned = data.matter.commissioned || false
          this.setupUri = data.matter.setupUri || null
          this.enabled = true
        } else {
          this.pin = this.$translate.instant('status.services.label_not_enabled')
          this.setupUri = null
          this.commissioned = false
        }
      } else {
        // No Matter info means Matter is not configured
        this.matterEnabled = false
        this.pin = this.$translate.instant('status.services.label_not_enabled')
        this.setupUri = null
        this.commissioned = false
      }
      this.loading = false
    })

    // Get initial Matter info if connected
    if (this.io.socket.connected) {
      this.getMatterInfo()
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

  private getMatterInfo() {
    // Request homebridge pairing pin which includes Matter info
    this.io.request('get-homebridge-pairing-pin')
      .subscribe({
        next: (data) => {
          // Extract Matter info from unified response
          if (data.matter) {
            this.matterEnabled = data.matter.enabled
            if (data.matter.enabled) {
              this.pin = data.matter.pin || this.pin
              this.commissioned = data.matter.commissioned || false
              this.setupUri = data.matter.setupUri || null
              this.enabled = true
            } else {
              this.pin = this.$translate.instant('status.services.label_not_enabled')
              this.setupUri = null
              this.commissioned = false
            }
          } else {
            // No Matter info means Matter is not configured
            this.matterEnabled = false
            this.pin = this.$translate.instant('status.services.label_not_enabled')
            this.setupUri = null
            this.commissioned = false
          }

          this.loading = false
          setTimeout(() => this.resizeQrCode(), 10)
        },
      })
  }
}
