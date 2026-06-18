require('dotenv').config();
const readline = require('readline');
const { ask } = require('./llm');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function prompt() {
  rl.question('you> ', async (line) => {
    const text = line.trim();
    if (!text) { prompt(); return; }
    try {
      const reply = await ask('cli', text);
      console.log(`\nbot> ${reply}\n`);
    } catch (err) {
      console.error(`\nerror> ${err.message}\n`);
    }
    prompt();
  });
}

console.log('Chat session started (Ctrl+C to exit)\n');
prompt();
