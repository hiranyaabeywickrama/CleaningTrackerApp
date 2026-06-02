/**
 * Interactive email setup — run: node scripts/configure-email.js
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const envPath = path.join(__dirname, '..', '.env');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

(async () => {
  console.log('\n=== CleanTrack Email Setup ===\n');
  console.log('Choose how to send OTP emails:\n');
  console.log('  1) Gmail SMTP (App Password)');
  console.log('  2) Resend API (free at https://resend.com)\n');

  const choice = await ask('Enter 1 or 2: ');

  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

  const setVar = (key, value) => {
    const line = `${key}=${value}`;
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, line);
    } else {
      envContent += `\n${line}`;
    }
  };

  if (choice.trim() === '2') {
    const apiKey = await ask('Paste your Resend API key (re_...): ');
    setVar('RESEND_API_KEY', apiKey.trim());
    setVar('RESEND_FROM', 'CleanTrack <onboarding@resend.dev>');
    console.log('\n✅ Resend configured. Restart backend: npm run dev\n');
  } else {
    const user = await ask('Gmail address (SMTP_USER): ');
    const pass = await ask('Gmail App Password (16 chars, no spaces): ');
    setVar('SMTP_USER', user.trim());
    setVar('SMTP_PASS', pass.replace(/\s/g, ''));
    setVar('SMTP_FROM_EMAIL', user.trim());
    setVar('SMTP_HOST', 'smtp.gmail.com');
    setVar('SMTP_PORT', '587');
    console.log('\n✅ Gmail configured. Restart backend: npm run dev\n');
    console.log('Test: node scripts/test-smtp.js your@email.com\n');
  }

  fs.writeFileSync(envPath, envContent.trim() + '\n');
  rl.close();
})();
