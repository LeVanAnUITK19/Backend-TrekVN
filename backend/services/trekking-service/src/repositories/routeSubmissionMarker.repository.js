'use strict';

const RouteSubmissionMarker = require('../models/RouteSubmissionMarker');

const findBySubmission = (routeSubmissionId) =>
  RouteSubmissionMarker.find({ routeSubmissionId }).sort({ sequence: 1 });

const findById = (id) => RouteSubmissionMarker.findById(id);

const findByIdAndSubmission = (id, routeSubmissionId) =>
  RouteSubmissionMarker.findOne({ _id: id, routeSubmissionId });

const createMany = (docs) => RouteSubmissionMarker.insertMany(docs);

const updateById = (id, data) =>
  RouteSubmissionMarker.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });

module.exports = {
  findBySubmission,
  findById,
  findByIdAndSubmission,
  createMany,
  updateById,
};
