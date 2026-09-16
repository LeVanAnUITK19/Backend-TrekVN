const nodemailer = require('nodemailer');

/**
 * Tạo transporter dùng Gmail + App Password
 * EMAIL_USER: địa chỉ Gmail
 * EMAIL_PASS: App Password (16 ký tự, bật 2FA trước)
 */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

module.exports = transporter;
