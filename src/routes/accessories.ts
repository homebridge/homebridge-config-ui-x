import { Router, Request, Response, NextFunction } from 'express';

import { hb } from '../hb';

export class AccessoriesRouter {
  public router: Router;

  constructor() {
    this.router = Router();

    this.router.get('/', this.getAccessoryLayout);
    this.router.post('/', this.updateAccessoryLayout);
  }

  getAccessoryLayout(req: Request, res: Response, next: NextFunction) {
    return hb.getAccessoryLayout(req.user.username)
      .then((data) => {
        return res.json(data);
      })
      .catch(next);
  }

  updateAccessoryLayout(req: Request, res: Response, next: NextFunction) {
    return hb.updateAccessoryLayout(req.user.username, req.body)
      .then((data) => {
        return res.json(data);
      })
      .catch(next);
  }
}
