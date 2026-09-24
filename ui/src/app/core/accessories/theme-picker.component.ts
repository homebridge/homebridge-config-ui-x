import type { OnChanges, OnInit } from '@angular/core'

import type { SharedThemeFavorites, ThemeAction } from './theme-picker.model'

import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, inject, input, TemplateRef, viewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'

import { ApiService } from '@/app/core/communication/api.service'
import { SettingsService } from '@/app/core/ui/settings.service'

import { ServiceTypeX } from './accessories.interfaces'
import { AccessoriesService } from './accessories.service'
import { MAX_THEME_FAVORITES, sharedFavoritesCharacteristic, sharedThemeFavorites, themeActions, themeMetadata } from './theme-picker.model'

@Component({
  selector: 'app-theme-picker',
  imports: [FormsModule, TranslatePipe],
  standalone: true,
  templateUrl: './theme-picker.component.html',
  styleUrl: './theme-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemePickerComponent implements OnChanges, OnInit {
  readonly service = input.required<ServiceTypeX>()
  readonly search = viewChild<ElementRef<HTMLInputElement>>('search')
  readonly opener = viewChild<ElementRef<HTMLButtonElement>>('opener')
  readonly catalog = viewChild.required<TemplateRef<unknown>>('catalog')
  readonly settings = inject(SettingsService)
  private modal = inject(NgbModal)
  private modalRef?: NgbModalRef
  private accessories = inject(AccessoriesService)
  private api = inject(ApiService)
  private translate = inject(TranslateService)
  private cdr = inject(ChangeDetectorRef)
  private destroy = inject(DestroyRef)
  enabled = false
  actions: ThemeAction[] = []
  favorites: string[] = []
  open = false
  editing = false
  busy = false
  busyLabel = ''
  query = ''
  onlyFavorites = false
  error = ''
  lastSent = ''
  shared = false
  sharedState?: SharedThemeFavorites
  private sharedSourceId?: string

  ngOnChanges() {
    this.refresh()
  }

  ngOnInit() {
    this.destroy.onDestroy(() => this.modalRef?.dismiss())
    this.accessories.accessoryData.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => {
      this.refresh()
      this.cdr.markForCheck()
    })
  }

  private refresh() {
    const source = this.accessories.accessories.services.find(item => item.uniqueId === this.service().uniqueId) as ServiceTypeX | undefined
    this.enabled = themeMetadata(source ?? this.service())?.role === 'source'
    this.actions = source ? themeActions(source, this.accessories.accessories.services) : []
    const current = source ?? this.service()
    if (this.sharedSourceId !== current.uniqueId) {
      this.sharedState = undefined
      this.sharedSourceId = current.uniqueId
    }
    this.shared = !!sharedFavoritesCharacteristic(current)
    const remote = sharedThemeFavorites(current)
    if (remote && (!this.sharedState || remote.revision >= this.sharedState.revision)) {
      this.sharedState = remote
    }
    if (this.shared) {
      if (!this.busy) {
        this.favorites = [...(this.sharedState?.ids ?? [])]
      }
      return
    }
    const saved = this.accessories.rooms().flatMap(room => room.services).find(item => item.uniqueId === this.service().uniqueId)?.themeFavorites
    if (!this.busy) {
      this.favorites = Array.isArray(saved) ? [...new Set(saved.filter(id => typeof id === 'string' && /^[a-f\d]{64}$/.test(id)))] : []
    }
  }

  get favoriteActions() {
    return this.actions.filter(action => this.favorites.includes(action.id))
  }

  get missingFavorites() {
    return this.favorites.filter(id => !this.actions.some(action => action.id === id)).length
  }

  get filtered() {
    const query = this.query.trim().toLocaleLowerCase()
    return this.actions.filter(action => (!this.onlyFavorites || this.favorites.includes(action.id))
      && action.name.toLocaleLowerCase().includes(query))
  }

  show(editing = false) {
    if (this.modalRef) {
      return
    }
    this.open = true
    this.editing = editing
    this.query = ''
    this.onlyFavorites = false
    this.modalRef = this.modal.open(this.catalog(), { size: 'md', ariaLabelledBy: 'theme-catalog-title' })
    const closed = () => {
      this.open = false
      this.modalRef = undefined
      this.cdr.markForCheck()
      this.opener()?.nativeElement.focus()
    }
    void this.modalRef.result.then(closed, closed)
  }

  close() {
    this.modalRef?.close()
  }

  async apply(action: ThemeAction) {
    if (this.busy) {
      return
    }
    this.refresh()
    const current = this.actions.find(item => item.id === action.id)
    if (!current) {
      this.error = this.translate.instant('accessories.themes.theme_unavailable')
      return
    }
    this.busy = true
    this.busyLabel = this.translate.instant('accessories.themes.sending')
    this.error = ''
    try {
      await this.api.put(`/accessories/${encodeURIComponent(current.service.uniqueId!)}`, { characteristicType: current.characteristicType ?? 'On', value: current.characteristicType ? current.id : true }, { timeout: 10000 })
      this.lastSent = current.name
      this.close()
    } catch {
      this.error = this.translate.instant('accessories.themes.command_unconfirmed')
    } finally {
      this.busy = false
      this.cdr.markForCheck()
    }
  }

  async toggleFavorite(action: ThemeAction) {
    if (this.busy) {
      return
    }
    if (this.shared) {
      await this.saveSharedFavorite(action)
      return
    }
    const target = this.accessories.rooms().flatMap(room => room.services).find(item => item.uniqueId === this.service().uniqueId)
    if (!target) {
      this.error = this.translate.instant('accessories.themes.lamp_unavailable')
      return
    }
    const previous = target.themeFavorites
    const next = this.favorites.includes(action.id) ? this.favorites.filter(id => id !== action.id) : [...this.favorites, action.id]
    target.themeFavorites = next
    this.busy = true
    this.busyLabel = this.translate.instant('accessories.themes.saving')
    this.error = ''
    await new Promise<void>((resolve) => {
      this.accessories.saveLayout(() => {
        this.favorites = next
        resolve()
      }, () => {
        target.themeFavorites = previous
        for (const room of this.accessories.accessoryLayout) {
          for (const item of room.services) {
            if (item.uniqueId === target.uniqueId) {
              item.themeFavorites = previous
            }
          }
        }
        const current = this.accessories.rooms().flatMap(room => room.services).find(item => item.uniqueId === this.service().uniqueId)
        if (current) {
          current.themeFavorites = previous
        }
        this.error = this.translate.instant('accessories.themes.save_failed')
        resolve()
      })
    })
    this.busy = false
    this.cdr.markForCheck()
  }

  private acceptShared(service: ServiceTypeX) {
    const state = sharedThemeFavorites(service)
    if (!state) {
      throw new Error('Shared favorites unavailable')
    }
    if (!this.sharedState || state.revision >= this.sharedState.revision) {
      this.sharedState = state
    }
    this.favorites = [...this.sharedState.ids]
    return state
  }

  private async saveSharedFavorite(action: ThemeAction) {
    const remove = this.favorites.includes(action.id)
    const endpoint = `/accessories/${encodeURIComponent(this.service().uniqueId!)}`
    this.busy = true
    this.busyLabel = this.translate.instant('accessories.themes.saving')
    this.error = ''
    let expected: string[] | undefined
    try {
      // Read first so a lost earlier response cannot become a stale overwrite.
      const state = this.acceptShared(await this.api.get<ServiceTypeX>(endpoint, { timeout: 10000 }))
      expected = remove ? state.ids.filter(id => id !== action.id) : [...new Set([...state.ids, action.id])]
      if (expected.length > MAX_THEME_FAVORITES) {
        this.error = this.translate.instant('accessories.themes.limit', { count: MAX_THEME_FAVORITES })
        return
      }
      if (JSON.stringify(expected) !== JSON.stringify(state.ids)) {
        const saved = await this.api.put<ServiceTypeX>(endpoint, {
          characteristicType: 'ThemeFavorites',
          value: btoa(JSON.stringify({ ...state, ids: expected })),
        }, { timeout: 10000 })
        this.acceptShared(saved)
      }
    } catch {
      try {
        const actual = this.acceptShared(await this.api.get<ServiceTypeX>(endpoint, { timeout: 10000 }))
        if (!expected || JSON.stringify(actual.ids) !== JSON.stringify(expected)) {
          this.error = this.translate.instant('accessories.themes.save_unconfirmed')
        }
      } catch {
        this.error = this.translate.instant('accessories.themes.reconnect')
      }
    } finally {
      this.busy = false
      this.cdr.markForCheck()
    }
  }
}
