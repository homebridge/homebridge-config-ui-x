import { TransitionService, TargetState } from '@uirouter/core';
import { Transition } from '@uirouter/angular';

import { AuthService } from '../_services/auth.service';

export function authHook(transitionService: TransitionService) {
  const requiresAuthCriteria = {
    to: (state) => {
      return state.data && state.data.requiresAuth;
    }
  };

  const redirectToLogin = (transition) => {
    const authService: AuthService = transition.injector().get(AuthService);
    const $state = transition.router.stateService;
    const targetState: TargetState = transition.targetState();

    const returnTo = {
      name: targetState.name(),
      params: targetState.params()
    };

    if (!authService.isLoggedIn()) {
      return $state.target('login', { returnTo: targetState }, { location: false });
    }
  };

  transitionService.onBefore(requiresAuthCriteria, redirectToLogin, { priority: 10 });
}
