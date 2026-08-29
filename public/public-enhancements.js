(() => {
  "use strict";

  const listing = document.querySelector("[data-analytics-listing]");
  const listingId = listing?.dataset.analyticsListing || null;
  const locale = document.documentElement.lang || null;

  function emit(name, props = {}, explicitListingId = listingId, explicitLocale = locale) {
    if (typeof navigator.sendBeacon !== "function") return;
    try {
      navigator.sendBeacon(
        "/api/events",
        new Blob(
          [JSON.stringify({ name, props, locale: explicitLocale || undefined, listing_id: explicitListingId || undefined })],
          { type: "application/json" },
        ),
      );
    } catch {
      // Analytics is best-effort and must never affect navigation.
    }
  }

  async function share(button) {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: button.dataset.title || document.title, url });
        emit("share_click", { method: "native" }, button.dataset.listingId, button.dataset.locale);
      } catch {
        // The visitor dismissed the native share sheet.
      }
      return;
    }
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(url);
      emit("share_click", { method: "copy" }, button.dataset.listingId, button.dataset.locale);
      button.textContent = button.dataset.copiedLabel || button.textContent;
      window.setTimeout(() => {
        button.textContent = button.dataset.label || button.textContent;
      }, 2000);
    } catch {
      // Clipboard access can be denied; leave the control unchanged.
    }
  }

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const shareButton = target?.closest("[data-public-share]");
      if (shareButton instanceof HTMLButtonElement) {
        void share(shareButton);
        return;
      }
    },
    { capture: true },
  );

  function renderOpenNow(element, state, copy) {
    if (state.state === "unknown") return;
    const isOpen = state.state === "open";
    let text = copy.closed || "";
    if (isOpen) {
      const closing = state.closesAt ? copy.closesAt.replace("{time}", state.closesAt) : "";
      text = closing ? `${copy.open} · ${closing}` : copy.open;
    } else if (state.state === "appointment_only") {
      text = copy.appointmentOnly;
    } else if (state.opensAt) {
      const day = state.opensDay === "today" || state.opensDay === "tomorrow"
        ? copy[state.opensDay]
        : copy.weekdays[state.opensDay] || "";
      text = `${copy.closed} · ${copy.opensAt.replace("{time}", state.opensAt).replace("{day}", day)}`;
    }
    element.querySelector("[data-open-now-text]").textContent = text;
    const dot = element.querySelector("[data-open-now-dot]");
    dot?.classList.toggle("bg-success", isOpen);
    dot?.classList.toggle("bg-disabled", !isOpen);
    element.classList.toggle("bg-success-bg", isOpen);
    element.classList.toggle("text-success", isOpen);
    element.classList.toggle("bg-neutral", !isOpen);
    element.classList.toggle("text-secondary", !isOpen);
    element.classList.remove("hidden");
    element.classList.add("inline-flex");
  }

  const openNowElements = [...document.querySelectorAll("[data-open-now]")]
    .filter((element) => element instanceof HTMLElement);
  if (openNowElements.length > 0 && "Worker" in window) {
    const worker = new Worker("/open-now-worker.js");
    worker.addEventListener("message", (event) => {
      const element = openNowElements[event.data.index];
      if (!(element instanceof HTMLElement)) return;
      try {
        renderOpenNow(element, event.data.state, JSON.parse(element.dataset.copy || "{}"));
      } catch {
        // Invalid public data fails quietly; the complete hours table remains.
      }
    });
    const update = () => {
      openNowElements.forEach((element, index) => {
        try {
          worker.postMessage({ index, hours: JSON.parse(element.dataset.hours || "{}") });
        } catch {
          // Invalid public data fails quietly; the complete hours table remains.
        }
      });
    };
    update();
    window.setInterval(update, 60_000);
  }
})();
