const db = require('./db');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

async function main() {
  console.log('\n=== Allowance Tracker Setup ===\n');

  if (db.hasAnyParent()) {
    console.log('A parent account already exists. Use the app to manage users.\n');
    rl.close();
    return;
  }

  console.log('Create the first parent (admin) account:\n');
  const username = (await ask('Username: ')).trim();
  const password = (await ask('Password: ')).trim();

  if (!username || !password) {
    console.log('Username and password are required.');
    rl.close();
    process.exit(1);
  }

  db.createUser(username, password, 'parent');
  console.log(`\nParent account "${username}" created successfully!`);
  console.log('Run "npm start" to start the server.\n');
  rl.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
