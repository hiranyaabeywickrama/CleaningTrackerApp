const nodemailer = require('nodemailer');
const env = require('../config/env');

let smtpTransporter = null;

const PLACEHOLDER_PASSWORDS = new Set([
  'paste_the_16_chars_from_google_here',
  'abcdefghijklmnop',
  'your_16_char_app_password',
  'paste_your_16_char_app_password_here',
  'your16charapppassword',
  'replace_with_your_16_char_app_password'
]);

const getSmtpCredentials = () => {
  let user = (env.smtpUser || '').trim();
  let pass = (env.smtpPass || '').trim();
  user = user.replace(/^["']|["']$/g, '');
  pass = pass.replace(/^["']|["']$/g, '').replace(/\s/g, '');
  return { user, pass };
};

const isRealAppPassword = (pass) => {
  if (!pass || pass.length !== 16) return false;
  if (PLACEHOLDER_PASSWORDS.has(pass.toLowerCase())) return false;
  if (/paste|your_|example|replace|xxxx|app_password/i.test(pass)) return false;
  return true;
};

const hasResend = () => {
  const key = (process.env.RESEND_API_KEY || '').trim();
  return key.length > 10 && key.startsWith('re_');
};

const isSmtpConfigured = () => {
  const { user, pass } = getSmtpCredentials();
  return !!(user && isRealAppPassword(pass));
};

/** Gmail SMTP or Resend API must be configured to send OTP emails */
const isEmailConfigured = () => isSmtpConfigured() || hasResend();

const getRoleLabel = (role) => {
  if (role === 'contractor') return 'Contractor';
  if (role === 'worker') return 'Worker';
  return 'User';
};

const buildOtpEmailContent = (otpCode, role, isLogin) => {
  const roleLabel = getRoleLabel(role);
  const actionLabel = isLogin ? 'Sign In' : 'Registration';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #1E40AF, #0EA5E9); padding: 28px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="color: #fff; margin: 0; font-size: 20px;">CleanTrack Verification</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 13px;">${roleLabel} ${actionLabel}</p>
      </div>
      <div style="background: #f8fafc; padding: 28px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="color: #334155; font-size: 14px;">Your one-time verification code is:</p>
        <p style="text-align: center; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1E40AF; margin: 20px 0;">${otpCode}</p>
        <p style="color: #64748b; font-size: 13px;">Expires in 5 minutes. Do not share this code.</p>
      </div>
    </div>
  `;

  const text = `Your CleanTrack verification code is ${otpCode}. It expires in 5 minutes.`;

  return {
    subject: `${otpCode} is your CleanTrack verification code`,
    html,
    text
  };
};

const sendViaResend = async (to, otpCode, role, isLogin) => {
  const apiKey = process.env.RESEND_API_KEY.trim();
  const from = (process.env.RESEND_FROM || 'CleanTrack <onboarding@resend.dev>').trim();
  const { subject, html, text } = buildOtpEmailContent(otpCode, role, isLogin);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const raw = data.message || data.error || `Resend API error (${response.status})`;
    if (/only send testing emails to your own email/i.test(String(raw))) {
      const ownerMatch = String(raw).match(/\(([^)]+@[^)]+)\)/);
      const owner = ownerMatch?.[1] || (process.env.SMTP_USER || '').trim() || 'your Resend signup email';
      throw new Error(
        `Resend test mode: verification emails can only be sent to ${owner} right now. ` +
          'To use any email address, add a real Gmail App Password to SMTP_PASS in backend/.env, ' +
          'or verify your domain at https://resend.com/domains and update RESEND_FROM.'
      );
    }
    throw new Error(raw);
  }

  console.log(`📧 OTP sent via Resend to ${to} (id: ${data.id})`);
  return { messageId: data.id, to, provider: 'resend' };
};

const getSmtpTransporter = async () => {
  if (smtpTransporter) return smtpTransporter;

  if (!isSmtpConfigured()) {
    throw new Error('Gmail SMTP credentials missing in .env');
  }

  const { user, pass } = getSmtpCredentials();

  smtpTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass }
  });

  await smtpTransporter.verify();
  console.log(`✅ Gmail SMTP ready — sending from ${user}`);
  return smtpTransporter;
};

const sendViaGmail = async (to, otpCode, role, isLogin) => {
  const transporter = await getSmtpTransporter();
  const { user } = getSmtpCredentials();
  const fromEmail = (env.smtpFromEmail || user).trim();
  const fromName = env.smtpFromName || 'CleanTrack';
  const { subject, html, text } = buildOtpEmailContent(otpCode, role, isLogin);

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
    text
  });

  console.log(`📧 OTP sent via Gmail to ${to} (messageId: ${info.messageId})`);
  return { messageId: info.messageId, to, provider: 'gmail' };
};

exports.sendOtpEmail = async (recipientEmail, otpCode, role = 'worker', isLogin = false) => {
  const to = recipientEmail.toLowerCase().trim();

  if (!isEmailConfigured()) {
    throw new Error(
      'Email is not configured. Add Gmail SMTP (SMTP_USER + SMTP_PASS) or Resend (RESEND_API_KEY) in backend/.env'
    );
  }

  if (hasResend()) {
    return sendViaResend(to, otpCode, role, isLogin);
  }

  return sendViaGmail(to, otpCode, role, isLogin);
};

exports.isSmtpConfigured = isSmtpConfigured;
exports.isEmailConfigured = isEmailConfigured;

exports.verifySmtpOnStartup = async () => {
  if (hasResend()) {
    console.log('✅ Resend API configured — OTP emails enabled');
    const from = (process.env.RESEND_FROM || '').trim();
    if (from.includes('onboarding@resend.dev')) {
      const owner = (process.env.SMTP_USER || 'your Resend signup email').trim();
      console.warn(
        `⚠️  Resend sandbox: with onboarding@resend.dev, OTP only delivers to ${owner}. ` +
          'Other addresses need Gmail SMTP_PASS or a verified domain on Resend.\n'
      );
    }
    return true;
  }

  if (!isSmtpConfigured()) {
    const { user, pass } = getSmtpCredentials();
    console.error('\n❌ OTP EMAIL NOT CONFIGURED — edit backend/.env:\n');
    if (user && pass && !isRealAppPassword(pass)) {
      if (pass.startsWith('re_')) {
        console.error('   Your Resend API key is in SMTP_PASS — that is the wrong field!');
        console.error('   → Move it to RESEND_API_KEY= in backend/.env');
        console.error('   → Leave SMTP_PASS empty\n');
      } else {
        console.error('   SMTP_PASS is not a valid Google App Password (must be exactly 16 characters).');
        console.error('   → Or use Resend: put your re_... key in RESEND_API_KEY instead\n');
      }
    } else if (user && !pass) {
      console.error(`   SMTP_USER is set (${user}) but SMTP_PASS is EMPTY.\n`);
    } else if (!hasResend()) {
      console.error('   Easiest fix — Resend (2 minutes):');
      console.error('     1. Sign up: https://resend.com');
      console.error('     2. API Keys → Create → copy re_... key');
      console.error('     3. Add to .env: RESEND_API_KEY=re_xxxxx');
      console.error('     4. Restart: npm run dev\n');
    }
    return false;
  }

  try {
    await getSmtpTransporter();
    return true;
  } catch (err) {
    smtpTransporter = null;
    const msg = err.message || '';
    if (msg.includes('535') || msg.includes('BadCredentials')) {
      console.error(
        '\n❌ Gmail rejected the password (535 Bad Credentials)\n' +
          '   You must use a real Google APP PASSWORD — not your normal Gmail password.\n' +
          '   Do NOT use the example "abcdefghijklmnop" from documentation.\n\n' +
          '   Fix:\n' +
          '   1. https://myaccount.google.com/apppasswords\n' +
          '   2. Create new App Password → Mail\n' +
          '   3. Copy the 16 characters Google shows you\n' +
          '   4. Paste into SMTP_PASS in backend/.env (no spaces)\n' +
          '   5. Restart: npm run dev\n'
      );
    } else {
      console.error('\n❌ Gmail SMTP failed:', msg, '\n');
    }
    return false;
  }
};

exports.sendWelcomeEmail = async (user) => {
  if (!isEmailConfigured()) return;
  try {
    if (hasResend()) return;
    const transporter = await getSmtpTransporter();
    const { user: smtpUser } = getSmtpCredentials();
    await transporter.sendMail({
      from: `"CleanTrack" <${env.smtpFromEmail || smtpUser}>`,
      to: user.email,
      subject: 'Welcome to CleanTrack',
      text: `Hello ${user.name}, your account is ready.`
    });
  } catch (e) {
    console.error('Welcome email error:', e.message);
  }
};

exports.getEmailConfigStatus = () => ({
  configured: isEmailConfigured(),
  gmail: isSmtpConfigured(),
  resend: hasResend()
});
