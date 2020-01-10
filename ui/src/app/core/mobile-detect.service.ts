import { Injectable } from '@angular/core';

import * as MobileDetect from 'mobile-detect';

const preventDefault = (e) => {
  e.preventDefault();
};

@Injectable({
  providedIn: 'root',
})
export class MobileDetectService {
  public detect;
  public isTouchMoveLocked = false;

  constructor() {
    this.detect = new MobileDetect(window.navigator.userAgent);
  }

  private preventDefault(e) {
    e.preventDefault();
  }

  public disableTouchMove() {
    if (!this.isTouchMoveLocked) {
      document.body.addEventListener('touchmove', preventDefault, { passive: false });
      console.log('Preventing touchmove');
      this.isTouchMoveLocked = true;
    }
  }

  public enableTouchMove() {
    document.body.removeEventListener('touchmove', preventDefault);
    this.isTouchMoveLocked = false;
    console.log('Re-enabling touchmove');
  }

}
