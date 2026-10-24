import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core'
import { JsonSchemaFormModule } from '@ng-formworks/core'
import { TranslatePipe } from '@ngx-translate/core'

import { isSecretKey } from '@/app/core/helpers/config-redaction.helper'

@Component({
  selector: 'app-config-input',
  imports: [JsonSchemaFormModule, TranslatePipe],
  standalone: true,
  templateUrl: './config-input.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigInputComponent {
  readonly layoutNode = input.required<any>()
  readonly layoutIndex = input.required<number[]>()
  readonly dataIndex = input.required<number[]>()
  readonly revealed = signal(false)
  readonly isSecret = computed(() => {
    const node = this.layoutNode()
    const name = String(node.name || node.dataPointer?.split('/').at(-1) || '')
    // The same name test as the JSON config page, so both hide the same fields
    return node.type === 'password' || isSecretKey(name)
  })

  // Named on the eye button, so a screen reader can tell one secret field's button from another's
  readonly fieldLabel = computed(() => {
    const node = this.layoutNode()
    return String(node.options?.title || node.name || node.dataPointer?.split('/').at(-1) || '')
  })

  // Keep the library's input, validators and form control alive when toggling.
  readonly inputLayout = computed(() => {
    const node = this.layoutNode()
    if (!this.isSecret()) {
      return node
    }
    return {
      ...node,
      type: this.revealed()
        ? 'text'
        : 'password',
      options: {
        ...node.options,
        'fieldHtmlClass': `${node.options?.fieldHtmlClass || ''} pe-5`,
        'x-inputAttributes': {
          ...node.options?.['x-inputAttributes'],
          spellcheck: 'false',
          autocapitalize: 'off',
          autocorrect: 'off',
          // A password box invites browsers and password managers to fill in a
          // saved login, which would be the Homebridge one - this asks them not to
          autocomplete: 'new-password',
        },
      },
    }
  })
}
