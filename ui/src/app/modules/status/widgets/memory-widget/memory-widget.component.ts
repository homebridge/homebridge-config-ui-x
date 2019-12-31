import { Component, OnInit, OnDestroy } from '@angular/core';
import { interval, Subscription } from 'rxjs';

import { WsService } from '../../../../core/ws.service';
import { AuthService } from '../../../../core/auth/auth.service';

@Component({
  selector: 'app-memory-widget',
  templateUrl: './memory-widget.component.html',
  styleUrls: ['./memory-widget.component.scss'],
})
export class MemoryWidgetComponent implements OnInit, OnDestroy {
  private io = this.$ws.getExistingNamespace('status');
  private intervalSubscription: Subscription;

  public totalMemory: number;
  public freeMemory: number;

  constructor(
    private $ws: WsService,
    public $auth: AuthService,
  ) { }

  ngOnInit() {
    this.io.connected.subscribe(async () => {
      this.getServerMemoryInfo();
    });

    if (this.io.socket.connected) {
      this.getServerMemoryInfo();
    }

    this.intervalSubscription = interval(12000).subscribe(() => {
      if (this.io.socket.connected) {
        this.getServerMemoryInfo();
      }
    });
  }

  getServerMemoryInfo() {
    this.io.request('get-server-memory-info').subscribe((data) => {
      this.totalMemory = data.mem.total / 1024 / 1024 / 1024;
      this.freeMemory = data.mem.available / 1024 / 1024 / 1024;
    });
  }

  ngOnDestroy() {
    this.intervalSubscription.unsubscribe();
  }

}
