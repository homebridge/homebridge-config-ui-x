import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { LayoutComponent } from './shared/layout/layout.component';
import { AuthGuard } from './core/auth/auth.guard';
import { AdminGuard } from './core/auth/admin.guard';
import { LoginComponent } from './core/auth/login/login.component';
import { LoginGuard } from './core/auth/login/login.guard';

/*
 * The status and restart modules should not be lazy loaded
 * to ensure restarts after an update go smoothly
 */
import { RestartComponent } from './modules/restart/restart.component';
import { StatusComponent } from './modules/status/status.component';

const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [LoginGuard],
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
    path: '**', pathMatch: 'full', redirectTo: '/',
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'enabled', onSameUrlNavigation: 'reload' })],
  exports: [RouterModule],
})
export class AppRoutingModule { }
