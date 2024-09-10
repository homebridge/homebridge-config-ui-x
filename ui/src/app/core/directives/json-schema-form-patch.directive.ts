import { Directive, Host, Input, Optional, Self } from '@angular/core'
import { JsonSchemaFormComponent } from '@oznu/ngx-bs4-jsonform'
import { cloneDeep, merge, uniqueId } from 'lodash-es'

@Directive({
  selector: '[jsfPatch]',
})
export class JsonSchemaFormPatchDirective {
  @Input() jsfPatch = false

  constructor(
    @Host() @Self() @Optional() public jsonSchemaForm: JsonSchemaFormComponent,
  ) {
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
      const ref = item.items.find(x => x.type === '$ref')
      if (ref) {
        const dataItems = item.items.filter(x => x.type === 'section' || x.type === 'div')

        const template = dataItems.length > 0
          ? dataItems.reduce((a, b) => a.id > b.id ? a : b)
          : this.getItemTemplateFromRef(ref)

        const data = this.getDataFromPointer(formData, ref.dataPointer.replace(refPointer, ''))

        if (data === null) {
          return
        }

        if (Array.isArray(data)) {
          // add missing items
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

      item.items.filter(i => i.items && Array.isArray(i.items)).forEach((i) => {
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
