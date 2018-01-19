import { Router, Request, Response, NextFunction } from 'express';

import { users } from '../users';

export class UserRouter {
  public router: Router;

  constructor() {
    this.router = Router();

    this.router.get('/', this.getUser);
    this.router.post('/', this.createUser);
    this.router.delete('/:id', this.deleteUser);
    this.router.put('/:id', this.updateUser);
  }

  getUser (req: Request, res: Response, next: NextFunction) {
    let authfile = users.getUsers();

    // remove user passwords before sending to client
    authfile = authfile.map((user) => {
      delete user.password;
      return user;
    });

    res.json(authfile);
  }

  createUser (req: Request, res: Response, next: NextFunction) {
    const authfile = users.getUsers();

    // check to see if user already exists
    if (authfile.find(x => x.username === req.body.username)) {
      return res.sendStatus(409);
    }

    users.addUser(req.body);

    res.json({ ok: true });
  }

  deleteUser (req: Request, res: Response, next: NextFunction) {
    users.deleteUser(req.params.id);
    res.json({ ok: true });
  }

  updateUser (req: Request, res: Response, next: NextFunction) {
    users.updateUser(parseInt(req.params.id, 10), req.body);
    res.json({ ok: true });
  }
}
