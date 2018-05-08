import { Router, Request, Response, NextFunction } from 'express';

import { hb } from '../hb';
import { pm } from '../pm';
import { users } from '../users';

export class PackageRouter {
  public router: Router;

  constructor() {
    this.router = Router();

    this.router.get('/', this.getPackages);
    this.router.put('/update', users.ensureAdmin, this.updatePackage);
    this.router.post('/uninstall', users.ensureAdmin, this.uninstallPackage);
    this.router.post('/install', users.ensureAdmin, this.installPackage);
    this.router.get('/homebridge', this.getHomebridgePackage);
    this.router.put('/homebridge/upgrade', users.ensureAdmin, this.upgradeHomebridgePackage);
    this.router.get('/changelog/:package', users.ensureAdmin, this.getChangeLog);
    this.router.get('/config-schema/:package', users.ensureAdmin, this.getConfigSchema);
  }

  getPackages(req: Request, res: Response, next: NextFunction) {
    if (req.query.search && req.query.search !== '') {
      return pm.searchRegistry(req.query.search)
        .then(pkgs => {
          res.json(pkgs);
        })
        .catch(next);
    } else {
      return pm.getInstalled()
        .then(pkgs => {
          res.json(pkgs);
        })
        .catch(next);
    }
  }

  updatePackage(req: Request, res: Response, next: NextFunction) {
    pm.updatePlugin(req.body.package);
    res.json({ ok: true });
  }

  uninstallPackage(req: Request, res: Response, next: NextFunction) {
    pm.removePlugin(req.body.package);
    res.json({ ok: true });
  }

  installPackage(req: Request, res: Response, next: NextFunction) {
    pm.installPlugin(req.body.package);
    res.json({ ok: true });
  }

  getHomebridgePackage(req: Request, res: Response, next: NextFunction) {
    if (!hb.homebridgeFork) {
      return pm.getHomebridge()
        .then(server => res.json(server))
        .catch(next);
    } else {
      return pm.getHomebridgeFork()
        .then(server => res.json(server))
        .catch(next);
    }
  }

  upgradeHomebridgePackage(req: Request, res: Response, next: NextFunction) {
    pm.updateHomebridge();
    res.json({ ok: true });
  }

  getChangeLog(req: Request, res: Response, next: NextFunction) {
    return pm.getChangeLog(req.params.package)
      .then((data) => {
        res.json({ changelog: data });
      })
      .catch(next);
  }

  getConfigSchema(req: Request, res: Response, next: NextFunction) {
    return pm.getConfigSchema(req.params.package)
      .then((data) => {
        res.json(data);
      })
      .catch(next);
  }

}
