const nodemailer = require('nodemailer');

let smtpTransport;

// Render Free blocks SMTP. Use EMAIL_PROVIDER=resend to send over HTTPS.
const sendMail = async (mail) => {
  const provider = (process.env.EMAIL_PROVIDER || 'smtp').trim().toLowerCase();
  const from = process.env.EMAIL_FROM || mail.from;

  if (provider === 'resend') {
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
      throw new Error('Resend requires RESEND_API_KEY and EMAIL_FROM');
    }
    const response = await globalThis.fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: mail.to, subject: mail.subject, html: mail.html }),
      signal: globalThis.AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // Do not include provider response bodies, credentials or OTPs in errors.
      throw new Error(`Resend rejected email (HTTP ${response.status})`);
    }
    const result = await response.json();
    if (!result.id) { throw new Error('Resend returned no message ID'); }
    return { messageId: result.id };
  }

  if (provider !== 'smtp') { throw new Error('Unsupported EMAIL_PROVIDER'); }
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('SMTP requires EMAIL_USER and EMAIL_PASS');
  }
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      dnsTimeout: 5_000,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
    });
  }
  const result = await smtpTransport.sendMail({ ...mail, from });
  if (result.rejected?.length) { throw new Error('SMTP rejected the email recipient'); }
  return result;
};

module.exports = { sendMail };
