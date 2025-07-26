import { ApplicationRef, Component, ComponentFactoryResolver, ElementRef, EmbeddedViewRef, inject, Injector, Input, OnDestroy, OnInit } from '@angular/core'

import { AccessoriesWidgetComponent } from '@/app/modules/status/widgets/accessories-widget/accessories-widget.component'
import { BridgesWidgetComponent } from '@/app/modules/status/widgets/bridges-widget/bridges-widget.component'
import { ClockWidgetComponent } from '@/app/modules/status/widgets/clock-widget/clock-widget.component'
import { CpuWidgetComponent } from '@/app/modules/status/widgets/cpu-widget/cpu-widget.component'
import { HapQrcodeWidgetComponent } from '@/app/modules/status/widgets/hap-qrcode-widget/hap-qrcode-widget.component'
import { HomebridgeLogsWidgetComponent } from '@/app/modules/status/widgets/homebridge-logs-widget/homebridge-logs-widget.component'
import { MemoryWidgetComponent } from '@/app/modules/status/widgets/memory-widget/memory-widget.component'
import { NetworkWidgetComponent } from '@/app/modules/status/widgets/network-widget/network-widget.component'
import { SystemInfoWidgetComponent } from '@/app/modules/status/widgets/system-info-widget/system-info-widget.component'
import { TerminalWidgetComponent } from '@/app/modules/status/widgets/terminal-widget/terminal-widget.component'
import { UpdateInfoWidgetComponent } from '@/app/modules/status/widgets/update-info-widget/update-info-widget.component'
import { UptimeWidgetComponent } from '@/app/modules/status/widgets/uptime-widget/uptime-widget.component'
import { WeatherWidgetComponent } from '@/app/modules/status/widgets/weather-widget/weather-widget.component'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  selector: 'app-widgets',
  template: '',
  standalone: true,
})
export class WidgetsComponent implements OnInit, OnDestroy {
  private appRef = inject(ApplicationRef)
  private componentFactoryResolver = inject(ComponentFactoryResolver)
  private el = inject(ElementRef)
  private injector = inject(Injector)
  private componentRef: any
  private availableWidgets = {
    HapQrcodeWidgetComponent,
    HomebridgeLogsWidgetComponent,
    TerminalWidgetComponent,
    CpuWidgetComponent,
    NetworkWidgetComponent,
    MemoryWidgetComponent,
    UptimeWidgetComponent,
    UpdateInfoWidgetComponent,
    SystemInfoWidgetComponent,
    WeatherWidgetComponent,
    AccessoriesWidgetComponent,
    ClockWidgetComponent,
    BridgesWidgetComponent,
  }

  @Input() widget: Widget

  public ngOnInit() {
    if (Object.prototype.hasOwnProperty.call(this.availableWidgets, this.widget.component)) {
      this.load(this.availableWidgets[this.widget.component])
    }
  }

  public ngOnDestroy() {
    if (this.componentRef) {
      this.widget.$resizeEvent.complete()
      this.widget.$configureEvent.complete()
      this.componentRef.destroy()
    }
  }

  private load(component: any) {
    // 1. Create a component reference from the component
    this.componentRef = this.componentFactoryResolver
      .resolveComponentFactory(component)
      .create(this.injector)

    // 2. Pass the though things
    this.componentRef.instance.resizeEvent = this.widget.$resizeEvent
    this.componentRef.instance.configureEvent = this.widget.$configureEvent
    this.componentRef.instance.widget = this.widget

    // 3. Get DOM element from component
    const domElem = (this.componentRef.hostView as EmbeddedViewRef<any>)
      .rootNodes[0] as HTMLElement

    // 4. Set styles
    domElem.style.height = '100%'
    domElem.style.width = '100%'
    domElem.style.display = 'flex'

    // 5. Append DOM element to the body
    this.el.nativeElement.appendChild(domElem)

    // 6. Attach component to the appRef so that it's inside the ng component tree
    this.appRef.attachView(this.componentRef.hostView)
  }
}
