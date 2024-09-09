import { CoreModule } from '@/app/core/core.module'
import { SetupWizardComponent } from '@/app/modules/setup-wizard/setup-wizard.component'
import { SetupWizardGuard } from '@/app/modules/setup-wizard/setup-wizard.guard'
import { SetupWizardRoutingModule } from '@/app/modules/setup-wizard/setup-wizard-routing.module'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { TranslateModule } from '@ngx-translate/core'

@NgModule({
  declarations: [
    SetupWizardComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    NgbModule,
    CoreModule,
    SetupWizardRoutingModule,
  ],
  providers: [
    SetupWizardGuard,
  ],
})
export class SetupWizardModule {}
