import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { UpdateAllProgressComponent } from '@/app/core/update-all/update-all-progress.component'
import { UpdateAllPlan, UpdateAllPlanItem } from '@/app/core/update-all/update-all.interfaces'
import { HttpErrorService } from '@/app/core/utilities/http-error.service'

/**
 * The Update All plan/confirm modal. Fetches the plan from the server, lets
 * the user untick anything, and starts the run. The server re-validates the
 * confirmed list against a fresh plan, so this component never chooses
 * versions - it only echoes the plan's `to` back.
 */
@Component({
  selector: 'app-update-all-modal',
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './update-all-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateAllModalComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $errors = inject(HttpErrorService)
  private $modal = inject(NgbModal)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public readonly defaultIcon = 'assets/hb-icon.png'
  public readonly loading = signal(true)
  public readonly starting = signal(false)
  public readonly plan = signal<UpdateAllPlan>({ items: [], needsReview: [], skipped: [] })
  public readonly showNeedsReview = signal(false)
  public readonly showSkipped = signal(false)

  // Names the user has unticked - everything in the plan is ticked by default
  private readonly unticked = signal<ReadonlySet<string>>(new Set())

  public readonly selectedCount = computed(() => this.plan().items.filter(x => !this.unticked().has(x.name)).length)

  /**
   * What the finale will restart for the CURRENT selection, mirroring its
   * rules: Homebridge itself or any main-bridge plugin → one Homebridge
   * restart (which covers every child bridge, so none are counted then);
   * otherwise just the child bridges of the selected plugins. The UI
   * restarting itself is independent of both.
   */
  public readonly restartPlan = computed(() => {
    const selected = this.plan().items.filter(x => !this.unticked().has(x.name))
    const ui = selected.some(x => x.type === 'ui')
    const homebridge = selected.some(x => x.type === 'homebridge'
      || (x.type === 'plugin' && (x.childBridgeUsernames?.length ?? 0) === 0))
    const childBridgeCount = homebridge
      ? 0
      : new Set(selected.flatMap(x => x.childBridgeUsernames ?? [])).size
    return { ui, homebridge, childBridgeCount }
  })

  // As computeds rather than inline length checks: the prefer-at-else lint
  // fix pattern-matches an inline `.length > 0` as the opposite of the item
  // list's `.length === 0` and folds the section into that @else, silently
  // dropping the guard.
  public readonly hasNeedsReview = computed(() => this.plan().needsReview.length > 0)
  public readonly hasSkipped = computed(() => this.plan().skipped.length > 0)

  public ngOnInit(): void {
    void this.loadPlan()
  }

  private async loadPlan(): Promise<void> {
    try {
      this.plan.set(await this.$api.get<UpdateAllPlan>('/update-all/plan'))
      this.loading.set(false)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.$activeModal.dismiss('Dismiss')
    }
  }

  public handleIconError(item: UpdateAllPlanItem): void {
    item.icon = this.defaultIcon
  }

  public isTicked(name: string): boolean {
    return !this.unticked().has(name)
  }

  public toggleItem(name: string): void {
    const next = new Set(this.unticked())
    if (next.has(name)) {
      next.delete(name)
    } else {
      next.add(name)
    }
    this.unticked.set(next)
  }

  public async confirm(): Promise<void> {
    if (this.selectedCount() === 0 || this.starting()) {
      return
    }
    this.starting.set(true)
    const items = this.plan().items.filter(x => this.isTicked(x.name)).map(x => ({ name: x.name, to: x.to }))

    try {
      await this.$api.post('/update-all/start', { items })
      this.$activeModal.close('started')
      this.$modal.open(UpdateAllProgressComponent, {
        size: 'lg',
        backdrop: 'static',
      })
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.starting.set(false)
    }
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }
}
