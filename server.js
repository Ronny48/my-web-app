require("dotenv").config();
const jwt = require("jsonwebtoken");
const marked = require("marked");
const sanitizeHTML = require("sanitize-html");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const express = require("express");
const db = require("better-sqlite3")("OurApp.db");
db.pragma("journal_mode = WAL");

// databse setup here
const createTables = db.transaction(() => {
  db.prepare(
    `
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username STRING NOT NULL UNIQUE,
            password STRING NOT NULL
        )       
        `
  ).run();

  db.prepare(
    `
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            createdDate TEXT,
            title STRING NOT NULL,
            body TEXT NOT NULL,
            authorId INTEGER,
            FOREIGN KEY (authorId) REFERENCES users (id)
        )       
        `
  ).run();
  db.prepare(
    `
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            postId INTEGER NOT NULL,
            authorId INTEGER,
            authorName TEXT,
            content TEXT NOT NULL,
            createdAt TEXT,
            FOREIGN KEY (authorId) REFERENCES users (id),
            FOREIGN KEY (postId) REFERENCES posts (id)
        )
        `
  ).run();
});

createTables();

const app = express();

app.use(express.json());

const path = require("path");

const PORT = process.env.PORT || 4000;

// Use the correct path to your .db file
const dbPath = path.join(__dirname, "users.db");

// Debug route to list all users
app.get("/admin/users", (req, res) => {
  try {
    const stmt = db.prepare("SELECT * FROM users"); // Assuming your table is called "users"
    const users = stmt.all();
    res.json(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Could not fetch users" });
  }
});

// database setup ends here

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: false }));
app.use(express.static("public"));
app.use(cookieParser());

app.use(function (req, res, next) {
  //make our markdown function available in our templates
  res.locals.filterUserHTML = function (content) {
    return sanitizeHTML(marked.parse(content), {
      allowedTags: [
        "p",
        "br",
        "ul",
        "li",
        "ol",
        "strong",
        "bold",
        "i",
        "em",
        "u",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
      ],
      allowedAttributes: {},
    });
  };

  res.locals.errors = [];

  //try to decode incoming cookies
  try {
    const decode = jwt.verify(req.cookies.ourSimpleApp, process.env.JWT_SECRET);
    req.user = decode;
  } catch (err) {
    req.user = false;
  }

  res.locals.user = req.user;

  next();
});

app.get("/", (req, res) => {
  if (req.user) {
    const postsStatement = db.prepare(
      "SELECT * FROM posts WHERE authorId = ? ORDER BY createdDate DESC"
    );
    const posts = postsStatement.all(req.user.userid);
    return res.render("dashboard", { posts });
  }

  res.render("homepage");
});

// New public dashboard: feed of all posts (like a feed with comments)
app.get("/dashboard", (req, res) => {
  res.render("feed");
});

// API: fetch all posts (with author names)
app.get("/api/posts", (req, res) => {
  try {
    const stmt = db.prepare(
      "SELECT posts.*, users.username FROM posts INNER JOIN users ON posts.authorId = users.id ORDER BY createdDate DESC"
    );
    const posts = stmt.all();
    res.json(posts);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "could not fetch posts" });
  }
});

// API: get comments for a post
app.get("/api/posts/:id/comments", (req, res) => {
  try {
    const stmt = db.prepare(
      "SELECT * FROM comments WHERE postId = ? ORDER BY createdAt ASC"
    );
    const comments = stmt.all(req.params.id);
    res.json(comments);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "could not fetch comments" });
  }
});

// API: add comment to a post
app.post("/api/posts/:id/comments", (req, res) => {
  try {
    const postId = Number(req.params.id);
    const content = String(req.body.content || "").trim();
    if (!content) return res.status(400).json({ error: "empty" });

    const authorId = req.user ? req.user.userid : null;
    const authorName = req.user
      ? req.user.username
      : req.body.authorName || "Anonymous";

    const insert = db.prepare(
      "INSERT INTO comments (postId, authorId, authorName, content, createdAt) VALUES (?, ?, ?, ?, ?)"
    );
    const result = insert.run(
      postId,
      authorId,
      authorName,
      content,
      new Date().toISOString()
    );

    res.json({
      id: result.lastInsertRowid,
      postId,
      authorId,
      authorName,
      content,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "could not save comment" });
  }
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/logout", (req, res) => {
  res.clearCookie("ourSimpleApp");
  res.redirect("/");
});

app.post("/login", (req, res) => {
  let errors = [];

  if (typeof req.body.username !== "string") req.body.username = "";
  if (typeof req.body.password !== "string") req.body.password = "";

  if (req.body.username.trim() == "") errors = ["Invalid Username / Password"];
  if (req.body.password == "") errors = ["Invalid Username / Password"];

  if (errors.length) {
    return res.render("login", { errors });
  }

  const userInQuestionStatement = db.prepare(
    "SELECT * FROM users WHERE username = ?"
  );
  const userInQuestion = userInQuestionStatement.get(req.body.username);

  if (!userInQuestion) {
    errors = ["Invalid Username / Password"];
    return res.render("login", { errors });
  }

  const matchOrNot = bcrypt.compareSync(
    req.body.password,
    userInQuestion.password
  );
  if (!matchOrNot) {
    errors = ["Invalid Username / Password"];
    return res.render("login", { errors });
  }

  const ourTokenValue = jwt.sign(
    {
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      skycolor: "blue",
      userid: userInQuestion.id,
      username: userInQuestion.username,
    },
    process.env.JWT_SECRET
  );

  res.cookie("ourSimpleApp", ourTokenValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 1000 * 60 * 60 * 24,
  });

  res.redirect("/");
});

function mustBeLoggedIn(req, res, next) {
  if (req.user) {
    return next();
  }
  return res.redirect("/");
}

app.get("/create-post", mustBeLoggedIn, (req, res) => {
  res.render("create-post");
});

function sharedPostValidation(req) {
  const errors = [];

  if (typeof req.body.title !== "string") req.body.title = "";
  if (typeof req.body.body !== "string") req.body.body = "";

  //triim - sanitize or strip hmtl tags
  req.body.title = sanitizeHTML(req.body.title.trim(), {
    allowedTags: [],
    allowedAttributes: {},
  });
  req.body.body = sanitizeHTML(req.body.body.trim(), {
    allowedTags: [],
    allowedAttributes: {},
  });

  if (!req.body.title) errors.push("You must provide a title");
  if (!req.body.body) errors.push("You must provide content");

  return errors;
}

app.get("/edit-post/:id", mustBeLoggedIn, (req, res) => {
  //try to lookup the post
  const statement = db.prepare("SELECT * FROM posts WHERE id = ?");
  const post = statement.get(req.params.id);

  if (!post) {
    return res.redirect("/");
  }

  //if not author of the post, redirect to homepage
  if (post.authorId !== req.user.userid) {
    return res.redirect("/");
  }

  //otherwise, render the edit-post template
  res.render("edit-post", { post });
});

app.post("/edit-post/:id", mustBeLoggedIn, (req, res) => {
  //try to lookup the post
  const statement = db.prepare("SELECT * FROM posts WHERE id = ?");
  const posts = statement.get(req.params.id);

  if (!posts) {
    return res.redirect("/");
  }

  //if not author of the post, redirect to homepage
  if (posts.authorId !== req.user.userid) {
    return res.redirect("/");
  }

  const errors = sharedPostValidation(req);

  if (errors.length) {
    return res.render("edit-post", { errors });
  }

  //update the post in the database
  const updateStatement = db.prepare(
    "UPDATE posts SET title = ?, body = ? WHERE id = ?"
  );
  updateStatement.run(req.body.title, req.body.body, req.params.id);

  res.redirect(`/post/${req.params.id}`);
});

app.post("/delete-post/:id", mustBeLoggedIn, (req, res) => {
  //try to lookup the post
  const statement = db.prepare("SELECT * FROM posts WHERE id = ?");
  const posts = statement.get(req.params.id);

  if (!posts) {
    return res.redirect("/");
  }

  //if not author of the post, redirect to homepage
  if (posts.authorId !== req.user.userid) {
    return res.redirect("/");
  }

  const deleteStatement = db.prepare("DELETE FROM posts WHERE id = ?");
  deleteStatement.run(req.params.id);

  res.redirect("/");
});

//.params.id is used to get the unique id from the url pattern
app.get("/post/:id", (req, res) => {
  const ourStatement = db.prepare(
    "SELECT posts.*, users.username FROM posts INNER JOIN users ON posts.authorId = users.id WHERE posts.id = ?"
  );
  const post = ourStatement.get(req.params.id);

  if (!post) {
    return res.redirect("/");
  }

  const isAuthor = post.authorId === req.user.userid;

  res.render("single-post", { post, isAuthor });
});

app.post("/create-post", mustBeLoggedIn, (req, res) => {
  const errors = sharedPostValidation(req);

  if (errors.length) {
    return res.render("create-post", { errors });
  }

  //save the post to the database
  const ourStatement = db.prepare(
    "INSERT INTO posts (title, body, authorId, createdDate) VALUES (?, ?, ?, ?)"
  );
  const result = ourStatement.run(
    req.body.title,
    req.body.body,
    req.user.userid,
    new Date().toISOString()
  );

  const gestPostStatement = db.prepare("SELECT * FROM posts WHERE ROWID = ?");
  const realPost = gestPostStatement.get(result.lastInsertRowid);

  res.redirect(`/post/${realPost.id}`);
});

app.post("/register", (req, res) => {
  const errors = [];

  if (typeof req.body.username !== "string") req.body.username = "";
  if (typeof req.body.password !== "string") req.body.password = "";

  req.body.username = req.body.username.trim();

  if (!req.body.username) errors.push("Username is required");
  if (req.body.username && req.body.username.length < 3)
    errors.push("Username must be at least 3 characters");
  if (req.body.username && req.body.username.length > 10)
    errors.push("Username cannot be more than 10 characters");
  if (req.body.username && !req.body.username.match(/^[a-zA-Z0-9]+$/))
    errors.push("Username can only contain letters and numbers");

  //check if the username is already taken
  const usernameStatement = db.prepare(
    "SELECT * FROM users WHERE username = ?"
  );
  const usernameCheck = usernameStatement.get(req.body.username);

  if (usernameCheck) errors.push("Username is already taken");

  if (!req.body.password) errors.push("Password is required");
  if (req.body.password && req.body.password.length < 12)
    errors.push("Password must be at least 12 characters");
  if (req.body.password && req.body.password.length > 70)
    errors.push("Password cannot be more than 70 characters");

  if (errors.length) {
    return res.render("homepage", { errors });
  }

  //save the new user to the database
  const salt = bcrypt.genSaltSync(10);
  req.body.password = bcrypt.hashSync(req.body.password, salt);

  const ourStatement = db.prepare(
    "INSERT INTO users (username, password) VALUES (?, ?)"
  );
  const result = ourStatement.run(req.body.username, req.body.password);

  const lookupStatement = db.prepare("SELECT * FROM users WHERE ROWID = ?");
  const ourUser = lookupStatement.get(result.lastInsertRowid);
  //log the user in by giving them a cookie
  const ourTokenValue = jwt.sign(
    {
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      skycolor: "blue",
      userid: ourUser.id,
      username: ourUser.username,
    },
    process.env.JWT_SECRET
  );

  res.cookie("ourSimpleApp", ourTokenValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 1000 * 60 * 60 * 24,
  });

  res.redirect("/");
});

app.get("/admin/users", (req, res) => {
  try {
    const stmt = db.prepare("SELECT id, username FROM users");
    const users = stmt.all();
    res.json(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Secure endpoint for Render Cron (or other schedulers) to trigger a GET to API_URL
app.get("/cron/ping", (req, res) => {
  const secret = req.header("X-Cron-Secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(403).send("forbidden");
  }

  // perform the GET
  const https = require("https");
  https
    .get(process.env.API_URL, (r) => {
      if (r.statusCode === 200) {
        console.log("GET request sent successfully");
        return res.status(200).send("ok");
      }
      console.log("GET request failed", r.statusCode);
      return res.status(502).send("bad gateway");
    })
    .on("error", (e) => {
      console.error("Error while sending request", e);
      return res.status(500).send("error");
    });
});

app.listen(PORT, () => {
  console.log(`Server live on port ${PORT}`);
});
