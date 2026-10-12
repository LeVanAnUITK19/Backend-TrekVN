'use strict';

const markerService = require('../services/marker.service');

const getMarkers = async (req, res, next) => {
  try {
    const markers = await markerService.getMarkers(req.user.userId, req.params.journeyId);
    res.json({ success: true, data: markers });
  } catch (err) { next(err); }
};

const createMarker = async (req, res, next) => {
  try {
    const marker = await markerService.createMarker(
      req.user.userId,
      req.params.journeyId,
      req.body
    );
    res.status(201).json({ success: true, data: marker });
  } catch (err) { next(err); }
};

const updateMarker = async (req, res, next) => {
  try {
    const marker = await markerService.updateMarker(
      req.user.userId,
      req.params.journeyId,
      req.params.markerId,
      req.body
    );
    res.json({ success: true, data: marker });
  } catch (err) { next(err); }
};

const deleteMarker = async (req, res, next) => {
  try {
    await markerService.deleteMarker(
      req.user.userId,
      req.params.journeyId,
      req.params.markerId
    );
    res.status(204).end();
  } catch (err) { next(err); }
};

module.exports = { getMarkers, createMarker, updateMarker, deleteMarker };
