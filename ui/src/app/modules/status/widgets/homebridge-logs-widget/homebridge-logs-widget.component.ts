import { Component, OnInit, ViewChild, ElementRef, Input, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { LogService } from '../../../../core/log.service';

@Component({
  selector: 'app-homebridge-logs-widget',
  templateUrl: './homebridge-logs-widget.component.html',
  styleUrls: ['./homebridge-logs-widget.component.scss'],
})
export class HomebridgeLogsWidgetComponent implements OnInit, OnDestroy {
  @ViewChild('logoutput', { static: true }) termTarget: ElementRef;
  @Input() resizeEvent: Subject<any>;

  constructor(
    private $log: LogService,
  ) { }

  ngOnInit() {
    setTimeout(() => {
      this.$log.startTerminal(this.termTarget, {
        cursorBlink: false,
        theme: {
          background: '#2b2b2b',
        },
      }, this.resizeEvent);
    });
  }

  ngOnDestroy() {
    this.$log.destroyTerminal();
  }

}
