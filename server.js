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
});

createTables();

const app = express();

app.use(express.json());

app.get('/admin/users', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM users'); // Assuming your table is called "users"
    const users = stmt.all();
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Could not fetch users' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is live at http://localhost:${PORT}`);
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
    const decode = jwt.verify(req.cookies.ourSimpleApp, process.env.JWTSECRET);
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
    process.env.JWTSECRET
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
    process.env.JWTSECRET
  );

  res.cookie("ourSimpleApp", ourTokenValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 1000 * 60 * 60 * 24,
  });

  res.redirect("/");
});

app.listen(3000);
