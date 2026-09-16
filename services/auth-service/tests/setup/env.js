/**
 * Thiết lập biến môi trường cho test
 * File này được load bởi Jest (setupFiles) TRƯỚC khi chạy bất kỳ test nào
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_RESET_SECRET = 'test-jwt-reset-secret-key';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_DAYS = '30';
process.env.BCRYPT_ROUNDS = '1'; // Giảm xuống 1 để test nhanh hơn
process.env.EMAIL_USER = 'test@trekvn.com';
