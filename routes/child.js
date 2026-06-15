const express = require('express');
const router = express.Router();
const db = require('../db');

router.use((req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'child') {
    return res.redirect(req.urlFor('/login'));
  }
  next();
});

router.get('/', (req, res) => {
  const childId = req.session.user.child_id;
  if (!childId) return res.redirect(req.urlFor('/login'));

  const child = db.getChild(childId);
  if (!child) return res.redirect(req.urlFor('/login'));

  const transactions = db.getTransactions(childId, 50);
  const balance = db.getBalance(childId);
  res.render('child/dashboard', { user: req.session.user, child, transactions, balance });
});

module.exports = router;
