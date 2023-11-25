import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { SupportRoutingModule } from './support-routing.module';
import { SupportComponent } from './support.component';

@NgModule({
  declarations: [
    SupportComponent,
  ],
  imports: [
    CommonModule,
    SupportRoutingModule,
    NgbModule,
    ReactiveFormsModule,
    TranslateModule,
  ],
})
export class SupportModule {}
