'use strict';

const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.originalUrl} not found`,
      details: {},
    },
  });
};

module.exports = { notFound };
