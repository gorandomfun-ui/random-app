import mongoose from 'mongoose'

const ItemSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['image', 'quote', 'video', 'joke', 'web', 'fact']
  },
  source: {
    type: String,
    required: true
  },
  externalId: {
    type: String,
    required: true
  },
  title: String,
  text: String,
  url: String,
  thumb: String,
  lang: {
    type: String,
    default: 'unknown',
    enum: ['en', 'fr', 'de', 'jp', 'unknown']
  },
  tags: [String],
  isSafe: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  freshness: {
    type: Number,
    default: 0
  },
  quality: {
    type: Number,
    default: 0
  },
  likeCount: {
    type: Number,
    default: 0
  },
  dislikeCount: {
    type: Number,
    default: 0
  },
  showWeight: {
    type: Number,
    default: 1.0
  },
  isSuppressed: {
    type: Boolean,
    default: false
  }
})

// Index composé unique
ItemSchema.index({ source: 1, externalId: 1 }, { unique: true })
ItemSchema.index({ type: 1 })
ItemSchema.index({ createdAt: -1 })
ItemSchema.index({ showWeight: -1 })

export default mongoose.models.Item || mongoose.model('Item', ItemSchema)