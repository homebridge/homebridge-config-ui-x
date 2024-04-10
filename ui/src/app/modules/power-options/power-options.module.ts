import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { PowerOptionsRoutingModule } from '@/app/modules/power-options/power-options-routing.module';
import { PowerOptionsComponent } from '@/app/modules/power-options/power-options.component';

@NgModule({
  declarations: [
    PowerOptionsComponent,
  ],
  imports: [
    CommonModule,
    PowerOptionsRoutingModule,
    NgbModule,
    ReactiveFormsModule,
    TranslateModule,
  ],
})
export class PowerOptionsModule {}
