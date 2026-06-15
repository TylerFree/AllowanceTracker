const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  if (!req.session.user) return res.redirect(req.urlFor('/login'));
  res.redirect(req.urlFor(req.session.user.role === 'parent' ? '/parent' : '/child'));
});

router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.urlFor(req.session.user.role === 'parent' ? '/parent' : '/child'));
  }
  res.render('login', { error: null });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.render('login', { error: 'Please enter your username and password.' });
  }

  const user = db.getUserByUsername(username.trim());
  if (!user || !db.verifyPassword(password, user.password_hash)) {
    return res.render('login', { error: 'Invalid username or password.' });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    child_id: user.child_id,
  };

  res.redirect(req.urlFor(user.role === 'parent' ? '/parent' : '/child'));
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect(req.urlFor('/login')));
});

module.exports = router;
