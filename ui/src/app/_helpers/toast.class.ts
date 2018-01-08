import {  ToastOptions } from 'ng2-toastr/ng2-toastr';

export class ToastCustomOptions extends ToastOptions {
  animate = 'flyRight';
  newestOnTop = false;
  showCloseButton = true;
  maxShown = 2;
  positionClass = 'toast-bottom-right';
}
