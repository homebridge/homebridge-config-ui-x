import type { ComponentFixture } from '@angular/core/testing'

import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { JsonSchemaFormPatchDirective } from '@/app/core/directives/json-schema-form-patch.directive'

/**
 * The directive that patches ng-formworks' generated markup for accessibility.
 *
 * Every plugin's settings form goes through it, and none of what it fixes is
 * visible on screen — it is all names and roles a screen reader reads out. That
 * makes it the easiest file in the app to break silently, and the hardest to
 * notice: the form still looks right.
 *
 * ⚠️ **Scope.** This spec covers the DOM patching, which is the part reachable
 * without ng-formworks: the directive injects `JsonSchemaFormComponent` as
 * `optional: true`, so on a plain host it skips the `buildLayout` override and
 * runs its accessibility pass over whatever markup is there. Two things are
 * therefore NOT covered here and would need the real schema renderer:
 *
 * - the `buildLayout` monkey-patch and `fixNestedArrayLayout`, which repair a
 *   nested-array layout ng-formworks builds wrongly;
 * - `patchExpandableFieldsetLegends` / `patchExpandableSectionLegends`, which
 *   need the collapse markup bootstrap generates at runtime.
 *
 * The fixtures below are the shapes ng-formworks actually emits, written by hand.
 */
@Component({
  selector: 'app-jsf-patch-host',
  imports: [JsonSchemaFormPatchDirective],
  // Flush left and newline-terminated: the lint template processor treats an
  // inline template as a file of its own, and `eslint --fix` silently truncated
  // the single-quoted version at the closing quote
  template: `<div jsfPatch></div>
`,
})
class HostComponent {}

describe('jsonSchemaFormPatchDirective', () => {
  let fixture: ComponentFixture<HostComponent>

  /**
   * Render some markup with the directive attached and let its observer settle.
   *
   * ⚠️ The markup is written straight onto the element rather than bound with
   * `[innerHTML]`: Angular sanitises that binding and strips the `<legend>` and
   * `<fieldset>` tags this directive keys off, so every assertion came back
   * `undefined` with nothing obviously wrong. Writing it directly also matches
   * how ng-formworks builds the form - which is why the MutationObserver exists.
   * @param markup - the ng-formworks markup to patch
   */
  async function patch(markup: string) {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({ imports: [HostComponent] })

    fixture = TestBed.createComponent(HostComponent)
    fixture.detectChanges()

    const root = fixture.nativeElement.querySelector('div') as HTMLElement
    root.innerHTML = markup
    await flush()
    return root
  }

  /**
   * Let the patch run.
   *
   * ⚠️ Two task turns, not one. The MutationObserver fires on a microtask, then
   * defers the patch itself to `requestAnimationFrame`, which the browser stub
   * drives off a timer - so a single `setTimeout(0)` lands before the patch has
   * happened and every assertion reads the unpatched DOM.
   */
  async function flush() {
    for (let turn = 0; turn < 4; turn += 1) {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
  })

  afterEach(() => {
    fixture?.destroy()
  })

  describe('naming the delete buttons of an array', () => {
    it('says what each button deletes', async () => {
      // ng-formworks renders a bare close button with no text at all, which a
      // screen reader announces as just "button"
      const host = await patch(`
        <div class="list-group-item">
          <legend>Accessory Name</legend>
          <button class="btn-close" title="Delete"></button>
        </div>
      `)

      expect(host.querySelector('button.btn-close')?.getAttribute('aria-label')).toBe('Delete Accessory Name')
    })

    it('takes the name from a heading when there is no legend', async () => {
      const host = await patch(`
        <div class="card">
          <h4>Second Device</h4>
          <button class="btn-close"></button>
        </div>
      `)

      expect(host.querySelector('button.btn-close')?.getAttribute('aria-label')).toBe('Delete Second Device')
    })

    it('prefers the legend over a heading', async () => {
      const host = await patch(`
        <fieldset>
          <legend>From The Legend</legend>
          <h4>From The Heading</h4>
          <button class="btn-close"></button>
        </fieldset>
      `)

      expect(host.querySelector('button.btn-close')?.getAttribute('aria-label')).toBe('Delete From The Legend')
    })

    it('falls back to a plain Delete when the item has no name', async () => {
      const host = await patch('<li><button class="btn-close"></button></li>')

      expect(host.querySelector('button.btn-close')?.getAttribute('aria-label')).toBe('Delete')
    })

    it('names each button after its own item, not the first one', async () => {
      // A tooltip on the wrong row is worse than none
      const host = await patch(`
        <div class="list-group-item"><legend>First</legend><button class="btn-close"></button></div>
        <div class="list-group-item"><legend>Second</legend><button class="btn-close"></button></div>
      `)

      const labels = [...host.querySelectorAll('button.btn-close')].map(button => button.getAttribute('aria-label'))
      expect(labels).toEqual(['Delete First', 'Delete Second'])
    })

    it('drops the title, so the name is not read twice', async () => {
      const host = await patch(`
        <div class="list-group-item">
          <legend>Accessory Name</legend>
          <button class="btn-close" title="Remove this item"></button>
        </div>
      `)

      expect(host.querySelector('button.btn-close')?.hasAttribute('title')).toBe(false)
    })

    it('trims a very long section title rather than reading it all out', async () => {
      const host = await patch(`
        <div class="list-group-item">
          <legend>${'A'.repeat(200)}</legend>
          <button class="btn-close"></button>
        </div>
      `)

      const label = host.querySelector('button.btn-close')?.getAttribute('aria-label') ?? ''
      expect(label.length).toBeLessThanOrEqual('Delete '.length + 80)
    })

    it('marks a button it has already named, so a re-render does not redo it', async () => {
      const host = await patch('<li><button class="btn-close"></button></li>')

      expect(host.querySelector('button.btn-close')?.getAttribute('data-jsf-a11y-delete')).toBe('true')
    })

    it('leaves an ordinary button alone', async () => {
      const host = await patch('<button class="btn btn-primary">Add Item</button>')

      expect(host.querySelector('button')?.hasAttribute('aria-label')).toBe(false)
    })
  })

  describe('checkboxes and switches read twice', () => {
    it('gives a wrapped checkbox the label text as its name', async () => {
      const host = await patch(`
        <label><input type="checkbox"><span>Enable Debug Mode</span></label>
      `)

      expect(host.querySelector('input')?.getAttribute('aria-label')).toBe('Enable Debug Mode')
    })

    it('reads a label that points at the control by id', async () => {
      const host = await patch(`
        <input type="checkbox" id="opt-1">
        <label for="opt-1">Enable Debug Mode</label>
      `)

      expect(host.querySelector('input')?.getAttribute('aria-label')).toBe('Enable Debug Mode')
    })

    it('hides the purely decorative switch graphic', async () => {
      // The slider span carries no information, but a screen reader still
      // stops on it
      const host = await patch(`
        <label><input type="checkbox"><span class="hb-uix-slider"></span><span>Enabled</span></label>
      `)

      const slider = host.querySelector('.hb-uix-slider')
      expect(slider?.getAttribute('aria-hidden')).toBe('true')
      expect(slider?.getAttribute('data-jsf-a11y-hidden')).toBe('true')
    })

    it('hides a sibling repeating the label text', async () => {
      // Which is what made every switch read its own name twice
      const host = await patch(`
        <div>
          <input type="checkbox" id="opt-2">
          <label for="opt-2">Enable Debug Mode</label>
          <span>Enable Debug Mode</span>
        </div>
      `)

      expect(host.querySelector('span')?.getAttribute('aria-hidden')).toBe('true')
    })

    it('leaves a sibling saying something different alone', async () => {
      // Help text is worth reading
      const host = await patch(`
        <div>
          <input type="checkbox" id="opt-3">
          <label for="opt-3">Enable Debug Mode</label>
          <span>Writes far more to the log</span>
        </div>
      `)

      expect(host.querySelector('span')?.hasAttribute('aria-hidden')).toBe(false)
    })

    it('leaves another control alone even when its text matches', async () => {
      // Hiding an interactive element from the accessibility tree would make it
      // unreachable
      const host = await patch(`
        <div>
          <input type="checkbox" id="opt-4">
          <label for="opt-4">Enabled</label>
          <button>Enabled</button>
        </div>
      `)

      expect(host.querySelector('button')?.hasAttribute('aria-hidden')).toBe(false)
    })

    it('keeps a name the form author set for themselves', async () => {
      const host = await patch(`
        <label aria-label="ignored"><input type="checkbox" aria-label="Set by the plugin"><span>Enabled</span></label>
      `)

      expect(host.querySelector('input')?.getAttribute('aria-label')).toBe('Set by the plugin')
    })

    it('does the same for a radio button', async () => {
      const host = await patch('<label><input type="radio"><span>Option One</span></label>')

      expect(host.querySelector('input')?.getAttribute('aria-label')).toBe('Option One')
    })

    it('also names a text field from its label', async () => {
      // ⚠️ Not a no-op, despite the comment in the source saying a "native
      // label" counts as an explicit name: `hasExplicitA11yName` only looks at
      // aria-label, aria-labelledby and title, so a `<label for>` association is
      // NOT recognised and the text gets copied onto the control as well. It is
      // the same text, so harmless - but worth pinning rather than assuming
      const host = await patch(`
        <input type="text" id="name-1">
        <label for="name-1">Name</label>
      `)

      expect(host.querySelector('input')?.getAttribute('aria-label')).toBe('Name')
    })

    it('leaves a text field with a name the author set alone', async () => {
      const host = await patch(`
        <input type="text" id="name-2" aria-label="Set by the plugin">
        <label for="name-2">Name</label>
      `)

      expect(host.querySelector('input')?.getAttribute('aria-label')).toBe('Set by the plugin')
    })

    it('leaves an unlabelled text field alone rather than inventing a name', async () => {
      const host = await patch('<input type="text">')

      expect(host.querySelector('input')?.hasAttribute('aria-label')).toBe(false)
    })

    it('does nothing for a control with no label at all', async () => {
      const host = await patch('<input type="checkbox">')

      expect(host.querySelector('input')?.hasAttribute('aria-label')).toBe(false)
      expect(host.querySelector('input')?.hasAttribute('data-jsf-a11y-processed')).toBe(false)
    })

    it('marks a control it has already handled', async () => {
      const host = await patch('<label><input type="checkbox"><span>Enabled</span></label>')

      expect(host.querySelector('input')?.getAttribute('data-jsf-a11y-processed')).toBe('true')
    })
  })

  describe('markup that arrives after the first pass', () => {
    it('patches a row the user has just added', async () => {
      // ng-formworks rebuilds parts of the form as the user edits it, so a
      // one-shot pass after render is not enough
      const host = await patch('<div class="list-group-item"><legend>First</legend><button class="btn-close"></button></div>')

      const added = document.createElement('div')
      added.className = 'list-group-item'
      added.innerHTML = '<legend>Second</legend><button class="btn-close"></button>'
      host.appendChild(added)
      await flush()

      expect(added.querySelector('button')?.getAttribute('aria-label')).toBe('Delete Second')
    })

    it('stops patching once the form has gone', async () => {
      const host = await patch('<div class="list-group-item"><legend>First</legend><button class="btn-close"></button></div>')

      fixture.destroy()
      const added = document.createElement('div')
      added.className = 'list-group-item'
      added.innerHTML = '<legend>Second</legend><button class="btn-close"></button>'
      host.appendChild(added)
      await flush()

      expect(added.querySelector('button')?.hasAttribute('aria-label')).toBe(false)
    })
  })
})
