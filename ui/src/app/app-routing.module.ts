import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { LayoutComponent } from './shared/layout/layout.component';
import { AuthGuard } from './core/auth/auth.guard';
import { AdminGuard } from './core/auth/admin.guard';
import { LoginComponent } from './core/auth/login/login.component';

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
        loadChildren: './modules/plugins/plugins.module#PluginsModule',
        canActivate: [AdminGuard],
      },
      {
        path: 'config',
        loadChildren: './modules/config-editor/config-editor.module#ConfigEditorModule',
        canActivate: [AdminGuard],
      },
      {
        path: 'accessories',
        loadChildren: './modules/accessories/accessories.module#AccessoriesModule',
      },
      {
        path: 'logs',
        loadChildren: './modules/logs/logs.module#LogsModule',
      },
      {
        path: 'users',
        loadChildren: './modules/users/users.module#UsersModule',
        canActivate: [AdminGuard],
      },
      {
        path: 'platform-tools',
        loadChildren: './modules/platform-tools/platform-tools.module#PlatformToolsModule',
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
