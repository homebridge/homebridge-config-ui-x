import { SetupWizardComponent } from '@/app/modules/setup-wizard/setup-wizard.component'
import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'

const routes: Routes = [
  {
    path: '',
    component: SetupWizardComponent,
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SetupWizardRoutingModule {}
