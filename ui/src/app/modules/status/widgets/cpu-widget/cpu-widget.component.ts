import { Component, OnInit } from '@angular/core';
import { WsService } from '../../../../core/ws.service';
import { AuthService } from '../../../../core/auth/auth.service';

@Component({
  selector: 'app-cpu-widget',
  templateUrl: './cpu-widget.component.html',
  styleUrls: ['./cpu-widget.component.scss'],
})
export class CpuWidgetComponent implements OnInit {
  private io = this.$ws.getExistingNamespace('status');

  public cpu = {} as any;
  public cpuTemperature = {} as any;
  public currentLoad = {} as any;

  constructor(
    private $ws: WsService,
    public $auth: AuthService,
  ) { }

  ngOnInit() {
    this.io.socket.on('system-status', (data) => {
      this.cpu = data.cpu;
      this.cpuTemperature = data.cpuTemperature;
      this.currentLoad = data.currentLoad;
    });
  }

}
