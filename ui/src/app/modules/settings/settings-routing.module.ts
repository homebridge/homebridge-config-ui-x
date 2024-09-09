import { AdminGuard } from '@/app/core/auth/admin.guard'
import { SettingsComponent } from '@/app/modules/settings/settings.component'
import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'

const routes: Routes = [
  {
    path: '',
    component: SettingsComponent,
    canActivate: [AdminGuard],
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SettingsRoutingModule {}
