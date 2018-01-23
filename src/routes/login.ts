import { Router, Request, Response, NextFunction } from 'express';

import { users } from '../users';

export class LoginRouter {
  public router: Router;

  constructor() {
    this.router = Router();

    this.router.post('/', this.login);
  }

  login(req: Request, res: Response, next: NextFunction) {
    return users.login(req.body.username, req.body.password)
      .then((user) => {
        if (!user) {
          return res.sendStatus(403);
        }

        return users.getJwt(user)
          .then((token) => {
            return res.json({
              token: token
            });
          });
      })
      .catch(next);
  }
}
