// Đặt biến môi trường trước khi Jest chạy bất kỳ test nào
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.PORT = '3002';
process.env.CHECKIN_MAX_GPS_ACCURACY_METERS = '50';
process.env.TREKKING_PROVIDER = 'mock';
