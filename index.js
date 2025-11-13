const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const connectDB = require("./db");
const News = require("./models/News");
const User = require("./models/User");
const Dropbox = require("dropbox").Dropbox;
require("dotenv").config();

const PORT = process.env.PORT || 8000;
const app = express();

app.use(cors());
app.use(bodyParser.json());

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, process.env.SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}
// login api with jwt token generation using user from database
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    // Find user by username
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Compare password with hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate JWT token
    const tokenPayload = { id: user._id, username: user.username };
    const accessToken = jwt.sign(tokenPayload, process.env.SECRET_KEY, {
      expiresIn: "1h",
    });
    
    res.json({ accessToken });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Create user API
app.post("/users",  async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
      return res.status(400).json({ 
        message: "Username, email, and password are required" 
      });
    }

    // Check if username already exists
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ message: "Username already exists" });
    }

    // Check if email already exists
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // Hash password before creating user
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user with hashed password
    const user = new User({
      username,
      email,
      password: hashedPassword,
    });

    await user.save();

    // Return user without password
    const userResponse = {
      id: user._id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.status(201).json({ 
      message: "User created successfully", 
      user: userResponse 
    });
  } catch (err) {
    console.error("Create user error:", err);
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

// Routes
//handle image upload using multer
const dbx = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });

const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const UPLOAD_FILE_SIZE_LIMIT = 70 * 1024 * 1024;
//Handle file upload to dropbox
const handleFileUpload = async (file) => {
  let sharedLink;
  const dropboxPath = "/" + Date.now() + "-" + file.originalname;
  // Upload file to Dropbox
  const response = await dbx.filesUpload({
    path: dropboxPath,
    contents: file.buffer,
  });
  try {
    const linkRes = await dbx.sharingCreateSharedLinkWithSettings({
      path: response.result.path_display,
    });
    sharedLink = linkRes.result.url; // direct download
  } catch (err) {
    // If link already exists
    if (err.error?.shared_link_already_exists) {
      const linkRes = await dbx.sharingListSharedLinks({
        path: response.result.path_display,
      });
      sharedLink = linkRes.result.links[0].url;
    } else {
      throw err;
    }
  }
  return sharedLink
    .replace("www.dropbox.com", "dl.dropboxusercontent.com")
    .replace("?dl=0", "?raw=1");
};
// News CRUD operations
app.post("/news",authenticateToken, upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    if (file.size > UPLOAD_FILE_SIZE_LIMIT) {
      return res.status(400).json({ error: "File size exceeds 70MB limit" });
    }
    const sharedLink = await handleFileUpload(file);
    const news = new News(req.body);
    news.image = sharedLink;
    await news.save();
    res.status(201).json({ message: "done", news });
  } catch (err) {
    res.status(400).send(err);
  }
});

app.get("/news", async (req, res) => {
  try {
    const news = await News.find().sort({ createdAt: -1 });
    res.status(200).send(news);
  } catch (err) {
    res.status(500).send(err);
  }
});
app.get("/news/:id", async (req, res) => {
  try {
    const news = await News.findById(req.params.id);
    if (!news) {
      return res.status(404).send({ message: "News not found" });
    }
    res.status(200).send(news);
  } catch (err) {
    res.status(500).send(err);
  }
});
app.put("/news/:id",authenticateToken, upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    const news = await News.findById(req.params.id);
    if (!news) {
      return res.status(404).json({ message: "News not found" });
    }

    // Only update image if a new file is uploaded
    if (file) {
      if (file.size > UPLOAD_FILE_SIZE_LIMIT) {
        return res.status(400).json({ error: "File size exceeds 70MB limit" });
      }
      const sharedLink = await handleFileUpload(file);
      news.image = sharedLink;
    }

    // Update text fields if provided
    news.title = req?.body?.title ? req.body.title : news.title;
    news.text = req?.body?.text ? req.body.text : news.text;
    news.place = req?.body?.place ? req.body.place : news.place;
    
    await news.save();

    res.status(200).json(news);
  } catch (err) {
    res.status(400).json(err);
  }
});
app.delete("/news/:id",authenticateToken, async (req, res) => {
  try {
    const news = await News.findByIdAndDelete(req.params.id);
    if (!news) {
      return res.status(404).send({ message: "News not found" });
    }
    res.status(200).send({ message: "News deleted" });
  } catch (err) {
    res.status(500).send(err);
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server listening on ${PORT}`);
  connectDB();
});
