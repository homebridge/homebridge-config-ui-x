import { TransitionService, TargetState } from '@uirouter/core';

import { AuthService } from '../_services/auth.service';
import { ApiService } from '../_services/api.service';

export function authHook(transitionService: TransitionService) {
  const requiresAuthCriteria = {
    to: (state) => {
      return state.data && state.data.requiresAuth;
    }
  };

  const requiresAdminCriteria = {
    to: (state) => {
      return state.data && state.data.requiresAdmin;
    }
  };

  const redirectToLogin = (transition) => {
    const $api: ApiService = transition.injector().get(ApiService);
    const $auth: AuthService = transition.injector().get(AuthService);
    const $state = transition.router.stateService;
    const targetState: TargetState = transition.targetState();

    if (!$auth.isLoggedIn()) {
      return $api.get('/auth/settings').toPromise()
        .then((data: any) => {
          if (data && data.formAuth === false) {
            return $auth.refreshToken();
          } else {
            return $state.target('login', { returnTo: targetState }, { location: false });
          }
        });
    }
  };

  const redirectToStatus = (transition) => {
    const $state = transition.router.stateService;
    const $auth: AuthService = transition.injector().get(AuthService);

    if ($auth.user && !$auth.user.admin) {
      return $state.target('status');
    }
  };

  transitionService.onBefore(requiresAuthCriteria, redirectToLogin, { priority: 1000000 });
  transitionService.onBefore(requiresAdminCriteria, redirectToStatus, { priority: 2000000 });
}
