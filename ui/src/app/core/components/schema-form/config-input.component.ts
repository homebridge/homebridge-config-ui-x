import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core'
import { JsonSchemaFormModule } from '@ng-formworks/core'
import { TranslatePipe } from '@ngx-translate/core'

const secretName = /password|passwd|passphrase|secret|token|apikey|privatekey|authorization|credential|^(?:pin|pincode|cookie)$/i

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
    return node.type === 'password' || secretName.test(name.replace(/[-_\s]/g, ''))
  })

  // Keep the library's input, validators and form control alive when toggling.
  readonly inputLayout = computed(() => {
    const node = this.layoutNode()
    if (!this.isSecret()) {
      return node
    }
    return {
      ...node,
      type: this.revealed() ? 'text' : 'password',
      options: {
        ...node.options,
        'fieldHtmlClass': `${node.options?.fieldHtmlClass || ''} pe-5`,
        'x-inputAttributes': {
          ...node.options?.['x-inputAttributes'],
          spellcheck: 'false',
          autocapitalize: 'off',
          autocorrect: 'off',
        },
      },
    }
  })
}
