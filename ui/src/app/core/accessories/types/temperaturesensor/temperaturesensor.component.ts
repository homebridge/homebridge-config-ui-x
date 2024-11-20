import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { DecimalPipe } from '@angular/common'
import { Component, Input } from '@angular/core'

@Component({
  selector: 'app-temperaturesensor',
  templateUrl: './temperaturesensor.component.html',
  styleUrls: ['./temperaturesensor.component.scss'],
  imports: [DecimalPipe, ConvertTempPipe],
})
export class TemperaturesensorComponent {
  @Input() public service: ServiceTypeX

  constructor() {}
}
