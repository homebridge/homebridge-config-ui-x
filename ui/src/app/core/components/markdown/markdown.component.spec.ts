import type { ComponentFixture } from '@angular/core/testing'

import { TestBed } from '@angular/core/testing'
import { beforeEach, describe, expect, it } from 'vitest'

import { MarkdownComponent } from '@/app/core/components/markdown/markdown.component'

/**
 * The markdown renderer, and the closest thing the UI has to a security
 * boundary in a component.
 *
 * ⚠️ **Everything it renders is third-party.** It is used for a plugin's
 * CHANGELOG (fetched from GitHub or the installed package) in the update and
 * config modals, and for the `headerDisplay` / `footerDisplay` of any installed
 * plugin's `config.schema.json`. `marked` does not sanitise its output, so
 * assigning it straight to `innerHTML` let a crafted plugin run script in an
 * admin's browser. The fix — passing the parsed HTML through Angular's own HTML
 * sanitizer first — is what the first block below exists to hold in place. It
 * had no test at all before this spec.
 *
 * The real `marked` and the real `DomSanitizer` are used rather than stubs:
 * both are pure, and a fake sanitizer would prove nothing about the thing being
 * protected.
 */
describe('markdownComponent', () => {
  let fixture: ComponentFixture<MarkdownComponent>

  /**
   * Render a piece of markdown and hand back the host element.
   * @param source - the markdown to render
   */
  function render(source: string) {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({ imports: [MarkdownComponent] })

    fixture = TestBed.createComponent(MarkdownComponent)
    fixture.componentRef.setInput('data', source)
    fixture.detectChanges()

    return fixture.nativeElement as HTMLElement
  }

  /** Re-render an already-created component with new markdown. */
  function rerender(source: string) {
    fixture.componentRef.setInput('data', source)
    fixture.detectChanges()
    return fixture.nativeElement as HTMLElement
  }

  beforeEach(() => {
    render('')
  })

  describe('sanitising third-party markdown', () => {
    it('strips an inline event handler', () => {
      // The original report: a crafted plugin CHANGELOG running script in an
      // admin's browser through an image that always fails to load
      const host = render('<img src=x onerror="alert(1)">')

      expect(host.querySelector('img')?.getAttribute('onerror')).toBeNull()
      expect(host.innerHTML).not.toContain('onerror')
    })

    it('strips a script tag', () => {
      const host = render('Release notes\n\n<script>alert(1)</script>')

      expect(host.querySelector('script')).toBeNull()
      expect(host.innerHTML).not.toContain('<script')
    })

    it('strips an event handler off any element, not just images', () => {
      const host = render('<div onclick="alert(1)">Click me</div>')

      expect(host.innerHTML).not.toContain('onclick')
      expect(host.textContent).toContain('Click me')
    })

    it('neutralises a javascript: link', () => {
      // Angular does not remove the href, it prefixes it with `unsafe:` - which
      // is not a scheme any browser will navigate to. Assert the prefix rather
      // than the absence of the string, or the test claims something untrue
      const host = render('[Click me](javascript:alert&#40;1&#41;)')

      expect(host.querySelector('a')?.getAttribute('href')).toBe('unsafe:javascript:alert(1)')
    })

    it('strips an iframe', () => {
      const host = render('<iframe src="https://example.com"></iframe>')

      expect(host.querySelector('iframe')).toBeNull()
    })

    it('leaves ordinary formatting alone', () => {
      // Sanitising must not cost the feature: this is release-notes markup
      const host = render('# Heading\n\nSome **bold** and _italic_ text.\n\n- one\n- two\n\n`code()`')

      expect(host.querySelector('h1')?.textContent).toBe('Heading')
      expect(host.querySelector('strong')?.textContent).toBe('bold')
      expect(host.querySelector('em')?.textContent).toBe('italic')
      expect(host.querySelectorAll('li')).toHaveLength(2)
      expect(host.querySelector('code')?.textContent).toBe('code()')
    })

    it('leaves an ordinary image alone', () => {
      const host = render('![A badge](https://example.com/badge.svg)')

      expect(host.querySelector('img')?.getAttribute('src')).toBe('https://example.com/badge.svg')
    })

    it('renders nothing for empty markdown', () => {
      expect(render('').innerHTML).toBe('')
    })

    it('renders nothing rather than throwing when handed no markdown at all', () => {
      const host = render(undefined as unknown as string)

      expect(host.innerHTML).toBe('')
    })

    it('re-renders when the markdown changes', () => {
      render('First release')
      const host = rerender('Second release')

      expect(host.textContent).toContain('Second release')
      expect(host.textContent).not.toContain('First release')
    })
  })

  describe('hardening links', () => {
    it('opens every link in a new tab, severing it from this page', () => {
      // `noopener` matters as much as the new tab: without it the opened page
      // gets a handle on the Homebridge window through `window.opener`
      const host = render('[Docs](https://homebridge.io) and [more](https://github.com)')

      const links = [...host.querySelectorAll('a')]
      expect(links).toHaveLength(2)
      for (const link of links) {
        expect(link.getAttribute('target')).toBe('_blank')
        expect(link.getAttribute('rel')).toBe('noopener noreferrer')
      }
    })

    it('overrides a target the markdown author set for themselves', () => {
      const host = render('<a href="https://example.com" target="_self" rel="opener">Link</a>')

      expect(host.querySelector('a')?.getAttribute('target')).toBe('_blank')
      expect(host.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer')
    })
  })

  describe('images with no alt text', () => {
    it('hides a decorative image from screen readers', () => {
      // A badge with no alt is decoration; announcing its filename is noise
      const host = render('![](https://example.com/badge.svg)')

      const img = host.querySelector('img')!
      expect(img.getAttribute('alt')).toBe('')
      expect(img.getAttribute('aria-hidden')).toBe('true')
      expect(img.getAttribute('role')).toBe('presentation')
    })

    it('treats whitespace-only alt text as no alt text', () => {
      const host = render('<img src="https://example.com/badge.svg" alt="   ">')

      expect(host.querySelector('img')?.getAttribute('aria-hidden')).toBe('true')
    })

    it('leaves a described image announced', () => {
      const host = render('![A CI status badge](https://example.com/badge.svg)')

      const img = host.querySelector('img')!
      expect(img.getAttribute('alt')).toBe('A CI status badge')
      expect(img.getAttribute('aria-hidden')).toBeNull()
    })
  })

  describe('github style alert callouts', () => {
    it.each([
      ['NOTE', 'note', 'fa-circle-info', 'Note'],
      ['TIP', 'tip', 'fa-lightbulb', 'Tip'],
      ['IMPORTANT', 'important', 'fa-circle-exclamation', 'Important'],
      ['WARNING', 'warning', 'fa-triangle-exclamation', 'Warning'],
      ['CAUTION', 'caution', 'fa-ban', 'Caution'],
    ])('turns a %s blockquote into a titled callout', (marker, kind, icon, label) => {
      const host = render(`> [!${marker}]\n> This release needs Node 22.`)

      const quote = host.querySelector('blockquote')!
      expect(quote.classList.contains('md-alert')).toBe(true)
      expect(quote.classList.contains(`md-alert-${kind}`)).toBe(true)

      const title = quote.querySelector('.md-alert-title')!
      expect(title.textContent).toBe(label)
      expect(title.querySelector('i')?.className).toBe(`fas ${icon}`)
      expect(title.querySelector('i')?.getAttribute('aria-hidden')).toBe('true')
    })

    it('takes the marker out of the body text', () => {
      // Left in place, a plugin's release notes read
      // "[!IMPORTANT] This release requires…" - which is what they used to
      const host = render('> [!IMPORTANT]\n> This release requires Node 22.')

      expect(host.textContent).not.toContain('[!IMPORTANT]')
      expect(host.textContent).toContain('This release requires Node 22.')
    })

    it('handles a marker on the same line as its body text', () => {
      const host = render('> [!WARNING] Back up first.')

      const quote = host.querySelector('blockquote')!
      expect(quote.classList.contains('md-alert-warning')).toBe(true)
      expect(quote.textContent).toContain('Back up first.')
      expect(quote.textContent).not.toContain('[!WARNING]')
    })

    it('accepts a lowercase marker', () => {
      const host = render('> [!note]\n> Something.')

      expect(host.querySelector('blockquote')?.classList.contains('md-alert-note')).toBe(true)
    })

    it('leaves a plain blockquote as a blockquote', () => {
      const host = render('> Just a quotation.')

      const quote = host.querySelector('blockquote')!
      expect(quote.classList.contains('md-alert')).toBe(false)
      expect(quote.querySelector('.md-alert-title')).toBeNull()
    })

    it('ignores a marker that is not one of the five', () => {
      const host = render('> [!SHOUTING]\n> Something.')

      const quote = host.querySelector('blockquote')!
      expect(quote.classList.contains('md-alert')).toBe(false)
      expect(quote.textContent).toContain('[!SHOUTING]')
    })

    it('promotes each of several alerts separately', () => {
      const host = render('> [!NOTE]\n> First.\n\n> [!WARNING]\n> Second.')

      const quotes = [...host.querySelectorAll('blockquote')]
      expect(quotes).toHaveLength(2)
      expect(quotes[0].classList.contains('md-alert-note')).toBe(true)
      expect(quotes[1].classList.contains('md-alert-warning')).toBe(true)
    })
  })

  describe('emoji shortnames', () => {
    it('replaces a shortname with the emoji', () => {
      const host = render('Shipped :tada:')

      expect(host.textContent).toContain('🎉')
      expect(host.textContent).not.toContain(':tada:')
    })

    it('replaces several in one line', () => {
      const host = render(':rocket: fast and :+1: good')

      expect(host.textContent).toContain('🚀')
      expect(host.textContent).toContain('👍')
    })

    it('swallows the skin tone modifier rather than applying it', () => {
      // ⚠️ Asserted exactly, because a looser check hides what happens. The
      // modifier is consumed and DROPPED, so the plain emoji is rendered - not
      // the toned one. `skin-tone-4` is itself in the shortname map, so a regex
      // without the modifier group would render 👍🏽 instead. Both read fine;
      // this is the one the component actually produces, matching what the old
      // emoji-js did.
      const host = render('Thanks :+1::skin-tone-4:')

      expect(host.textContent?.trim()).toBe('Thanks 👍')
    })

    it('leaves a shortname it does not know alone', () => {
      // Colons are ordinary punctuation in release notes
      const host = render('See :not_an_emoji: for details')

      expect(host.textContent).toContain(':not_an_emoji:')
    })

    it('leaves text with no colons untouched', () => {
      const host = render('Nothing to replace here')

      // Trimmed: marked ends its paragraph with a newline
      expect(host.textContent?.trim()).toBe('Nothing to replace here')
    })

    it('does not touch a shortname inside inline code', () => {
      // A code sample showing the literal syntax must keep it
      const host = render('Write `:tada:` to celebrate')

      expect(host.querySelector('code')?.textContent).toBe(':tada:')
    })

    it('does not touch a shortname inside a fenced code block', () => {
      const host = render('```\nconst emoji = ":tada:"\n```')

      expect(host.querySelector('pre')?.textContent).toContain(':tada:')
      expect(host.querySelector('pre')?.textContent).not.toContain('🎉')
    })
  })
})
