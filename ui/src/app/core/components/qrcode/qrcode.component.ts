import { ChangeDetectionStrategy, Component, ElementRef, input, OnChanges, viewChild } from '@angular/core'
import { toString } from 'qrcode'

@Component({
  selector: 'app-qrcode',
  standalone: true,
  templateUrl: './qrcode.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrcodeComponent implements OnChanges {
  readonly data = input.required<string>()

  private readonly qrcodeElement = viewChild<ElementRef>('qrcode')

  public ngOnChanges(): void {
    void this.renderQrCode()
  }

  private async renderQrCode() {
    if (this.data()) {
      const qrcodeElement = this.qrcodeElement()
      qrcodeElement.nativeElement.innerHTML = await toString(this.data(), {
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
