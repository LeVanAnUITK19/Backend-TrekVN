'use strict';

// Hooks cover admin edits, rating recalculations and contribution approvals.
module.exports = (schema) => {
  for (const operation of ['save', 'insertMany', 'findOneAndUpdate', 'updateOne', 'updateMany', 'findOneAndDelete', 'deleteOne', 'deleteMany']) {
    schema.post(operation, async () => {
      await require('../../services/catalogCache').getCatalogCache().invalidate();
    });
  }
};
