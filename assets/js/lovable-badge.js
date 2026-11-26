(() => {
  const badge = document.querySelector("#lovable-badge");
  const closeButton = document.querySelector("#lovable-badge-close");

  if (!badge || !closeButton) return;

  if (window.self !== window.top || navigator.userAgent.includes("puppeteer")) {
    badge.hidden = true;
    return;
  }

  closeButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    badge.classList.add("closing");
    window.setTimeout(() => {
      badge.hidden = true;
    }, 240);
  });
})();
