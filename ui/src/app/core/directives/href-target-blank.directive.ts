import { Directive, ElementRef, OnInit } from '@angular/core';

@Directive({
  selector: '[hrefTargetBlank]',
})
export class HrefTargetBlankDirective implements OnInit {

  constructor(
    private el: ElementRef,
  ) { }

  ngOnInit() {
    // ensure third party links open in a new window without a referrer
    const links = this.el.nativeElement.querySelectorAll('a');
    links.forEach((a) => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
  }

}
