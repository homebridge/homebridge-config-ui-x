import { Routes } from '@angular/router'

import { adminGuard } from '@/app/core/auth/guards/admin.guard'
import { authGuard } from '@/app/core/auth/guards/auth.guard'
import { loginGuard } from '@/app/core/auth/guards/login.guard'
import { logsGuard } from '@/app/core/auth/guards/logs.guard'
import { setupWizardGuard } from '@/app/core/auth/guards/setup-wizard.guard'
import { configEditorResolver } from '@/app/modules/config-editor/config-editor.resolver'
import { usersResolver } from '@/app/modules/users/users.resolver'

/*
 * The status and restart modules should not be lazy loaded
 * to ensure restarts after an update go smoothly
 */

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('@/app/modules/login/login.component').then(m => m.LoginComponent),
    canActivate: [loginGuard],
  },
  {
    path: 'setup',
    loadComponent: () => import('@/app/modules/setup-wizard/setup-wizard.component').then(m => m.SetupWizardComponent),
    canActivate: [setupWizardGuard],
  },
  {
    path: '',
    loadComponent: () => import('@/app/shared/layout/layout.component').then(m => m.LayoutComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('@/app/modules/status/status.component').then(m => m.StatusComponent),
        canDeactivate: [(component: any) => component.canDeactivate ? component.canDeactivate() : true],
      },
      {
        path: 'restart',
        loadComponent: () => import('@/app/modules/restart/restart.component').then(m => m.RestartComponent),
        canActivate: [adminGuard],
      },
      {
        path: 'plugins',
        loadComponent: () => import('@/app/modules/plugins/plugins.component').then(m => m.PluginsComponent),
        canActivate: [authGuard],
        canDeactivate: [(component: any, _currentRoute: any, _currentState: any, nextState?: any) => component.canDeactivate ? component.canDeactivate(nextState?.url) : true],
      },
      {
        path: 'config',
        loadComponent: () => import('@/app/modules/config-editor/config-editor.component').then(m => m.ConfigEditorComponent),
        canActivate: [adminGuard],
        canDeactivate: [(component: any) => component.canDeactivate ? component.canDeactivate() : true],
        resolve: {
          config: configEditorResolver,
        },
      },
      {
        path: 'accessories',
        loadComponent: () => import('@/app/modules/accessories/accessories.component').then(m => m.AccessoriesComponent),
        canActivate: [authGuard],
        data: {
          view: 'accessories',
        },
      },
      {
        path: 'smart-automations',
        loadComponent: () => import('@/app/modules/smart-automations/smart-automations.component').then(m => m.SmartAutomationsComponent),
        canActivate: [authGuard],
      },
      {
        path: 'logs',
        loadComponent: () => import('@/app/modules/logs/logs.component').then(m => m.LogsComponent),
        canActivate: [logsGuard],
        canDeactivate: [(component: any, _currentRoute: any, _currentState: any, nextState?: any) => component.canDeactivate ? component.canDeactivate(nextState?.url) : true],
      },
      {
        path: 'users',
        loadComponent: () => import('@/app/modules/users/users.component').then(m => m.UsersComponent),
        canActivate: [adminGuard],
        resolve: {
          homebridgeUsers: usersResolver,
        },
      },
      {
        path: 'settings',
        loadComponent: () => import('@/app/modules/settings/settings.component').then(m => m.SettingsComponent),
        canActivate: [adminGuard],
      },
      {
        path: 'support',
        loadComponent: () => import('@/app/modules/support/support.component').then(m => m.SupportComponent),
        canActivate: [authGuard],
      },
      {
        path: 'power-options',
        loadComponent: () => import('@/app/modules/power-options/power-options.component').then(m => m.PowerOptionsComponent),
        canActivate: [adminGuard],
      },
      {
        path: 'platform-tools',
        loadChildren: () => import('@/app/modules/platform-tools/platform-tools.routes').then(m => m.PLATFORM_TOOLS_ROUTES),
        canActivate: [adminGuard],
      },
    ],
  },
  {
    path: '**',
    pathMatch: 'full',
    redirectTo: '/',
  },
]
