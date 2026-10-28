'use strict';
require('dotenv').config();
require('./server').startServer().catch((err) => {
  require('./config/logger').error({ message: 'Community startup failed', reason: err.message });
  process.exit(1);
});
