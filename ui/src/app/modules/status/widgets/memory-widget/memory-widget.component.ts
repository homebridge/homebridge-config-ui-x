import { Component, OnInit } from '@angular/core';
import { WsService } from '../../../../core/ws.service';
import { AuthService } from '../../../../core/auth/auth.service';

@Component({
  selector: 'app-memory-widget',
  templateUrl: './memory-widget.component.html',
  styleUrls: ['./memory-widget.component.scss'],
})
export class MemoryWidgetComponent implements OnInit {
  private io = this.$ws.getExistingNamespace('status');

  public totalMemory: number;
  public freeMemory: number;

  constructor(
    private $ws: WsService,
    public $auth: AuthService,
  ) { }

  ngOnInit() {
    this.io.socket.on('system-status', (data) => {
      this.totalMemory = data.mem.total / 1024 / 1024 / 1024;
      this.freeMemory = data.mem.available / 1024 / 1024 / 1024;
    });
  }

}
