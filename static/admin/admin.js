(function () {
  "use strict";

  var sidebar = document.querySelector("#dashboard-sidebar");
  var menuToggle = document.querySelector("[data-menu-toggle]");
  var menuBackdrop = document.querySelector("[data-menu-backdrop]");
  var sessionStatus = document.querySelector("[data-session-status]");
  var accessNotice = document.querySelector("[data-access-notice]");
  var accessTitle = document.querySelector("[data-access-title]");
  var accessMessage = document.querySelector("[data-access-message]");
  var viewTitle = document.querySelector("[data-current-view]");
  var postForm = document.querySelector("[data-post-form]");
  var publishButton = document.querySelector("[data-publish-post]");
  var localUiPreview = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  var canPublish = false;
  var lastAutoSlug = "";
  var savedPostSnapshot = null;
  var isPublishing = false;
  var viewNames = {
    overview: "Overview",
    posts: "Posts",
    resources: "Resources",
    pages: "Key pages",
    media: "Media library",
    "post-editor": "Post editor"
  };

  function setMenu(open) {
    if (!sidebar || !menuToggle || !menuBackdrop) return;
    sidebar.classList.toggle("is-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    menuBackdrop.hidden = !open;
    document.body.style.overflow = open ? "hidden" : "";
  }

  function showView(view) {
    if (!viewNames[view]) view = "overview";

    document.querySelectorAll("[data-panel]").forEach(function (panel) {
      var active = panel.getAttribute("data-panel") === view;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });

    document.querySelectorAll(".nav-item[data-view]").forEach(function (item) {
      var active = item.getAttribute("data-view") === view;
      item.classList.toggle("is-active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });

    if (viewTitle) viewTitle.textContent = viewNames[view];
    if (window.location.hash !== "#" + view) history.replaceState(null, "", "#" + view);
    setMenu(false);
  }

  function displayUser(user) {
    var email = typeof user.email === "string" ? user.email : "Authenticated editor";
    var name = typeof user.name === "string" && user.name.trim() ? user.name.trim() : email.split("@")[0];
    var readableName = name.replace(/[._-]+/g, " ").replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
    var initials = readableName.split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0); }).join("").toUpperCase();

    document.querySelectorAll("[data-user-name]").forEach(function (element) { element.textContent = readableName; });
    document.querySelectorAll("[data-user-email]").forEach(function (element) { element.textContent = email; });
    document.querySelectorAll("[data-user-initials]").forEach(function (element) { element.textContent = initials || "AE"; });
    document.querySelectorAll("[data-greeting-name]").forEach(function (element) { element.textContent = ", " + readableName.split(" ")[0]; });
  }

  function setSessionState(state, message) {
    if (!sessionStatus) return;
    sessionStatus.classList.toggle("is-ready", state === "ready");
    sessionStatus.classList.toggle("is-error", state === "error");
    sessionStatus.lastChild.textContent = " " + message;
  }

  function formControl(name) {
    return postForm ? postForm.elements.namedItem(name) : null;
  }

  function postPayload() {
    return {
      title: formControl("title").value,
      slug: formControl("slug").value,
      date: formControl("date").value,
      description: formControl("description").value,
      featuredImage: formControl("featuredImage").value,
      socialImage: formControl("socialImage").value,
      socialImageAlt: formControl("socialImageAlt").value,
      gallery: formControl("gallery").value.split(/\r?\n/).map(function (item) { return item.trim(); }).filter(Boolean),
      body: formControl("body").value,
      sha: formControl("sha").value || null
    };
  }

  function hasUnsavedPostChanges() {
    return postForm && savedPostSnapshot !== null && savedPostSnapshot !== JSON.stringify(postPayload());
  }

  function updatePublishButton() {
    if (!publishButton || !postForm) return;
    var hasChanges = hasUnsavedPostChanges();
    publishButton.disabled = !canPublish || !hasChanges || isPublishing;
    if (isPublishing) publishButton.textContent = "Publishing...";
    else if (!canPublish) publishButton.textContent = "Publishing unavailable";
    else if (!hasChanges) publishButton.textContent = "No changes to publish";
    else publishButton.textContent = formControl("id").value ? "Publish changes" : "Publish post";
  }

  function setPublishPermission(allowed) {
    canPublish = Boolean(allowed);
    updatePublishButton();
  }

  function setEditorStatus(state, title, message, commitUrl) {
    var status = document.querySelector("[data-editor-status]");
    var statusTitle = document.querySelector("[data-editor-status-title]");
    var statusMessage = document.querySelector("[data-editor-status-message]");
    var commitLink = document.querySelector("[data-commit-link]");
    if (!status || !statusTitle || !statusMessage || !commitLink) return;

    status.hidden = false;
    status.classList.toggle("is-error", state === "error");
    status.classList.toggle("is-pending", state === "pending");
    statusTitle.textContent = title;
    statusMessage.textContent = message;
    commitLink.hidden = !commitUrl;
    if (commitUrl) commitLink.href = commitUrl;
  }

  function hideEditorStatus() {
    var status = document.querySelector("[data-editor-status]");
    if (status) status.hidden = true;
  }

  function clearFormErrors() {
    if (!postForm) return;
    postForm.querySelectorAll(".form-field").forEach(function (field) { field.classList.remove("has-error"); });
    postForm.querySelectorAll("[data-error]").forEach(function (element) {
      if (element.dataset.defaultText !== undefined) element.textContent = element.dataset.defaultText;
    });
  }

  function showFormErrors(errors) {
    if (!postForm || !errors) return;
    Object.keys(errors).forEach(function (name) {
      var control = formControl(name);
      var message = postForm.querySelector('[data-error="' + name + '"]');
      if (control && control.closest) control.closest(".form-field").classList.add("has-error");
      if (message) message.textContent = errors[name];
    });
    var firstError = postForm.querySelector(".form-field.has-error input, .form-field.has-error textarea");
    if (firstError) firstError.focus();
  }

  function slugify(value) {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100).replace(/-+$/g, "");
  }

  function resetPostForm() {
    if (!postForm) return;
    postForm.reset();
    clearFormErrors();
    hideEditorStatus();
    formControl("id").value = "";
    formControl("sha").value = "";
    formControl("slug").disabled = false;
    formControl("date").value = new Date().toISOString().slice(0, 10);
    lastAutoSlug = "";
    savedPostSnapshot = JSON.stringify(postPayload());
    updatePublishButton();
    var count = document.querySelector("[data-description-count]");
    if (count) count.textContent = "0";
  }

  function openNewPost() {
    resetPostForm();
    var title = document.querySelector("[data-editor-title]");
    var description = document.querySelector("[data-editor-description]");
    if (title) title.textContent = "Create a new post";
    if (description) description.textContent = "Complete the required fields, then publish the post to the website repository.";
    showView("post-editor");
    setPublishPermission(canPublish);
    if (!canPublish) {
      setEditorStatus("pending", "Publishing is not configured", "Connect the GitHub repository secret on the protected deployment before publishing.");
    }
    formControl("title").focus();
  }

  function fillPostForm(post) {
    resetPostForm();
    ["id", "sha", "title", "slug", "date", "description", "featuredImage", "socialImage", "socialImageAlt", "body"].forEach(function (name) {
      var control = formControl(name);
      if (control) control.value = post[name] || "";
    });
    formControl("gallery").value = Array.isArray(post.gallery) ? post.gallery.join("\n") : "";
    formControl("slug").disabled = true;
    savedPostSnapshot = JSON.stringify(postPayload());
    updatePublishButton();
    var count = document.querySelector("[data-description-count]");
    if (count) count.textContent = String((post.description || "").length);
  }

  async function openExistingPost(id) {
    showView("post-editor");
    resetPostForm();
    var heading = document.querySelector("[data-editor-title]");
    if (heading) heading.textContent = "Loading post...";
    setEditorStatus("pending", "Loading the repository version", "Checking the latest file before editing.");

    if (localUiPreview) {
      setPublishPermission(false);
      setEditorStatus("error", "Protected deployment required", "Existing post bodies are loaded through the authenticated repository API, not the local UI preview.");
      if (heading) heading.textContent = "Post editor";
      return;
    }

    try {
      var response = await fetch("/api/admin/posts/" + encodeURIComponent(id), {
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      var payload = await response.json();
      if (!response.ok || !payload.post) throw new Error(payload.error || "The post could not be loaded.");
      fillPostForm(payload.post);
      hideEditorStatus();
      if (heading) heading.textContent = "Edit post";
      var description = document.querySelector("[data-editor-description]");
      if (description) description.textContent = "The URL slug is locked. Publishing will update the existing post.";
      setPublishPermission(canPublish);
    } catch (error) {
      if (heading) heading.textContent = "Post editor";
      setEditorStatus("error", "Post could not be loaded", error instanceof Error ? error.message : "Try again later.");
    }
  }

  function setCount(kind, count) {
    document.querySelectorAll('[data-count="' + kind + '"]').forEach(function (element) {
      element.textContent = String(count);
    });
    document.querySelectorAll('[data-summary="' + kind + '"]').forEach(function (element) {
      var label = kind === "pages" ? "key pages" : kind;
      element.textContent = count + " " + label;
    });
  }

  function formatDate(value) {
    if (typeof value !== "string" || !value) return "Publication date not set";
    var date = new Date(value + "T00:00:00Z");
    if (Number.isNaN(date.getTime())) return "Publication date not set";
    return "Published " + new Intl.DateTimeFormat("en", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }).format(date);
  }

  function readableType(value) {
    if (typeof value !== "string") return "Publication";
    return value.replace(/-/g, " ").replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
  }

  function createRecordRow(item, kind) {
    var row = document.createElement("div");
    row.className = "record-row";

    var type = document.createElement("span");
    type.className = kind === "resources" ? "record-type record-file" : "record-type";
    type.textContent = kind === "resources" ? "PDF" : "Story";

    var copy = document.createElement("div");
    var title = document.createElement("strong");
    title.textContent = typeof item.title === "string" ? item.title : "Untitled";
    var detail = document.createElement("small");
    detail.textContent = kind === "resources"
      ? readableType(item.resourceType) + (item.publicationDate ? " | " + formatDate(item.publicationDate).replace("Published ", "") : "")
      : formatDate(item.date);
    copy.append(title, detail);

    var status = document.createElement("span");
    status.className = "published-label";
    status.textContent = "Published";
    row.append(type, copy, status);
    if (kind === "posts" && typeof item.id === "string") {
      var edit = document.createElement("button");
      edit.className = "record-action";
      edit.type = "button";
      edit.textContent = "Edit";
      edit.addEventListener("click", function () { openExistingPost(item.id); });
      row.append(edit);
    }
    return row;
  }

  function renderRecords(kind, items) {
    var list = document.querySelector('[data-record-list="' + kind + '"]');
    if (!list) return;
    list.replaceChildren();

    if (!items.length) {
      var empty = document.createElement("p");
      empty.className = "loading-row";
      empty.textContent = "No " + kind + " have been published yet.";
      list.append(empty);
      return;
    }

    items.forEach(function (item) { list.append(createRecordRow(item, kind)); });
  }

  function renderPages(items) {
    var grid = document.querySelector("[data-page-grid]");
    if (!grid) return;
    grid.replaceChildren();

    items.forEach(function (item, index) {
      var card = document.createElement("article");
      card.className = "page-card";
      var number = document.createElement("span");
      number.textContent = String(index + 1).padStart(2, "0");
      var title = document.createElement("strong");
      title.textContent = typeof item.title === "string" ? item.title : "Untitled page";
      var description = document.createElement("p");
      description.textContent = typeof item.description === "string" ? item.description : "Editable website page.";
      var sourceType = document.createElement("small");
      sourceType.textContent = typeof item.sourceType === "string" ? item.sourceType : "Website content";
      card.append(number, title, description, sourceType);
      grid.append(card);
    });
  }

  function displayContent(manifest) {
    setCount("posts", manifest.summary.posts);
    setCount("resources", manifest.summary.resources);
    setCount("pages", manifest.summary.pages);
    renderRecords("posts", manifest.posts);
    renderRecords("resources", manifest.resources);
    renderPages(manifest.pages);

    var freshness = document.querySelector("[data-content-freshness]");
    if (freshness) {
      var generated = new Date(manifest.generatedAt);
      freshness.textContent = Number.isNaN(generated.getTime())
        ? "Loaded from this deployment"
        : "Deployment content generated " + generated.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    }
  }

  async function loadContent(endpoint) {
    var response = await fetch(endpoint || "/api/admin/content", {
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    var contentType = response.headers.get("content-type") || "";
    var payload = contentType.includes("application/json") ? await response.json() : null;

    if (!response.ok || !payload || !payload.summary || !Array.isArray(payload.posts) || !Array.isArray(payload.resources) || !Array.isArray(payload.pages)) {
      throw new Error(payload && payload.error ? payload.error : "The deployed content could not be loaded.");
    }

    displayContent(payload);
  }

  async function loadSession() {
    setSessionState("loading", "Checking access");
    if (accessNotice) accessNotice.hidden = true;

    try {
      if (localUiPreview) {
        displayUser({ name: "Local Preview", email: "Not authenticated" });
        setSessionState("ready", "Local UI preview");
        await loadContent("/admin/content.json");
        return;
      }

      var response = await fetch("/api/admin/session", {
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });

      var contentType = response.headers.get("content-type") || "";
      var payload = contentType.includes("application/json") ? await response.json() : null;

      if (!response.ok || !payload || !payload.user) {
        var errorMessage = payload && payload.error ? payload.error : "The secure session API returned an unexpected response.";
        throw new Error(errorMessage);
      }

      displayUser(payload.user);
      setPublishPermission(Boolean(payload.permissions && payload.permissions.publish));
      setSessionState("ready", "Secure session");
      try {
        await loadContent();
      } catch (error) {
        if (accessNotice && accessTitle && accessMessage) {
          accessTitle.textContent = "Content list unavailable";
          accessMessage.textContent = error instanceof Error ? error.message : "Try again in a moment.";
          accessNotice.hidden = false;
        }
      }
    } catch (error) {
      setSessionState("error", "Content unavailable");
      if (accessNotice && accessTitle && accessMessage) {
        accessTitle.textContent = "Dashboard connection unavailable";
        accessMessage.textContent = error instanceof Error ? error.message : "The secure session API could not be reached.";
        accessNotice.hidden = false;
      }
    }
  }

  document.querySelectorAll("[data-view]").forEach(function (control) {
    control.addEventListener("click", function () {
      showView(control.getAttribute("data-view") || "overview");
    });
  });

  document.querySelectorAll("[data-new-post]").forEach(function (button) { button.addEventListener("click", openNewPost); });
  document.querySelectorAll("[data-cancel-post]").forEach(function (button) { button.addEventListener("click", function () { showView("posts"); }); });

  if (postForm) {
    postForm.querySelectorAll("[data-error]").forEach(function (element) { element.dataset.defaultText = element.textContent; });
    formControl("title").addEventListener("input", function (event) {
      if (formControl("id").value) return;
      var slug = formControl("slug");
      if (!slug.value || slug.value === lastAutoSlug) {
        lastAutoSlug = slugify(event.target.value);
        slug.value = lastAutoSlug;
      }
    });
    formControl("description").addEventListener("input", function (event) {
      var count = document.querySelector("[data-description-count]");
      if (count) count.textContent = String(event.target.value.length);
    });
    postForm.addEventListener("input", updatePublishButton);
    postForm.addEventListener("change", updatePublishButton);
    postForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearFormErrors();

      if (!canPublish || localUiPreview) {
        setEditorStatus("error", "Publishing is unavailable", "Use the Access-protected deployment after the GitHub secret is configured.");
        return;
      }
      if (!hasUnsavedPostChanges()) return;

      var id = formControl("id").value;
      var payload = postPayload();
      var endpoint = id ? "/api/admin/posts/" + encodeURIComponent(id) : "/api/admin/posts";
      var method = id ? "PUT" : "POST";

      isPublishing = true;
      updatePublishButton();
      setEditorStatus("pending", "Publishing post", "Creating a Git commit and starting the Pages rebuild.");

      try {
        var response = await fetch(endpoint, {
          method: method,
          credentials: "same-origin",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        var result = await response.json();
        if (!response.ok) {
          showFormErrors(result.errors || {});
          throw new Error(result.error || "The post could not be published.");
        }

        formControl("id").value = result.post.id;
        formControl("sha").value = result.post.sha;
        formControl("slug").disabled = true;
        savedPostSnapshot = JSON.stringify(postPayload());
        var editorTitle = document.querySelector("[data-editor-title]");
        if (editorTitle) editorTitle.textContent = "Edit post";
        setEditorStatus("success", "Post committed successfully", result.message, result.commit && result.commit.url);
      } catch (error) {
        setEditorStatus("error", "Post was not published", error instanceof Error ? error.message : "Try again later.");
      } finally {
        isPublishing = false;
        updatePublishButton();
      }
    });
  }

  if (menuToggle) menuToggle.addEventListener("click", function () { setMenu(!sidebar.classList.contains("is-open")); });
  if (menuBackdrop) menuBackdrop.addEventListener("click", function () { setMenu(false); });
  document.querySelectorAll("[data-session-retry]").forEach(function (button) { button.addEventListener("click", loadSession); });
  window.addEventListener("hashchange", function () { showView(window.location.hash.slice(1)); });
  window.addEventListener("keydown", function (event) { if (event.key === "Escape") setMenu(false); });
  window.addEventListener("resize", function () { if (window.innerWidth > 820) setMenu(false); });

  showView(window.location.hash.slice(1) || "overview");
  loadSession();
})();
