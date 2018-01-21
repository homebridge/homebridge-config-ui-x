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
    return users.getUsers()
      .then((authfile) => {
        // remove sensitive data before sending user list to client
        authfile = authfile.map((user) => {
          delete user.hashedPassword;
          return user;
        });

        return res.json(authfile);
      })
      .catch(next);
  }

  createUser (req: Request, res: Response, next: NextFunction) {
    // check to see if user already exists
    return users.findByUsername(req.body.username)
      .then((user) => {
        if (user) {
          return res.sendStatus(409);
        }

        return users.addUser(req.body)
          .then(() => {
            return res.json({ ok: true });
          });
      })
      .catch(next);
  }

  deleteUser (req: Request, res: Response, next: NextFunction) {
    return users.deleteUser(req.params.id)
      .then(() => {
        return res.json({ ok: true });
      })
      .catch(next);
  }

  updateUser (req: Request, res: Response, next: NextFunction) {
    return users.updateUser(parseInt(req.params.id, 10), req.body)
      .then(() => {
        return res.json({ ok: true });
      })
      .catch(next);
  }
}
