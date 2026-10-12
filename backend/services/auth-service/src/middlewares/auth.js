const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../utils/errors');
const userRepository = require('../repositories/user.repository');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authorization token required');
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!decoded.id) {
      throw new UnauthorizedError('Invalid token payload');
    }
    const user = await userRepository.findById(decoded.id);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedError('Account is inactive or blocked');
    }
    if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      throw new UnauthorizedError('Session revoked; sign in again');
    }
    // Read current permissions rather than retaining a revoked ADMIN role in a JWT.
    req.user = { ...decoded, id: String(user._id), email: user.email, role: user.role };
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Invalid or expired token'));
    }
    next(err);
  }
};

module.exports = { authenticate };
