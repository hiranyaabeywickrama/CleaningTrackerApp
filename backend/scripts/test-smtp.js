/**
 * Test Gmail SMTP — run from backend folder:
 *   node scripts/test-smtp.js your.recipient@email.com
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const emailService = require('../src/services/emailService');

const to = process.argv[2];
if (!to) {
  console.error('Usage: node scripts/test-smtp.js recipient@email.com');
  process.exit(1);
}

(async () => {
  try {
    if (!emailService.isEmailConfigured()) {
      console.error('Email not configured. Run: npm run setup-email');
      process.exit(1);
    }
    await emailService.sendOtpEmail(to, '123456', 'contractor', true);
    console.log('SUCCESS — check inbox for', to);
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exit(1);
  }
})();
