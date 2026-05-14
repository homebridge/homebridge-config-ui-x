import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, input } from '@angular/core'
import { EmojiConvertor } from 'emoji-js'
import { marked } from 'marked'

@Component({
  selector: 'markdown',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkdownComponent {
  private static emoji = new EmojiConvertor()

  private el = inject<ElementRef<HTMLElement>>(ElementRef)

  public readonly data = input('')

  constructor() {
    effect(() => this.render(this.data()))
  }

  private render(source: string): void {
    const root = this.el.nativeElement
    root.innerHTML = marked.parse(source ?? '', { async: false }) as string

    root.querySelectorAll('a').forEach((a) => {
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
    })

    root.querySelectorAll('img').forEach((img) => {
      const alt = img.getAttribute('alt')
      if (!alt || !alt.trim()) {
        img.setAttribute('alt', '')
        img.setAttribute('aria-hidden', 'true')
        img.setAttribute('role', 'presentation')
      }
    })

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      (n: Node) => {
        const p = n.parentElement
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
      const replaced = MarkdownComponent.emoji.replace_colons(original)
      if (replaced !== original) {
        t.nodeValue = replaced
      }
    })
  }
}
