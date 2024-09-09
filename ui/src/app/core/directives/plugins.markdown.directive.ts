import { Directive, ElementRef, OnInit } from '@angular/core'
import { EmojiConvertor } from 'emoji-js'

@Directive({
  selector: 'markdown',
})
export class PluginsMarkdownDirective implements OnInit {
  constructor(
    private el: ElementRef,
  ) {}

  ngOnInit() {
    // ensure third party links open in a new window without a referrer
    const links = this.el.nativeElement.querySelectorAll('a')
    links.forEach((a: any) => {
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
    })

    // replace colon emojis
    const emoji = new EmojiConvertor()
    this.el.nativeElement.innerHTML = emoji.replace_colons(this.el.nativeElement.innerHTML)
  }
}
