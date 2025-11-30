import { Routes } from '@angular/router'

import { startupScriptResolver } from '@/app/modules/platform-tools/docker/startup-script/startup-script.resolver'

export const PLATFORM_TOOLS_ROUTES: Routes = [
  {
    path: '',
    redirectTo: '/',
    pathMatch: 'full',
  },
  {
    path: 'docker',
    children: [
      {
        path: '',
        redirectTo: '/',
        pathMatch: 'full',
      },
      {
        path: 'startup-script',
        loadComponent: () => import('@/app/modules/platform-tools/docker/startup-script/startup-script.component').then(m => m.StartupScriptComponent),
        resolve: {
          startupScript: startupScriptResolver,
        },
      },
      {
        path: 'restart-container',
        loadComponent: () => import('@/app/modules/platform-tools/docker/container-restart/container-restart.component').then(m => m.ContainerRestartComponent),
      },
    ],
  },
  {
    path: 'linux',
    children: [
      {
        path: '',
        redirectTo: '/',
        pathMatch: 'full',
      },
      {
        path: 'restart-server',
        loadComponent: () => import('@/app/modules/platform-tools/linux/restart-linux/restart-linux.component').then(m => m.RestartLinuxComponent),
      },
      {
        path: 'shutdown-server',
        loadComponent: () => import('@/app/modules/platform-tools/linux/shutdown-linux/shutdown-linux.component').then(m => m.ShutdownLinuxComponent),
      },
    ],
  },
  {
    path: 'terminal',
    loadComponent: () => import('@/app/modules/platform-tools/terminal/terminal.component').then(m => m.TerminalComponent),
    canDeactivate: [(component: any, _currentRoute: any, _currentState: any, nextState?: any) => component.canDeactivate ? component.canDeactivate(nextState?.url) : true],
  },
]
