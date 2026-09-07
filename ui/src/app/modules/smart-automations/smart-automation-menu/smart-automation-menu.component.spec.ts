import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'

import { ManagePluginsService } from '@/app/core/plugins/manage-plugins.service'
import { SmartAutomationMenuComponent } from '@/app/modules/smart-automations/smart-automation-menu/smart-automation-menu.component'
import { fakeApi, fakeWs, makeSettings, modalServiceSpy } from '@/testing'
import { provideFakes } from '@/testing/providers'

describe('smartAutomationMenuComponent', () => {
  it('opens the child bridge namespace when this is the first page visited', async () => {
    const ws = fakeWs()
    const childBridges = ws.namespace('child-bridges')
    childBridges.socket.respondTo('restart-child-bridge', {})

    TestBed.configureTestingModule({
      providers: [
        provideFakes({ api: fakeApi(), settings: makeSettings(), ws, modal: modalServiceSpy() }),
        {
          provide: ManagePluginsService,
          useValue: { jsonEditor: vi.fn(), resetChildBridges: vi.fn() },
        },
      ],
    })
    TestBed.overrideComponent(SmartAutomationMenuComponent, {
      set: { imports: [], template: '' },
    })

    const fixture = TestBed.createComponent(SmartAutomationMenuComponent)
    fixture.componentRef.setInput('bridgeUsername', '0E:11:22:33:44:55')
    fixture.detectChanges()

    await fixture.componentInstance.childBridgeAction('restart')

    expect(ws.connectToNamespace).toHaveBeenCalledWith('child-bridges')
    expect(childBridges.requests).toContainEqual({
      resource: 'restart-child-bridge',
      payload: '0E:11:22:33:44:55',
    })
  })
})
