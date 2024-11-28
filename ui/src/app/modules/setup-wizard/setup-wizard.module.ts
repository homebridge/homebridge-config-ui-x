import { SetupWizardRoutingModule } from '@/app/modules/setup-wizard/setup-wizard-routing.module'
import { SetupWizardComponent } from '@/app/modules/setup-wizard/setup-wizard.component'
import { SetupWizardGuard } from '@/app/modules/setup-wizard/setup-wizard.guard'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { TranslateModule } from '@ngx-translate/core'

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    NgbModule,
    SetupWizardRoutingModule,
    SetupWizardComponent,
  ],
  providers: [
    SetupWizardGuard,
  ],
})
export class SetupWizardModule {}
