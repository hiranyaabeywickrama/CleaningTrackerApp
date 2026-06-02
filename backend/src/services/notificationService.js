const Notification = require('../models/Notification');

const createNotification = async ({ userId, type, title, message, data = {} }) => {
  const notification = await Notification.create({
    userId,
    type,
    title,
    message,
    data
  });

  return notification;
};

const emitSocketNotification = (io, userId, event, payload) => {
  if (!io || !userId) return;
  io.emit(`${event}:${userId}`, payload);
};

const notifyUser = async (io, { userId, type, title, message, data = {}, socketEvent }) => {
  const notification = await createNotification({ userId, type, title, message, data });

  if (io && socketEvent) {
    emitSocketNotification(io, userId, socketEvent, {
      notificationId: notification._id,
      type,
      title,
      message,
      data,
      createdAt: notification.createdAt
    });
  }

  return notification;
};

module.exports = {
  createNotification,
  emitSocketNotification,
  notifyUser
};
