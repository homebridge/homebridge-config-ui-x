import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, input } from '@angular/core'
import { marked } from 'marked'

import emojiShortnames from './emoji-shortnames.json'

// Same token shape emoji-js matched: `:name:` optionally trailed by a skin-tone modifier.
const RE_EMOJI_COLONS = /:([\w+-]+):(?::skin-tone-[2-6]:)?/gi
const EMOJI: Record<string, string> = emojiShortnames

function replaceColons(text: string): string {
  return text.replace(RE_EMOJI_COLONS, (match, name) => EMOJI[name] ?? match)
}

// GitHub's alert syntax - a blockquote whose first line is `> [!NOTE]` and the
// four siblings below. `marked` has no notion of it, so it renders a plain
// blockquote and leaves the marker sitting in the text as
// `[!IMPORTANT] This release requires…`, which is what a plugin's release notes
// looked like in the update modal. Turned into a titled callout here.
const RE_ALERT = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][^\S\n]*\n?/i

// ⚠️ These class names have to appear in a `.ts` or `.html` file to survive the
// build: `scripts/fontawesome-subset.mjs` strips the icon fonts down to the
// `fa-*` names it finds in those two extensions, and does NOT scan `.scss`.
// Putting the icon in CSS instead would ship a blank box.
// ⚠️ Every name here must exist in the free SOLID face. `fa-hand` was the first
// pick for caution and rendered as a missing-glyph box: the free set only has it
// in the regular face, even though `svgs/solid/hand.svg` is on disk. Check the
// rendered glyph, not the file list, before adding one.
const ALERT_ICONS: Record<string, string> = {
  note: 'fa-circle-info',
  tip: 'fa-lightbulb',
  important: 'fa-circle-exclamation',
  warning: 'fa-triangle-exclamation',
  caution: 'fa-ban',
}

// Not translated, deliberately: these mirror the literal marker the author
// typed, and GitHub does not translate them either.
const ALERT_LABELS: Record<string, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
}

@Component({
  selector: 'markdown',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkdownComponent {
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

    root.querySelectorAll('blockquote').forEach(quote => this.applyAlert(quote))

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
      const replaced = replaceColons(original)
      if (replaced !== original) {
        t.nodeValue = replaced
      }
    })
  }

  /**
   * Promote a GitHub-style alert blockquote to a titled callout.
   *
   * The marker and the first line of body text arrive as ONE text node, split
   * only by the newline the author wrote, so the marker is stripped from that
   * node rather than by removing an element.
   */
  private applyAlert(quote: HTMLQuoteElement): void {
    // ⚠️ Not simply the first text node: `marked` puts a newline between
    // `<blockquote>` and `<p>`, so the first node is whitespace and the marker
    // is in the second. Skip blank nodes to reach the one that matters.
    const walker = document.createTreeWalker(quote, NodeFilter.SHOW_TEXT)
    let firstText = walker.nextNode() as Text | null
    while (firstText && !firstText.nodeValue?.trim()) {
      firstText = walker.nextNode() as Text | null
    }

    const match = firstText?.nodeValue?.match(RE_ALERT)
    if (!firstText || !match) {
      return
    }

    const kind = match[1].toLowerCase()
    firstText.nodeValue = (firstText.nodeValue ?? '').replace(RE_ALERT, '')

    quote.classList.add('md-alert', `md-alert-${kind}`)

    const title = document.createElement('p')
    title.className = 'md-alert-title'

    const icon = document.createElement('i')
    // Both halves are fixed strings from the maps above, never author input.
    icon.className = `fas ${ALERT_ICONS[kind]}`
    icon.setAttribute('aria-hidden', 'true')

    title.append(icon, ALERT_LABELS[kind])
    quote.prepend(title)
  }
}
