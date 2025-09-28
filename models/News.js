const mongoose = require("mongoose");

const newsSchema = new mongoose.Schema(
  {
    title: {
      type: mongoose.Schema.Types.String,
      required: true,
    },
    image: { type: mongoose.Schema.Types.String },
    text: { type: mongoose.Schema.Types.String, required: true },
    place: { type: mongoose.Schema.Types.String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("News", newsSchema);
