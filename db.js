const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DBURI, );
    console.log("✅ Database connection established");
    
  } catch (err) {
    console.error("❌ Unable to connect to DB:", err);
    process.exit(1);
  }
};

module.exports = connectDB;
