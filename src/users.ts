import * as fs from 'fs-extra';
import * as cryptoNode from 'crypto';
import * as Bluebird from 'bluebird';
import * as jsonwebtoken from 'jsonwebtoken';

const crypto = Bluebird.promisifyAll(cryptoNode);
const jwt = Bluebird.promisifyAll(jsonwebtoken);

import { hb } from './hb';

export interface User {
  id: number;
  name: string;
  username: string;
  admin: boolean;
  hashedPassword: string;
  salt: string;
  password?: string;
}

class Users {
  async getUsers() {
    const allUsers: User[] = await fs.readJson(hb.authPath);
    return allUsers;
  }

  async findById(id: number) {
    const authfile = await this.getUsers();
    const user = authfile.find(x => x.id === id);
    return user;
  }

  async findByUsername(username: string) {
    const authfile = await this.getUsers();
    const user = authfile.find(x => x.username === username);
    return user;
  }

  async hashPassword(password: string, salt: string) {
    const derivedKey = await crypto.pbkdf2Async(password, salt, 1000, 64, 'sha512');
    return derivedKey.toString('hex');
  }

  async genSalt() {
    const salt = await crypto.randomBytesAsync(32);
    return salt.toString('hex');
  }

  async login(username: string, password: string) {
    const user = await this.findByUsername(username);

    if (!user) {
      return null;
    }

    // using username as salt if user.salt not set to maintain backwards compatibility with older versions.
    const hashedPassword = await this.hashPassword(password, user.salt || user.username);

    if (hashedPassword === user.hashedPassword) {
      return user;
    } else {
      return null;
    }
  }

  async addUser(user) {
    const authfile = await this.getUsers();

    const salt = await this.genSalt();

    // user object
    const newUser: User = {
      id: authfile.length ? Math.max.apply(Math, authfile.map(x => x.id)) + 1 : 1,
      username: user.username,
      name: user.name,
      hashedPassword: await this.hashPassword(user.password, salt),
      salt: salt,
      admin: user.admin
    };

    // add the user to the authfile
    authfile.push(newUser);

    // update the auth.json
    await fs.writeJson(hb.authPath, authfile, {spaces: 4});

    hb.log(`Added new user: ${user.username}`);
  }

  async updateUser(userId, update) {
    const authfile = await this.getUsers();

    const user = authfile.find(x => x.id === userId);

    if (!user) {
      throw new Error('User Not Found');
    }

    user.name = update.name || user.name;
    user.admin = (update.admin === undefined) ? user.admin : update.admin;

    if (update.password) {
      const salt = await this.genSalt();

      user.hashedPassword = await this.hashPassword(update.password, salt);
      user.salt = salt;
    }

    // update the auth.json
    await fs.writeJson(hb.authPath, authfile, { spaces: 4 });

    hb.log(`Updated user: ${user.username}`);
  }

  async deleteUser(id) {
    const authfile = await this.getUsers();

    const index = authfile.findIndex(x => x.id === parseInt(id, 10));

    if (index < 0) {
      throw new Error('User not found');
    }

    // prevent deleting the only admin user
    if (authfile[index].admin && authfile.filter(x => x.admin === true).length < 2) {
      throw new Error('Cannot delete only admin user');
    }

    authfile.splice(index, 1);

    // update the auth.json
    await fs.writeJson(hb.authPath, authfile, { spaces: 4 });

    hb.log(`Deleted user with ID ${id}`);
  }

  async getJwt(user) {
    return jwt.signAsync({
      username: user.username,
      name: user.name,
      admin: user.admin
    }, user.hashedPassword, {expiresIn: '8h'});
  }

  async verifyJwt(token) {
    const decoded = jwt.decode(token);

    if (!decoded) {
      return null;
    }

    const user = await this.findByUsername(decoded.username);

    if (user) {
      try {
        await jwt.verifyAsync(token, user.hashedPassword);
        return user;
      } catch (e) {
        return null;
      }
    } else {
      return null;
    }
  }

  ensureAdmin(req, res, next) {
    if (req.user && req.user.admin) {
      return next();
    } else {
      hb.warn(`403 Forbidden [${req.user.username}] ${req.originalUrl}`);
      return res.sendStatus(403);
    }
  }

  async updateOldPasswords() {
    let authfile = await this.getUsers();

    authfile = await Bluebird.map(authfile, async (user) => {
      if (user.password && !user.hashedPassword) {
        const salt = await this.genSalt();

        user.hashedPassword = await this.hashPassword(user.password, salt);
        user.salt = salt;

        delete user.password;

        hb.log(`Hashed password for "${user.username}" in auth.json`);
        return user;
      } else {
        return user;
      }
    });

    // update the auth.json
    await fs.writeJson(hb.authPath, authfile, { spaces: 4 });
  }

  async setupDefaultUser() {
    return this.addUser({
      'username': 'admin',
      'password': 'admin',
      'name': 'Administrator',
      'admin': true
    });
  }

  async setupAuthFile() {
    if (!await fs.pathExists(hb.authPath)) {
      await fs.writeJson(hb.authPath, []);
    }

    const authfile = await this.getUsers();

    // if there are no admin users, add the default user
    if (!authfile.find(x => x.admin === true || x.username === 'admin')) {
      await this.setupDefaultUser();
    }

    // update older auth.json files from plain text to hashed passwords
    if (authfile.find(x => x.password && !x.hashedPassword)) {
      await this.updateOldPasswords();
    }
  }
}

export const users = new Users();
