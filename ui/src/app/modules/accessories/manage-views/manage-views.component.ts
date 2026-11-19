import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AccessoryView } from '@/app/core/accessories/filters/accessory-views'

type ChipList = 'pinned' | 'excluded'

const CHIP_LISTS: ChipList[] = ['pinned', 'excluded']

/**
 * Rename, reorder, share and delete the saved views, and edit which accessories each one
 * pins or excludes. Views shared by someone else are shown read-only.
 */
@Component({
  selector: 'app-manage-views',
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './manage-views.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageViewsComponent {
  private $activeModal = inject(NgbActiveModal)
  protected readonly $accessories = inject(AccessoriesService)

  public readonly views = this.$accessories.views

  /** Every accessory on the page, by uniqueId */
  private readonly serviceNames = computed(() => new Map(
    this.$accessories.rooms()
      .flatMap(room => room.services)
      .filter(service => !!service.uniqueId)
      .map(service => [service.uniqueId!, service.customName || service.serviceName || service.uniqueId!]),
  ))

  /** The accessories a view's list can still take */
  public readonly accessoryOptions = computed(() => [
    ...this.serviceNames().entries(),
  ]
    .map(([uniqueId, name]) => ({ uniqueId, name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })))

  public readonly chipLists = CHIP_LISTS

  public isOwn(view: AccessoryView): boolean {
    return this.$accessories.isOwnView(view)
  }

  public nameOf(uniqueId: string): string {
    return this.serviceNames().get(uniqueId) ?? uniqueId
  }

  /** Accessories not yet in this view's list */
  public optionsFor(view: AccessoryView, list: ChipList): Array<{ uniqueId: string, name: string }> {
    const taken = new Set(view[list] ?? [])
    return this.accessoryOptions().filter(option => !taken.has(option.uniqueId))
  }

  public isFirst(view: AccessoryView): boolean {
    return this.views().indexOf(view) === 0
  }

  public isLast(view: AccessoryView): boolean {
    return this.views().indexOf(view) === this.views().length - 1
  }

  /** Rename on blur or Enter. A blank name puts the old one back. */
  public rename(view: AccessoryView, event: Event): void {
    const input = event.target as HTMLInputElement
    const name = input.value.trim()
    if (!name) {
      input.value = view.name
      return
    }
    if (name !== view.name) {
      this.$accessories.updateView(view.id, { name })
    }
  }

  public move(view: AccessoryView, direction: -1 | 1): void {
    this.$accessories.reorderViews(view.id, direction)
  }

  public remove(view: AccessoryView): void {
    this.$accessories.deleteView(view.id)
  }

  public toggleShare(view: AccessoryView): void {
    this.$accessories.toggleShare(view.id)
  }

  /** Add an accessory to a list from its select. Pinning takes it off the excluded list, and the reverse. */
  public add(view: AccessoryView, list: ChipList, event: Event): void {
    const select = event.target as HTMLSelectElement
    const uniqueId = select.value
    select.value = ''
    if (!uniqueId) {
      return
    }
    const other: ChipList = list === 'pinned'
      ? 'excluded'
      : 'pinned'
    this.$accessories.updateView(view.id, {
      [list]: [
        ...new Set([
          ...(view[list] ?? []),
          uniqueId,
        ]),
      ],
      [other]: (view[other] ?? []).filter(entry => entry !== uniqueId),
    })
  }

  public removeChip(view: AccessoryView, list: ChipList, uniqueId: string): void {
    this.$accessories.updateView(view.id, {
      [list]: (view[list] ?? []).filter(entry => entry !== uniqueId),
    })
  }

  /** Keep Enter in a box from doing anything more than commit its edit */
  public blur(event: Event): void {
    (event.target as HTMLElement).blur()
  }

  public close(): void {
    this.$activeModal.close()
  }
}
