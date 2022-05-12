import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { SetupWizardComponent } from './setup-wizard.component';

const routes: Routes = [
  {
    path: '',
    component: SetupWizardComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SetupWizardRoutingModule { }
