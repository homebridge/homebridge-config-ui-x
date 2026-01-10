import { Directive, ElementRef, inject, OnInit } from '@angular/core'
import { EmojiConvertor } from 'emoji-js'

@Directive({
  selector: 'markdown',
  standalone: true,
})
export class PluginsMarkdownDirective implements OnInit {
  private el = inject(ElementRef)

  public ngOnInit() {
    const root = this.el.nativeElement as HTMLElement

    const links = root.querySelectorAll('a')
    links.forEach((a: HTMLAnchorElement) => {
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
    })

    const images = root.querySelectorAll('img')
    images.forEach((img: HTMLImageElement) => {
      const alt = img.getAttribute('alt')
      if (!alt || !alt.trim()) {
        img.setAttribute('alt', '')
        img.setAttribute('aria-hidden', 'true')
        img.setAttribute('role', 'presentation')
      }
    })

    const emoji = new EmojiConvertor()

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      (n: Node) => {
        const p = n.parentElement as HTMLElement | null
        if (!p) {
          return NodeFilter.FILTER_REJECT
        }
        if (p.closest('code, pre, script, style')) {
          return NodeFilter.FILTER_REJECT
        }
        return NodeFilter.FILTER_ACCEPT
      },
    )

    const textNodes: Text[] = []
    let n: Node | null = walker.nextNode()
    while (n) {
      textNodes.push(n as Text)
      n = walker.nextNode()
    }

    textNodes.forEach((t) => {
      const original = t.nodeValue || ''
      if (!original.includes(':')) {
        return
      }
      const replaced = emoji.replace_colons(original)
      if (replaced !== original) {
        t.nodeValue = replaced
      }
    })
  }
}
