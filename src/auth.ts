import { Passport } from 'passport';
import { BasicStrategy } from 'passport-http';
import { Request, Response, NextFunction } from 'express';

import { hb } from './hb';
import { users } from './users';

export class AuthMiddleware {
  private passport;
  public init;
  public main;
  public staticAuth;

  constructor() {
    this.passport = new Passport();

    this.passport.use(new BasicStrategy((username, password, callback) => {
      return users.login(username, password)
        .then((user) => {
          if (!user) {
            return callback(null, false);
          }

          return callback(null, user);
        })
        .catch((err) => callback(err, false));
    }));

    this.passport.serializeUser((user, callback) => {
      callback(null, user.id);
    });

    this.passport.deserializeUser((id, callback) => {
      return users.findById(id)
        .then((user) => {
          if (!user) {
            return callback(null, false);
          }

          return callback(null, user);
        })
        .catch((err) => callback(err, false));
    });

    this.init = [
      this.passport.initialize(),
      this.passport.session()
    ];

    if (hb.authMethod === 'none' || hb.authMethod === false) {
      hb.log('Authentication Disabled');
      this.main = this.noAuthHandler;
      this.staticAuth = this.noAuthHandler;
    } else if (hb.authMethod === 'basic') {
      hb.log('Using Basic Authentication');
      this.main = this.passport.authenticate('basic', { session: false });
      this.staticAuth = this.passport.authenticate('basic', { session: false });
    } else {
      hb.log('Using Form Authentication');
      this.main = this.formAuthHandler;
      this.staticAuth = this.noAuthHandler;
    }
  }

  noAuthHandler(req: Request, res: Response, next: NextFunction) {
    return users.getUsers()
      .then((authfile) => {
        req.user = authfile[0];
        req.user.admin = true;
        return next();
      })
      .catch(next);
  }

  formAuthHandler(req: Request, res: Response, next: NextFunction) {
    if (req.headers['x-jwt']) {
      return users.verifyJwt(req.headers['x-jwt'])
        .then((user) => {
          if (user) {
            req.user = user;
            return next();
          } else {
            return res.sendStatus(401);
          }
        })
        .catch(() => res.sendStatus(401));
    } else {
      return res.sendStatus(401);
    }
  }

  queryTokenAuthHandler(req: Request, res: Response, next: NextFunction) {
    if (req.query.token) {
      return users.verifyJwt(req.query.token)
        .then((user) => {
          if (user) {
            return next();
          } else {
            return res.sendStatus(401);
          }
        });
    } else {
      return res.sendStatus(401);
    }
  }

}
