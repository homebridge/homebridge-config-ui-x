import { Router, Request, Response, NextFunction } from 'express';

import { hb } from '../hb';
import { users } from '../users';

export class ConfigRouter {
  public router: Router;

  constructor() {
    this.router = Router();

    this.router.get('/', users.ensureAdmin, this.getConfig);
    this.router.post('/', users.ensureAdmin, this.updateConfig);
    this.router.get('/backups', users.ensureAdmin, this.listConfigBackups);
    this.router.get('/backups/:backupId(\\d+)', users.ensureAdmin, this.getConfigBackup);
    this.router.delete('/backups', users.ensureAdmin, this.deleteAllConfigBackups);
  }

  getConfig(req: Request, res: Response, next: NextFunction) {
    return res.sendFile(hb.configPath);
  }

  updateConfig(req: Request, res: Response, next: NextFunction) {
    return hb.updateConfig(req.body)
      .then((config) => {
        res.json(config);
      })
      .catch(next);
  }

  listConfigBackups(req: Request, res: Response, next: NextFunction) {
    return hb.listConfigBackups()
      .then((data) => {
        res.json(data);
      })
      .catch(next);
  }

  getConfigBackup(req: Request, res: Response, next: NextFunction) {
    return hb.getConfigBackup(req.params.backupId)
      .then((backupConfig) => {
        res.send(backupConfig);
      })
      .catch(next);
  }

  deleteAllConfigBackups(req: Request, res: Response, next: NextFunction) {
    return hb.deleteAllConfigBackups()
      .then((backupConfig) => {
        res.json({ok: true});
      })
      .catch(next);
  }
}
