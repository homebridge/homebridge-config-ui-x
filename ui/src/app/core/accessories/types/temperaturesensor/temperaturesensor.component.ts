import { DecimalPipe, UpperCasePipe } from '@angular/common'
import { Component, inject, Input } from '@angular/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { SettingsService } from '@/app/core/settings.service'

@Component({
  selector: 'app-temperaturesensor',
  templateUrl: './temperaturesensor.component.html',
  styleUrls: ['./temperaturesensor.component.scss'],
  standalone: true,
  imports: [DecimalPipe, ConvertTempPipe, UpperCasePipe],
})
export class TemperaturesensorComponent {
  $settings = inject(SettingsService)

  @Input() public service: ServiceTypeX

  constructor() {}
}
