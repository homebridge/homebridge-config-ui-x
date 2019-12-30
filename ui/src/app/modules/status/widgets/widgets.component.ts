import { Component, OnInit, Input, ComponentFactoryResolver, ApplicationRef, Injector, ElementRef, EmbeddedViewRef, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';

import { HapQrcodeWidgetComponent } from './hap-qrcode-widget/hap-qrcode-widget.component';
import { HomebridgeLogsWidgetComponent } from './homebridge-logs-widget/homebridge-logs-widget.component';
import { TerminalWidgetComponent } from './terminal-widget/terminal-widget.component';
import { CpuWidgetComponent } from './cpu-widget/cpu-widget.component';
import { MemoryWidgetComponent } from './memory-widget/memory-widget.component';
import { UptimeWidgetComponent } from './uptime-widget/uptime-widget.component';
import { HomebridgeStatusWidgetComponent } from './homebridge-status-widget/homebridge-status-widget.component';
import { SystemInfoWidgetComponent } from './system-info-widget/system-info-widget.component';


const availableWidgets = {
  HapQrcodeWidgetComponent,
  HomebridgeLogsWidgetComponent,
  TerminalWidgetComponent,
  CpuWidgetComponent,
  MemoryWidgetComponent,
  UptimeWidgetComponent,
  HomebridgeStatusWidgetComponent,
  SystemInfoWidgetComponent,
};

@Component({
  selector: 'app-widgets',
  template: '',
})
export class WidgetsComponent implements OnInit, OnDestroy {
  @Input() widget;
  @Input() resizeEvent: Subject<any>;

  private componentRef;

  constructor(
    private componentFactoryResolver: ComponentFactoryResolver,
    private appRef: ApplicationRef,
    private injector: Injector,
    private el: ElementRef,
  ) { }

  ngOnInit() {
    if (availableWidgets.hasOwnProperty(this.widget.component)) {
      this.load(availableWidgets[this.widget.component]);
    }
  }

  ngOnDestroy() {
    if (this.componentRef) {
      this.resizeEvent.complete();
      this.componentRef.destroy();
    }
  }

  load(component) {
    // 1. Create a component reference from the component
    this.componentRef = this.componentFactoryResolver
      .resolveComponentFactory(component)
      .create(this.injector);

    // 2. Pass the resize event observable
    this.componentRef.instance.resizeEvent = this.resizeEvent;

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
