import {
  Component, OnInit, Input, ComponentFactoryResolver,
  ApplicationRef, Injector, ElementRef, EmbeddedViewRef, OnDestroy,
} from '@angular/core';

import { HapQrcodeWidgetComponent } from './hap-qrcode-widget/hap-qrcode-widget.component';
import { HomebridgeLogsWidgetComponent } from './homebridge-logs-widget/homebridge-logs-widget.component';
import { TerminalWidgetComponent } from './terminal-widget/terminal-widget.component';
import { CpuWidgetComponent } from './cpu-widget/cpu-widget.component';
import { NetworkWidgetComponent } from './network-widget/network-widget.component';
import { MemoryWidgetComponent } from './memory-widget/memory-widget.component';
import { UptimeWidgetComponent } from './uptime-widget/uptime-widget.component';
import { HomebridgeStatusWidgetComponent } from './homebridge-status-widget/homebridge-status-widget.component';
import { SystemInfoWidgetComponent } from './system-info-widget/system-info-widget.component';
import { WeatherWidgetComponent } from './weather-widget/weather-widget.component';
import { AccessoriesWidgetComponent } from './accessories-widget/accessories-widget.component';
import { ClockWidgetComponent } from './clock-widget/clock-widget.component';
import { ChildBridgeWidgetComponent } from './child-bridge-widget/child-bridge-widget.component';

@Component({
  selector: 'app-widgets',
  template: '',
})
export class WidgetsComponent implements OnInit, OnDestroy {
  @Input() widget;

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
  };

  private componentRef;

  constructor(
    private componentFactoryResolver: ComponentFactoryResolver,
    private appRef: ApplicationRef,
    private injector: Injector,
    private el: ElementRef,
  ) { }

  ngOnInit() {
    if (this.availableWidgets.hasOwnProperty(this.widget.component)) {
      this.load(this.availableWidgets[this.widget.component]);
    }
  }

  ngOnDestroy() {
    if (this.componentRef) {
      this.widget.$resizeEvent.complete();
      this.widget.$configureEvent.complete();
      this.componentRef.destroy();
    }
  }

  load(component) {
    // 1. Create a component reference from the component
    this.componentRef = this.componentFactoryResolver
      .resolveComponentFactory(component)
      .create(this.injector);

    // 2. Pass the though things
    this.componentRef.instance.resizeEvent = this.widget.$resizeEvent;
    this.componentRef.instance.configureEvent = this.widget.$configureEvent;
    this.componentRef.instance.widget = this.widget;

    // 3. Get DOM element from component
    const domElem = (this.componentRef.hostView as EmbeddedViewRef<any>)
      .rootNodes[0] as HTMLElement;

    // 4. Set styles
    domElem.style.height = '100%';
    domElem.style.width = '100%';
    domElem.style.display = 'flex';

    // 5. Append DOM element to the body
    this.el.nativeElement.appendChild(domElem);

    // 6. Attach component to the appRef so that it's inside the ng component tree
    this.appRef.attachView(this.componentRef.hostView);
  }

}
