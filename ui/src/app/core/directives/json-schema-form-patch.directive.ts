import { AfterViewInit, Directive, ElementRef, inject, Input, OnDestroy } from '@angular/core'
import { JsonSchemaFormComponent } from '@ng-formworks/core'
import { cloneDeep, merge, uniqueId } from 'lodash-es'

@Directive({
  selector: '[jsfPatch]',
  standalone: true,
})
export class JsonSchemaFormPatchDirective implements AfterViewInit, OnDestroy {
  private host = inject(ElementRef<HTMLElement>)
  jsonSchemaForm = inject(JsonSchemaFormComponent, { host: true, self: true, optional: true })

  private observer?: MutationObserver
  private patchingInProgress = false

  @Input() jsfPatch = false

  constructor() {
    const jsonSchemaForm = this.jsonSchemaForm
    if (!jsonSchemaForm) {
      return
    }

    const buildLayoutOriginal = jsonSchemaForm.jsf.buildLayout.bind(jsonSchemaForm.jsf)

    jsonSchemaForm.jsf.buildLayout = (widgetLibrary: any) => {
      buildLayoutOriginal(widgetLibrary)
      if (jsonSchemaForm.jsf.formValues && this.jsfPatch) {
        return this.fixNestedArrayLayout(
          jsonSchemaForm.jsf.layout,
          jsonSchemaForm.jsf.formValues,
        )
      }
    }
  }

  public ngAfterViewInit(): void {
    this.patchAccessibility()

    let scheduled = false
    this.observer = new MutationObserver((mutations) => {
      if (this.patchingInProgress) {
        return
      }

      // Ignore churn in big popup/dropdown menus (ng-bootstrap / overlays)
      for (const m of mutations) {
        const t = m.target as HTMLElement | null
        if (!t?.closest) {
          continue
        }
        if (
          t.closest('.dropdown-menu')
          || t.closest('ngb-typeahead-window')
          || t.closest('.cdk-overlay-container')
          || t.closest('[role="listbox"]')
        ) {
          return
        }
      }

      if (scheduled) {
        return
      }
      scheduled = true

      requestAnimationFrame(() => {
        scheduled = false
        this.patchAccessibility()
      })
    })

    this.observer.observe(this.host.nativeElement, {
      childList: true,
      subtree: true,
    })
  }

  public ngOnDestroy(): void {
    this.observer?.disconnect()
    this.observer = undefined
  }

  private patchAccessibility() {
    if (this.patchingInProgress) {
      return
    }

    this.patchingInProgress = true
    const root = this.host.nativeElement

    this.patchExpandableFieldsetLegends(root)
    this.patchDeleteButtons(root)
    this.patchCheckboxRadioDuplicateText(root)
    this.patchBasicControlNames(root)

    this.patchingInProgress = false
  }

  private patchExpandableFieldsetLegends(root: HTMLElement) {
    const fieldsets = root.querySelectorAll('fieldset')

    fieldsets.forEach((fs) => {
      const fieldset = fs as HTMLFieldSetElement
      const legend = fieldset.querySelector('legend') as HTMLLegendElement | null
      if (!legend) {
        return
      }

      const titleText = this.cleanSectionTitle((legend.textContent || '').trim())
      if (!titleText) {
        return
      }

      const realToggle
        = (legend.querySelector('button') as HTMLElement | null)
          || (legend.querySelector('a') as HTMLElement | null)
          || (legend.querySelector('[data-bs-toggle="collapse"]') as HTMLElement | null)
          || (legend.querySelector('[aria-expanded]') as HTMLElement | null)
          || (legend as unknown as HTMLElement)

      const collapseBody = this.findCollapseBody(fieldset, realToggle)

      let proxy = fieldset.querySelector(':scope > button.jsf-fieldset-proxy') as HTMLButtonElement | null

      if (!proxy) {
        proxy = document.createElement('button')
        proxy.type = 'button'
        proxy.className = 'jsf-fieldset-proxy visually-hidden-focusable'
        fieldset.insertBefore(proxy, fieldset.firstChild)

        proxy.addEventListener('click', (e) => {
          e.preventDefault()
          realToggle.click()
          window.setTimeout(() => {
            this.syncProxyExpanded(fieldset, proxy!, realToggle, collapseBody)
          }, 0)
        })

        proxy.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            proxy!.click()
          }
        })
      }

      proxy.textContent = titleText
      proxy.setAttribute('role', 'button')
      proxy.setAttribute('tabindex', '0')
      proxy.setAttribute('aria-label', titleText)
      proxy.removeAttribute('aria-describedby')

      if (collapseBody) {
        if (!collapseBody.id) {
          collapseBody.id = `jsf_collapse_${Math.random().toString(36).slice(2)}`
        }
        proxy.setAttribute('aria-controls', collapseBody.id)
      } else {
        proxy.removeAttribute('aria-controls')
      }

      fieldset.setAttribute('role', 'presentation')
      legend.setAttribute('aria-hidden', 'true')
      legend.querySelectorAll<HTMLElement>('button, a, [tabindex]').forEach((el) => {
        el.setAttribute('tabindex', '-1')
      })

      this.syncProxyExpanded(fieldset, proxy, realToggle, collapseBody)

      // NOTE: We intentionally do NOT add per-fieldset MutationObservers here.
      // The root observer will trigger patchAccessibility() as needed, and this avoids
      // observer proliferation in very large/dynamic forms.
    })
  }

  private syncProxyExpanded(
    fieldset: HTMLElement,
    proxy: HTMLButtonElement,
    realToggle: HTMLElement | null,
    collapseBody: HTMLElement | null,
  ) {
    const expanded = this.getExpandedState(fieldset, collapseBody, realToggle)
    const next = expanded ? 'true' : 'false'
    if (proxy.getAttribute('aria-expanded') !== next) {
      proxy.setAttribute('aria-expanded', next)
    }
  }

  private findCollapseBody(fieldset: HTMLElement, realToggle: HTMLElement | null): HTMLElement | null {
    if (realToggle) {
      const ariaControls = realToggle.getAttribute('aria-controls')
      if (ariaControls) {
        const el = document.getElementById(ariaControls)
        if (el) {
          return el as HTMLElement
        }
      }

      const dataTarget = realToggle.getAttribute('data-bs-target') || realToggle.getAttribute('data-target')
      if (dataTarget && dataTarget.startsWith('#')) {
        const el = document.getElementById(dataTarget.slice(1))
        if (el) {
          return el as HTMLElement
        }
      }
    }

    return (fieldset.querySelector(':scope .collapse') as HTMLElement | null)
  }

  private getExpandedState(fieldset: HTMLElement, collapseBody: HTMLElement | null, realToggle: HTMLElement | null) {
    const toggleExpanded = realToggle?.getAttribute('aria-expanded')
    if (toggleExpanded === 'true') {
      return true
    }
    if (toggleExpanded === 'false') {
      return false
    }

    if (realToggle?.classList.contains('collapsed')) {
      return false
    }

    if (collapseBody) {
      return collapseBody.classList.contains('show')
    }

    return this.isFieldsetExpanded(fieldset)
  }

  private isFieldsetExpanded(fieldset: HTMLElement) {
    const controls = fieldset.querySelectorAll('input, select, textarea, button, a')
    for (const el of Array.from(controls)) {
      const h = el as HTMLElement
      if (this.isVisiblyRendered(h)) {
        if (h.tagName.toLowerCase() === 'legend') {
          continue
        }
        if (h.classList.contains('jsf-fieldset-proxy')) {
          continue
        }
        return true
      }
    }
    return false
  }

  private isVisiblyRendered(el: HTMLElement) {
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false
    }
    if (el.getAttribute('aria-hidden') === 'true') {
      return false
    }
    return el.getClientRects().length > 0
  }

  private patchDeleteButtons(root: HTMLElement) {
    const closeButtons = root.querySelectorAll('button.btn-close')

    closeButtons.forEach((btn) => {
      const b = btn as HTMLButtonElement

      if (b.hasAttribute('data-jsf-a11y-delete')) {
        return
      }

      const itemName = this.findNearestItemName(b, root)
      b.setAttribute('aria-label', itemName ? `Delete ${itemName}` : 'Delete')
      b.removeAttribute('title')
      b.setAttribute('data-jsf-a11y-delete', 'true')
    })
  }

  private findNearestItemName(btn: HTMLElement, root: HTMLElement) {
    const container
      = btn.closest('.list-group-item')
        || btn.closest('.card')
        || btn.closest('li')
        || btn.closest('fieldset')
        || btn.parentElement

    const scope = (container as HTMLElement) || root

    const legend = scope.querySelector('legend') as HTMLElement | null
    if (legend) {
      const t = this.cleanSectionTitle((legend.textContent || '').trim())
      if (t) {
        return t
      }
    }

    const heading = scope.querySelector('h1, h2, h3, h4, h5, h6') as HTMLElement | null
    if (heading) {
      const t = this.cleanSectionTitle((heading.textContent || '').trim())
      if (t) {
        return t
      }
    }

    return ''
  }

  private cleanSectionTitle(raw: string) {
    let t = (raw || '').replace(/^[\s\uF0D7\uF0D8\uF0A7\uF0A8]+/g, '').trim()
    t = t.replace(/\s+clickable\s*$/i, '').trim()
    if (t.length > 80) {
      t = t.slice(0, 80).trim()
    }
    return t
  }

  private patchCheckboxRadioDuplicateText(root: HTMLElement) {
    const inputs = root.querySelectorAll('input')

    inputs.forEach((el) => {
      const control = el as HTMLInputElement
      const type = (control.getAttribute('type') || '').toLowerCase()

      if (type !== 'checkbox' && type !== 'radio') {
        return
      }

      if (control.hasAttribute('data-jsf-a11y-processed')) {
        return
      }

      const labelFor
        = control.id
          ? (root.querySelector(`label[for="${control.id}"]`) as HTMLLabelElement | null)
          : null

      const labelWrap = control.closest('label') as HTMLLabelElement | null

      const labelEl = labelFor || labelWrap
      const labelText = this.getLabelText(labelEl)

      if (!labelText) {
        return
      }

      if (!this.hasExplicitA11yName(control)) {
        control.setAttribute('aria-label', labelText)
      }

      control.setAttribute('data-jsf-a11y-processed', 'true')

      if (labelWrap && labelWrap.contains(control)) {
        labelWrap.querySelectorAll<HTMLElement>('*').forEach((node) => {
          if (node === control) {
            return
          }
          if (node.contains(control)) {
            return
          }
          if (node.hasAttribute('data-jsf-a11y-hidden')) {
            return
          }

          const isPurelyVisual
            = node.classList.contains('hb-uix-slider')
              || node.classList.contains('hb-uix-round')

          if (isPurelyVisual) {
            node.setAttribute('aria-hidden', 'true')
            node.setAttribute('data-jsf-a11y-hidden', 'true')
          }
        })
      }

      const parent = control.parentElement
      if (parent) {
        Array.from(parent.children).forEach((sibling) => {
          if (!(sibling instanceof HTMLElement)) {
            return
          }
          if (sibling === control) {
            return
          }
          if (labelEl && sibling === labelEl) {
            return
          }
          if (sibling.hasAttribute('data-jsf-a11y-hidden')) {
            return
          }
          if (this.isInteractiveElement(sibling)) {
            return
          }

          const siblingText = (sibling.textContent || '').trim()
          if (!siblingText) {
            return
          }

          if (siblingText === labelText) {
            sibling.setAttribute('aria-hidden', 'true')
            sibling.setAttribute('data-jsf-a11y-hidden', 'true')
          }
        })
      }
    })
  }

  private getLabelText(labelEl: HTMLLabelElement | null): string {
    if (!labelEl) {
      return ''
    }

    return (labelEl.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private hasExplicitA11yName(el: HTMLElement): boolean {
    const ariaLabel = el.getAttribute('aria-label')
    if (ariaLabel && ariaLabel.trim()) {
      return true
    }

    const ariaLabelledby = el.getAttribute('aria-labelledby')
    if (ariaLabelledby && ariaLabelledby.trim()) {
      return true
    }

    const title = el.getAttribute('title')
    return !!(title && title.trim())
  }

  private isInteractiveElement(el: HTMLElement): boolean {
    const tagName = el.tagName.toLowerCase()

    if (['a', 'button', 'input', 'select', 'textarea'].includes(tagName)) {
      return true
    }

    const tabindex = el.getAttribute('tabindex')
    if (tabindex !== null && Number.parseInt(tabindex, 10) >= 0) {
      return true
    }

    const role = el.getAttribute('role')
    return role && ['button', 'link', 'menuitem', 'tab', 'option'].includes(role)
  }

  private patchBasicControlNames(root: HTMLElement) {
    const controls = root.querySelectorAll('input, select, textarea')

    controls.forEach((controlEl) => {
      const control = controlEl as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

      if (control instanceof HTMLInputElement) {
        const type = (control.getAttribute('type') || '').toLowerCase()
        if (type === 'checkbox' || type === 'radio') {
          return
        }
      }

      if (control.hasAttribute('data-jsf-a11y-labeled')) {
        return
      }

      // If it already has a name (native label, aria-labelledby, aria-label, etc.), do nothing.
      if (this.hasExplicitA11yName(control)) {
        control.setAttribute('data-jsf-a11y-labeled', 'true')
        return
      }

      // Prefer external label text if present
      let labelText = ''
      if (control.id) {
        const label = root.querySelector(`label[for="${control.id}"]`) as HTMLLabelElement | null
        labelText = (label?.textContent || '').trim()
      }

      if (!labelText) {
        const wrap = control.closest('label') as HTMLLabelElement | null
        labelText = this.getLabelText(wrap)
      }

      if (!labelText) {
        return
      }

      control.setAttribute('aria-label', labelText)
      control.setAttribute('data-jsf-a11y-labeled', 'true')
    })
  }

  private fixNestedArrayLayout(builtLayout: any[], formData: any) {
    this.fixArray(builtLayout, formData, '')
    return builtLayout
  }

  private fixArray(items: any | any[], formData: any, refPointer: string) {
    if (Array.isArray(items)) {
      const configItems = items.filter(x => x.name !== '_bridge')
      const nestedItems = configItems
        .filter(x => x.items && Array.isArray(x.items))
        .flatMap(x => x.items)
        .filter(x => x.dataType === 'array' || x.arrayItem)

      const allItems = configItems.concat(nestedItems)
      allItems.filter(x => x.dataType === 'array' || x.arrayItem).forEach((item) => {
        this.fixNestedArray(item, formData, refPointer)
      })
    } else {
      this.fixNestedArray(items, formData, refPointer)
    }
  }

  private fixNestedArray(item: any, formData: any, refPointer: string) {
    if (item.items && Array.isArray(item.items)) {
      const ref = item.items.find((x: any) => x.type === '$ref')
      if (ref) {
        const dataItems = item.items.filter((x: any) => x.type === 'section' || x.type === 'div')

        const template = dataItems.length > 0
          ? dataItems.reduce((a: any, b: any) => a.id > b.id ? a : b)
          : this.getItemTemplateFromRef(ref)

        const data = this.getDataFromPointer(formData, ref.dataPointer.replace(refPointer, ''))

        if (data === null) {
          return
        }

        if (Array.isArray(data)) {
          // Add missing items
          while (item.items.length - 1 < data.length) {
            const newItem = cloneDeep(template)
            newItem._id = uniqueId('new_')

            item.items.unshift(newItem)
          }

          data.forEach((d: any, index: number) => {
            this.fixArray(item.items[index], d, ref.dataPointer)
          })
        } else {
          this.fixArray(item.items, formData, ref.dataPointer)
        }
      } else {
        this.fixArray(item.items, formData, refPointer)
      }

      item.items.filter((i: any) => i.items && Array.isArray(i.items)).forEach((i: any) => {
        this.fixArray(i.items, formData, refPointer)
      })
    }
  }

  private getDataFromPointer(data: any, dataPointer: string) {
    let value = data

    dataPointer.substring(1).split(/\//).filter(x => x !== '-').forEach((key: string) => {
      try {
        value = value[key]
      } catch {
        value = null
      }
    })

    return value
  }

  private getItemTemplateFromRef(ref: any) {
    const templateNode: { type: string, items: any[] } = {
      type: 'section',
      items: [],
    }

    const item = cloneDeep(ref)
    merge(item, templateNode)
    return item
  }
}
