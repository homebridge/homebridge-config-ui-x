import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'

import { AdminGuard } from '@/app/core/auth/admin.guard'
import { AuthGuard } from '@/app/core/auth/auth.guard'
import { LoginGuard } from '@/app/modules/login/login.guard'
import { SetupWizardGuard } from '@/app/modules/setup-wizard/setup-wizard.guard'

/*
 * The status and restart modules should not be lazy loaded
 * to ensure restarts after an update go smoothly
 */

const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('@/app/modules/login/login.component').then(m => m.LoginComponent),
    canActivate: [LoginGuard],
  },
  {
    path: 'setup',
    loadChildren: () => import('./modules/setup-wizard/setup-wizard.module').then(m => m.SetupWizardModule),
    canActivate: [SetupWizardGuard],
  },
  {
    path: '',
    loadComponent: () => import('@/app/shared/layout/layout.component').then(m => m.LayoutComponent),
    canActivate: [AuthGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('@/app/modules/status/status.component').then(m => m.StatusComponent),
        canDeactivate: [(component: any) => component.canDeactivate ? component.canDeactivate() : true],
      },
      {
        path: 'restart',
        loadComponent: () => import('@/app/modules/restart/restart.component').then(m => m.RestartComponent),
        canActivate: [AdminGuard],
      },
      {
        path: 'plugins',
        loadChildren: () => import('./modules/plugins/plugins.module').then(m => m.PluginsModule),
      },
      {
        path: 'config',
        loadChildren: () => import('./modules/config-editor/config-editor.module').then(m => m.ConfigEditorModule),
        canActivate: [AdminGuard],
      },
      {
        path: 'accessories',
        loadChildren: () => import('./modules/accessories/accessories.module').then(m => m.AccessoriesModule),
      },
      {
        path: 'logs',
        loadChildren: () => import('./modules/logs/logs.module').then(m => m.LogsModule),
      },
      {
        path: 'users',
        loadChildren: () => import('./modules/users/users.module').then(m => m.UsersModule),
        canActivate: [AdminGuard],
      },
      {
        path: 'settings',
        loadChildren: () => import('./modules/settings/settings.module').then(m => m.SettingsModule),
        canActivate: [AdminGuard],
      },
      {
        path: 'support',
        loadChildren: () => import('./modules/support/support.module').then(m => m.SupportModule),
      },
      {
        path: 'power-options',
        loadChildren: () => import('./modules/power-options/power-options.module').then(m => m.PowerOptionsModule),
      },
      {
        path: 'platform-tools',
        loadChildren: () => import('./modules/platform-tools/platform-tools.module').then(m => m.PlatformToolsModule),
        canActivate: [AdminGuard],
      },
    ],
  },
  {
    path: '**',
    pathMatch: 'full',
    redirectTo: '/',
  },
]

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    scrollPositionRestoration: 'enabled',
    onSameUrlNavigation: 'reload',
  })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
