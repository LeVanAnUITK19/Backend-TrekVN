/**
 * Template HTML email xác minh đăng ký
 */
const registerOtpTemplate = (otp, expiresMinutes = 10) => ({
  subject: '[TrekVN] Mã xác minh đăng ký tài khoản',
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <div style="background: #1a7f4b; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">🏔️ TrekVN</h1>
      </div>
      <div style="padding: 32px;">
        <h2 style="color: #222; margin-top: 0;">Xác minh tài khoản của bạn</h2>
        <p style="color: #555; line-height: 1.6;">
          Cảm ơn bạn đã đăng ký <strong>TrekVN</strong>! Nhập mã OTP bên dưới để kích hoạt tài khoản.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <span style="
            display: inline-block;
            font-size: 36px;
            font-weight: bold;
            letter-spacing: 10px;
            color: #1a7f4b;
            background: #f0faf5;
            padding: 16px 28px;
            border-radius: 8px;
            border: 2px dashed #1a7f4b;
          ">${otp}</span>
        </div>
        <p style="color: #888; font-size: 13px; text-align: center;">
          Mã có hiệu lực trong <strong>${expiresMinutes} phút</strong>. Không chia sẻ mã này với bất kỳ ai.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #aaa; font-size: 12px; text-align: center;">
          Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email này.
        </p>
      </div>
    </div>
  `,
});

/**
 * Template HTML email reset mật khẩu
 */
const resetPasswordOtpTemplate = (otp, expiresMinutes = 10) => ({
  subject: '[TrekVN] Mã xác minh đặt lại mật khẩu',
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <div style="background: #c0392b; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">🏔️ TrekVN</h1>
      </div>
      <div style="padding: 32px;">
        <h2 style="color: #222; margin-top: 0;">Đặt lại mật khẩu</h2>
        <p style="color: #555; line-height: 1.6;">
          Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Nhập mã OTP bên dưới để tiếp tục.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <span style="
            display: inline-block;
            font-size: 36px;
            font-weight: bold;
            letter-spacing: 10px;
            color: #c0392b;
            background: #fdf5f4;
            padding: 16px 28px;
            border-radius: 8px;
            border: 2px dashed #c0392b;
          ">${otp}</span>
        </div>
        <p style="color: #888; font-size: 13px; text-align: center;">
          Mã có hiệu lực trong <strong>${expiresMinutes} phút</strong>. Không chia sẻ mã này với bất kỳ ai.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #aaa; font-size: 12px; text-align: center;">
          Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này. Tài khoản của bạn vẫn an toàn.
        </p>
      </div>
    </div>
  `,
});

module.exports = { registerOtpTemplate, resetPasswordOtpTemplate };
