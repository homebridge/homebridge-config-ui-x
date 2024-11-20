import { PowerOptionsRoutingModule } from '@/app/modules/power-options/power-options-routing.module'
import { PowerOptionsComponent } from '@/app/modules/power-options/power-options.component'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { TranslateModule } from '@ngx-translate/core'

@NgModule({
  imports: [
    CommonModule,
    PowerOptionsRoutingModule,
    NgbModule,
    ReactiveFormsModule,
    TranslateModule,
    PowerOptionsComponent,
  ],
})
export class PowerOptionsModule {}
