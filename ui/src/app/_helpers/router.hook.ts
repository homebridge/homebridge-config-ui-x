import { TransitionService } from '@uirouter/core';

export function routerHook(transitionService: TransitionService) {
  // close menu on route change
  const closeMenuCriteria = {
    to: (state) => {
      return true;
    }
  };

  const closeDropdownMenus = () => {
    const dropdownMenu = window.document.querySelector('#navbarSupportedContent');
    if (dropdownMenu) {
      dropdownMenu.classList.remove('show');
    }
  };

  transitionService.onStart(closeMenuCriteria, closeDropdownMenus, { priority: 10 });
}
