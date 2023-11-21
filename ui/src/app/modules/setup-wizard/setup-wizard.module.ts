import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { SetupWizardRoutingModule } from './setup-wizard-routing.module';
import { SetupWizardComponent } from './setup-wizard.component';
import { SetupWizardGuard } from './setup-wizard.guard';
import { CoreModule } from '@/app/core/core.module';

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
export class SetupWizardModule { }
