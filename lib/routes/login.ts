import { Router, Request, Response, NextFunction } from 'express';

import { users } from '../users';

export class LoginRouter {
  public router: Router;

  constructor() {
    this.router = Router();

    this.router.post('/', this.login);
  }

  login (req: Request, res: Response, next: NextFunction) {
    users.findByUsername(req.body.username, (err, user) => {
      if (err) {
        return res.sendStatus(403);
      }

      if (!user) {
        return res.sendStatus(403);
      }

      if (user.hashedPassword !== users.hashPassword(req.body.password, req.body.username)) {
        return res.sendStatus(403);
      }

      return res.json({
        token: users.getJwt(user)
      });
    });
  }
}
