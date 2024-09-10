import { AccessoriesWidgetComponent } from '@/app/modules/status/widgets/accessories-widget/accessories-widget.component'
import { ChildBridgeWidgetComponent } from '@/app/modules/status/widgets/child-bridge-widget/child-bridge-widget.component'
import { ClockWidgetComponent } from '@/app/modules/status/widgets/clock-widget/clock-widget.component'
import { CpuWidgetComponent } from '@/app/modules/status/widgets/cpu-widget/cpu-widget.component'
import { HapQrcodeWidgetComponent } from '@/app/modules/status/widgets/hap-qrcode-widget/hap-qrcode-widget.component'
import { HomebridgeLogsWidgetComponent } from '@/app/modules/status/widgets/homebridge-logs-widget/homebridge-logs-widget.component'
import { HomebridgeStatusWidgetComponent } from '@/app/modules/status/widgets/homebridge-status-widget/homebridge-status-widget.component'
import { MemoryWidgetComponent } from '@/app/modules/status/widgets/memory-widget/memory-widget.component'
import { NetworkWidgetComponent } from '@/app/modules/status/widgets/network-widget/network-widget.component'
import { SystemInfoWidgetComponent } from '@/app/modules/status/widgets/system-info-widget/system-info-widget.component'
import { TerminalWidgetComponent } from '@/app/modules/status/widgets/terminal-widget/terminal-widget.component'
import { UptimeWidgetComponent } from '@/app/modules/status/widgets/uptime-widget/uptime-widget.component'
import { WeatherWidgetComponent } from '@/app/modules/status/widgets/weather-widget/weather-widget.component'
import {
  ApplicationRef,
  Component,
  ComponentFactoryResolver,
  ElementRef,
  EmbeddedViewRef,
  Injector,
  Input,
  OnDestroy,
  OnInit,
} from '@angular/core'

@Component({
  selector: 'app-widgets',
  template: '',
})
export class WidgetsComponent implements OnInit, OnDestroy {
  @Input() widget: any

  private availableWidgets = {
    HapQrcodeWidgetComponent,
    HomebridgeLogsWidgetComponent,
    TerminalWidgetComponent,
    CpuWidgetComponent,
    NetworkWidgetComponent,
    MemoryWidgetComponent,
    UptimeWidgetComponent,
    HomebridgeStatusWidgetComponent,
    SystemInfoWidgetComponent,
    WeatherWidgetComponent,
    AccessoriesWidgetComponent,
    ClockWidgetComponent,
    ChildBridgeWidgetComponent,
  }

  private componentRef

  constructor(
    private componentFactoryResolver: ComponentFactoryResolver,
    private appRef: ApplicationRef,
    private injector: Injector,
    private el: ElementRef,
  ) {}

  ngOnInit() {
    if (Object.prototype.hasOwnProperty.call(this.availableWidgets, this.widget.component)) {
      this.load(this.availableWidgets[this.widget.component])
    }
  }

  ngOnDestroy() {
    if (this.componentRef) {
      this.widget.$resizeEvent.complete()
      this.widget.$configureEvent.complete()
      this.componentRef.destroy()
    }
  }

  load(component) {
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
