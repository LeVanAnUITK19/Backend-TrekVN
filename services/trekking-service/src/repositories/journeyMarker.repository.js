'use strict';

const JourneyMarker = require('../models/JourneyMarker');

const findByJourney = (journeyId) =>
  JourneyMarker.find({ journeyId }).sort({ markedAt: 1 });

const findById = (id) => JourneyMarker.findById(id);

const findByIdAndJourney = (id, journeyId) =>
  JourneyMarker.findOne({ _id: id, journeyId });

const findByIdAndUser = (id, userId) =>
  JourneyMarker.findOne({ _id: id, userId });

const findByClientMarkerId = (journeyId, userId, clientMarkerId) =>
  JourneyMarker.findOne({ journeyId, userId, clientMarkerId });

const findByIds = (ids) => JourneyMarker.find({ _id: { $in: ids } });

const create = (data) => JourneyMarker.create(data);

const updateById = (id, data) =>
  JourneyMarker.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });

const deleteById = (id) => JourneyMarker.findByIdAndDelete(id);

module.exports = {
  findByJourney,
  findById,
  findByIdAndJourney,
  findByIdAndUser,
  findByClientMarkerId,
  findByIds,
  create,
  updateById,
  deleteById,
};
