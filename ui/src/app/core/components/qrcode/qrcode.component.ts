import { Component, ElementRef, Input, OnChanges, ViewChild } from '@angular/core';
import * as QRCode from 'qrcode';

@Component({
  selector: 'app-qrcode',
  templateUrl: './qrcode.component.html',
  styleUrls: ['./qrcode.component.scss'],
})
export class QrcodeComponent implements OnChanges {
  @Input() data: string;

  @ViewChild('qrcode', { static: true }) qrcodeElement: ElementRef;

  ngOnChanges(): void {
    this.renderQrCode();
  }

  async renderQrCode() {
    if (this.data) {
      const qrcodeSvg = await QRCode.toString(this.data, {
        type: 'svg',
        margin: 0,
        color: {
          light: '#ffffff00',
          dark: document.body.classList.contains('dark-mode') ? '#FFF' : '#000',
        },
      });
      this.qrcodeElement.nativeElement.innerHTML = qrcodeSvg;
      const svgElement = this.qrcodeElement.nativeElement.querySelector('svg') as SVGElement;
      const svgPathElement = svgElement.querySelector('path') as SVGPathElement;
      svgPathElement.classList.add('qr-code-theme-color');
    }
  }

}
