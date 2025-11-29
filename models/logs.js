// models/logs.js
const mongoose = require('mongoose');

const common = {
  createdAt: { type: Date, default: Date.now, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
};

const ReportLogSchema = new mongoose.Schema({
  module: { type: String, index: true },          // resident|documents|cases|community|health|disaster|financial
  title: String,
  status: { type: String, enum: ['Completed','Pending','In Progress'], index: true },
  recordCount: Number,
  meta: Object,
  ...common,
});

const ActivityLogSchema = new mongoose.Schema({
  userName: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  activityType: { type: String, index: true },     // Create|Update|Delete|View|Export|Login|Logout|Download
  module: String,
  description: String,
  ipAddress: String,
  status: { type: String, enum: ['Success','Failed'], index: true },
  ...common,
});

const UserLogSchema = new mongoose.Schema({
  userId: String,
  username: String,
  fullName: String,
  role: String,
  email: String,
  status: { type: String, enum: ['Active','Inactive'], index: true },
  lastLogin: Date,
  loginCount: Number,
  ...common,
});

const SystemLogSchema = new mongoose.Schema({
  logLevel: { type: String, enum: ['Error','Warning','Info','Debug'], index: true },
  event: String,
  component: String,
  message: String,
  details: String,
  ...common,
});

module.exports = {
  ReportLog: mongoose.model('ReportLog', ReportLogSchema),
  ActivityLog: mongoose.model('ActivityLog', ActivityLogSchema),
  UserLog: mongoose.model('UserLog', UserLogSchema),
  SystemLog: mongoose.model('SystemLog', SystemLogSchema),
};
