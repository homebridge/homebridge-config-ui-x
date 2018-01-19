import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

import { hb } from './hb';

class Users {
  findById (id, callback) {
    const authfile = this.getUsers();

    const user = authfile.find(x => x.id === id);

    if (user) {
      callback(null, user);
    } else {
      callback(new Error('User ' + id + ' does not exist'));
    }
  }

  findByUsername (username, callback) {
    const authfile = this.getUsers();

    const user = authfile.find(x => x.username === username);

    if (user) {
      callback(null, user);
    } else {
      callback(null, null);
    }
  }

  getUsers () {
    return fs.readJsonSync(hb.authPath);
  }

  hashPassword (password, salt) {
    // pbkdf2 iterations have been kept low so we don't lock up homebridge when a user logs in on low powered devices
    // we're using the username as the salt for the sake of keeping the module portable
    const derivedKey = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512');
    return derivedKey.toString('hex');
  }

  addUser (user) {
    const authfile = this.getUsers();

    // user object
    const newuser = {
      id: authfile.length ? Math.max.apply(Math, authfile.map(x => x.id)) + 1 : 1,
      username: user.username,
      name: user.name,
      hashedPassword: this.hashPassword(user.password, user.username),
      admin: user.admin
    };

    // add the user to the authfile
    authfile.push(newuser);

    // update the auth.json
    fs.writeFileSync(hb.authPath, JSON.stringify(authfile, null, 4));

    hb.log(`Added new user: ${user.username}`);
  }

  updateUser (userId, update) {
    const authfile = this.getUsers();

    const user = authfile.find(x => x.id === userId);

    if (!user) {
      throw new Error('User not gound');
    }

    user.name = update.name || user.name;
    user.admin = update.admin || user.admin;

    if (update.password) {
      user.hashedPassword = this.hashPassword(update.password, user.username);
    }

    // update the auth.json
    fs.writeFileSync(hb.authPath, JSON.stringify(authfile, null, 4));

    hb.log(`Updated user: ${user.username}`);
  }

  deleteUser (id) {
    const authfile = this.getUsers();

    const index = authfile.findIndex(x => x.id === parseInt(id, 10));
    if (index < 0) {
      throw new Error('User not found');
    }

    authfile.splice(index, 1);

    // update the auth.json
    fs.writeFileSync(hb.authPath, JSON.stringify(authfile, null, 4));

    hb.log(`Deleted user with ID ${id}`);
  }

  getJwt (user) {
    return jwt.sign({
      username: user.username,
      name: user.name,
      admin: user.admin
    }, user.hashedPassword, {expiresIn: '8h'});
  }

  verifyJwt (token, callback) {
    const authfile = this.getUsers();
    const decoded = jwt.decode(token);

    if (!decoded) {
      return callback(new Error('User Not Found'));
    }

    const user = authfile.find(x => x.username === decoded.username);

    if (user) {
      jwt.verify(token, user.hashedPassword, (err, res) => {
        return callback(err, user);
      });
    } else {
      return callback(new Error('User Not Found'));
    }
  }

  updateOldPasswords () {
    let authfile = this.getUsers();

    authfile = authfile.map((user) => {
      if (user.password && !user.hashedPassword) {
        user.hashedPassword = this.hashPassword(user.password, user.username);
        delete user.password;
        return user;
      } else {
        return user;
      }
    });

    fs.writeFileSync(hb.authPath, JSON.stringify(authfile, null, 4));
  }

  setupDefaultUser () {
    return this.addUser({
      'username': 'admin',
      'password': 'admin',
      'name': 'Administrator',
      'admin': true
    });
  }

  setupAuthFile () {
    if (!fs.existsSync(hb.authPath)) {
      fs.writeFileSync(hb.authPath, '[]');
    }

    const authfile = this.getUsers();

    // if there are no admin users, add the default user
    if (!authfile.find(x => x.admin === true || x.username === 'admin')) {
      this.setupDefaultUser();
    }

    // update older auth.json files from plain text to hashed passwords
    if (authfile.find(x => x.password && !x.hashedPassword)) {
      this.updateOldPasswords();
    }
  }
}

export const users = new Users();
