import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. "INV-20261007"
  seq: { type: Number, default: 0 },
});

/** Atomic, gap-free-on-commit sequence generator. Pass the transaction session so rollbacks release the number. */
counterSchema.statics.next = async function next(key, session) {
  try {
    const doc = await this.findOneAndUpdate(
      { _id: key },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true, session }
    );
    return doc.seq;
  } catch (err) {
    // Under high concurrency on new day keys, two threads may collide on the initial upsert (E11000).
    // The second thread can safely retry a standard increment.
    if (err.code === 11000) {
      const doc = await this.findOneAndUpdate(
        { _id: key },
        { $inc: { seq: 1 } },
        { new: true, session }
      );
      if (doc) return doc.seq;
    }
    throw err;
  }
};

export default mongoose.models.Counter || mongoose.model('Counter', counterSchema);
