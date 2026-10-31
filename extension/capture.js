// Request synchronously from the capture click, before any await can lose the
// user gesture. Side-panel clicks do not grant activeTab. Host access also lets
// tabs.query expose the YouTube URL without the broad tabs permission.
export async function captureFromTab(pick = false) {
  let granted;
  try {
    granted = await chrome.permissions.request({
      origins: [
        "https://www.youtube.com/*",
        "https://m.youtube.com/*",
        "https://youtube.com/*",
      ],
    });
  } catch {
    throw new Error(
      "YouTube access could not be requested. Reload the extension and reopen the panel, or paste manually.",
    );
  }
  if (!granted)
    throw new Error(
      "YouTube access was not granted. Click capture again and allow YouTube access, or paste manually.",
    );
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id)
      throw new Error(
        "No active tab available. Open a YouTube video and capture again, or paste manually.",
      );
    let url;
    try {
      url = new URL(tab.url);
    } catch {
      throw new Error(
        "Tab URL unavailable. Activate a YouTube video and capture again, or paste manually.",
      );
    }
    if (
      url.protocol !== "https:" ||
      !["www.youtube.com", "m.youtube.com", "youtube.com"].includes(
        url.hostname,
      )
    )
      throw new Error(
        "Open a YouTube video and capture again, or paste manually.",
      );
    const [response] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: captureYouTube,
      args: [pick],
    });
    const data = response?.result;
    if (!data || data.error)
      throw new Error(data?.error || "Comment unavailable. Paste it manually.");
    return data;
  } catch (err) {
    if (/Cannot access|Missing host|permission/i.test(err.message))
      throw new Error(
        "Chrome blocked YouTube access. Click capture again and allow access; check the extension's Site access settings, or paste manually.",
      );
    if (/No tab with id|tab was closed|frame.*removed/i.test(err.message))
      throw new Error(
        "The YouTube tab closed or navigated during capture. Open the video and capture again, or paste manually.",
      );
    throw err;
  }
}

// Self-contained for chrome.scripting.executeScript: runs only after a user action.
export async function captureYouTube(pick = false) {
  if (
    location.protocol !== "https:" ||
    !["www.youtube.com", "m.youtube.com", "youtube.com"].includes(
      location.hostname,
    )
  )
    return {
      error: "Open a YouTube video, or paste a comment manually below.",
    };
  const commentSelector = "ytd-comment-view-model, ytd-comment-renderer";
  const content = (el) =>
    el?.querySelector("#content-text, yt-attributed-string#content-text");
  const visible = (el) =>
    !!el &&
    !!el.getClientRects().length &&
    getComputedStyle(el).visibility !== "hidden";
  let target;
  if (pick) {
    target = await new Promise((resolve) => {
      const notice = document.createElement("div");
      notice.textContent =
        "Counterpoint: click a comment · Esc to cancel (20 seconds)";
      Object.assign(notice.style, {
        position: "fixed",
        top: "12px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: "2147483647",
        padding: "16px",
        borderRadius: "12px",
        background: "#163e39",
        color: "white",
        font: "14px system-ui",
        boxShadow: "0 6px 30px #0004",
      });
      document.documentElement.append(notice);
      const cleanup = (value) => {
        clearTimeout(timer);
        notice.remove();
        document.removeEventListener("click", onClick, true);
        document.removeEventListener("keydown", onKey, true);
        resolve(value);
      };
      const onClick = (event) => {
        const found = event.target.closest?.(commentSelector);
        if (!found) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        cleanup(found);
      };
      const onKey = (event) => {
        if (event.key === "Escape") cleanup(null);
      };
      const timer = setTimeout(() => cleanup(null), 20000);
      document.addEventListener("click", onClick, true);
      document.addEventListener("keydown", onKey, true);
    });
  } else {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim())
      return {
        error:
          "Highlight text inside a YouTube comment, use Pick a comment, or paste manually.",
      };
    const node = selection?.anchorNode;
    const element =
      node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    const end = selection?.focusNode;
    const endElement =
      end?.nodeType === Node.ELEMENT_NODE ? end : end?.parentElement;
    target = element?.closest(commentSelector);
    if (!target || endElement?.closest(commentSelector) !== target)
      return {
        error:
          "Select text inside one YouTube comment, use Pick a comment, or paste manually. Cross-comment selections are not captured.",
      };
  }
  if (!target)
    return {
      error: "Comment picking cancelled or timed out. You can paste manually.",
    };
  const textElement = content(target);
  const text = textElement?.innerText?.trim();
  if (!visible(textElement) || !text)
    return {
      error:
        "This comment is inaccessible. Expand it or paste its text manually.",
    };
  if (text.length > 8000)
    return {
      error:
        "Comment exceeds 8,000 characters. Paste only the relevant text manually.",
    };
  const thread = target.closest("ytd-comment-thread-renderer");
  const context = [];
  if (thread) {
    for (const item of thread.querySelectorAll(commentSelector)) {
      if (item === target || context.length >= 4) continue;
      const el = content(item);
      // Deduplicate wrappers, not distinct comments with the same text.
      if (
        !visible(el) ||
        context.some((c) => c.element === el) ||
        el === textElement
      )
        continue;
      const value = el.innerText?.trim();
      if (!value) continue;
      context.push({
        element: el,
        text: value.slice(0, 1000),
        label: `${item.closest("#replies, ytd-comment-replies-renderer") ? "Loaded reply" : "Loaded parent"}${value.length > 1000 ? " (excerpt)" : ""}`,
      });
    }
  }
  return {
    text,
    context: context.map(({ text, label }) => ({ text, label })),
    note: `Captured comment and ${context.length} loaded thread message(s). Hidden/unloaded replies are unavailable. Order and authorship are not inferred. Review context before sending.`,
  };
}
