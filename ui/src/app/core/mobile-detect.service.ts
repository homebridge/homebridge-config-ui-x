import { Injectable } from '@angular/core';

import * as MobileDetect from 'mobile-detect';

@Injectable({
  providedIn: 'root'
})
export class MobileDetectService {
  public detect;

  constructor() {
    this.detect = new MobileDetect(window.navigator.userAgent);
  }

}
