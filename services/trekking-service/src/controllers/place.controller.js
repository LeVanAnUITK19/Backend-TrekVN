'use strict';

const placeService = require('../services/place.service');
const storageService = require('../services/storage.service');
const placeRepo = require('../repositories/place.repository');
const { Errors, AppError } = require('../utils/errors');
const axios = require('axios');
const { pipeline } = require('node:stream');

// Stream only the published place object. The browser does not need bucket CORS
// and cannot choose an arbitrary upstream URL through this endpoint.
const adminDownloadPlaceOfflineMap = async (req, res, next) => {
  const controller = new AbortController();
  req.once('aborted', () => controller.abort());
  res.once('close', () => { if (!res.writableFinished) {controller.abort();} });
  try {
    const map = await placeService.adminGetPlaceOfflineMap(req.params.id);
    if (!map.available || !map.objectKey) {
      throw new AppError('Địa điểm chưa có gói bản đồ offline đã xuất bản.', 404, 'OFFLINE_MAP_NOT_AVAILABLE');
    }
    if (!map.downloadUrl) {
      throw new AppError('Backend chưa cấu hình link tải gói bản đồ.', 503, 'OFFLINE_MAP_URL_MISSING');
    }
    const upstream = await axios.get(map.downloadUrl, {
      responseType: 'stream', signal: controller.signal, timeout: 120000,
    });
    if (controller.signal.aborted) { upstream.data.destroy(); return; }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="offline-map.zip"');
    res.setHeader('Cache-Control', 'private, no-store');
    pipeline(upstream.data, res, (error) => { if (error && !res.destroyed) {res.destroy(error);} });
  } catch (error) {
    if (controller.signal.aborted) {return;}
    if (error instanceof AppError) {return next(error);}
    next(new AppError('Không thể tải ZIP bản đồ đã xuất bản từ kho lưu trữ.',
      error.response?.status === 404 ? 404 : 502, 'OFFLINE_MAP_DOWNLOAD_FAILED'));
  }
};

const getPlaces = async (req, res, next) => {
  try {
    const result = await placeService.getPlaces(req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getPlaceById = async (req, res, next) => {
  try {
    const place = await placeService.getPlaceById(req.params.placeId);
    res.json({ success: true, data: place });
  } catch (err) { next(err); }
};

const getPlaceRoutes = async (req, res, next) => {
  try {
    const routes = await placeService.getPlaceRoutes(req.params.placeId);
    res.json({ success: true, data: routes });
  } catch (err) { next(err); }
};

const getPlaceOfflinePackage = async (req, res, next) => {
  try {
    const result = await placeService.getPlaceOfflinePackage(req.params.placeId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const checkPlaceOfflinePackage = async (req, res, next) => {
  try {
    const result = await placeService.checkPlaceOfflinePackage(
      req.params.placeId,
      req.query.version
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// ─── Admin ────────────────────────────────────────────────────────────────────

const adminGetPlaces = async (req, res, next) => {
  try {
    const result = await placeService.adminGetPlaces(req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const adminListPlacesWithOfflineMap = async (req, res, next) => {
  try {
    const result = await placeService.adminListPlacesWithOfflineMap(req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const adminGetPlaceById = async (req, res, next) => {
  try {
    const place = await placeService.adminGetPlaceById(req.params.id);
    res.json({ success: true, data: place });
  } catch (err) { next(err); }
};

const adminCreatePlace = async (req, res, next) => {
  try {
    const place = await placeService.adminCreatePlace(req.body);
    res.status(201).json({ success: true, data: place });
  } catch (err) { next(err); }
};

const adminUpdatePlace = async (req, res, next) => {
  try {
    const place = await placeService.adminUpdatePlace(req.params.id, req.body);
    res.json({ success: true, data: place });
  } catch (err) { next(err); }
};

const adminUpdatePlaceStatus = async (req, res, next) => {
  try {
    const place = await placeService.adminUpdatePlaceStatus(req.params.id, req.body.status);
    res.json({ success: true, data: place });
  } catch (err) { next(err); }
};

// ─── Admin Offline Map (Place scope) ──────────────────────────────────────────

const adminGetPlaceOfflineMap = async (req, res, next) => {
  try {
    const result = await placeService.adminGetPlaceOfflineMap(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const adminUpdatePlaceOfflineMap = async (req, res, next) => {
  try {
    const result = await placeService.adminUpdatePlaceOfflineMap(req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const adminDeletePlace = async (req, res, next) => {
  try {
    await placeService.adminDeletePlace(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
};

// ─── Admin Image Upload ────────────────────────────────────────────────────────

/**
 * POST /admin/trekking/places/:id/images
 * Upload 1–10 ảnh địa điểm lên Cloudinary, thêm URL vào place.images.
 * Body: multipart/form-data, field "images" (multiple files).
 */
const adminUploadPlaceImages = async (req, res, next) => {
  try {
    const place = await placeRepo.findById(req.params.id);
    if (!place) {throw Errors.placeNotFound(req.params.id);}

    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có file nào được gửi lên' });
    }
    if (files.length > 10) {
      return res.status(400).json({ success: false, message: 'Tối đa 10 ảnh mỗi lần upload' });
    }

    // Upload tuần tự để tránh quá tải Cloudinary
    const uploadedUrls = [];
    for (const file of files) {
      const url = await storageService.uploadPlaceImage(file.buffer, req.params.id);
      uploadedUrls.push(url);
    }

    // Gộp với ảnh hiện có, giới hạn 20
    const existingImages = place.images || [];
    const allImages = [...existingImages, ...uploadedUrls].slice(0, 20);
    const updatedPlace = await placeRepo.updateById(req.params.id, { images: allImages });

    res.json({ success: true, data: { urls: uploadedUrls, images: updatedPlace.images } });
  } catch (err) { next(err); }
};

/**
 * POST /admin/trekking/places/:id/map-image
 * Upload ảnh bản đồ địa điểm lên Cloudinary, lưu URL vào place.imageMapUrl.
 * Body: multipart/form-data, field "image" (single file).
 */
const adminUploadPlaceMapImage = async (req, res, next) => {
  try {
    const place = await placeRepo.findById(req.params.id);
    if (!place) {throw Errors.placeNotFound(req.params.id);}

    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'Không có file nào được gửi lên' });
    }

    const url = await storageService.uploadPlaceMapImage(file.buffer, req.params.id);
    const updatedPlace = await placeRepo.updateById(req.params.id, { imageMapUrl: url });

    res.json({ success: true, data: { url, imageMapUrl: updatedPlace.imageMapUrl } });
  } catch (err) { next(err); }
};

module.exports = {
  getPlaces, getPlaceById, getPlaceRoutes,
  getPlaceOfflinePackage, checkPlaceOfflinePackage,
  adminListPlacesWithOfflineMap,
  adminGetPlaces, adminGetPlaceById, adminCreatePlace, adminUpdatePlace,
  adminUpdatePlaceStatus, adminDeletePlace,
  adminGetPlaceOfflineMap, adminUpdatePlaceOfflineMap,
  adminDownloadPlaceOfflineMap,
  adminUploadPlaceImages, adminUploadPlaceMapImage,
};
