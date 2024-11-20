import { Component, ElementRef, Input, OnChanges, viewChild } from '@angular/core'
import { toString } from 'qrcode'

@Component({
  selector: 'app-qrcode',
  templateUrl: './qrcode.component.html',
  standalone: true,
})
export class QrcodeComponent implements OnChanges {
  @Input() data: string

  readonly qrcodeElement = viewChild<ElementRef>('qrcode')

  ngOnChanges(): void {
    this.renderQrCode()
  }

  async renderQrCode() {
    if (this.data) {
      const qrcodeElement = this.qrcodeElement()
      qrcodeElement.nativeElement.innerHTML = await toString(this.data, {
        type: 'svg',
        margin: 0,
        color: {
          light: '#ffffff00',
          dark: document.body.classList.contains('dark-mode') ? '#FFF' : '#000',
        },
      })
      const svgElement = qrcodeElement.nativeElement.querySelector('svg') as SVGElement
      const svgPathElement = svgElement.querySelector('path') as SVGPathElement
      svgPathElement.classList.add('qr-code-theme-color')
    }
  }
}
