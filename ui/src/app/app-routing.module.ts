import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { LayoutComponent } from './shared/layout/layout.component';
import { AuthGuard } from './core/auth/auth.guard';
import { AdminGuard } from './core/auth/admin.guard';
import { LoginComponent } from './core/auth/login/login.component';

const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    children: [
      {
        path: '',
        loadChildren: './modules/status/status.module#StatusModule',
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
      },
      {
        path: 'restart',
        loadChildren: './modules/restart/restart.module#RestartModule',
      },
      {
        path: 'platform-tools',
        loadChildren: './modules/platform-tools/platform-tools.module#PlatformToolsModule',
      }
    ]
  },
  {
    path: '**', pathMatch: 'full', redirectTo: '/'
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'enabled', onSameUrlNavigation: 'reload' })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
