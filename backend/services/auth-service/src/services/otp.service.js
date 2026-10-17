const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const otpRepository = require('../repositories/otp.repository');
const transporter = require('../config/mailer');
const { registerOtpTemplate, resetPasswordOtpTemplate } = require('../utils/emailTemplates');
const { BadRequestError, TooManyRequestsError } = require('../utils/errors');
const logger = require('../config/logger');

const OTP_EXPIRES_MINUTES = 10;
const MAX_ATTEMPTS = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sinh OTP 6 chữ số an toàn bằng crypto
 */
const generateOtp = () => {
  const buffer = crypto.randomBytes(4);
  const num = buffer.readUInt32BE(0) % 1_000_000;
  return num.toString().padStart(6, '0');
};

/**
 * Chọn template phù hợp theo purpose
 */
const getEmailTemplate = (purpose, otp) => {
  switch (purpose) {
    case 'REGISTER':
      return registerOtpTemplate(otp, OTP_EXPIRES_MINUTES);
    case 'RESET_PASSWORD':
      return resetPasswordOtpTemplate(otp, OTP_EXPIRES_MINUTES);
    default:
      throw new Error(`Unknown OTP purpose: ${purpose}`);
  }
};

/**
 * Gửi email thực qua nodemailer
 */
const sendEmail = async (to, subject, html) => {
  await transporter.sendMail({
    from: `"TrekVN" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Tạo + gửi OTP cho email với mục đích cụ thể
 * @param {string} email
 * @param {'REGISTER'|'RESET_PASSWORD'} purpose
 * @param {string|null} userId
 */
const sendOtp = async (email, purpose, userId = null) => {
  // Hủy tất cả OTP cũ còn active của email + purpose này
  await otpRepository.revokeAllActive(email, purpose);

  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);

  await otpRepository.create({ userId, email, purpose, otpHash, expiresAt });

  const { subject, html } = getEmailTemplate(purpose, otp);

  try {
    await sendEmail(email, subject, html);
    logger.info(`[OTP] Sent ${purpose} OTP to ${email}`);
  } catch (err) {
    // Log lỗi gửi mail nhưng không throw để tránh leak thông tin
    logger.error(`[OTP] Failed to send email to ${email}: ${err.message}`);
  }

  return { expiresAt };
};

/**
 * Xác minh OTP — ném lỗi nếu không hợp lệ, trả về record nếu OK
 * @param {string} email
 * @param {'REGISTER'|'RESET_PASSWORD'} purpose
 * @param {string} otp
 */
const verifyOtp = async (email, purpose, otp) => {
  const record = await otpRepository.findActive(email, purpose);

  if (!record) {
    throw new BadRequestError('OTP không hợp lệ hoặc đã hết hạn');
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await otpRepository.revokeAllActive(email, purpose);
    throw new TooManyRequestsError('Vượt quá số lần thử. Vui lòng yêu cầu OTP mới');
  }

  const isMatch = await bcrypt.compare(otp, record.otpHash);
  if (!isMatch) {
    await otpRepository.incrementAttempts(record._id);
    const remaining = MAX_ATTEMPTS - record.attempts - 1;
    throw new BadRequestError(`OTP không đúng. Còn ${remaining} lần thử`);
  }

  await otpRepository.markUsed(record._id);
  return record;
};

module.exports = { sendOtp, verifyOtp };
