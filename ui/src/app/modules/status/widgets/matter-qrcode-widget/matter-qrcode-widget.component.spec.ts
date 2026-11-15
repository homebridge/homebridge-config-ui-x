import type { FakeIoNamespace, FakeWs } from '@/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslatePipe } from '@ngx-translate/core'
import { Subject } from 'rxjs'
import { describe, expect, it } from 'vitest'

import { MatterQrcodeWidgetComponent } from '@/app/modules/status/widgets/matter-qrcode-widget/matter-qrcode-widget.component'
import { fakeWs } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The Matter pairing code on the dashboard. Homebridge 2.5.1 reports `startFailed` when Matter is on but its
 * server could not start: there is then no code to show, and the widget says so instead of showing an empty box
 * (which looks as if it is still starting) with the pin of an earlier run.
 */
describe('matterQrcodeWidgetComponent', () => {
  let ws: FakeWs
  let io: FakeIoNamespace

  async function open(matter: Record<string, any>) {
    TestBed.resetTestingModule()
    ws = fakeWs()
    io = ws.namespace('status')
    io.socket.respondTo('get-homebridge-pairing-pin', { matter })

    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        provideFakes({ ws }),
      ],
    })
    TestBed.overrideComponent(MatterQrcodeWidgetComponent, {
      set: {
        imports: [TranslatePipe],
        schemas: [NO_ERRORS_SCHEMA],
      },
    })

    const fixture = TestBed.createComponent(MatterQrcodeWidgetComponent)
    fixture.componentInstance.resizeEvent = new Subject<void>()
    fixture.componentRef.setInput('widget', { component: 'MatterQrcodeWidgetComponent' })
    fixture.detectChanges()
    await fixture.whenStable()
    for (let tick = 0; tick < 10; tick += 1) {
      await Promise.resolve()
    }
    fixture.detectChanges()
    return fixture
  }

  it('says matter failed to start, and shows no code or old pin, when homebridge reports startFailed', async () => {
    const fixture = await open({ enabled: true, startFailed: true, pin: '111-22-333' })
    const text = fixture.nativeElement.textContent as string

    expect(text).toContain('status.widget.matter_start_failed')
    expect(text).not.toContain('111-22-333')
    expect(fixture.nativeElement.querySelector('app-qrcode')).toBeNull()
  })

  it('shows the code of a matter server that started', async () => {
    const fixture = await open({ enabled: true, setupUri: 'MT:ABC', pin: '111-22-333' })
    const text = fixture.nativeElement.textContent as string

    expect(text).not.toContain('status.widget.matter_start_failed')
    expect(text).toContain('111-22-333')
    expect(fixture.nativeElement.querySelector('app-qrcode')).not.toBeNull()
  })
})
