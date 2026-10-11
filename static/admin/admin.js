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
  var saveDraftButton = document.querySelector("[data-save-draft]");
  var uploadFeaturedImageButton = document.querySelector("[data-upload-featured-image]");
  var selectFeaturedImageButton = document.querySelector("[data-select-featured-image]");
  var selectGalleryImageButton = document.querySelector("[data-select-gallery-image]");
  var featuredImageFile = document.querySelector("[data-featured-image-file]");
  var featuredImageStatus = document.querySelector("[data-featured-image-status]");
  var uploadMediaImageButton = document.querySelector("[data-upload-media-image]");
  var mediaImageFile = document.querySelector("[data-media-image-file]");
  var mediaUploadStatus = document.querySelector("[data-media-upload-status]");
  var cancelMediaButton = document.querySelector("[data-cancel-media]");
  var mediaLibraryGrid = document.querySelector("[data-media-library-grid]");
  var mediaLibraryStatus = document.querySelector("[data-media-library-status]");
  var mediaLibraryDescription = document.querySelector("[data-media-library-description]");
  var localUiPreview = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  var canPublish = false;
  var lastAutoSlug = "";
  var savedPostSnapshot = null;
  var isPublishing = false;
  var mediaTarget = null;
  var resourceForm = document.querySelector("[data-resource-form]");
  var uploadDocumentButton = document.querySelector("[data-upload-document]");
  var documentFile = document.querySelector("[data-document-file]");
  var documentStatus = document.querySelector("[data-document-status]");
  var resourceSavedSnapshot = null;
  var isPublishingResource = false;
  var sessionRetryAttempted = false;
  var publishedPosts = [];
  var viewNames = {
    overview: "Overview",
    posts: "Posts",
    resources: "Resources",
    pages: "Key pages",
    media: "Media library",
    "post-editor": "Post editor",
    "resource-editor": "Resource editor"
    , "page-editor": "Key-page editor", "homepage-editor": "Homepage editor"
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
      draft: formControl("draft").value === "true",
      sha: formControl("sha").value || null
    };
  }

  function hasUnsavedPostChanges() {
    return postForm && savedPostSnapshot !== null && savedPostSnapshot !== JSON.stringify(postPayload());
  }

  function updatePublishButton() {
    if (!publishButton || !postForm) return;
    var hasChanges = hasUnsavedPostChanges();
    var publishingDraft = formControl("draft").value === "true";
    publishButton.disabled = !canPublish || (!hasChanges && !publishingDraft) || isPublishing;
    if (isPublishing) publishButton.textContent = "Publishing...";
    else if (!canPublish) publishButton.textContent = "Publishing unavailable";
    else if (!hasChanges && !publishingDraft) publishButton.textContent = "No changes to publish";
    else publishButton.textContent = publishingDraft ? "Publish post" : (formControl("id").value ? "Publish changes" : "Publish post");
    if (saveDraftButton) { saveDraftButton.disabled = !canPublish || !hasChanges || isPublishing; saveDraftButton.hidden = false; }
  }

  function setFeaturedImageStatus(message) {
    if (featuredImageStatus) featuredImageStatus.textContent = message;
  }

  function setMediaUploadStatus(message) { if (mediaUploadStatus) mediaUploadStatus.textContent = message; }

  async function uploadImage(file) {
    var data = new FormData();
    data.append("file", file);
    var response = await fetch("/api/admin/media", { method: "POST", credentials: "same-origin", headers: { Accept: "application/json" }, body: data });
    var result = await response.json();
    if (!response.ok || !result.media || typeof result.media.url !== "string") throw new Error(result.error || "The image could not be uploaded.");
    return result.media.url;
  }

  function formatFileSize(bytes) {
    if (typeof bytes !== "number" || bytes < 1024) return "Image";
    return (bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1) + " MB";
  }

  function selectMedia(url) {
    if (!mediaTarget || !postForm) return;
    var control = formControl(mediaTarget);
    if (mediaTarget === "gallery") {
      var items = control.value.split(/\r?\n/).map(function (item) { return item.trim(); }).filter(Boolean);
      if (!items.includes(url)) items.push(url);
      control.value = items.join("\n");
    } else {
      control.value = url;
    }
    control.dispatchEvent(new Event("input", { bubbles: true }));
    showView("post-editor");
    setEditorStatus("success", "Image selected", "The image is ready to publish with this post.");
  }

  function renderMedia(items) {
    if (!mediaLibraryGrid || !mediaLibraryStatus) return;
    mediaLibraryGrid.replaceChildren();
    if (!items.length) {
      mediaLibraryStatus.hidden = false;
      mediaLibraryStatus.textContent = "No uploaded images yet. Upload one from a post's Featured image field.";
      return;
    }

    mediaLibraryStatus.hidden = true;
    items.forEach(function (item) {
      var card = document.createElement("article");
      card.className = "media-card";
      var image = document.createElement("img");
      image.src = item.url;
      image.alt = "Uploaded website image";
      image.loading = "lazy";
      var copy = document.createElement("div");
      copy.className = "media-card-copy";
      var detail = document.createElement("small");
      detail.textContent = formatFileSize(item.size);
      copy.append(detail);
      if (mediaTarget) {
        var use = document.createElement("button");
        use.type = "button";
        use.textContent = mediaTarget === "gallery" ? "Add to gallery" : "Use as featured image";
        use.addEventListener("click", function () { selectMedia(item.url); });
        copy.append(use);
      }
      card.append(image, copy);
      mediaLibraryGrid.append(card);
    });
  }

  async function openMediaLibrary(target) {
    mediaTarget = target;
    showView("media");
    if (cancelMediaButton) cancelMediaButton.hidden = !target;
    if (mediaLibraryDescription) {
      mediaLibraryDescription.textContent = target === "gallery"
        ? "Choose an uploaded image to add to this post's gallery."
        : target === "featuredImage"
          ? "Choose an uploaded image for this post's featured image."
          : "Images uploaded from the post editor.";
    }
    if (!mediaLibraryStatus || !mediaLibraryGrid) return;
    mediaLibraryGrid.replaceChildren();
    mediaLibraryStatus.hidden = false;
    mediaLibraryStatus.textContent = "Loading uploaded images...";

    try {
      var response = await fetch("/api/admin/media", { credentials: "same-origin", headers: { Accept: "application/json" } });
      var result = await response.json();
      if (!response.ok || !Array.isArray(result.items)) throw new Error(result.error || "The media library could not be loaded.");
      renderMedia(result.items);
    } catch (error) {
      mediaLibraryStatus.hidden = false;
      mediaLibraryStatus.textContent = error instanceof Error ? error.message : "The media library could not be loaded.";
    }
  }

  function resourceControl(name) { return resourceForm ? resourceForm.elements.namedItem(name) : null; }

  function resourcePayload() {
    return { title: resourceControl("title").value, slug: resourceControl("slug").value, description: resourceControl("description").value, resourceType: resourceControl("resourceType").value, publicationDate: resourceControl("publicationDate").value, file: resourceControl("file").value, weight: Number(resourceControl("weight").value), sha: resourceControl("sha").value || null };
  }

  function updateResourceButton() {
    var button = document.querySelector("[data-publish-resource]");
    if (!button || !resourceForm) return;
    var changed = resourceSavedSnapshot !== null && resourceSavedSnapshot !== JSON.stringify(resourcePayload());
    button.disabled = !canPublish || isPublishingResource || !changed;
    button.textContent = isPublishingResource ? "Publishing..." : !canPublish ? "Publishing unavailable" : !changed ? "No changes to publish" : resourceControl("id").value ? "Publish changes" : "Publish resource";
  }

  function setResourceStatus(state, title, message, commitUrl) {
    var box = document.querySelector("[data-resource-status]");
    var heading = document.querySelector("[data-resource-status-title]");
    var copy = document.querySelector("[data-resource-status-message]");
    var link = document.querySelector("[data-resource-commit-link]");
    if (!box || !heading || !copy || !link) return;
    box.hidden = false;
    box.classList.toggle("is-error", state === "error");
    box.classList.toggle("is-pending", state === "pending");
    heading.textContent = title;
    copy.textContent = message;
    link.hidden = !commitUrl;
    if (commitUrl) link.href = commitUrl;
  }

  function openNewResource() {
    if (!resourceForm) return;
    resourceForm.reset();
    resourceControl("id").value = ""; resourceControl("sha").value = "";
    resourceControl("slug").disabled = false;
    resourceControl("weight").value = "100";
    document.querySelectorAll("[data-resource-error]").forEach(function (item) { item.textContent = item.dataset.defaultText || ""; });
    var status = document.querySelector("[data-resource-status]");
    if (status) status.hidden = true;
    if (documentStatus) documentStatus.textContent = "PDF only, up to 8 MB.";
    resourceSavedSnapshot = JSON.stringify(resourcePayload());
    showView("resource-editor");
    updateResourceButton();
  }

  async function openExistingResource(id) {
    showView("resource-editor");
    setResourceStatus("pending", "Loading the repository version", "Checking the latest file before editing.");
    try {
      var response = await fetch("/api/admin/resources/" + encodeURIComponent(id), { credentials: "same-origin", headers: { Accept: "application/json" } });
      var result = await response.json(); if (!response.ok || !result.resource) throw new Error(result.error || "The resource could not be loaded.");
      var resource = result.resource;
      ["id", "sha", "title", "slug", "description", "resourceType", "publicationDate", "file", "weight"].forEach(function (name) { if (resourceControl(name)) resourceControl(name).value = resource[name] || ""; });
      resourceControl("slug").disabled = true;
      resourceSavedSnapshot = JSON.stringify(resourcePayload());
      var status = document.querySelector("[data-resource-status]"); if (status) status.hidden = true;
      if (documentStatus) documentStatus.textContent = "Upload a new PDF only if you are replacing this document.";
      updateResourceButton();
    } catch (error) { setResourceStatus("error", "Resource could not be loaded", error instanceof Error ? error.message : "Try again later."); }
  }

  function setPublishPermission(allowed) {
    canPublish = Boolean(allowed);
    updatePublishButton();
    updateResourceButton();
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
    formControl("draft").value = "true";
    formControl("slug").disabled = false;
    formControl("date").value = new Date().toISOString().slice(0, 10);
    lastAutoSlug = "";
    setFeaturedImageStatus("JPEG, PNG, GIF, WebP, or AVIF up to 8 MB.");
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
    ["id", "sha", "title", "slug", "date", "description", "featuredImage", "socialImage", "socialImageAlt", "body", "draft"].forEach(function (name) {
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

  async function deleteContentItem(kind, id, title) {
    var action = kind === "posts" ? "unpublish" : "delete";
    if (!window.confirm("Are you sure you want to " + action + " “" + title + "”? This change will go live after the next Pages rebuild.")) return false;
    try {
      var response = await fetch("/api/admin/" + kind + "/" + encodeURIComponent(id), { method: "DELETE", credentials: "same-origin", headers: { Accept: "application/json" } });
      var result = await response.json();
      if (!response.ok) throw new Error(result.error || "The item could not be removed.");
      window.alert(result.message);
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The item could not be removed.");
      return false;
    }
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
    status.textContent = item.status === "draft" ? "Draft" : "Published";
    row.append(type, copy, status);
    if (kind === "posts" && typeof item.id === "string") {
      var edit = document.createElement("button");
      edit.className = "record-action";
      edit.type = "button";
      edit.textContent = "Edit";
      edit.addEventListener("click", function () { openExistingPost(item.id); });
      row.append(edit);
      var unpublish = document.createElement("button");
      unpublish.className = "record-action"; unpublish.type = "button"; unpublish.textContent = "Unpublish";
      unpublish.addEventListener("click", async function () { if (await deleteContentItem("posts", item.id, title.textContent || "this post")) row.remove(); });
      row.append(unpublish);
    }
    if (kind === "resources" && typeof item.id === "string") {
      var resourceEdit = document.createElement("button");
      resourceEdit.className = "record-action"; resourceEdit.type = "button"; resourceEdit.textContent = "Edit";
      resourceEdit.addEventListener("click", function () { openExistingResource(item.id); });
      row.append(resourceEdit);
      var resourceDelete = document.createElement("button");
      resourceDelete.className = "record-action"; resourceDelete.type = "button"; resourceDelete.textContent = "Delete";
      resourceDelete.addEventListener("click", async function () { if (await deleteContentItem("resources", item.id, title.textContent || "this resource")) row.remove(); });
      row.append(resourceDelete);
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

    if (!items.length) {
      var empty = document.createElement("p"); empty.className = "loading-row"; empty.textContent = "No key pages are available."; grid.append(empty); return;
    }
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
      card.tabIndex = 0; card.setAttribute("role", "button"); card.addEventListener("click", function () { item.id === "homepage" ? openHomepage() : openExistingPage(item.id); });
      grid.append(card);
    });
  }

  async function openHomepage() { var form = document.querySelector("[data-homepage-form]"); var fields = document.querySelector("[data-homepage-fields]"); showView("homepage-editor"); fields.textContent = "Loading homepage..."; try { var response = await fetch("/api/admin/homepage", { credentials: "same-origin" }); var result = await response.json(); if (!response.ok) throw new Error(result.error); form.dataset.homepage = JSON.stringify(result.homepage); form.dataset.sha = result.sha; fields.replaceChildren(); ["hero", "introduction", "support"].forEach(function (section) { Object.keys(result.homepage[section]).forEach(function (key) { if (typeof result.homepage[section][key] !== "string") return; var label = document.createElement("label"); label.className = "form-field"; var name = document.createElement("span"); name.textContent = section + " - " + key.replace(/_/g, " "); var input = document.createElement(key.includes("description") || key === "title" ? "textarea" : "input"); input.value = result.homepage[section][key]; input.dataset.section = section; input.dataset.key = key; input.addEventListener("input", function () { document.querySelector("[data-publish-homepage]").disabled = !canPublish; }); label.append(name, input); fields.append(label); }); }); document.querySelector("[data-publish-homepage]").disabled = true; } catch (error) { fields.textContent = error.message || "Homepage could not be loaded."; } }

  async function openExistingPage(id) {
    var form = document.querySelector("[data-page-form]"); if (!form) return;
    showView("page-editor");
    var status = document.querySelector("[data-page-status]"); status.hidden = false; document.querySelector("[data-page-status-title]").textContent = "Loading page"; document.querySelector("[data-page-status-message]").textContent = "Checking the latest repository version.";
    try { var response = await fetch("/api/admin/pages/" + encodeURIComponent(id), { credentials: "same-origin" }); var result = await response.json(); if (!response.ok || !result.page) throw new Error(result.error || "The page could not be loaded."); var page = result.page; ["id", "sha", "title", "description", "body"].forEach(function (name) { form.elements.namedItem(name).value = page[name] || ""; }); form.elements.namedItem("hasBody").value = page.body ? "true" : ""; document.querySelector("[data-page-editor-title]").textContent = "Edit " + page.title; document.querySelector("[data-page-description-field]").hidden = page.id !== "contact"; document.querySelector("[data-page-body-field]").hidden = !page.body; status.hidden = true; form.dataset.snapshot = JSON.stringify({ title: page.title, description: page.description, body: page.body, sha: page.sha }); document.querySelector("[data-publish-page]").disabled = true; } catch (error) { document.querySelector("[data-page-status-title]").textContent = "Page could not be loaded"; document.querySelector("[data-page-status-message]").textContent = error.message; }
  }

  function displayContent(manifest) {
    publishedPosts = manifest.posts;
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

  async function loadDrafts() {
    var response = await fetch("/api/admin/drafts", { credentials: "same-origin", headers: { Accept: "application/json" } });
    var result = await response.json();
    if (!response.ok || !Array.isArray(result.posts)) return;
    renderRecords("posts", result.posts.concat(publishedPosts));
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

  function showContentUnavailable(message) {
    ["posts", "resources"].forEach(function (kind) {
      var list = document.querySelector('[data-record-list="' + kind + '"]');
      if (list) { list.replaceChildren(); var notice = document.createElement("p"); notice.className = "loading-row"; notice.textContent = message; list.append(notice); }
    });
    var pages = document.querySelector("[data-page-grid]");
    if (pages) { pages.replaceChildren(); var pageNotice = document.createElement("p"); pageNotice.className = "loading-row"; pageNotice.textContent = message; pages.append(pageNotice); }
    ["posts", "resources", "pages"].forEach(function (kind) { setCount(kind, "-"); });
    var freshness = document.querySelector("[data-content-freshness]"); if (freshness) freshness.textContent = "Content could not be loaded";
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
        await loadDrafts();
      } catch (error) {
        showContentUnavailable("Content could not be loaded. Try again.");
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
      if (!sessionRetryAttempted) {
        sessionRetryAttempted = true;
        window.setTimeout(loadSession, 3000);
      }
    }
  }

  document.querySelectorAll("[data-view]").forEach(function (control) {
    control.addEventListener("click", function () {
      var view = control.getAttribute("data-view") || "overview";
      if (view === "media") openMediaLibrary(null);
      else showView(view);
    });
  });

  document.querySelectorAll("[data-new-post]").forEach(function (button) { button.addEventListener("click", openNewPost); });
  document.querySelectorAll("[data-cancel-post]").forEach(function (button) { button.addEventListener("click", function () { showView("posts"); }); });
  document.querySelectorAll("[data-new-resource]").forEach(function (button) { button.addEventListener("click", openNewResource); });
  document.querySelectorAll("[data-cancel-resource]").forEach(function (button) { button.addEventListener("click", function () { showView("resources"); }); });
  document.querySelectorAll("[data-cancel-page]").forEach(function (button) { button.addEventListener("click", function () { showView("pages"); }); });
  document.querySelectorAll("[data-cancel-homepage]").forEach(function (button) { button.addEventListener("click", function () { showView("pages"); }); });
  var homepageForm = document.querySelector("[data-homepage-form]"); if (homepageForm) homepageForm.addEventListener("submit", async function (event) { event.preventDefault(); var homepage = JSON.parse(homepageForm.dataset.homepage); homepageForm.querySelectorAll("[data-section]").forEach(function (input) { homepage[input.dataset.section][input.dataset.key] = input.value; }); var response = await fetch("/api/admin/homepage", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ homepage: homepage, sha: homepageForm.dataset.sha }) }); var result = await response.json(); var status = document.querySelector("[data-homepage-status]"); status.hidden = false; document.querySelector("[data-homepage-status-title]").textContent = response.ok ? "Homepage committed" : "Homepage was not published"; document.querySelector("[data-homepage-status-message]").textContent = result.message || result.error; });

  var pageForm = document.querySelector("[data-page-form]");
  if (pageForm) pageForm.addEventListener("input", function () { document.querySelector("[data-publish-page]").disabled = !canPublish; });
  if (pageForm) pageForm.addEventListener("submit", async function (event) {
    event.preventDefault(); if (!canPublish) return;
    var status = document.querySelector("[data-page-status]"); var title = document.querySelector("[data-page-status-title]"); var message = document.querySelector("[data-page-status-message]");
    var payload = { title: pageForm.elements.namedItem("title").value, description: pageForm.elements.namedItem("description").value, body: pageForm.elements.namedItem("body").value, sha: pageForm.elements.namedItem("sha").value };
    title.textContent = "Publishing page"; message.textContent = "Creating a Git commit and starting the Pages rebuild."; status.hidden = false;
    try { var response = await fetch("/api/admin/pages/" + encodeURIComponent(pageForm.elements.namedItem("id").value), { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) }); var result = await response.json(); if (!response.ok) throw new Error(result.error || "The page could not be published."); pageForm.elements.namedItem("sha").value = result.page.sha; title.textContent = "Page committed successfully"; message.textContent = result.message; } catch (error) { title.textContent = "Page was not published"; message.textContent = error.message; }
  });

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
    if (saveDraftButton) saveDraftButton.addEventListener("click", function () { formControl("draft").value = "true"; postForm.requestSubmit(); });
    if (publishButton) publishButton.addEventListener("click", function () { formControl("draft").value = "false"; });
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

  if (uploadFeaturedImageButton && featuredImageFile) {
    uploadFeaturedImageButton.addEventListener("click", function () {
      if (!canPublish || localUiPreview) {
        setFeaturedImageStatus("Image uploads are available on the production dashboard.");
        return;
      }
      featuredImageFile.click();
    });
    featuredImageFile.addEventListener("change", async function () {
      var file = featuredImageFile.files && featuredImageFile.files[0];
      if (!file) return;

      uploadFeaturedImageButton.disabled = true;
      setFeaturedImageStatus("Uploading image...");
      try {
        var imageUrl = await uploadImage(file);
        formControl("featuredImage").value = imageUrl;
        formControl("featuredImage").dispatchEvent(new Event("input", { bubbles: true }));
        setFeaturedImageStatus("Image uploaded. It is ready to use in this post.");
      } catch (error) {
        setFeaturedImageStatus(error instanceof Error ? error.message : "The image could not be uploaded.");
      } finally {
        featuredImageFile.value = "";
        uploadFeaturedImageButton.disabled = false;
      }
    });
  }

  if (selectFeaturedImageButton) selectFeaturedImageButton.addEventListener("click", function () { openMediaLibrary("featuredImage"); });
  if (selectGalleryImageButton) selectGalleryImageButton.addEventListener("click", function () { openMediaLibrary("gallery"); });
  if (cancelMediaButton) cancelMediaButton.addEventListener("click", function () { mediaTarget = null; showView("post-editor"); });
  if (uploadMediaImageButton && mediaImageFile) {
    uploadMediaImageButton.addEventListener("click", function () {
      if (!canPublish || localUiPreview) return setMediaUploadStatus("Image uploads are available on the production dashboard.");
      mediaImageFile.click();
    });
    mediaImageFile.addEventListener("change", async function () {
      var file = mediaImageFile.files && mediaImageFile.files[0];
      if (!file) return;
      uploadMediaImageButton.disabled = true;
      setMediaUploadStatus("Uploading image...");
      try {
        await uploadImage(file);
        setMediaUploadStatus("Image uploaded. Choose it below to use it in the post.");
        await openMediaLibrary(mediaTarget);
      } catch (error) { setMediaUploadStatus(error instanceof Error ? error.message : "The image could not be uploaded."); }
      finally { mediaImageFile.value = ""; uploadMediaImageButton.disabled = false; }
    });
  }

  if (resourceForm) {
    resourceForm.querySelectorAll("[data-resource-error]").forEach(function (item) { item.dataset.defaultText = item.textContent; });
    resourceControl("title").addEventListener("input", function (event) {
      var slug = resourceControl("slug");
      if (!slug.value || slug.value === slugify(resourceControl("title").dataset.lastTitle || "")) slug.value = slugify(event.target.value);
      resourceControl("title").dataset.lastTitle = event.target.value;
    });
    resourceForm.addEventListener("input", updateResourceButton);
    resourceForm.addEventListener("change", updateResourceButton);
    resourceForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!canPublish || localUiPreview) return setResourceStatus("error", "Publishing is unavailable", "Use the Access-protected production dashboard.");
      if (isPublishingResource || resourceSavedSnapshot === JSON.stringify(resourcePayload())) return;
      resourceForm.querySelectorAll(".form-field").forEach(function (field) { field.classList.remove("has-error"); });
      isPublishingResource = true; updateResourceButton();
      setResourceStatus("pending", "Publishing resource", "Creating a Git commit and starting the Pages rebuild.");
      var payload = resourcePayload(); var resourceId = resourceControl("id").value;
      try {
        var response = await fetch(resourceId ? "/api/admin/resources/" + encodeURIComponent(resourceId) : "/api/admin/resources", { method: resourceId ? "PUT" : "POST", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        var result = await response.json();
        if (!response.ok) {
          Object.keys(result.errors || {}).forEach(function (name) { var control = resourceControl(name); var message = resourceForm.querySelector('[data-resource-error="' + name + '"]'); if (control && control.closest) control.closest(".form-field").classList.add("has-error"); if (message) message.textContent = result.errors[name]; });
          throw new Error(result.error || "The resource could not be published.");
        }
        resourceControl("id").value = result.resource.id; resourceControl("sha").value = result.resource.sha; resourceControl("slug").disabled = true; resourceSavedSnapshot = JSON.stringify(resourcePayload());
        setResourceStatus("success", "Resource committed successfully", result.message, result.commit && result.commit.url);
      } catch (error) { setResourceStatus("error", "Resource was not published", error instanceof Error ? error.message : "Try again later."); }
      finally { isPublishingResource = false; updateResourceButton(); }
    });
  }

  if (uploadDocumentButton && documentFile && resourceForm) {
    uploadDocumentButton.addEventListener("click", function () { if (!canPublish || localUiPreview) return setResourceStatus("error", "Upload is unavailable", "Use the production dashboard."); documentFile.click(); });
    documentFile.addEventListener("change", async function () {
      var file = documentFile.files && documentFile.files[0]; if (!file) return;
      uploadDocumentButton.disabled = true; if (documentStatus) documentStatus.textContent = "Uploading PDF...";
      try { var data = new FormData(); data.append("file", file); var response = await fetch("/api/admin/documents", { method: "POST", credentials: "same-origin", headers: { Accept: "application/json" }, body: data }); var result = await response.json(); if (!response.ok || !result.document) throw new Error(result.error || "The PDF could not be uploaded."); resourceControl("file").value = result.document.url; resourceControl("file").dispatchEvent(new Event("input", { bubbles: true })); if (documentStatus) documentStatus.textContent = "PDF uploaded. It is ready to publish."; }
      catch (error) { if (documentStatus) documentStatus.textContent = error instanceof Error ? error.message : "The PDF could not be uploaded."; }
      finally { documentFile.value = ""; uploadDocumentButton.disabled = false; }
    });
  }

  if (menuToggle) menuToggle.addEventListener("click", function () { setMenu(!sidebar.classList.contains("is-open")); });
  if (menuBackdrop) menuBackdrop.addEventListener("click", function () { setMenu(false); });
  document.querySelectorAll("[data-session-retry]").forEach(function (button) { button.addEventListener("click", loadSession); });
  window.addEventListener("hashchange", function () { showView(window.location.hash.slice(1)); });
  window.addEventListener("keydown", function (event) { if (event.key === "Escape") setMenu(false); });
  window.addEventListener("resize", function () { if (window.innerWidth > 820) setMenu(false); });

  var initialView = window.location.hash.slice(1) || "overview";
  showView(initialView === "post-editor" ? "posts" : initialView === "resource-editor" ? "resources" : initialView);
  loadSession();
})();
