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
      users.findByUsername(username, (err, user) => {
        if (err) {
          return callback(err);
        }

        if (!user) {
          return callback(null, false);
        }

        if (user.hashedPassword !== users.hashPassword(password, username)) {
          return callback(null, false);
        }

        return callback(null, user);
      });
    }));

    this.passport.serializeUser((user, callback) => {
      callback(null, user.id);
    });

    this.passport.deserializeUser((id, callback) => {
      users.findById(id, (err, user) => {
        if (err) {
          return callback(err);
        }

        callback(null, user);
      });
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

  noAuthHandler (req: Request, res: Response, next: NextFunction) {
    req.user = users.getUsers()[0];
    next();
  }

  formAuthHandler (req: Request, res: Response, next: NextFunction) {
    if (req.headers['x-jwt']) {
      users.verifyJwt(req.headers['x-jwt'], (err, user) => {
        if (err) {
          return res.sendStatus(401);
        }
        req.user = user;
        next();
      });
    } else {
      return res.sendStatus(401);
    }
  }

}
