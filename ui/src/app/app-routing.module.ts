import { AdminGuard } from '@/app/core/auth/admin.guard'
import { AuthGuard } from '@/app/core/auth/auth.guard'
import { LoginComponent } from '@/app/modules/login/login.component'
import { LoginGuard } from '@/app/modules/login/login.guard'
import { RestartComponent } from '@/app/modules/restart/restart.component'
import { SetupWizardGuard } from '@/app/modules/setup-wizard/setup-wizard.guard'
import { StatusComponent } from '@/app/modules/status/status.component'
import { LayoutComponent } from '@/app/shared/layout/layout.component'
import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'

/*
 * The status and restart modules should not be lazy loaded
 * to ensure restarts after an update go smoothly
 */

const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [LoginGuard],
  },
  {
    path: 'setup',
    loadChildren: () => import('./modules/setup-wizard/setup-wizard.module').then(m => m.SetupWizardModule),
    canActivate: [SetupWizardGuard],
  },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    children: [
      {
        path: '',
        component: StatusComponent,
      },
      {
        path: 'restart',
        component: RestartComponent,
        canActivate: [AdminGuard],
      },
      {
        path: 'plugins',
        loadChildren: () => import('./modules/plugins/plugins.module').then(m => m.PluginsModule),
        canActivate: [AdminGuard],
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
      // redirects from old urls below
      {
        path: 'docker/terminal',
        redirectTo: 'platform-tools/terminal',
      },
      {
        path: 'docker/startup-script',
        redirectTo: 'platform-tools/docker/startup-script',
      },
      {
        path: 'docker/restart',
        redirectTo: 'platform-tools/docker/restart-container',
      },
      {
        path: 'docker/settings',
        redirectTo: 'platform-tools/docker/settings',
      },
      {
        path: 'linux/terminal',
        redirectTo: 'platform-tools/terminal',
      },
      {
        path: 'linux/restart',
        redirectTo: 'platform-tools/linux/restart-server',
      },
      {
        path: 'linux/shutdown',
        redirectTo: 'platform-tools/linux/shutdown-server',
      },
      {
        path: 'platform-tools/docker/settings',
        redirectTo: '/settings',
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
