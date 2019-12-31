import { Component, OnInit, ElementRef, ViewChild, Input } from '@angular/core';
import { ApiService } from '../../../../core/api.service';
import { WsService } from '../../../../core/ws.service';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-hap-qrcode-widget',
  templateUrl: './hap-qrcode-widget.component.html',
  styleUrls: ['./hap-qrcode-widget.component.scss'],
})
export class HapQrcodeWidgetComponent implements OnInit {
  @ViewChild('qrcode', { static: true }) qrcodeElement: ElementRef;
  @ViewChild('pincode', { static: true }) pincodeElement: ElementRef;
  @ViewChild('qrcodecontainer', { static: true }) qrcodeContainerElement: ElementRef;

  @Input() resizeEvent: Subject<any>;

  private loadedQrCode: boolean;
  private io = this.$ws.getExistingNamespace('status');

  public pin = 'Loading...';
  public qrCodeHeight;
  public qrCodeWidth;

  constructor(
    private $api: ApiService,
    private $ws: WsService,
  ) { }

  ngOnInit() {
    this.resizeQrCode();

    this.io.socket.on('homebridge-status', (data) => {
      this.getQrCodeImage();
      this.pin = data.pin;
    });

    if (this.io.socket.connected) {
      this.getQrCodeImage();
      this.getPairingPin();
    }

    this.io.socket.on('disconnect', () => {
      this.loadedQrCode = false;
    });

    // subscribe to grid resize events
    this.resizeEvent.subscribe({
      next: () => {
        this.resizeQrCode();
      },
    });
  }

  resizeQrCode() {
    if (this.loadedQrCode) {
      const containerHeight = (<HTMLElement>this.qrcodeContainerElement.nativeElement).offsetHeight;
      const containerWidth = (<HTMLElement>this.qrcodeContainerElement.nativeElement).offsetWidth;
      const pinCodeHeight = (<HTMLElement>this.pincodeElement.nativeElement).offsetHeight;
      this.qrCodeHeight = containerHeight - pinCodeHeight;
      this.qrCodeWidth = containerWidth;
    }
  }

  getQrCodeImage() {
    if (!this.loadedQrCode) {
      return this.$api.get('/server/qrcode.svg', { responseType: 'text' as 'text' }).subscribe(
        (svg) => {
          this.qrcodeElement.nativeElement.innerHTML = svg;
          this.loadedQrCode = true;
          setTimeout(() => {
            this.resizeQrCode();
          }, 20);
          setTimeout(() => {
            this.resizeEvent.next();
          }, 1000);
        },
        (err) => {
          this.loadedQrCode = false;
        },
      );
    }
  }

  getPairingPin() {
    this.io.request('get-homebridge-pairing-pin').subscribe((data) => {
      this.pin = data.pin;
    });
  }

}
