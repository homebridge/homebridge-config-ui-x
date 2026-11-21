import { ChangeDetectionStrategy, Component, input, model } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ACCESSORY_CATEGORIES, ACCESSORY_SUBCATEGORIES } from '@/app/core/accessories/filters/accessory-categories'
import { KioskScope } from '@/app/modules/kiosk/kiosk-scope'

/**
 * Picks a kiosk scope: rooms, categories (with their subcategories under a picked category) and labels.
 * Shared by the tablet and kiosk dialogs so they look and behave the same. Emits the whole new scope on each change.
 */
@Component({
  selector: 'app-scope-picker',
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './scope-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScopePickerComponent {
  /** The scope being picked. Each pick sets it, and the two-way binding reports it to the parent. */
  public readonly scope = model.required<KioskScope>()
  /** The rooms to offer */
  public readonly rooms = input<string[]>([])
  /** The labels to offer */
  public readonly labels = input<string[]>([])

  protected readonly categories = ACCESSORY_CATEGORIES
  protected readonly subcategoriesOf = ACCESSORY_SUBCATEGORIES

  /** Whether a value is picked in one of the scope lists */
  protected isPicked(list: keyof KioskScope, value: string): boolean {
    return this.scope()[list].includes(value)
  }

  protected toggleRoom(room: string): void {
    this.emit({
      ...this.scope(),
      rooms: this.toggle(this.scope().rooms, room),
    })
  }

  protected toggleLabel(label: string): void {
    this.emit({
      ...this.scope(),
      labels: this.toggle(this.scope().labels, label),
    })
  }

  protected toggleCategory(category: string): void {
    const current = this.scope()
    const categories = this.toggle(current.categories, category)
    // Subcategories belong to their category, so dropping a category drops its subcategories
    const own = ACCESSORY_SUBCATEGORIES[category as keyof typeof ACCESSORY_SUBCATEGORIES] as readonly string[]
    const subcategories = categories.includes(category)
      ? current.subcategories
      : current.subcategories.filter(entry => !own.includes(entry))
    this.emit({ ...current, categories, subcategories })
  }

  protected toggleSubcategory(subcategory: string): void {
    this.emit({
      ...this.scope(),
      subcategories: this.toggle(this.scope().subcategories, subcategory),
    })
  }

  /** Subcategories shown under a picked category */
  protected subcategoriesFor(category: string): readonly string[] {
    return this.subcategoriesOf[category as keyof typeof ACCESSORY_SUBCATEGORIES] ?? []
  }

  private toggle(values: string[], value: string): string[] {
    return values.includes(value)
      ? values.filter(entry => entry !== value)
      : [...values, value]
  }

  private emit(scope: KioskScope): void {
    this.scope.set(scope)
  }
}
