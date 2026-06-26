const mongoose = require('mongoose');

const ClientRequestSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  location: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  time: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    required: false
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'cancelled'],
    default: 'pending'
  },
  offers: [
    {
      contractor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      price: {
        type: Number,
        required: true
      },
      status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ClientRequest', ClientRequestSchema);
