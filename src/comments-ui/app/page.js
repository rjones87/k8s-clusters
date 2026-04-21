"use client";

import { useEffect, useState } from "react";

const emptyForm = {
  author: "",
  message: ""
};

export default function CommentsPage() {
  const [comments, setComments] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [selectedId, setSelectedId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadComments() {
    setError("");

    try {
      const response = await fetch("/api/comments", {
        headers: {
          Accept: "application/json"
        },
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`Failed to load comments (${response.status})`);
      }

      const data = await response.json();
      setComments(data);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadComments();
  }, []);

  function selectComment(comment) {
    setSelectedId(comment.id);
    setForm({
      author: comment.author,
      message: comment.message
    });
    setNotice("");
    setError("");
  }

  function resetForm() {
    setSelectedId(null);
    setForm(emptyForm);
    setNotice("");
    setError("");
  }

  async function saveComment(event) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setNotice("");

    const method = selectedId ? "PUT" : "POST";
    const url = selectedId ? `/api/comments/${selectedId}` : "/api/comments";

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(form)
      });

      const isNoContent = response.status === 204;
      const payload = isNoContent ? null : await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || `Request failed (${response.status})`);
      }

      setNotice(selectedId ? "Comment updated." : "Comment created.");
      resetForm();
      await loadComments();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteComment(id) {
    setError("");
    setNotice("");
    setIsSaving(true);

    try {
      const response = await fetch(`/api/comments/${id}`, {
        method: "DELETE"
      });

      if (!response.ok && response.status !== 204) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `Delete failed (${response.status})`);
      }

      if (selectedId === id) {
        resetForm();
      }

      setNotice("Comment deleted.");
      await loadComments();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <span className="eyebrow">Comments Console</span>
        <h1>Manage comments without leaving Kong.</h1>
        <p>
          This Next.js client talks to the comments API through the same gateway. Create,
          review, edit, and delete records from a dedicated UI while the API remains
          available at <code>/api/comments</code>.
        </p>
      </section>

      <section className="layout">
        <div className="panel">
          <h2>{selectedId ? "Edit Comment" : "Create Comment"}</h2>
          <p>
            Use the form to {selectedId ? "update the selected comment" : "publish a new comment"}.
          </p>

          {error ? <div className="alert alert-error">{error}</div> : null}
          {notice ? <div className="alert alert-success">{notice}</div> : null}

          <form className="form" onSubmit={saveComment}>
            <div className="field">
              <label htmlFor="author">Author</label>
              <input
                id="author"
                name="author"
                value={form.author}
                onChange={(event) =>
                  setForm((current) => ({ ...current, author: event.target.value }))
                }
                placeholder="Robin"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="message">Message</label>
              <textarea
                id="message"
                name="message"
                value={form.message}
                onChange={(event) =>
                  setForm((current) => ({ ...current, message: event.target.value }))
                }
                placeholder="Write a comment"
                required
              />
            </div>

            <div className="actions">
              <button className="button button-primary" type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : selectedId ? "Update Comment" : "Create Comment"}
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={resetForm}
                disabled={isSaving}
              >
                Clear
              </button>
            </div>
          </form>
        </div>

        <div className="panel stack">
          <div className="toolbar">
            <div>
              <h2>Existing Comments</h2>
              <p>Current records fetched live from the comments API.</p>
            </div>
            <div className="actions">
              <span className="badge">{comments.length} comments</span>
              <button className="button button-secondary" type="button" onClick={loadComments}>
                Refresh
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="empty">Loading comments...</div>
          ) : comments.length === 0 ? (
            <div className="empty">No comments yet. Create the first one from the form.</div>
          ) : (
            <div className="comment-list">
              {comments.map((comment) => (
                <article className="comment-card" key={comment.id}>
                  <h3>{comment.author}</h3>
                  <div className="comment-meta">
                    #{comment.id} • updated {new Date(comment.updated_at).toLocaleString()}
                  </div>
                  <p>{comment.message}</p>
                  <div className="actions">
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => selectComment(comment)}
                    >
                      Edit
                    </button>
                    <button
                      className="button button-danger"
                      type="button"
                      onClick={() => deleteComment(comment.id)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
