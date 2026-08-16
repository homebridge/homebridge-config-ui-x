import { ChangeDetectionStrategy, Component, input } from '@angular/core'

/**
 * One row of an Update All list: the plugin's icon, its name, and a line
 * saying what is happening to it. The confirm modal and the progress modal
 * both render this, so the two lists cannot drift apart - only the right-hand
 * slot differs between them (a toggle while choosing, a status while running).
 */
@Component({
  selector: 'app-update-all-item-row',
  standalone: true,
  templateUrl: './update-all-item-row.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateAllItemRowComponent {
  public readonly displayName = input.required<string>()
  public readonly icon = input<string | null | undefined>(null)

  /**
   * The already-translated line under the name, saying what is happening to
   * this item. It carries the version jump too when that is worth showing, so
   * the row is two lines rather than three.
   */
  public readonly note = input<string | null>(null)

  /** The Homebridge logo, used for the UI and Homebridge themselves and for any plugin without an icon */
  public readonly defaultIcon = 'assets/hb-icon.png'

  public handleIconError(event: Event): void {
    (event.target as HTMLImageElement).src = this.defaultIcon
  }
}
