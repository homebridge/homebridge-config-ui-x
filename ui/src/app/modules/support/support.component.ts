import { Component, OnInit } from '@angular/core';
import { SettingsService } from '@/app/core/settings.service';

@Component({
  selector: 'app-support',
  templateUrl: './support.component.html',
  styleUrls: ['./support.component.scss'],
})
export class SupportComponent implements OnInit {
  constructor(
    public $settings: SettingsService,
  ) {}

  ngOnInit(): void {}
}
