const Province = require('../models/Province');

const findById = (id) => Province.findById(id);

const findByCode = (code) => Province.findOne({ code });

const findAll = () => Province.find().sort({ region: 1, name: 1 });

const countAll = () => Province.countDocuments();

module.exports = { findById, findByCode, findAll, countAll };
