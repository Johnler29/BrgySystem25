// models/SystemSettings.js
const mongoose = require('mongoose');

const SystemSettingsSchema = new mongoose.Schema({
  maintenanceMode: { type: Boolean, default: false },
  allowRegistration: { type: Boolean, default: true },
  debugMode: { type: Boolean, default: false },
  logLevel: { type: String, default: 'info' }, // error|warning|info|debug
  autoClearLogsDays: { type: String, default: '30' },
}, { timestamps: true });

module.exports = mongoose.model('SystemSettings', SystemSettingsSchema);
