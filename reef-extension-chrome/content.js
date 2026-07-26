"use strict";
(() => {
  // ../src/extraction.ts
  function stripTags(value) {
    let result = "";
    let inTag = false;
    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      if (char === "<" && inTag === false) {
        inTag = true;
      } else if (char === ">" && inTag === true) {
        inTag = false;
      } else if (inTag === false) {
        result += char;
      }
    }
    return result.replace(/\s+/g, " ").trim();
  }
  function generateSelector(element) {
    const path = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += `#${current.id}`;
        path.unshift(selector);
        break;
      } else if (current.className) {
        const classes = current.className.trim().split(/\s+/);
        if (classes.length) {
          selector += `.${classes.join(".")}`;
        }
      }
      let siblingIndex = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === current.tagName) {
          siblingIndex++;
        }
        sibling = sibling.previousElementSibling;
      }
      if (siblingIndex > 1) {
        selector += `:nth-child(${siblingIndex})`;
      }
      path.unshift(selector);
      current = current.parentElement;
    }
    return path.length > 0 ? path.join(" > ") : element.tagName.toLowerCase();
  }
  function generateStableSelector(element) {
    const candidates = [];
    const push = (value) => {
      if (value && !candidates.includes(value)) candidates.push(value);
    };
    const escape = (value) => typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/(["\\])/g, "\\$1");
    for (const attr of ["data-testid", "data-test", "data-agent-id", "id"]) {
      const value = element.getAttribute(attr);
      if (value) push(attr === "id" ? `#${escape(value)}` : `[${attr}="${escape(value)}"]`);
    }
    const aria = element.getAttribute("aria-label");
    if (aria) push(`[aria-label="${escape(aria)}"]`);
    const role = element.getAttribute("role");
    const name = extractActionName(element);
    if (role && name) push(`[role="${escape(role)}"][aria-label="${escape(name)}"]`);
    if (role) push(`[role="${escape(role)}"]`);
    push(generateSelector(element));
    let sibling = element.previousElementSibling;
    let position = 1;
    while (sibling) {
      if (sibling.tagName === element.tagName) position++;
      sibling = sibling.previousElementSibling;
    }
    push(`xpath=//${element.tagName.toLowerCase()}[${position}]`);
    return candidates;
  }
  function walkComposed(root, visit, iframePath = []) {
    const elements = root instanceof Document ? Array.from(root.documentElement ? [root.documentElement] : []) : [root];
    const walk = (element, path) => {
      visit(element, path);
      if (element.shadowRoot) walkRoot(element.shadowRoot, path);
      for (const child of Array.from(element.children)) walk(child, path);
      if (element.tagName.toLowerCase() === "iframe") {
        try {
          const frame = element.contentDocument;
          if (frame) walkRoot(frame, [...path, Array.from(element.parentElement?.children || []).indexOf(element)]);
        } catch {
        }
      }
    };
    const walkRoot = (value, path) => {
      if (value instanceof Document) {
        if (value.documentElement) walk(value.documentElement, path);
      } else if (value instanceof ShadowRoot) for (const child of Array.from(value.children)) walk(child, path);
      else walk(value, path);
    };
    for (const element of elements) walk(element, iframePath);
  }
  function isFocusableAction(element) {
    const tag = element.tagName.toLowerCase();
    return ["a", "button", "input", "textarea", "select", "summary"].includes(tag) || ["button", "link", "tab", "menuitem", "checkbox", "radio", "combobox", "option"].includes(element.getAttribute("role") || "") || element.hasAttribute("contenteditable") || element.hasAttribute("tabindex") && Number(element.getAttribute("tabindex")) >= 0 || element.hasAttribute("data-reef-action");
  }
  function extractAccessibilityTree(root = document) {
    const records = [];
    walkComposed(root, (element, iframePath) => {
      if (!isFocusableAction(element)) return;
      const label = extractActionName(element);
      if (!label) return;
      const selectors = generateStableSelector(element);
      records.push({ id: `${typeof location !== "undefined" ? location.href : ""}#accessibility-${records.length}`, url: typeof location !== "undefined" ? location.href : "", headingText: label, headingId: `accessibility-${records.length}`, breadcrumb: "", bodyText: label, type: element.matches("input,textarea,select,[contenteditable]") ? "field" : "action", selector: selectors[0], selectors, iframePath, label, destructive: isDestructiveAction(label) });
    });
    return records;
  }
  function extractHeadingId(fullMatch, text) {
    const idMatch = fullMatch.match(/\bid=["']([^"']+)['"]/i);
    if (idMatch?.[1]) return idMatch[1];
    const stripped = text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return stripped || Math.random().toString(36).slice(2);
  }
  function hasExplicitId(fullMatch) {
    return /\bid=["'][^"']+["']/i.test(fullMatch);
  }
  function findParentSectionId(html, headingMatchEnd) {
    const afterHeading = html.slice(headingMatchEnd, headingMatchEnd + 500);
    const idMatch = afterHeading.match(/<section[^>]*id="([^"]+)"/i);
    if (idMatch?.[1]) return idMatch[1];
    const articleMatch = afterHeading.match(/<article[^>]*id="([^"]+)"/i);
    if (articleMatch?.[1]) return articleMatch[1];
    return null;
  }
  var headingCache = /* @__PURE__ */ new Map();
  function extractSections(html, url) {
    if (headingCache.has(url)) {
      return headingCache.get(url);
    }
    const cleanHtml = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
    const matches = [];
    const headingRegexGlobal = /<(h[1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
    let match;
    headingRegexGlobal.lastIndex = 0;
    while ((match = headingRegexGlobal.exec(cleanHtml)) !== null) {
      const [, tag, text] = match;
      const headingText = stripTags(text);
      const level = parseInt(tag[1], 10);
      matches.push({
        level,
        index: match.index,
        text: headingText,
        id: extractHeadingId(match[0], headingText),
        hasRealId: hasExplicitId(match[0])
      });
    }
    const len = matches.length;
    const sections = new Array(len);
    for (let i = 0; i < len; i++) {
      const heading = matches[i];
      const nextHeading = matches[i + 1];
      const start = heading.index + heading.text.length;
      const end = nextHeading?.index ?? cleanHtml.length;
      const content = cleanHtml.slice(start, end);
      const bodyText = stripTags(content).replace(/\s+/g, " ").trim();
      let breadcrumb = "";
      for (let j = 0; j <= i; j++) {
        if (j > 0) breadcrumb += " \u203A ";
        breadcrumb += matches[j].text;
      }
      const parentSectionId = heading.hasRealId ? null : findParentSectionId(cleanHtml, heading.index + heading.text.length);
      const selector = heading.hasRealId ? "#" + heading.id : parentSectionId ? "#" + parentSectionId : void 0;
      sections[i] = {
        id: `${url}#${heading.id}`,
        url: `${url}#${heading.id}`,
        headingText: heading.text,
        headingId: heading.id,
        breadcrumb,
        bodyText,
        type: "section",
        selector
      };
    }
    headingCache.set(url, sections);
    return sections;
  }
  function extractActionName(element) {
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel?.trim()) return ariaLabel.trim();
    const ariaLabelledBy = element.getAttribute("aria-labelledby");
    if (ariaLabelledBy) {
      const labelledElement = document.getElementById(ariaLabelledBy);
      if (labelledElement?.textContent?.trim()) {
        return labelledElement.textContent.trim();
      }
    }
    const textContent = element.textContent?.trim();
    if (textContent) return textContent;
    const title = element.getAttribute("title");
    if (title?.trim()) return title.trim();
    return null;
  }
  function isDestructiveAction(label) {
    const destructiveVerbs = [
      "delete",
      "remove",
      "cancel subscription",
      "unsubscribe",
      "pay",
      "checkout",
      "submit order",
      "confirm"
    ];
    const lowerLabel = label.toLowerCase();
    return destructiveVerbs.some((verb) => lowerLabel.includes(verb));
  }
  function extractActions(html, url, excludeSelectors) {
    const actions = [];
    const doc = new DOMParser().parseFromString(html, "text/html");
    const selectors = [
      "button",
      '[role="button"]',
      'input[type="button"]',
      'input[type="submit"]',
      "summary",
      "[data-reef-action]"
    ];
    const elements = Array.from(doc.querySelectorAll(selectors.join(",")));
    for (const element of elements) {
      if (excludeSelectors && element.matches(excludeSelectors)) continue;
      const label = extractActionName(element);
      if (!label) continue;
      const selectors2 = generateStableSelector(element);
      actions.push({
        id: `${url}#action-${actions.length}`,
        url,
        headingText: label,
        headingId: `action-${actions.length}`,
        breadcrumb: "",
        bodyText: label,
        type: "action",
        selector: selectors2[0],
        selectors: selectors2,
        destructive: isDestructiveAction(label),
        label
      });
    }
    return actions;
  }
  function extractFields(html, url) {
    const fields = [];
    const doc = new DOMParser().parseFromString(html, "text/html");
    const formElements = Array.from(doc.querySelectorAll("form"));
    for (const form of formElements) {
      let breadcrumb = "";
      let current = form.parentElement;
      while (current && current !== doc.body) {
        if (current.matches('h1, h2, h3, h4, h5, h6, article, section, [role="main"], main')) {
          const headingText = current.textContent?.trim() || "";
          if (headingText) {
            breadcrumb = headingText;
          }
          break;
        }
        current = current.parentElement;
      }
      const inputs = Array.from(form.querySelectorAll("input, textarea, select"));
      for (const input of inputs) {
        if (input.matches('input[type="hidden"], input[type="button"], input[type="submit"], input[type="reset"]')) {
          continue;
        }
        let label = "";
        const id = input.id;
        if (id) {
          const labelElement = doc.querySelector(`label[for="${id}"]`);
          if (labelElement) {
            label = labelElement.textContent?.trim() || "";
          }
        }
        if (!label) {
          const parentLabel = input.closest("label");
          if (parentLabel) {
            label = parentLabel.textContent?.trim() || "";
            const inputElement2 = input;
            if (label && inputElement2.value && label.includes(inputElement2.value)) {
              label = label.replace(inputElement2.value, "").trim();
            }
          }
        }
        if (!label) {
          const inputElement2 = input;
          const placeholder = "placeholder" in inputElement2 ? inputElement2.placeholder : "";
          label = placeholder || input.getAttribute("aria-label") || "";
        }
        if (!label) continue;
        const selectors = generateStableSelector(input);
        const inputElement = input;
        fields.push({
          id: `${url}#field-${fields.length}`,
          url,
          headingText: label,
          headingId: `field-${fields.length}`,
          breadcrumb,
          bodyText: label,
          type: "field",
          selector: selectors[0],
          selectors,
          label,
          value: inputElement.value
        });
      }
    }
    return fields;
  }
  function extractLinks(html, url) {
    const links = [];
    const doc = new DOMParser().parseFromString(html, "text/html");
    const anchors = Array.from(doc.querySelectorAll("a[href]"));
    for (const anchor of anchors) {
      if (anchor.hasAttribute("rel") && anchor.getAttribute("rel")?.toLowerCase().includes("nofollow")) continue;
      const href = anchor.getAttribute("href");
      if (!href) continue;
      if (href === "#" || href.startsWith("javascript:")) continue;
      const linkText = anchor.textContent?.trim() || "";
      if (!linkText) continue;
      const resolvedUrl = resolveUrl(href, url);
      const isExternal = !resolvedUrl.startsWith(window.location.origin);
      const selectors = generateStableSelector(anchor);
      links.push({
        id: `${url}#link-${links.length}`,
        url: resolvedUrl,
        headingText: linkText,
        headingId: `link-${links.length}`,
        breadcrumb: "",
        bodyText: linkText,
        type: isExternal ? "link" : "section",
        selector: selectors[0],
        selectors
      });
    }
    return links;
  }
  function extractFiles(html, url, extensions) {
    const files = [];
    const doc = new DOMParser().parseFromString(html, "text/html");
    const fileExtensions = extensions?.split(",").map((e) => e.trim().toLowerCase()) ?? ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "zip", "csv"];
    const anchors = Array.from(doc.querySelectorAll("a[href]"));
    for (const anchor of anchors) {
      const href = anchor.getAttribute("href");
      if (!href) continue;
      const isFile = fileExtensions.some(
        (ext) => href.toLowerCase().endsWith(`.${ext}`) || href.toLowerCase().endsWith(`.${ext}?`) || href.toLowerCase().endsWith(`.${ext}#`)
      );
      if (!isFile) continue;
      const linkText = anchor.textContent?.trim() || href.split("/").pop() || "";
      if (!linkText) continue;
      const resolvedUrl = resolveUrl(href, url);
      const selectors = generateStableSelector(anchor);
      files.push({
        id: `${url}#file-${files.length}`,
        url: resolvedUrl,
        headingText: linkText,
        headingId: `file-${files.length}`,
        breadcrumb: "",
        bodyText: linkText,
        type: "file",
        selector: selectors[0],
        selectors
      });
    }
    return files;
  }
  function extractMedia(html, url) {
    const media = [];
    const doc = new DOMParser().parseFromString(html, "text/html");
    const images = Array.from(doc.querySelectorAll("img"));
    for (const img of images) {
      const alt = img.alt.trim();
      if (!alt) continue;
      let caption = "";
      const figure = img.closest("figure");
      if (figure) {
        const figcaption = figure.querySelector("figcaption");
        if (figcaption) {
          caption = figcaption.textContent?.trim() || "";
        }
      }
      const textToIndex = caption ? `${alt} ${caption}` : alt;
      if (!textToIndex.trim()) continue;
      const selectors = generateStableSelector(img);
      media.push({
        id: `${url}#media-image-${media.length}`,
        url,
        headingText: alt,
        headingId: `media-image-${media.length}`,
        breadcrumb: "",
        bodyText: textToIndex,
        type: "media",
        selector: selectors[0],
        selectors
      });
    }
    const mediaElements = Array.from(doc.querySelectorAll("video, audio"));
    for (const element of mediaElements) {
      const title = element.getAttribute("title") || element.getAttribute("aria-label") || "";
      if (!title) continue;
      let transcript = "";
      const tracks = Array.from(element.querySelectorAll('track[kind="captions"], track[kind="subtitles"]'));
      for (const track of tracks) {
        const src = track.getAttribute("src");
        if (src) {
          transcript += `[Transcript available: ${src}] `;
        }
      }
      const textToIndex = transcript ? `${title} ${transcript}` : title;
      if (!textToIndex.trim()) continue;
      const selectors = generateStableSelector(element);
      media.push({
        id: `${url}#media-${media.length}`,
        url,
        headingText: title,
        headingId: `media-${media.length}`,
        breadcrumb: "",
        bodyText: textToIndex,
        type: "media",
        selector: selectors[0],
        selectors,
        transcript: transcript.trim()
      });
    }
    return media;
  }
  function extractStructuredData(html, url) {
    const structured = [];
    const doc = new DOMParser().parseFromString(html, "text/html");
    const jsonLdScripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent || "{}");
        if (Array.isArray(data) ? data.some((item) => item["@type"] === "FAQPage") : data["@type"] === "FAQPage") {
          const faqItems = Array.isArray(data) ? data.flatMap((item) => item.mainEntity || []) : data.mainEntity || [];
          for (const [index, question] of faqItems.entries()) {
            if (!question || !question.name) continue;
            const answer = question.acceptedAnswer?.text || question.suggestedAnswer?.text || "";
            if (!answer) continue;
            const textToIndex = `${question.name} ${answer}`;
            structured.push({
              id: `${url}#structured-faq-${index}`,
              url,
              headingText: question.name,
              headingId: `structured-faq-${index}`,
              breadcrumb: "",
              bodyText: textToIndex,
              type: "structured",
              structuredData: { question: question.name, answer }
            });
          }
        } else if (data["@type"]) {
          const type = data["@type"];
          const name = data.name || data.headline || "";
          const description = data.description || "";
          if (!name && !description) continue;
          const textToIndex = `${name} ${description}`.trim();
          if (!textToIndex) continue;
          structured.push({
            id: `${url}#structured-${type.toLowerCase()}-${structured.length}`,
            url,
            headingText: name || "Structured Data",
            headingId: `structured-${type.toLowerCase()}-${structured.length}`,
            breadcrumb: "",
            bodyText: textToIndex,
            type: "structured",
            structuredData: data
          });
        }
      } catch (e) {
        continue;
      }
    }
    return structured;
  }
  function resolveUrl(value, base) {
    if (!value) return base;
    try {
      return new URL(value, base).toString();
    } catch {
      return value;
    }
  }

  // ../src/agent.ts
  var Agent = class {
    constructor(index, inspector, actionsMode = "execute") {
      this.actionCount = 0;
      this.lastRoute = typeof window !== "undefined" ? window.location.href : "";
      this.lastAction = { success: false, reason: "no-action" };
      this.index = index;
      this.inspector = inspector;
      this.options = typeof actionsMode === "string" ? { actionsMode } : actionsMode;
      this.actionsMode = this.options.actionsMode ?? "execute";
      this.installRouteObserver();
    }
    async click(selector) {
      if (typeof selector !== "string" && selector.destructive && (this.actionsMode === "navigate-only" || this.options.destructive === false)) throw new Error("destructive-action-blocked");
      this.guardAction();
      const resolved = await this.resolveSelector(selector);
      if (!resolved.success) {
        if (typeof selector !== "string" && this.actionsMode === "navigate-only") return this;
        throw new Error(resolved.reason || "Click failed");
      }
      const element = resolved.element;
      this.ensureVisible(element ?? null);
      const before = this.fingerprint();
      if (element && typeof MouseEvent !== "undefined") {
        const clickEvent = new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: typeof window !== "undefined" ? window : void 0
        });
        element.dispatchEvent(clickEvent);
      }
      await this.waitForStable({ quietMs: 50, timeout: 1e3 });
      if (!this.changedSince(before) && typeof selector !== "string" && selector.selectors?.length) {
        const retry = await this.resolveSelector({ ...selector, selectors: selector.selectors.slice(1) });
        if (retry.success && retry.element && retry.element !== element) retry.element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }
      this.lastAction = { success: true, changed: this.changedSince(before), url: typeof window !== "undefined" ? window.location.href : void 0, element };
      return this;
    }
    async type(selector, value) {
      this.guardAction();
      const resolved = await this.resolveSelector(selector);
      if (!resolved.success) {
        throw new Error(resolved.reason || "Type failed");
      }
      const element = resolved.element;
      this.ensureVisible(element);
      if (element && "value" in element) {
        const descriptor = Object.getOwnPropertyDescriptor(element, "value");
        if (descriptor && descriptor.set) {
          descriptor.set.call(element, value);
        } else {
          element.value = value;
        }
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
      this.lastAction = { success: true, changed: true, url: typeof window !== "undefined" ? window.location.href : void 0, element: element ?? void 0 };
      return this;
    }
    async submit(selector) {
      let element = null;
      if (selector) {
        const resolved = await this.resolveSelector(selector);
        if (resolved.success && resolved.element) {
          element = resolved.element;
        }
      } else if (typeof document !== "undefined") {
        element = document.querySelector("form") || document.querySelector('button[type="submit"]') || document.querySelector('input[type="submit"]');
      }
      if (element) {
        if (element instanceof HTMLFormElement) {
          element.dispatchEvent(new Event("submit", { bubbles: true }));
        } else {
          const clickEvent = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: typeof window !== "undefined" ? window : void 0
          });
          element.dispatchEvent(clickEvent);
        }
        this.lastAction = { success: true, changed: true, url: typeof window !== "undefined" ? window.location.href : void 0, element };
      }
      return this;
    }
    getLastActionResult() {
      return { ...this.lastAction };
    }
    async navigate(url) {
      if ((url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) && typeof window !== "undefined") {
        const target = new URL(url, window.location.href).toString();
        const sameOrigin = new URL(target).origin === window.location.origin;
        if (sameOrigin && target.split("#")[0] === window.location.href.split("#")[0] && window.history.pushState) {
          window.history.pushState({}, "", target);
          window.dispatchEvent(new PopStateEvent("popstate"));
          await this.waitForStable();
        } else window.location.href = target;
      }
      return this;
    }
    async back() {
      if (typeof window !== "undefined") {
        window.history.back();
      }
      return this;
    }
    async forward() {
      if (typeof window !== "undefined") {
        window.history.forward();
      }
      return this;
    }
    async wait(timeout = 1e3) {
      await new Promise((resolve) => setTimeout(resolve, timeout));
      return this;
    }
    async extract(selector) {
      const resolved = await this.resolveSelector(selector);
      if (!resolved.success) {
        throw new Error(resolved.reason || "Extract failed");
      }
      const element = resolved.element;
      if (!element) {
        throw new Error("Element not found");
      }
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        return element.value;
      }
      return element.textContent?.trim() || "";
    }
    async observe(options) {
      if (typeof document === "undefined") return [];
      const records = extractAccessibilityTree(options?.root ?? document).filter((record) => {
        if (options?.includeHidden) return true;
        const element = this.resolveRecordElement(record);
        return !!element && (!options?.inViewport && options?.inViewport !== false ? this.isVisible(element) : this.isVisible(element));
      });
      this.inspector.setRecords(records);
      return records;
    }
    async waitForStable(options) {
      if (typeof document === "undefined" || typeof MutationObserver === "undefined") return this;
      const quietMs = options?.quietMs ?? 250;
      const timeout = options?.timeout ?? 5e3;
      await new Promise((resolve) => {
        let quietTimer;
        const observer = new MutationObserver(() => {
          clearTimeout(quietTimer);
          quietTimer = setTimeout(done, quietMs);
        });
        const done = () => {
          clearTimeout(quietTimer);
          observer.disconnect();
          resolve();
        };
        observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
        quietTimer = setTimeout(done, quietMs);
        setTimeout(done, timeout);
      });
      return this;
    }
    isVisible(element) {
      if (!element) return false;
      const style = typeof window !== "undefined" ? window.getComputedStyle(element) : null;
      if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (typeof window === "undefined" || rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth);
    }
    async exhaustPagination(options) {
      const maxPages = options?.maxPages ?? 10;
      const nextText = (options?.nextText ?? ["next", "older", "more"]).map((v) => v.toLowerCase());
      const merged = /* @__PURE__ */ new Map();
      for (let page = 0; page < maxPages && this.actionCount < (options?.maxActionsPerRun ?? this.options.maxActionsPerRun ?? Infinity); page++) {
        const records = await this.observe({ inViewport: false, includeHidden: true });
        records.forEach((record) => merged.set(`${record.label}:${record.type}`, record));
        const next = records.find((record) => record.type === "action" && !record.destructive && nextText.some((text) => (record.label || "").toLowerCase().includes(text)));
        if (next) await this.click(next);
        else if (options?.scroll !== false && typeof window !== "undefined") {
          window.scrollTo(0, document.body.scrollHeight);
          await this.waitForStable();
        } else break;
        if (!next && options?.scroll === false) break;
      }
      return [...merged.values()];
    }
    async resolveSelector(selector) {
      let element = null;
      if (typeof selector === "string") {
        element = this.queryComposed(selector);
      } else if (selector) {
        const record = this.index.allSections.find((r) => r.id === selector.id);
        const candidates = record?.selectors?.length ? record.selectors : record?.selector ? [record.selector] : [];
        for (const candidate of candidates) {
          element = this.queryComposed(candidate, record?.iframePath);
          if (element) break;
        }
        if (!element) element = this.resolveRecordElement(selector);
        if (!element && selector.headingText) {
          const match = await this.findActionable(selector.headingText);
          if (match && match.id !== selector.id) return this.resolveSelector(match);
        }
      }
      if (!element) {
        return { success: false, reason: "element-not-found" };
      }
      return { success: true, element };
    }
    queryComposed(selector, iframePath) {
      if (typeof document === "undefined") return null;
      const find = (root) => {
        if (selector.startsWith("xpath=")) {
          try {
            return document.evaluate(selector.slice(6), root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
          } catch {
            return null;
          }
        }
        const direct = root.querySelector(selector);
        if (direct) return direct;
        for (const host of Array.from(root.querySelectorAll("*"))) if (host.shadowRoot) {
          const found = find(host.shadowRoot);
          if (found) return found;
        }
        return null;
      };
      if (!iframePath?.length) return find(document);
      let current = document;
      for (const position of iframePath) {
        const frame = current?.querySelectorAll("iframe")[position];
        current = frame?.contentDocument ?? null;
      }
      return current ? find(current) : null;
    }
    resolveRecordElement(record) {
      const candidates = record.selectors?.length ? record.selectors : record.selector ? [record.selector] : [];
      for (const selector of candidates) {
        const found = this.queryComposed(selector, record.iframePath);
        if (found) return found;
      }
      return null;
    }
    ensureVisible(element) {
      if (element && !this.isVisible(element)) element.scrollIntoView({ block: "center", inline: "nearest" });
    }
    fingerprint() {
      return `${typeof window !== "undefined" ? window.location.href : ""}|${typeof document !== "undefined" ? document.body?.textContent?.length : 0}`;
    }
    changedSince(before) {
      return this.fingerprint() !== before;
    }
    guardAction() {
      this.actionCount++;
      if (this.actionCount > (this.options.maxActionsPerRun ?? Infinity)) throw new Error("max-actions-per-run-exceeded");
      if (this.options.rateLimitMs) return;
    }
    installRouteObserver() {
      if (typeof window === "undefined") return;
      const onRoute = () => {
        this.lastRoute = window.location.href;
        void this.observe({ inViewport: false });
      };
      window.addEventListener("popstate", onRoute);
      window.addEventListener("hashchange", onRoute);
      for (const method of ["pushState", "replaceState"]) {
        const historyMethod = window.history[method].bind(window.history);
        window.history[method] = (...args) => {
          const result = historyMethod(...args);
          onRoute();
          return result;
        };
      }
    }
    async findActionable(text) {
      const results = this.index.allSections.filter(
        (r) => r.type === "action" || r.type === "field"
      );
      const normalized = text.toLowerCase().trim();
      for (const record of results) {
        if (record.headingText.toLowerCase().includes(normalized) || record.label?.toLowerCase().includes(normalized)) {
          return record;
        }
      }
      return null;
    }
    async executeWorkflow(steps, options) {
      const maxRetries = options?.maxRetries ?? 0;
      const retryDelay = options?.retryDelay ?? 500;
      const stopOnError = options?.stopOnError ?? true;
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        options?.onStepStart?.(step, i);
        let attempt = 0;
        let success = false;
        while (attempt <= maxRetries && !success) {
          try {
            switch (step.action) {
              case "click":
                if (step.selector) {
                  await this.click(step.selector);
                } else if (step.recordId) {
                  const record = this.index.allSections.find((r) => r.id === step.recordId);
                  if (record) await this.click(record);
                }
                success = true;
                break;
              case "type":
                if (step.selector) {
                  await this.type(step.selector, step.value || "");
                } else if (step.recordId) {
                  const record = this.index.allSections.find((r) => r.id === step.recordId);
                  if (record) await this.type(record, step.value || "");
                }
                success = true;
                break;
              case "navigate":
                if (step.url) {
                  await this.navigate(step.url);
                  await this.waitForNavigation();
                }
                success = true;
                break;
              case "extract":
                success = true;
                break;
              case "submit":
                await this.submit(step.selector);
                success = true;
                break;
              case "back":
                await this.back();
                success = true;
                break;
              case "forward":
                await this.forward();
                success = true;
                break;
              case "wait":
                if (step.timeout) {
                  await this.wait(step.timeout);
                }
                success = true;
                break;
            }
            options?.onStepComplete?.(step, i, success);
          } catch (error) {
            attempt++;
            if (attempt > maxRetries) {
              options?.onStepError?.(step, i, error);
              if (stopOnError) {
                throw error;
              }
            } else {
              await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
          }
        }
      }
    }
    async waitForNavigation() {
      await new Promise((resolve) => {
        if (typeof document !== "undefined") {
          const checkReady = () => {
            if (document.readyState === "complete") {
              resolve();
            } else {
              setTimeout(checkReady, 100);
            }
          };
          checkReady();
        } else {
          resolve();
        }
      });
    }
    getSession() {
      return {
        id: this.generateSessionId(),
        url: typeof window !== "undefined" ? window.location.href : "about:blank",
        timestamp: Date.now(),
        cookies: this.getCookies(),
        localStorage: this.getLocalStorageSnapshot()
      };
    }
    generateSessionId() {
      return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
    getCookies() {
      const cookies = {};
      if (typeof document !== "undefined") {
        document.cookie.split(";").forEach((cookie) => {
          const [name, value] = cookie.trim().split("=");
          if (name) cookies[name] = value || "";
        });
      }
      return cookies;
    }
    getLocalStorageSnapshot() {
      const storage = {};
      try {
        if (typeof localStorage !== "undefined") {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
              storage[key] = localStorage.getItem(key) || "";
            }
          }
        }
      } catch (e) {
      }
      return storage;
    }
  };

  // ../src/search-index.ts
  function createTrieNode() {
    return {
      children: /* @__PURE__ */ new Map(),
      records: []
    };
  }
  function createSearchIndex() {
    return {
      headingIndex: /* @__PURE__ */ new Map(),
      headingIds: /* @__PURE__ */ new Map(),
      bodyIndex: /* @__PURE__ */ new Map(),
      allSections: [],
      queryCache: /* @__PURE__ */ new Map(),
      popularQueries: [],
      docFrequency: /* @__PURE__ */ new Map(),
      fieldDocFreq: {
        headingText: /* @__PURE__ */ new Map(),
        bodyText: /* @__PURE__ */ new Map(),
        label: /* @__PURE__ */ new Map(),
        breadcrumb: /* @__PURE__ */ new Map()
      },
      totalDocs: 0,
      queryPopularity: /* @__PURE__ */ new Map(),
      version: 1,
      headingTrie: createTrieNode()
    };
  }

  // src/spotlight.ts
  var HOST_ID = "reef-spotlight-host";
  var MAX_ROWS_DEFAULT = 50;
  var DEBOUNCE_DEFAULT = 80;
  var MAX_RECENTS_DEFAULT = 8;
  var STYLES = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }

.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 17, 21, 0.42);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  z-index: 2147483647;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 14vh;
  animation: reef-spotlight-fade 120ms ease-out;
}
.card {
  width: min(640px, 92vw);
  max-height: min(560px, 70vh);
  background: #ffffff;
  color: #111111;
  border-radius: 14px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.32), 0 4px 12px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: reef-spotlight-slide 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}
.input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid #ececec;
}
.input-row .glyph {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  color: #6b7280;
}
.input-row input {
  flex: 1 1 auto;
  font-size: 18px;
  line-height: 24px;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font-family: inherit;
  min-width: 0;
}
.input-row input::placeholder { color: #9ca3af; }
.input-row .esc {
  font-size: 11px;
  color: #6b7280;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 1px 6px;
  background: #fafafa;
  user-select: none;
}
.results {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 6px 0;
  scrollbar-width: thin;
}
.empty {
  padding: 28px 20px;
  text-align: center;
  color: #6b7280;
  font-size: 14px;
  line-height: 1.5;
}
.empty .suggestion {
  color: #2563eb;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}
.empty .suggestion:hover {
  color: #1d4ed8;
}
.row {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  border-left: 2px solid transparent;
  user-select: none;
}
.row[aria-selected="true"] {
  background: #f3f4f6;
  border-left-color: #111111;
}
.row .favicon {
  width: 16px;
  height: 16px;
  border-radius: 2px;
  background: #f3f4f6;
  object-fit: contain;
}
.row .main { min-width: 0; }
.row .title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  color: #111111;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row .title mark {
  background: #fde68a;
  color: inherit;
  padding: 0 1px;
  border-radius: 2px;
}
.row .url {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}
.row .match {
  font-size: 11px;
  color: #6b7280;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  border-top: 1px solid #ececec;
  font-size: 11px;
  color: #6b7280;
  background: #fafafa;
}
.footer .hints { display: flex; gap: 10px; flex-wrap: wrap; }
.footer .hint kbd {
  font-family: inherit;
  font-size: 10px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 3px;
  padding: 0 4px;
  margin-right: 2px;
}
.footer .brand { font-weight: 600; color: #111111; }

/* Section headers */
.section-header {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: #9ca3af;
  padding: 8px 16px 4px;
  user-select: none;
}

/* Autocorrect banner */
.autocorrect-banner {
  padding: 8px 16px;
  font-size: 12px;
  color: #6b7280;
  background: #fefce8;
  border-bottom: 1px solid #fde68a;
}
.autocorrect-banner strong { color: #111111; }
.autocorrect-banner .autocorrect-orig {
  color: #2563eb;
  text-decoration: none;
  cursor: pointer;
}
.autocorrect-banner .autocorrect-orig:hover { text-decoration: underline; }

/* Site result rows */
.row-site .site-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  background: #f3f4f6;
  border-radius: 2px;
}
.row-site .site-icon svg { stroke: #6366f1; }

/* Action rows */
.row-action { opacity: 0.85; }
.row-action:hover { opacity: 1; }
.row-action .action-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0fdf4;
  border-radius: 2px;
}
.row-action .action-icon svg { stroke: #16a34a; }
.row-action .action-title { font-style: italic; }
.row-action .action-badge {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #16a34a;
  font-weight: 600;
}

/* Dark theme */
:host([data-theme="dark"]) .card { background: #1f2024; color: #e7e7ea; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55), 0 4px 12px rgba(0, 0, 0, 0.35); }
:host([data-theme="dark"]) .input-row { border-bottom-color: #2c2d31; }
:host([data-theme="dark"]) .input-row .glyph,
:host([data-theme="dark"]) .input-row input::placeholder,
:host([data-theme="dark"]) .row .url,
:host([data-theme="dark"]) .row .match,
:host([data-theme="dark"]) .footer { color: #a1a1aa; }
:host([data-theme="dark"]) .input-row .esc { background: #2c2d31; border-color: #3a3b40; color: #a1a1aa; }
:host([data-theme="dark"]) .row[aria-selected="true"] { background: #2c2d31; border-left-color: #ffffff; }
:host([data-theme="dark"]) .row .title { color: #e7e7ea; }
:host([data-theme="dark"]) .row .favicon { background: #2c2d31; }
:host([data-theme="dark"]) .row .title mark { background: #facc15; color: #111111; }
:host([data-theme="dark"]) .footer { background: #161719; border-top-color: #2c2d31; }
:host([data-theme="dark"]) .footer .brand { color: #e7e7ea; }
:host([data-theme="dark"]) .footer .hint kbd { background: #2c2d31; border-color: #3a3b40; color: #e7e7ea; }
:host([data-theme="dark"]) .empty .suggestion { color: #60a5fa; }
:host([data-theme="dark"]) .empty .suggestion:hover { color: #93bbfd; }
:host([data-theme="dark"]) .section-header { color: #71717a; }
:host([data-theme="dark"]) .autocorrect-banner { background: #422006; border-bottom-color: #854d0e; color: #a1a1aa; }
:host([data-theme="dark"]) .autocorrect-banner strong { color: #e7e7ea; }
:host([data-theme="dark"]) .autocorrect-banner .autocorrect-orig { color: #60a5fa; }
:host([data-theme="dark"]) .row-site .site-icon { background: #2c2d31; }
:host([data-theme="dark"]) .row-action .action-icon { background: #1a2e1a; }
:host([data-theme="dark"]) .row-action .action-badge { color: #4ade80; }

@keyframes reef-spotlight-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes reef-spotlight-slide { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
  .backdrop, .card { animation: none; }
}
`;
  function defaultSendMessage(msg) {
    return new Promise((resolve) => {
      try {
        const result = globalThis.chrome?.runtime?.sendMessage(msg, (res) => resolve(res));
        if (result && typeof result.then === "function") {
          result.then(resolve, () => resolve(void 0));
        }
      } catch {
        resolve(void 0);
      }
    });
  }
  async function getStoredTheme() {
    try {
      const chrome2 = globalThis.chrome;
      if (chrome2?.storage?.local?.get) {
        const data = await new Promise((resolve) => {
          chrome2.storage.local.get(["theme"], (d) => resolve(d));
        });
        const t = data?.theme;
        if (t === "light" || t === "dark" || t === "system") return t;
      }
    } catch {
    }
    return "system";
  }
  function resolveTheme(t) {
    if (t === "system") {
      try {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      } catch {
        return "light";
      }
    }
    return t;
  }
  function hostFromUrl(url) {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function highlight(text, query) {
    if (!query) return escapeHtml(text);
    const safe = escapeHtml(text);
    const q = escapeHtml(query);
    try {
      const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
      return safe.replace(re, "<mark>$1</mark>");
    } catch {
      return safe;
    }
  }
  function truncate(s, n) {
    if (s.length <= n) return s;
    return s.slice(0, n - 1) + "\u2026";
  }
  var FALLBACK_FAVICON = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='8' cy='8' r='6' fill='none' stroke='%23999' stroke-width='1.4'/><path d='M2 8h12M8 2c2.5 2.5 2.5 9.5 0 12M8 2c-2.5 2.5-2.5 9.5 0 12' fill='none' stroke='%23999' stroke-width='1.4'/></svg>";
  function createSpotlight(opts = {}) {
    const maxRows = opts.maxRows ?? MAX_ROWS_DEFAULT;
    const debounceMs = opts.debounceMs ?? DEBOUNCE_DEFAULT;
    const maxRecents = opts.maxRecents ?? MAX_RECENTS_DEFAULT;
    const send = opts.sendMessage ?? defaultSendMessage;
    let host = null;
    let shadow = null;
    let card = null;
    let input = null;
    let results = null;
    let footer = null;
    let mounted = false;
    let open = false;
    let currentResults = [];
    let unifiedResults = [];
    let currentQuery = "";
    let currentSuggestion;
    let currentSiteResults = [];
    let currentActions = [];
    let currentAutocorrected = false;
    let currentReefSuggestions = [];
    let selectedIndex = 0;
    let perTabMatchIndex = /* @__PURE__ */ new Map();
    let debounceHandle = null;
    let lastQueryKey = "\0never-queried\0";
    let inFlight = 0;
    function mount() {
      if (mounted) return;
      host = document.createElement("div");
      host.id = HOST_ID;
      host.style.position = "fixed";
      host.style.inset = "0";
      host.style.zIndex = "2147483647";
      host.style.display = "none";
      shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = STYLES;
      shadow.appendChild(style);
      const backdrop = document.createElement("div");
      backdrop.className = "backdrop";
      backdrop.addEventListener("mousedown", (e) => {
        if (e.target === backdrop) hide();
      });
      card = document.createElement("div");
      card.className = "card";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-label", "Reef Spotlight");
      card.addEventListener("mousedown", (e) => e.stopPropagation());
      const inputRow = document.createElement("div");
      inputRow.className = "input-row";
      const glyph = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      glyph.setAttribute("class", "glyph");
      glyph.setAttribute("viewBox", "0 0 20 20");
      glyph.setAttribute("fill", "none");
      glyph.setAttribute("stroke", "currentColor");
      glyph.setAttribute("stroke-width", "2");
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", "9");
      circle.setAttribute("cy", "9");
      circle.setAttribute("r", "6");
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", "13.5");
      line.setAttribute("y1", "13.5");
      line.setAttribute("x2", "18");
      line.setAttribute("y2", "18");
      line.setAttribute("stroke-linecap", "round");
      glyph.appendChild(circle);
      glyph.appendChild(line);
      inputRow.appendChild(glyph);
      input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Search tabs & page content\u2026";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.setAttribute("aria-label", "Search tabs and page content");
      input.setAttribute("aria-autocomplete", "list");
      input.setAttribute("aria-controls", "reef-spotlight-results");
      input.addEventListener("input", onInput);
      input.addEventListener("keydown", onKeyDown);
      inputRow.appendChild(input);
      const esc = document.createElement("span");
      esc.className = "esc";
      esc.textContent = "esc";
      inputRow.appendChild(esc);
      results = document.createElement("div");
      results.className = "results";
      results.id = "reef-spotlight-results";
      results.setAttribute("role", "listbox");
      results.setAttribute("aria-label", "Tabs");
      results.addEventListener("mousedown", (e) => {
        const target = e.target;
        const row = target.closest(".row");
        if (!row) return;
        e.preventDefault();
        const idx = Number(row.dataset.index);
        if (Number.isFinite(idx)) {
          selectedIndex = idx;
          applySelection();
          openSelected();
        }
      });
      footer = document.createElement("div");
      footer.className = "footer";
      const hints = document.createElement("span");
      hints.className = "hints";
      hints.innerHTML = '<span class="hint"><kbd>\u2191</kbd><kbd>\u2193</kbd>navigate</span><span class="hint"><kbd>\u21B5</kbd>open</span><span class="hint"><kbd>esc</kbd>close</span><span class="hint"><kbd>tab</kbd>cycle matches</span><span class="hint"><kbd>Ctrl</kbd>+<kbd>1\u20139</kbd>jump</span>';
      footer.appendChild(hints);
      const brand = document.createElement("span");
      brand.className = "brand";
      brand.textContent = "Reef Spotlight";
      footer.appendChild(brand);
      card.appendChild(inputRow);
      card.appendChild(results);
      card.appendChild(footer);
      backdrop.appendChild(card);
      shadow.appendChild(backdrop);
      host.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          hide();
        }
      }, true);
      document.documentElement.appendChild(host);
      mounted = true;
    }
    function setSelected(idx, scroll = false) {
      if (!results) return;
      if (unifiedResults.length === 0) {
        selectedIndex = 0;
        return;
      }
      if (idx < 0) idx = unifiedResults.length - 1;
      if (idx >= unifiedResults.length) idx = 0;
      selectedIndex = idx;
      applySelection(scroll);
    }
    function applySelection(scroll = false) {
      if (!results) return;
      const rows = results.querySelectorAll(".row");
      rows.forEach((r) => r.setAttribute("aria-selected", "false"));
      const sel = rows[selectedIndex];
      if (sel) {
        sel.setAttribute("aria-selected", "true");
        if (scroll && typeof sel.scrollIntoView === "function") {
          try {
            sel.scrollIntoView({ block: "nearest" });
          } catch {
          }
        }
      }
    }
    function renderResults(items, query, suggestion, autocorrected, siteResults, actions, reefSuggestions) {
      if (!results) return;
      currentResults = items;
      unifiedResults = [];
      selectedIndex = 0;
      results.replaceChildren();
      const hasAny = items.length > 0 || siteResults && siteResults.length > 0 || actions && actions.length > 0;
      if (!hasAny) {
        const empty = document.createElement("div");
        empty.className = "empty";
        if (suggestion && suggestion !== query.toLowerCase() && !autocorrected) {
          empty.innerHTML = `No matching tabs found. Did you mean <a class="suggestion" href="#">${escapeHtml(suggestion)}</a>?`;
          const link = empty.querySelector(".suggestion");
          if (link) {
            link.addEventListener("click", (e) => {
              e.preventDefault();
              if (input) {
                input.value = suggestion;
                currentQuery = suggestion;
                onInput();
              }
            });
          }
        } else {
          empty.textContent = query ? "No matching tabs found." : "Start typing to search every open tab.";
        }
        if (reefSuggestions && reefSuggestions.length > 0) {
          const chips = document.createElement("div");
          chips.className = "reef-suggestion-chips";
          chips.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;justify-content:center;margin-top:8px;";
          for (const s of reefSuggestions) {
            const chip = document.createElement("button");
            chip.className = "reef-suggestion-chip";
            chip.textContent = s;
            chip.style.cssText = "font-size:11px;padding:3px 10px;border-radius:12px;border:1px solid #e5e7eb;background:#fafafa;color:#6b7280;cursor:pointer;";
            chip.addEventListener("click", () => {
              if (input) {
                input.value = s;
                currentQuery = s;
                onInput();
              }
            });
            chips.appendChild(chip);
          }
          empty.appendChild(chips);
        }
        if (actions && actions.length > 0) {
          const frag = document.createDocumentFragment();
          renderSectionHeader(frag, "Actions");
          for (const action of actions) {
            const idx = unifiedResults.length;
            unifiedResults.push({ kind: "action", data: action });
            frag.appendChild(createActionRow(action, idx));
          }
          results.appendChild(frag);
        }
        results.appendChild(empty);
        return;
      }
      const fragment = document.createDocumentFragment();
      if (autocorrected && suggestion) {
        const banner = document.createElement("div");
        banner.className = "autocorrect-banner";
        banner.innerHTML = `Showing results for <strong>${escapeHtml(suggestion)}</strong> &mdash; <a class="autocorrect-orig" href="#">search for "${escapeHtml(query)}" instead</a>`;
        const origLink = banner.querySelector(".autocorrect-orig");
        if (origLink) {
          origLink.addEventListener("click", (e) => {
            e.preventDefault();
            lastQueryKey = "\0force-requery\0";
            if (input) {
              input.value = query;
              currentQuery = query;
              onInput();
            }
          });
        }
        fragment.appendChild(banner);
      }
      if (items.length > 0) {
        if (siteResults?.length || autocorrected) {
          renderSectionHeader(fragment, "Tabs");
        }
        const renderCount = Math.min(items.length, maxRows);
        for (let i = 0; i < renderCount; i++) {
          const item = items[i];
          const idx = unifiedResults.length;
          unifiedResults.push({ kind: "tab", data: item });
          fragment.appendChild(createTabRow(item, query, idx));
        }
      }
      if (siteResults && siteResults.length > 0) {
        renderSectionHeader(fragment, "Site Content");
        for (const sr of siteResults) {
          const idx = unifiedResults.length;
          unifiedResults.push({ kind: "site", data: sr });
          fragment.appendChild(createSiteRow(sr, query, idx));
        }
      }
      if (actions && actions.length > 0) {
        renderSectionHeader(fragment, "New Tab");
        for (const action of actions) {
          const idx = unifiedResults.length;
          unifiedResults.push({ kind: "action", data: action });
          fragment.appendChild(createActionRow(action, idx));
        }
      }
      results.appendChild(fragment);
      applySelection();
    }
    function renderSectionHeader(parent, label) {
      const header = document.createElement("div");
      header.className = "section-header";
      header.textContent = label;
      parent.appendChild(header);
    }
    function createTabRow(item, query, idx) {
      const row = document.createElement("div");
      row.className = "row";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", idx === selectedIndex ? "true" : "false");
      row.dataset.index = String(idx);
      row.dataset.tabId = String(item.tabId);
      row.dataset.windowId = String(item.windowId);
      row.title = item.title;
      const fav = document.createElement("img");
      fav.className = "favicon";
      fav.alt = "";
      fav.width = 16;
      fav.height = 16;
      fav.src = item.favIconUrl || FALLBACK_FAVICON;
      fav.addEventListener("error", () => {
        fav.src = FALLBACK_FAVICON;
      }, { once: true });
      row.appendChild(fav);
      const main = document.createElement("div");
      main.className = "main";
      const title = document.createElement("div");
      title.className = "title";
      title.innerHTML = highlight(truncate(item.title, 60), query);
      const url = document.createElement("div");
      url.className = "url";
      url.textContent = hostFromUrl(item.url);
      main.appendChild(title);
      main.appendChild(url);
      row.appendChild(main);
      const match = item.matchedRecords?.[perTabMatchIndex.get(item.tabId) ?? 0];
      if (match && (match.headingText || match.bodyText)) {
        const snippet = document.createElement("div");
        snippet.className = "match";
        const text = (match.headingText ? match.headingText + " \u2014 " : "") + (match.bodyText || "");
        snippet.textContent = truncate(text, 90);
        row.appendChild(snippet);
      } else {
        const placeholder = document.createElement("div");
        row.appendChild(placeholder);
      }
      return row;
    }
    function createSiteRow(sr, query, idx) {
      const row = document.createElement("div");
      row.className = "row row-site";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", idx === selectedIndex ? "true" : "false");
      row.dataset.index = String(idx);
      row.title = sr.headingText;
      const icon = document.createElement("div");
      icon.className = "favicon site-icon";
      icon.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2.5 2 9.5 0 12M8 2c-2 2.5-2 9.5 0 12"/></svg>';
      row.appendChild(icon);
      const main = document.createElement("div");
      main.className = "main";
      const title = document.createElement("div");
      title.className = "title";
      title.innerHTML = highlight(truncate(sr.headingText, 60), query);
      const url = document.createElement("div");
      url.className = "url";
      url.textContent = sr.sourceOrigin;
      main.appendChild(title);
      main.appendChild(url);
      row.appendChild(main);
      const snippet = document.createElement("div");
      snippet.className = "match";
      snippet.textContent = truncate(sr.bodyText, 90);
      row.appendChild(snippet);
      return row;
    }
    function createActionRow(action, idx) {
      const row = document.createElement("div");
      row.className = "row row-action";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", idx === selectedIndex ? "true" : "false");
      row.dataset.index = String(idx);
      row.title = action.title;
      const icon = document.createElement("div");
      icon.className = "favicon action-icon";
      if (action.type === "search-web") {
        icon.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5"/><line x1="11" y1="11" x2="15" y2="15" stroke-linecap="round"/></svg>';
      } else {
        icon.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4"/></svg>';
      }
      row.appendChild(icon);
      const main = document.createElement("div");
      main.className = "main";
      const title = document.createElement("div");
      title.className = "title action-title";
      title.textContent = action.title;
      main.appendChild(title);
      row.appendChild(main);
      const badge = document.createElement("div");
      badge.className = "match action-badge";
      badge.textContent = "new tab";
      row.appendChild(badge);
      return row;
    }
    function renderRecents(items) {
      if (!results) return;
      currentResults = items.map((r) => ({
        tabId: -1,
        windowId: -1,
        title: r.title,
        url: r.url,
        favIconUrl: r.favicon,
        score: 0,
        matchedRecords: [],
        _isRecent: true
      }));
      unifiedResults = currentResults.map((r) => ({ kind: "tab", data: r }));
      selectedIndex = 0;
      results.replaceChildren();
      if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Start typing to search every open tab.";
        results.appendChild(empty);
        return;
      }
      const fragment = document.createDocumentFragment();
      items.forEach((r, i) => {
        const row = document.createElement("div");
        row.className = "row";
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", i === 0 ? "true" : "false");
        row.dataset.index = String(i);
        row.dataset.recent = "1";
        row.title = r.title;
        const fav = document.createElement("img");
        fav.className = "favicon";
        fav.alt = "";
        fav.width = 16;
        fav.height = 16;
        fav.src = r.favicon || FALLBACK_FAVICON;
        fav.addEventListener("error", () => {
          fav.src = FALLBACK_FAVICON;
        }, { once: true });
        row.appendChild(fav);
        const main = document.createElement("div");
        main.className = "main";
        const title = document.createElement("div");
        title.className = "title";
        title.textContent = truncate(r.title, 60);
        const url = document.createElement("div");
        url.className = "url";
        url.textContent = hostFromUrl(r.url);
        main.appendChild(title);
        main.appendChild(url);
        row.appendChild(main);
        const tag = document.createElement("div");
        tag.className = "match";
        tag.textContent = "recent";
        row.appendChild(tag);
        fragment.appendChild(row);
      });
      results.appendChild(fragment);
      applySelection();
    }
    async function runQuery(query) {
      const key = query.trim();
      if (key === lastQueryKey) return;
      lastQueryKey = key;
      perTabMatchIndex = /* @__PURE__ */ new Map();
      if (!key) {
        currentSuggestion = void 0;
        currentSiteResults = [];
        currentActions = [];
        currentAutocorrected = false;
        const recents = await fetchRecents();
        renderRecents(recents);
        return;
      }
      const reqId = ++inFlight;
      const res = await send({ type: "SPOTLIGHT_SEARCH", query: key, limit: maxRows });
      if (reqId !== inFlight) return;
      const items = res && res.success && Array.isArray(res.items) ? res.items : [];
      currentSuggestion = res && res.suggestion || void 0;
      currentAutocorrected = !!(res && res.autocorrected);
      currentSiteResults = res && Array.isArray(res.siteResults) ? res.siteResults : [];
      currentActions = res && Array.isArray(res.actions) ? res.actions : [];
      currentReefSuggestions = items.length === 0 ? reefSuggest(key, 5) : [];
      renderResults(items, key, currentSuggestion, currentAutocorrected, currentSiteResults, currentActions, currentReefSuggestions);
    }
    async function fetchRecents() {
      try {
        const res = await send({ type: "LIBRARY_RECENTS_LIST" });
        const list = res && res.success && Array.isArray(res.items) ? res.items : [];
        return list.slice(0, maxRecents).map((r) => ({
          url: r.url,
          title: r.title,
          favicon: r.favicon,
          visitedAt: r.visitedAt ?? 0
        }));
      } catch {
        return [];
      }
    }
    function onInput() {
      if (!input) return;
      currentQuery = input.value;
      if (debounceHandle) clearTimeout(debounceHandle);
      debounceHandle = setTimeout(() => {
        debounceHandle = null;
        void runQuery(currentQuery);
      }, debounceMs);
    }
    function onKeyDown(e) {
      if (!input) return;
      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (e.key === "ArrowDown" || mod && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        setSelected(selectedIndex + 1, true);
        return;
      }
      if (e.key === "ArrowUp" || mod && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        setSelected(selectedIndex - 1, true);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        setSelected(0, true);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        setSelected(unifiedResults.length - 1, true);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        openSelected();
        return;
      }
      if (e.key === "Tab") {
        const sel = unifiedResults[selectedIndex];
        if (sel && sel.kind === "tab" && sel.data.matchedRecords && sel.data.matchedRecords.length > 1) {
          e.preventDefault();
          const next = ((perTabMatchIndex.get(sel.data.tabId) ?? 0) + 1) % sel.data.matchedRecords.length;
          perTabMatchIndex.set(sel.data.tabId, next);
          applySelection();
          if (results) {
            const row = results.querySelectorAll(".row")[selectedIndex];
            if (row) {
              const match = sel.data.matchedRecords[next];
              const snippetEl = row.querySelector(".match");
              if (snippetEl) {
                const text = (match.headingText ? match.headingText + " \u2014 " : "") + (match.bodyText || "");
                snippetEl.textContent = truncate(text, 90);
              }
            }
          }
        }
        return;
      }
      if (e.key === "Backspace" && e.shiftKey && mod) {
        e.preventDefault();
        if (input) {
          input.value = "";
          currentQuery = "";
          onInput();
        }
        return;
      }
      if (mod && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const idx = Number(e.key) - 1;
        if (idx < unifiedResults.length) {
          setSelected(idx, true);
          openSelected();
        }
        return;
      }
    }
    async function openSelected() {
      const sel = unifiedResults[selectedIndex];
      if (!sel) return;
      if (sel.kind === "action") {
        try {
          await send({ type: "SPOTLIGHT_OPEN_NEW_TAB", url: sel.data.url });
        } catch {
        }
        hide();
        return;
      }
      if (sel.kind === "site") {
        try {
          await send({ type: "SPOTLIGHT_OPEN_NEW_TAB", url: sel.data.url });
        } catch {
        }
        hide();
        return;
      }
      const tabHit = sel.data;
      if (tabHit._isRecent) {
        try {
          await send({ type: "LIBRARY_OPEN_RECENT", url: tabHit.url });
        } catch {
        }
        hide();
        return;
      }
      const matchIdx = perTabMatchIndex.get(tabHit.tabId) ?? 0;
      const record = tabHit.matchedRecords?.[matchIdx];
      try {
        await send({ type: "TAB_SWITCH", tabId: tabHit.tabId, windowId: tabHit.windowId });
        if (record) {
          await send({ type: "SPOTLIGHT_OPEN_RECORD", tabId: tabHit.tabId, record });
        }
      } catch {
      }
      hide();
    }
    async function applyTheme(theme) {
      if (!host) return;
      const resolved = resolveTheme(theme);
      host.setAttribute("data-theme", resolved);
    }
    async function show() {
      mount();
      if (!host || !input) return;
      open = true;
      host.style.display = "block";
      const t = opts.theme ?? await getStoredTheme();
      await applyTheme(t);
      lastQueryKey = "\0never-queried\0";
      perTabMatchIndex = /* @__PURE__ */ new Map();
      currentSuggestion = void 0;
      currentSiteResults = [];
      currentActions = [];
      currentAutocorrected = false;
      unifiedResults = [];
      input.value = "";
      currentQuery = "";
      await runQuery("");
      try {
        input?.focus();
      } catch {
      }
    }
    function hide() {
      if (!host) return;
      open = false;
      host.style.display = "none";
      if (debounceHandle) {
        clearTimeout(debounceHandle);
        debounceHandle = null;
      }
    }
    async function toggle() {
      if (open) hide();
      else await show();
    }
    function isOpen() {
      return open;
    }
    function destroy() {
      if (debounceHandle) clearTimeout(debounceHandle);
      if (host && host.parentNode) host.parentNode.removeChild(host);
      host = null;
      shadow = null;
      card = null;
      input = null;
      results = null;
      footer = null;
      mounted = false;
      open = false;
    }
    return { show, hide, toggle, isOpen, destroy };
  }

  // src/content.ts
  var HARD_EXCLUSION_SELECTOR = 'input[type="password"], input[name*="card" i], input[autocomplete*="cc-" i], input[name*="ssn" i], input[name*="social-security" i], [data-reef-agent="off"], [data-sensitive]';
  function isSensitiveElement(element, customExclusions = []) {
    if (element.matches(HARD_EXCLUSION_SELECTOR) || element.closest('[data-reef-agent="off"], [data-sensitive]')) {
      return true;
    }
    return customExclusions.some((selector) => {
      try {
        return element.matches(selector) || !!element.closest(selector);
      } catch {
        return false;
      }
    });
  }
  function getAuthoritativeManifest() {
    if (typeof window !== "undefined" && window.__reefAgentManifest) {
      return window.__reefAgentManifest;
    }
    const scriptTag = document.querySelector('script[type="application/agent-manifest+json"]');
    if (scriptTag?.textContent) {
      try {
        return JSON.parse(scriptTag.textContent);
      } catch {
      }
    }
    return null;
  }
  function extractPageManifest(customExclusions = []) {
    const authoritative = getAuthoritativeManifest();
    if (authoritative) {
      const filteredRecords = authoritative.records.filter((record) => {
        if (!record.selector) return true;
        try {
          const el = document.querySelector(record.selector);
          return el ? !isSensitiveElement(el, customExclusions) : true;
        } catch {
          return true;
        }
      });
      syncRecordsToReef(filteredRecords);
      return {
        ...authoritative,
        records: filteredRecords
      };
    }
    const url = location.href;
    const html = document.documentElement.outerHTML;
    const rawRecords = [
      ...extractSections(html, url),
      ...extractActions(html, url),
      ...extractFields(html, url),
      ...extractLinks(html, url),
      ...extractFiles(html, url),
      ...extractMedia(html, url),
      ...extractStructuredData(html, url),
      ...extractAccessibilityTree(document)
    ];
    const filtered = rawRecords.filter((record) => {
      if (record.selector) {
        try {
          const element = document.querySelector(record.selector);
          if (element && isSensitiveElement(element, customExclusions)) return false;
        } catch {
        }
      }
      return true;
    });
    const deduped = [
      ...new Map(
        filtered.map((record) => [`${record.type}:${record.headingText}:${record.selector || record.url}`, record])
      ).values()
    ];
    syncRecordsToReef(deduped);
    return {
      version: 1,
      url,
      generatedAt: Date.now(),
      records: deduped,
      excludedCount: rawRecords.length - deduped.length
    };
  }
  var dummyInspector = {
    activate: () => {
    },
    deactivate: () => {
    },
    isActive: () => false,
    setRecords: () => {
    }
  };
  var currentAgent = null;
  function getOrCreateAgent(actionsMode = "execute") {
    const index = createSearchIndex();
    currentAgent = new Agent(index, dummyInspector, { actionsMode });
    return currentAgent;
  }

  var reefSynced = false;
  var reefLastUrl = "";
  function syncRecordsToReef(records) {
    if (typeof window === "undefined" || !window.Reef) return;
    const currentUrl = typeof location !== "undefined" ? location.href : "";
    if (reefSynced && reefLastUrl === currentUrl) return;
    try {
      window.Reef.addCustomRecords(records);
      reefSynced = true;
      reefLastUrl = currentUrl;
    } catch (e) {
      console.warn("[reef-ext] failed to sync records to Reef index", e);
    }
  }

  function reefLocalSearch(query, options) {
    if (typeof window === "undefined" || !window.Reef) return { results: [], suggestion: void 0, autocorrected: false };
    if (!query || !query.trim()) return { results: [], suggestion: void 0, autocorrected: false };
    const limit = options?.limit ?? 20;
    const results = window.Reef.search(query, { limit, fuzzy: false, includeScore: true });
    if (results.length > 0) {
      return { results: results.map((r) => r.record ?? r), suggestion: void 0, autocorrected: false };
    }
    const fuzzyResults = window.Reef.search(query, { limit, fuzzy: true, fuzzyDistance: 2, includeScore: true });
    if (fuzzyResults.length > 0) {
      const suggestion = fuzzyResults[0]?.record?.headingText ?? void 0;
      return { results: fuzzyResults.map((r) => r.record ?? r), suggestion, autocorrected: true };
    }
    return { results: [], suggestion: void 0, autocorrected: false };
  }

  function reefSuggest(query, limit) {
    if (typeof window === "undefined" || !window.Reef) return [];
    try {
      return window.Reef.suggest(query, limit ?? 10);
    } catch {
      return [];
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("keydown", (e) => {
      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      if (!isMac) return;
      if (e.metaKey && e.shiftKey && (e.key === "l" || e.key === "L") && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        ensureSpotlight().show();
      }
    }, true);
  }
  var spotlightHandle = null;
  function ensureSpotlight() {
    if (!spotlightHandle) spotlightHandle = createSpotlight();
    return spotlightHandle;
  }
  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      (async () => {
        try {
          if (message.type === "PING") {
            sendResponse({ success: true, url: location.href });
            return;
          }
          if (message.type === "GET_MANIFEST" || message.type === "RESCAN") {
            const manifest = extractPageManifest(message.options?.exclusionSelectors || []);
            sendResponse({ success: true, manifest });
            return;
          }
          if (message.type === "EXECUTE_ACTION" && message.record) {
            const actionsMode = message.options?.actionsMode || "execute";
            const agent = getOrCreateAgent(actionsMode);
            if (message.record.destructive && actionsMode === "navigate-only") {
              sendResponse({ success: false, error: "destructive-action-blocked-by-mode" });
              return;
            }
            if (message.actionType === "click" || message.record.type === "action" || message.record.type === "link") {
              if (message.record.selector) {
                await agent.click(message.record);
              } else if (message.record.url) {
                location.href = message.record.url;
              }
              sendResponse({ success: true, url: location.href });
              return;
            }
            if (message.actionType === "type" || message.record.type === "field") {
              const valueToType = message.value ?? message.record.value ?? "";
              await agent.type(message.record, valueToType);
              sendResponse({ success: true });
              return;
            }
            sendResponse({ success: false, error: "unknown-action-type" });
            return;
          }
          if (message.type === "HIGHLIGHT_RECORD" && message.record?.selector) {
            const el = document.querySelector(message.record.selector);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              const origOutline = el.style.outline;
              el.style.outline = "3px solid #00a8b5";
              setTimeout(() => {
                el.style.outline = origOutline;
              }, 2e3);
            }
            sendResponse({ success: true });
            return;
          }
          if (message.type === "REEF_LOCAL_SEARCH") {
            const query = message.query || "";
            const opts = message.options || {};
            if (!query.trim()) {
              sendResponse({ success: true, results: [], suggestion: void 0, autocorrected: false });
              return;
            }
            if (!reefSynced) {
              extractPageManifest(message.options?.exclusionSelectors || []);
            }
            const searchResult = reefLocalSearch(query, { limit: opts.limit ?? 20 });
            const suggestions = reefSuggest(query, 8);
            sendResponse({
              success: true,
              results: searchResult.results,
              suggestion: searchResult.suggestion,
              autocorrected: searchResult.autocorrected,
              suggestions
            });
            return;
          }
          if (message.type === "REEF_SUGGEST") {
            const suggestions = reefSuggest(message.query || "", message.limit ?? 10);
            sendResponse({ success: true, suggestions });
            return;
          }
          if (message.type === "REEF_BOOKMARK_SELECTION" && message.text) {
            const created = await createBookmarkFromSelection(message.text);
            showReefToast(created ? "Bookmarked in Reef" : "Bookmark failed", created ? "success" : "error");
            sendResponse({ success: !!created });
            return;
          }
          if (message.type === "REEF_SNIPPET_SELECTION" && message.text) {
            const created = await createSnippetFromSelection(message.text);
            showReefToast(created ? "Saved as snippet" : "Snippet failed", created ? "success" : "error");
            sendResponse({ success: !!created });
            return;
          }
          if (message.type === "REEF_BOOKMARK_PAGE") {
            const created = await createBookmarkFromPage();
            showReefToast(created ? "Page bookmarked" : "Bookmark failed", created ? "success" : "error");
            sendResponse({ success: !!created });
            return;
          }
          if (message.type === "REEF_SHOW_TOAST" && message.message) {
            showReefToast(message.message, message.toastType || "info");
            sendResponse({ success: true });
            return;
          }
          if (message.type === "REEF_OPEN_POPUP_QUERY" || message.type === "REEF_OPEN_NOTE_FOR_PAGE") {
            sendResponse({ success: true });
            return;
          }
          if (message.type === "SHOW_SPOTLIGHT") {
            try {
              await ensureSpotlight().show();
              sendResponse({ success: true });
            } catch (err) {
              sendResponse({ success: false, error: err?.message || String(err) });
            }
            return;
          }
          if (message.type === "HIDE_SPOTLIGHT") {
            spotlightHandle?.hide();
            sendResponse({ success: true });
            return;
          }
          sendResponse({ success: false, error: "unsupported-message-type" });
        } catch (err) {
          sendResponse({ success: false, error: err?.message || String(err) });
        }
      })();
      return true;
    });
  }
  var TOOLBAR_HOST_ID = "reef-selection-toolbar-host";
  function isInsideEditable(target) {
    if (!target) return false;
    const el = target;
    if (!el || !el.closest) return false;
    return !!el.closest('input, textarea, [contenteditable="true"], [contenteditable=""], [data-reef-agent="off"], [data-sensitive]');
  }
  function getSelectionContext() {
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      return { text: "", rect: null, range: null };
    }
    const text = sel.toString().trim();
    if (text.length < 1) return { text: "", rect: null, range: null };
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    return { text, rect, range };
  }
  function ensureToolbarHost() {
    if (typeof document === "undefined") return null;
    let host = document.getElementById(TOOLBAR_HOST_ID);
    if (host && host.shadowRoot) return host;
    if (!host) {
      host = document.createElement("div");
      host.id = TOOLBAR_HOST_ID;
      host.setAttribute("data-reef-agent", "on");
      host.style.cssText = "position: fixed; z-index: 2147483646; top: 0; left: 0; display: none; pointer-events: auto;";
      (document.body || document.documentElement).appendChild(host);
    }
    if (!host.shadowRoot) {
      const root = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = REEF_TOOLBAR_CSS;
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.innerHTML = `
      <button class="btn" data-action="bookmark" title="Bookmark selection">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M4 2h8a1 1 0 0 1 1 1v11l-5-3-5 3V3a1 1 0 0 1 1-1z"/></svg>
        <span>Bookmark</span>
      </button>
      <button class="btn" data-action="snippet" title="Save as snippet">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M3 3h10v2H3V3zm0 4h10v2H3V7zm0 4h7v2H3v-2z"/></svg>
        <span>Snippet</span>
      </button>
      <button class="btn" data-action="search" title="Search in Reef">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M11.5 11.5 14 14M12.5 7a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
        <span>Search</span>
      </button>
      <button class="btn" data-action="copy" title="Copy text">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M5 2h7a1 1 0 0 1 1 1v9h-1V3H5V2zM3 4h7a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm0 1v9h7V5H3z"/></svg>
        <span>Copy</span>
      </button>
    `;
      root.appendChild(style);
      root.appendChild(bar);
      bar.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      bar.addEventListener("click", async (e) => {
        const target = e.target;
        const btn = target.closest(".btn");
        if (!btn) return;
        const action = btn.dataset.action;
        const text = host._reefText || "";
        hideToolbar();
        if (action === "bookmark") {
          const ok = await createBookmarkFromSelection(text);
          showReefToast(ok ? "Bookmarked in Reef" : "Bookmark failed", ok ? "success" : "error");
        } else if (action === "snippet") {
          const ok = await createSnippetFromSelection(text);
          showReefToast(ok ? "Saved as snippet" : "Snippet failed", ok ? "success" : "error");
        } else if (action === "search") {
          if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage({ type: "TAB_SEARCH_PROMPT", query: text });
          }
          try {
            chrome?.action?.openPopup?.();
          } catch {
          }
        } else if (action === "copy") {
          try {
            await navigator.clipboard.writeText(text);
            showReefToast("Copied to clipboard", "success");
          } catch {
            showReefToast("Copy failed", "error");
          }
        }
      });
    }
    return host;
  }
  var REEF_TOOLBAR_CSS = `
:host { all: initial; }
.bar {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: #111;
  color: #fff;
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 6px 20px rgba(0,0,0,.25);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  font-size: 12px;
  line-height: 1;
  user-select: none;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: transparent;
  color: #fff;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  white-space: nowrap;
  transition: background .12s;
}
.btn:hover { background: rgba(255,255,255,.12); }
.btn:active { background: rgba(255,255,255,.2); }
.btn svg { display: block; }
`;
  function showToolbarAt(rect, text) {
    const host = ensureToolbarHost();
    if (!host) return;
    host._reefText = text;
    host.style.display = "block";
    const bar = host.shadowRoot.querySelector(".bar");
    const margin = 8;
    const barHeight = bar ? bar.offsetHeight : 36;
    const barWidth = bar ? bar.offsetWidth : 280;
    let top = window.scrollY + rect.top - barHeight - margin;
    let left = window.scrollX + rect.left + rect.width / 2 - barWidth / 2;
    if (rect.top - barHeight - margin < 0) {
      top = window.scrollY + rect.bottom + margin;
    }
    const maxLeft = window.scrollX + window.innerWidth - barWidth - 8;
    if (left > maxLeft) left = maxLeft;
    if (left < window.scrollX + 8) left = window.scrollX + 8;
    host.style.transform = `translate(${left}px, ${top}px)`;
  }
  function hideToolbar() {
    const host = document.getElementById(TOOLBAR_HOST_ID);
    if (host) {
      host.style.display = "none";
      host._reefText = "";
    }
  }
  var toolbarTimer = null;
  function onSelectionChange() {
    if (typeof document === "undefined") return;
    const active = document.activeElement;
    if (active && isInsideEditable(active)) {
      hideToolbar();
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      hideToolbar();
      return;
    }
    if (isInsideEditable(sel.anchorNode)) {
      hideToolbar();
      return;
    }
    const { text, rect } = getSelectionContext();
    if (!text || text.length < 1 || !rect || rect.width === 0) {
      hideToolbar();
      return;
    }
    if (toolbarTimer) window.clearTimeout(toolbarTimer);
    toolbarTimer = window.setTimeout(() => {
      const ctx = getSelectionContext();
      if (ctx.text && ctx.rect) showToolbarAt(ctx.rect, ctx.text);
    }, 220);
  }
  function dismissOnOutside() {
    document.addEventListener("mousedown", (e) => {
      const host = document.getElementById(TOOLBAR_HOST_ID);
      if (!host || host.style.display === "none") return;
      if (host.contains(e.target)) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      hideToolbar();
    }, true);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideToolbar();
    });
    window.addEventListener("scroll", () => hideToolbar(), { passive: true });
    window.addEventListener("resize", () => hideToolbar());
  }
  if (typeof document !== "undefined") {
    document.addEventListener("selectionchange", onSelectionChange);
    if (document.readyState === "complete" || document.readyState === "interactive") {
      dismissOnOutside();
    } else {
      document.addEventListener("DOMContentLoaded", dismissOnOutside);
    }
  }
  var TOAST_HOST_ID = "reef-toast-host";
  function showReefToast(message, type = "info") {
    if (typeof document === "undefined") return;
    let host = document.getElementById(TOAST_HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = TOAST_HOST_ID;
      host.setAttribute("data-reef-agent", "on");
      host.style.cssText = "position: fixed; z-index: 2147483647; top: 16px; right: 16px; display: flex; flex-direction: column; gap: 6px; pointer-events: none;";
      (document.body || document.documentElement).appendChild(host);
    }
    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    if (!shadow.querySelector("style")) {
      const style = document.createElement("style");
      style.textContent = `
      :host { all: initial; }
      .toast {
        background: ${type === "error" ? "#b91c1c" : type === "success" ? "#047857" : "#111"};
        color: #fff;
        padding: 8px 12px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        font-size: 12px;
        line-height: 1.3;
        max-width: 320px;
        box-shadow: 0 8px 24px rgba(0,0,0,.25);
        animation: reef-in .18s ease-out;
        pointer-events: auto;
      }
      @keyframes reef-in {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
      shadow.appendChild(style);
    }
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    shadow.appendChild(el);
    window.setTimeout(() => {
      el.style.transition = "opacity .2s";
      el.style.opacity = "0";
      window.setTimeout(() => el.remove(), 220);
    }, 2200);
  }
  async function createBookmarkFromSelection(text) {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return false;
    const { selectionContext } = captureSelectionContext();
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: "LIBRARY_BOOKMARK_CREATE",
        data: {
          url: location.href,
          title: document.title,
          selectedText: text.slice(0, 4e3),
          note: "",
          tags: [],
          contextBefore: selectionContext.before,
          contextAfter: selectionContext.after,
          favicon: getFavicon()
        }
      }, (res) => resolve(!!(res && res.success)));
    });
  }
  async function createSnippetFromSelection(text) {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return false;
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: "LIBRARY_SNIPPET_CREATE",
        data: {
          text: text.slice(0, 4e3),
          title: text.slice(0, 80),
          tags: [],
          source: { url: location.href, title: document.title }
        }
      }, (res) => resolve(!!(res && res.success)));
    });
  }
  async function createBookmarkFromPage() {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return false;
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: "LIBRARY_BOOKMARK_CREATE",
        data: {
          url: location.href,
          title: document.title,
          note: "",
          tags: [],
          favicon: getFavicon()
        }
      }, (res) => resolve(!!(res && res.success)));
    });
  }
  function captureSelectionContext() {
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return { before: "", after: "" };
      const range = sel.getRangeAt(0);
      const beforeRange = document.createRange();
      beforeRange.setStart(document.body, 0);
      beforeRange.setEnd(range.startContainer, range.startOffset);
      const afterRange = document.createRange();
      afterRange.setStart(range.endContainer, range.endOffset);
      afterRange.setEndAfter(document.body.lastChild || document.body);
      return {
        before: (beforeRange.toString() || "").slice(-160).trim(),
        after: (afterRange.toString() || "").slice(0, 160).trim()
      };
    } catch {
      return { before: "", after: "" };
    }
  }
  function getFavicon() {
    if (typeof document === "undefined") return void 0;
    const link = document.querySelector('link[rel*="icon"]');
    return link?.href || void 0;
  }
})();
//# sourceMappingURL=content.js.map
