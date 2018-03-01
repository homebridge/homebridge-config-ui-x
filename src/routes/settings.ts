import { Router, Request, Response, NextFunction } from 'express';

import { hb } from '../hb';

export class SettingsRouter {
  public router: Router;

  constructor() {
    this.router = Router();

    this.router.get('/', this.getSettings);
    this.router.get('/accessories', this.getAccessoryLayout);
    this.router.post('/accessories', this.updateAccessoryLayout);
  }

  getSettings(req: Request, res: Response, next: NextFunction) {
    return res.json({
      formAuth: hb.formAuth,
      theme: hb.theme,
      enableAccessories: hb.homebridgeInsecure || false
    });
  }

  getAccessoryLayout(req: Request, res: Response, next: NextFunction) {
    return hb.getAccessoryLayout()
      .then((data) => {
        return res.json(data);
      })
      .catch(next);
  }

  updateAccessoryLayout(req: Request, res: Response, next: NextFunction) {
    return hb.updateAccessoryLayout(req.body)
      .then((data) => {
        return res.json(data);
      })
      .catch(next);
  }
}
