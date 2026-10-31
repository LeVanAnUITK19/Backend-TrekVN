jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

const originalFetch = globalThis.fetch;
const emailVariables = [
  'EMAIL_PROVIDER', 'EMAIL_FROM', 'BREVO_API_KEY', 'RESEND_API_KEY', 'EMAIL_USER', 'EMAIL_PASS',
  'EMAILJS_SERVICE_ID', 'EMAILJS_TEMPLATE_ID', 'EMAILJS_PUBLIC_KEY', 'EMAILJS_PRIVATE_KEY',
];
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

describe('Brevo HTTPS email delivery', () => {
  beforeEach(() => {
    process.env.EMAIL_PROVIDER = 'brevo';
    process.env.BREVO_API_KEY = 'test-brevo-api-key';
    process.env.EMAIL_FROM = 'TrekViet <sender@gmail.com>';
  });

  test('uses Brevo API authentication and sends existing OTP HTML to the requested recipient', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ messageId: '<brevo-message-id>' }) });

    await expect(require('../../src/config/mailer').sendMail(mail))
      .resolves.toEqual({ messageId: '<brevo-message-id>' });
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(options.method).toBe('POST');
    expect(options.headers['api-key']).toBe('test-brevo-api-key');
    expect(options.headers.Authorization).toBeUndefined();
    expect(options.signal).toBeInstanceOf(globalThis.AbortSignal);
    expect(JSON.parse(options.body)).toEqual({
      sender: { name: 'TrekViet', email: 'sender@gmail.com' },
      to: [{ email: mail.to }],
      subject: mail.subject,
      htmlContent: mail.html,
    });
    expect(require('nodemailer').createTransport).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['sender@gmail.com', { name: 'TrekViet', email: 'sender@gmail.com' }],
    ['"Trek Việt" <sender@gmail.com>', { name: 'Trek Việt', email: 'sender@gmail.com' }],
  ])('accepts sender format %s', async (from, sender) => {
    process.env.EMAIL_FROM = from;
    globalThis.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ messageId: 'message-id' }) });
    await require('../../src/config/mailer').sendMail(mail);
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body).sender).toEqual(sender);
  });

  test.each(['BREVO_API_KEY', 'EMAIL_FROM'])('missing %s fails before sending', async (key) => {
    delete process.env[key];
    await expect(require('../../src/config/mailer').sendMail(mail)).rejects.toThrow('Brevo requires');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test.each(['not-an-email', 'a@example.com, b@example.com', 'Group: a@example.com;', 'a@example.com\r\nBcc: b@example.com'])(
    'invalid sender %s fails before sending', async (from) => {
      process.env.EMAIL_FROM = from;
      await expect(require('../../src/config/mailer').sendMail(mail)).rejects.toThrow('one valid sender');
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

  test.each([400, 401, 403, 429, 500])('HTTP %s is reported without exposing the provider body', async (status) => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status,
      json: () => Promise.resolve({ code: 'permission_denied', message: 'private-provider-message test-brevo-api-key' }),
    });
    await expect(require('../../src/config/mailer').sendMail(mail))
      .rejects.toThrow(`Brevo rejected email (HTTP ${status}, permission_denied)`);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(require('nodemailer').createTransport).not.toHaveBeenCalled();
  });

  test('a non-JSON error response keeps the HTTP status', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 502, json: () => Promise.reject(new SyntaxError('invalid JSON')) });
    await expect(require('../../src/config/mailer').sendMail(mail)).rejects.toThrow('Brevo rejected email (HTTP 502)');
  });

  test('untrusted provider codes are excluded from error logs', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false, status: 403,
      json: () => Promise.resolve({ code: 'private\nprovider text', message: mail.html }),
    });
    await expect(require('../../src/config/mailer').sendMail(mail)).rejects.toThrow('Brevo rejected email (HTTP 403)');
  });

  test('an aborted request fails without retrying or switching providers', async () => {
    globalThis.fetch.mockRejectedValue(new Error('request aborted'));
    await expect(require('../../src/config/mailer').sendMail(mail)).rejects.toThrow('request aborted');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(require('nodemailer').createTransport).not.toHaveBeenCalled();
  });

  test('an accepted response without a message ID is not treated as success', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    await expect(require('../../src/config/mailer').sendMail(mail)).rejects.toThrow('Brevo returned no message ID');
  });
});

describe('EmailJS HTTPS OTP delivery', () => {
  const otpMail = { ...mail, otp: '012345', expiresMinutes: 10 };
  beforeEach(() => {
    process.env.EMAIL_PROVIDER = 'emailjs';
    process.env.EMAILJS_SERVICE_ID = 'service_test';
    process.env.EMAILJS_TEMPLATE_ID = 'template_test';
    process.env.EMAILJS_PUBLIC_KEY = 'test-public-key';
    delete process.env.EMAILJS_PRIVATE_KEY;
  });

  test('sends the server OTP to the requested recipient and accepts plain-text OK', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('OK') });

    await expect(require('../../src/config/mailer').sendMail(otpMail)).resolves.toEqual({ accepted: true });
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://api.emailjs.com/api/v1.0/email/send');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.signal).toBeInstanceOf(globalThis.AbortSignal);
    expect(JSON.parse(options.body)).toEqual({
      service_id: 'service_test', template_id: 'template_test', user_id: 'test-public-key',
      template_params: { email: mail.to, subject: mail.subject, passcode: '012345', time: '10 phút' },
    });
    expect(require('nodemailer').createTransport).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test('includes the private accessToken only when configured', async () => {
    process.env.EMAILJS_PRIVATE_KEY = 'test-private-key';
    globalThis.fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('"OK"') });
    await require('../../src/config/mailer').sendMail(otpMail);
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body).accessToken).toBe('test-private-key');
  });

  test.each(['EMAILJS_SERVICE_ID', 'EMAILJS_TEMPLATE_ID', 'EMAILJS_PUBLIC_KEY'])('missing %s fails before sending', async (key) => {
    delete process.env[key];
    await expect(require('../../src/config/mailer').sendMail(otpMail)).rejects.toThrow('EmailJS requires EMAILJS');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test.each([
    { otp: undefined }, { otp: 123456 }, { otp: '12345' }, { otp: 'abcdef' },
    { expiresMinutes: 0 }, { expiresMinutes: undefined },
  ])('invalid OTP parameters do not send a blank verification email: %j', async (invalid) => {
    await expect(require('../../src/config/mailer').sendMail({ ...otpMail, ...invalid }))
      .rejects.toThrow('six-digit OTP');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test.each([400, 401, 403, 422, 429, 500])('HTTP %s is a delivery failure without disclosing keys or OTPs', async (status) => {
    globalThis.fetch.mockResolvedValue({
      ok: false, status,
      text: () => Promise.resolve('private response test-public-key test-private-key 012345'),
    });
    await expect(require('../../src/config/mailer').sendMail(otpMail))
      .rejects.toThrow(`EmailJS rejected email (HTTP ${status})`);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(require('nodemailer').createTransport).not.toHaveBeenCalled();
  });

  test('non-browser access failures add an actionable hint without the raw response', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false, status: 403,
      text: () => Promise.resolve('API calls are disabled for non-browser applications. private response'),
    });
    await expect(require('../../src/config/mailer').sendMail(otpMail))
      .rejects.toThrow('EmailJS rejected email (HTTP 403, non-browser API access disabled)');
  });

  test('an aborted request fails without retry or provider fallback', async () => {
    globalThis.fetch.mockRejectedValue(new Error('request aborted'));
    await expect(require('../../src/config/mailer').sendMail(otpMail)).rejects.toThrow('request aborted');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(require('nodemailer').createTransport).not.toHaveBeenCalled();
  });

  test('unexpected HTTP 200 content is not accepted as a successful send', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('<html>unavailable</html>') });
    await expect(require('../../src/config/mailer').sendMail(otpMail)).rejects.toThrow('unexpected success response');
  });
});
