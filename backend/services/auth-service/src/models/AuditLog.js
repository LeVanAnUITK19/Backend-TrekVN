'use strict';

const mongoose = require('mongoose');

/**
 * AuditLog — ghi lại mọi action quan trọng của Admin.
 * Backend tự ghi, không có API tạo/sửa/xóa từ client (FR-ADM-04, BR-15).
 *
 * action: CREATE | UPDATE | DELETE | BLOCK | UNBLOCK | APPROVE | REJECT
 *         HIDE | PUBLISH | DISABLE | LOGIN | LOGOUT | XP_ADJUSTMENT
 *
 * entityType: USER | PLACE | ROUTE | MILESTONE | CONTRIBUTION | POST | COMMENT
 *             REVIEW | BADGE | OFFLINE_MAP | RANK
 */
const auditLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    adminName: { type: String, required: true },
    adminEmail: { type: String, required: true },

    action: {
      type: String,
      enum: [
        'CREATE', 'UPDATE', 'DELETE', 'BLOCK', 'UNBLOCK',
        'APPROVE', 'REJECT', 'HIDE', 'PUBLISH', 'DISABLE',
        'LOGIN', 'LOGOUT', 'XP_ADJUSTMENT',
      ],
      required: true,
    },

    entityType: {
      type: String,
      enum: [
        'USER', 'PLACE', 'ROUTE', 'MILESTONE', 'CONTRIBUTION',
        'POST', 'COMMENT', 'REVIEW', 'BADGE', 'OFFLINE_MAP', 'RANK',
      ],
      required: true,
    },

    entityId: { type: String, default: null },

    // Snapshot trước và sau khi thay đổi (bộ lọc đã loại bỏ secret fields)
    beforeSummary: { type: mongoose.Schema.Types.Mixed, default: null },
    afterSummary: { type: mongoose.Schema.Types.Mixed, default: null },

    result: {
      type: String,
      enum: ['SUCCESS', 'FAILURE'],
      default: 'SUCCESS',
    },

    ipAddress: { type: String, default: null },
    note: { type: String, default: null },

    timestamp: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    timestamps: false,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

auditLogSchema.index({ adminId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ entityType: 1 });
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ result: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
