const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcrypt');
const path = require('path');
const os = require('os');
const fs = require('fs');

function firstDefined(...values) {
  for (const value of values) {
    if (value && value.trim()) return value.trim();
  }
  return null;
}

function resolveDefaultDataDir() {
  const fromEnv = firstDefined(
    process.env.ALLOWANCE_DATA_DIR,
    process.env.XDG_DATA_HOME && path.join(process.env.XDG_DATA_HOME, 'allowance-tracker')
  );
  if (fromEnv) return fromEnv;

  if (process.platform === 'win32') {
    return path.join(firstDefined(process.env.LOCALAPPDATA, process.env.APPDATA) || os.homedir(), 'AllowanceTracker');
  }

  return path.join(os.homedir(), '.local', 'share', 'allowance-tracker');
}

function ensureWritableDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  fs.accessSync(dirPath, fs.constants.W_OK);
}

function resolveDbPath() {
  if (firstDefined(process.env.DB_PATH)) {
    const explicitPath = path.resolve(process.env.DB_PATH);
    ensureWritableDirectory(path.dirname(explicitPath));
    return explicitPath;
  }

  const candidates = [
    path.join(resolveDefaultDataDir(), 'allowance.db'),
    path.join(process.cwd(), 'allowance-data', 'allowance.db'),
    path.join(__dirname, 'allowance.db'),
  ];

  for (const candidate of candidates) {
    try {
      const fullPath = path.resolve(candidate);
      ensureWritableDirectory(path.dirname(fullPath));
      return fullPath;
    } catch (_) {
      // Try the next candidate if this location is not writable.
    }
  }

  throw new Error('Unable to find a writable directory for the SQLite database. Set DB_PATH to a writable file path.');
}

const DB_PATH = resolveDbPath();
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('parent', 'child')),
    child_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS children (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    weekly_amount REAL NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('allowance', 'deduction', 'payout')),
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INTEGER,
    FOREIGN KEY (child_id) REFERENCES children(id)
  );
`);

function runTransaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = {
  getDbPath() {
    return DB_PATH;
  },

  getUserByUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  },

  getUserById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },

  getAllUsers() {
    return db.prepare('SELECT id, username, role, child_id, created_at FROM users ORDER BY role, username').all();
  },

  createUser(username, password, role, childId = null) {
    const hash = bcrypt.hashSync(password, 10);
    return db.prepare('INSERT INTO users (username, password_hash, role, child_id) VALUES (?, ?, ?, ?)').run(username, hash, role, childId);
  },

  verifyPassword(plaintext, hash) {
    return bcrypt.compareSync(plaintext, hash);
  },

  updatePassword(userId, newPassword) {
    const hash = bcrypt.hashSync(newPassword, 10);
    return db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  },

  deleteUser(id) {
    return db.prepare('DELETE FROM users WHERE id = ?').run(id);
  },

  getAllChildren() {
    return db.prepare('SELECT * FROM children WHERE active = 1 ORDER BY name').all();
  },

  getChild(id) {
    return db.prepare('SELECT * FROM children WHERE id = ?').get(parseInt(id));
  },

  createChild(name, weeklyAmount) {
    return db.prepare('INSERT INTO children (name, weekly_amount) VALUES (?, ?)').run(name, weeklyAmount);
  },

  updateChild(id, name, weeklyAmount) {
    return db.prepare('UPDATE children SET name = ?, weekly_amount = ? WHERE id = ?').run(name, weeklyAmount, parseInt(id));
  },

  deactivateChild(id) {
    return db.prepare('UPDATE children SET active = 0 WHERE id = ?').run(parseInt(id));
  },

  getBalance(childId) {
    const result = db.prepare(`
      SELECT COALESCE(SUM(CASE
        WHEN type = 'allowance' THEN amount
        WHEN type IN ('deduction', 'payout') THEN -amount
        ELSE 0
      END), 0) AS balance
      FROM transactions
      WHERE child_id = ?
    `).get(parseInt(childId));
    return result.balance;
  },

  getTransactions(childId, limit = 100) {
    return db.prepare(`
      SELECT t.*, u.username AS created_by_name
      FROM transactions t
      LEFT JOIN users u ON t.created_by_user_id = u.id
      WHERE t.child_id = ?
      ORDER BY t.created_at DESC
      LIMIT ?
    `).all(parseInt(childId), limit);
  },

  addTransaction(childId, amount, type, description, createdByUserId) {
    return db.prepare(
      'INSERT INTO transactions (child_id, amount, type, description, created_by_user_id) VALUES (?, ?, ?, ?, ?)'
    ).run(parseInt(childId), amount, type, description || '', createdByUserId || null);
  },

  deleteTransaction(id) {
    return db.prepare('DELETE FROM transactions WHERE id = ?').run(parseInt(id));
  },

  getAllChildrenWithBalances() {
    const children = this.getAllChildren();
    return children.map(child => ({ ...child, balance: this.getBalance(child.id) }));
  },

  creditWeeklyAllowances() {
    const children = db.prepare('SELECT * FROM children WHERE active = 1 AND weekly_amount > 0').all();
    const stmt = db.prepare('INSERT INTO transactions (child_id, amount, type, description) VALUES (?, ?, ?, ?)');
    runTransaction(() => {
      for (const child of children) {
        stmt.run(child.id, child.weekly_amount, 'allowance', 'Weekly allowance');
      }
    });
    return children.length;
  },

  hasAnyParent() {
    const result = db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'parent'").get();
    return result.cnt > 0;
  },
};
