jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

const originalFetch = globalThis.fetch;
const emailVariables = ['EMAIL_PROVIDER', 'EMAIL_FROM', 'RESEND_API_KEY', 'EMAIL_USER', 'EMAIL_PASS'];
const originalEmailEnv = Object.fromEntries(emailVariables.map((key) => [key, process.env[key]]));
const mail = { to: 'recipient@example.com', subject: 'OTP', html: '<p>test-code</p>' };

beforeEach(() => {
  jest.resetModules();
  globalThis.fetch = jest.fn();
  process.env.EMAIL_PROVIDER = 'resend';
  process.env.RESEND_API_KEY = 'test-api-key';
  process.env.EMAIL_FROM = 'TrekViet <otp@example.com>';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of emailVariables) {
    if (originalEmailEnv[key] === undefined) { delete process.env[key]; }
    else { process.env[key] = originalEmailEnv[key]; }
  }
});

test('Resend sends over HTTPS with sender, content and an abort deadline, without SMTP', async () => {
  globalThis.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'email-id' }) });
  const mailer = require('../../src/config/mailer');

  await expect(mailer.sendMail(mail)).resolves.toEqual({ messageId: 'email-id' });
  const [url, options] = globalThis.fetch.mock.calls[0];
  expect(url).toBe('https://api.resend.com/emails');
  expect(options.method).toBe('POST');
  expect(options.headers.Authorization).toBe('Bearer test-api-key');
  expect(options.signal).toBeInstanceOf(globalThis.AbortSignal);
  expect(JSON.parse(options.body)).toEqual({ ...mail, from: process.env.EMAIL_FROM });
  expect(require('nodemailer').createTransport).not.toHaveBeenCalled();
});

test.each(['RESEND_API_KEY', 'EMAIL_FROM'])('missing %s fails before contacting Resend', async (key) => {
  delete process.env[key];
  await expect(require('../../src/config/mailer').sendMail(mail)).rejects.toThrow('requires');
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

test.each([401, 403, 429, 500])('Resend HTTP %s is a delivery failure with no credential/body disclosure', async (status) => {
  globalThis.fetch.mockResolvedValue({ ok: false, status });
  await expect(require('../../src/config/mailer').sendMail(mail))
    .rejects.toThrow(`Resend rejected email (HTTP ${status})`);
});

test('an aborted HTTPS request is a delivery failure; SMTP is not used as fallback', async () => {
  globalThis.fetch.mockRejectedValue(new Error('request aborted'));
  await expect(require('../../src/config/mailer').sendMail(mail)).rejects.toThrow('request aborted');
  expect(require('nodemailer').createTransport).not.toHaveBeenCalled();
});

test('SMTP remains available locally and rejects refused recipients', async () => {
  process.env.EMAIL_PROVIDER = 'smtp';
  process.env.EMAIL_USER = 'sender@example.com';
  process.env.EMAIL_PASS = 'test-password';
  const sendMail = jest.fn().mockResolvedValue({ rejected: ['recipient@example.com'] });
  require('nodemailer').createTransport.mockReturnValue({ sendMail });
  await expect(require('../../src/config/mailer').sendMail(mail)).rejects.toThrow('recipient');
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
