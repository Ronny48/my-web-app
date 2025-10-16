// dashboard feed: fetch posts and render, handle comments
(async function () {
  const feed = document.getElementById("feed");
  if (!feed) return;

  function timeAgo(iso) {
    const d = new Date(iso);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  }

  async function fetchPosts() {
    const res = await fetch("/api/posts");
    const posts = await res.json();
    render(posts);
  }

  function createPostNode(post) {
    const container = document.createElement("article");
    container.className = "post";
    // Build title and body safely:
    const titleHTML = post.title
      ? `<strong>${escapeHtml(post.title)}</strong><br>`
      : "";
    // preserve newlines in the body by converting to <br>
    const bodyText = escapeHtml(post.body || "").replace(/\n/g, "<br>");

    container.innerHTML = `
      <header class="post-header">
        <div class="post-author">${escapeHtml(post.username || "Unknown")}</div>
        <div class="post-meta">${timeAgo(post.createdDate)}</div>
      </header>
      <div class="post-body">${titleHTML}${bodyText}</div>
      <div class="post-actions">
        <button class="button show-comments">Comments</button>
      </div>
      <div class="comments" data-post-id="${post.id}">
        <div class="comments-list">Loading comments...</div>
        <form class="comment-form">
          <input name="content" placeholder="Write a comment" />
          <button class="button" type="submit">Reply</button>
        </form>
      </div>
    `;

    // hook comment form
    const commentForm = container.querySelector(".comment-form");
    commentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = commentForm.querySelector("[name=content]");
      const content = input.value.trim();
      if (!content) return;
      const postId = post.id;
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        input.value = "";
        await loadComments(post.id, container.querySelector(".comments-list"));
      } else {
        alert("Could not post comment");
      }
    });

    // hide comments by default
    const commentsWrap = container.querySelector(".comments");
    commentsWrap.style.display = "none";

    const showBtn = container.querySelector(".show-comments");
    showBtn.addEventListener("click", async () => {
      if (commentsWrap.style.display === "none") {
        commentsWrap.style.display = "";
        await loadComments(post.id, container.querySelector(".comments-list"));
      } else {
        commentsWrap.style.display = "none";
      }
    });

    return container;
  }

  async function loadComments(postId, target) {
    target.innerHTML = "Loading...";
    const res = await fetch(`/api/posts/${postId}/comments`);
    if (!res.ok) {
      target.innerHTML = "Could not load comments";
      return;
    }
    const comments = await res.json();
    if (!comments.length) {
      target.innerHTML = '<small class="muted">No comments yet</small>';
      return;
    }
    target.innerHTML = comments
      .map(
        (c) => `
      <div class="comment">
        <div class="comment-author">${escapeHtml(c.authorName || "Anon")}</div>
        <div class="comment-body">${escapeHtml(c.content)}</div>
      </div>
    `
      )
      .join("");
  }

  function escapeHtml(s) {
    if (!s) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function render(posts) {
    feed.innerHTML = "";
    if (!posts.length) {
      feed.innerHTML = '<p class="muted">No posts yet.</p>';
      return;
    }
    posts.forEach((p) => feed.appendChild(createPostNode(p)));
  }

  await fetchPosts();
})();
