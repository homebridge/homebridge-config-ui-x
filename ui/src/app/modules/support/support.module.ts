import { SupportComponent } from '@/app/modules/support/support.component'
import { SupportRoutingModule } from '@/app/modules/support/support-routing.module'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { TranslateModule } from '@ngx-translate/core'

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
