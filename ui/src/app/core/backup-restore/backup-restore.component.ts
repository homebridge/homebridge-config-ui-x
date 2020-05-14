import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpEventType, HttpResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { saveAs } from 'file-saver';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { ToastrService } from 'ngx-toastr';

import { ApiService } from '../api.service';
import { WsService } from '../ws.service';

@Component({
  selector: 'app-backup-restore',
  templateUrl: './backup-restore.component.html',
  styleUrls: ['./backup-restore.component.scss'],
})
export class BackupRestoreComponent implements OnInit, OnDestroy {
  public clicked = false;
  public selectedFile: File;
  public restoreInProgress = false;
  public restoreStarted = false;
  public restoreFailed = false;
  public restoreArchiveType: 'homebridge' | 'hbfx' = 'homebridge';
  public uploadPercent = 0;

  private term = new Terminal();
  private termTarget: HTMLElement;
  private fitAddon = new FitAddon();

  private io = this.$ws.connectToNamespace('backup');

  constructor(
    private $route: Router,
    public activeModal: NgbActiveModal,
    private translate: TranslateService,
    public $toastr: ToastrService,
    private $api: ApiService,
    private $ws: WsService,
  ) { }

  ngOnInit() {
    this.termTarget = document.getElementById('plugin-log-output');
    this.term.open(this.termTarget);
    this.fitAddon.fit();

    this.io.socket.on('stdout', (data) => {
      this.term.write(data);
    });
  }

  async onDownloadBackupClick() {
    this.clicked = true;
    this.$api.get('/backup/download', { observe: 'response', responseType: 'blob' }).subscribe(
      (res) => {
        const archiveName = res.headers.get('File-Name') || 'homebridge-backup.tar.gz';
        saveAs(res.body, archiveName);
        this.clicked = false;
        this.activeModal.close();
        this.$toastr.success(
          this.translate.instant('backup.message_backup_archive_created'),
          this.translate.instant('toast.title_success'),
        );
      },
      (err) => {
        this.clicked = false;
        this.$toastr.error(this.translate.instant('backup.message_backup_download_failed'), this.translate.instant('toast.title_error'));
      },
    );
  }

  onRestoreBackupClick() {
    if (this.restoreArchiveType === 'homebridge') {
      this.uploadHomebridgeArchive();
    } else if (this.restoreArchiveType === 'hbfx') {
      this.uploadHbfxArchive();
    }
  }

  uploadHomebridgeArchive() {
    this.term.reset();
    this.clicked = true;
    const formData: FormData = new FormData();
    formData.append('restoreArchive', this.selectedFile, this.selectedFile.name);
    this.$api.post('/backup/restore', formData).subscribe(
      (res) => {
        this.restoreStarted = true;
        this.restoreInProgress = true;
        setTimeout(() => {
          this.startRestore();
        }, 500);
        this.clicked = false;
      },
      (err) => {
        this.$toastr.error(this.translate.instant('backup.message_restore_failed'), this.translate.instant('toast.title_error'));
        this.clicked = false;
      },
    );
  }

  async startRestore() {
    await this.io.request('do-restore').subscribe(
      (res) => {
        this.restoreInProgress = false;
        this.$toastr.success(this.translate.instant('backup.message_backup_restored'), this.translate.instant('toast.title_success'));
      },
      (err) => {
        this.restoreFailed = true;
        this.$toastr.error(this.translate.instant('backup.message_restore_failed'), this.translate.instant('toast.title_error'));
      },
    );
  }

  uploadHbfxArchive() {
    this.term.reset();
    this.clicked = true;
    const formData: FormData = new FormData();
    formData.append('restoreArchive', this.selectedFile, this.selectedFile.name);
    this.$api.post('/backup/restore/hbfx', formData, {
      reportProgress: true,
      observe: 'events',
    }).subscribe(
      (event) => {
        if (event.type === HttpEventType.UploadProgress) {
          this.uploadPercent = Math.round(100 * event.loaded / event.total);
        } else if (event instanceof HttpResponse) {
          if (event.status === 200) {
            this.restoreStarted = true;
            this.restoreInProgress = true;
            setTimeout(() => {
              this.startHbfxRestore();
            }, 500);
            this.clicked = false;
          }
        }
      },
      (err) => {
        this.$toastr.error(this.translate.instant('backup.message_restore_failed'), this.translate.instant('toast.title_error'));
        this.clicked = false;
      },
    );
  }

  async startHbfxRestore() {
    await this.io.request('do-restore-hbfx').subscribe(
      (res) => {
        this.restoreInProgress = false;
        this.$toastr.success(this.translate.instant('backup.message_backup_restored'), this.translate.instant('toast.title_success'));
      },
      (err) => {
        this.restoreFailed = true;
        this.$toastr.error(this.translate.instant('backup.message_restore_failed'), this.translate.instant('toast.title_error'));
      },
    );
  }

  handleRestoreFileInput(files: FileList) {
    if (files.length) {
      this.selectedFile = files[0];
      if (this.selectedFile.name.endsWith('.hbfx')) {
        this.restoreArchiveType = 'hbfx';
      } else {
        this.restoreArchiveType = 'homebridge';
      }
    } else {
      delete this.selectedFile;
    }
  }

  postBackupRestart() {
    this.$api.put('/backup/restart', {}).subscribe(
      (res) => {
        this.activeModal.close();
        this.$route.navigate(['/']);
      },
      (err) => {

      },
    );
  }

  ngOnDestroy() {
    this.io.end();
  }

}
