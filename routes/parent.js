const express = require('express');
const router = express.Router();
const db = require('../db');

router.use((req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'parent') {
    return res.redirect(req.urlFor('/login'));
  }
  next();
});

// Dashboard
router.get('/', (req, res) => {
  const children = db.getAllChildrenWithBalances();
  res.render('parent/dashboard', { user: req.session.user, children });
});

// Child transaction history
router.get('/child/:id', (req, res) => {
  const child = db.getChild(req.params.id);
  if (!child || !child.active) return res.redirect(req.urlFor('/parent'));
  const transactions = db.getTransactions(child.id);
  const balance = db.getBalance(child.id);
  res.render('parent/child_detail', { user: req.session.user, child, transactions, balance });
});

// Add transaction
router.post('/transaction', (req, res) => {
  const { child_id, amount, type, description } = req.body;
  const parsed = parseFloat(amount);

  if (!['allowance', 'deduction', 'payout'].includes(type) || isNaN(parsed) || parsed <= 0) {
    return res.redirect(req.urlFor(`/parent/child/${child_id}`));
  }

  db.addTransaction(parseInt(child_id), parsed, type, description, req.session.user.id);
  res.redirect(req.urlFor(`/parent/child/${child_id}`));
});

// Delete transaction
router.post('/transaction/delete', (req, res) => {
  const { transaction_id, child_id } = req.body;
  db.deleteTransaction(transaction_id);
  res.redirect(req.urlFor(`/parent/child/${child_id}`));
});

// Credit weekly allowance manually for one child
router.post('/credit-allowance/:id', (req, res) => {
  const child = db.getChild(req.params.id);
  if (child && child.weekly_amount > 0) {
    db.addTransaction(child.id, child.weekly_amount, 'allowance', 'Manual allowance credit', req.session.user.id);
  }
  res.redirect(req.urlFor(`/parent/child/${child.id}`));
});

// Credit weekly allowances for ALL children
router.post('/credit-all', (req, res) => {
  db.creditWeeklyAllowances();
  res.redirect(req.urlFor('/parent'));
});

// Manage page
router.get('/manage', (req, res) => {
  const children = db.getAllChildren();
  const users = db.getAllUsers();
  res.render('parent/manage', { user: req.session.user, children, users, error: null, success: null });
});

// Add child
router.post('/child/add', (req, res) => {
  const { name, weekly_amount } = req.body;
  if (!name || !name.trim()) return res.redirect(req.urlFor('/parent/manage'));
  db.createChild(name.trim(), parseFloat(weekly_amount) || 0);
  res.redirect(req.urlFor('/parent/manage'));
});

// Edit child
router.post('/child/edit', (req, res) => {
  const { id, name, weekly_amount } = req.body;
  if (!name || !name.trim()) return res.redirect(req.urlFor('/parent/manage'));
  db.updateChild(id, name.trim(), parseFloat(weekly_amount) || 0);
  res.redirect(req.urlFor('/parent/manage'));
});

// Remove child
router.post('/child/remove', (req, res) => {
  db.deactivateChild(req.body.id);
  res.redirect(req.urlFor('/parent/manage'));
});

// Add user
router.post('/user/add', (req, res) => {
  const { username, password, role, child_id } = req.body;
  const children = db.getAllChildren();
  const users = db.getAllUsers();

  if (!username || !password || password.length < 4) {
    return res.render('parent/manage', {
      user: req.session.user, children, users,
      error: 'Username and password (min 4 chars) are required.',
      success: null,
    });
  }

  try {
    db.createUser(username.trim(), password, role, child_id ? parseInt(child_id) : null);
    res.render('parent/manage', {
      user: req.session.user,
      children: db.getAllChildren(),
      users: db.getAllUsers(),
      error: null,
      success: `User "${username.trim()}" created.`,
    });
  } catch (e) {
    res.render('parent/manage', {
      user: req.session.user, children, users,
      error: `Username "${username.trim()}" is already taken.`,
      success: null,
    });
  }
});

// Delete user
router.post('/user/delete', (req, res) => {
  const id = parseInt(req.body.id);
  if (id !== req.session.user.id) {
    db.deleteUser(id);
  }
  res.redirect(req.urlFor('/parent/manage'));
});

// Change password
router.post('/user/change-password', (req, res) => {
  const { user_id, new_password } = req.body;
  if (new_password && new_password.length >= 4) {
    db.updatePassword(parseInt(user_id), new_password);
  }
  res.redirect(req.urlFor('/parent/manage'));
});

module.exports = router;
