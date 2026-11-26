/**
 * Twist Stop — machine interactions
 * Vanilla JavaScript; no framework or backend required.
 */

const MAX_TURNS = 6;
const TURN_INTERVAL = 520;

const FLAVOURS = {
  vanilla: { label: "Vanilla", colour: "#f4e5c8", shadow: "#d9c49e", highlight: "#fff8e9" },
  strawberry: { label: "Strawberry", colour: "#ed9cac", shadow: "#c96f83", highlight: "#ffd0d8" },
  pistachio: { label: "Pistachio", colour: "#b8c99d", shadow: "#879d6e", highlight: "#e0edc9" },
};

const SPRINKLE_COLOURS = ["#e85b54", "#e9bd45", "#70a8bd", "#a47bb5", "#f2eee2"];

class ConeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas?.getContext("2d");
    this.width = 0;
    this.height = 0;
    this.state = { flavour: "vanilla", turns: 0, toppings: new Set() };

    if (!this.context) return;

    this.resize = this.resize.bind(this);
    if ("ResizeObserver" in window) {
      this.observer = new ResizeObserver(this.resize);
      this.observer.observe(canvas.parentElement);
    } else {
      window.addEventListener("resize", this.resize, { passive: true });
    }
    this.resize();
  }

  setState(state) {
    this.state = state;
    this.draw();
  }

  resize() {
    if (!this.canvas || !this.context) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.draw();
  }

  draw() {
    const ctx = this.context;
    if (!ctx || !this.width || !this.height) return;

    const { flavour, turns, toppings } = this.state;
    const palette = FLAVOURS[flavour] || FLAVOURS.vanilla;
    const w = this.width;
    const h = this.height;
    const cx = w * 0.5;
    const baseY = h * 0.77;

    ctx.clearRect(0, 0, w, h);
    if (!turns) return;

    const layerGap = Math.min(19, h * 0.085);
    const baseRadius = Math.min(w * 0.19, 49);
    const topY = baseY - (turns - 1) * layerGap - 15;

    // Soft-serve core, tucked behind the individual swirls.
    const coreGradient = ctx.createLinearGradient(cx - baseRadius, 0, cx + baseRadius, 0);
    coreGradient.addColorStop(0, palette.shadow);
    coreGradient.addColorStop(0.28, palette.colour);
    coreGradient.addColorStop(0.72, palette.highlight);
    coreGradient.addColorStop(1, palette.shadow);
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.moveTo(cx - baseRadius * 0.7, baseY);
    ctx.bezierCurveTo(cx - baseRadius * 0.45, topY + 5, cx - baseRadius * 0.48, topY, cx, topY);
    ctx.bezierCurveTo(cx + baseRadius * 0.48, topY, cx + baseRadius * 0.45, topY + 5, cx + baseRadius * 0.7, baseY);
    ctx.closePath();
    ctx.fill();

    // Each press adds a visible folded ring to the cone.
    for (let i = 0; i < turns; i += 1) {
      const y = baseY - i * layerGap;
      const radius = baseRadius * (0.94 - i * 0.055);
      const gradient = ctx.createLinearGradient(cx - radius, y - 10, cx + radius, y + 10);
      gradient.addColorStop(0, palette.shadow);
      gradient.addColorStop(0.22, palette.colour);
      gradient.addColorStop(0.68, palette.highlight);
      gradient.addColorStop(1, palette.shadow);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(cx, y, Math.max(8, radius), 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(95, 68, 54, 0.10)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Rounded peak on top of the soft serve.
    const peakRadius = Math.max(8, baseRadius * (0.94 - (turns - 1) * 0.055));
    const peakGradient = ctx.createLinearGradient(cx - peakRadius, topY - 15, cx + peakRadius, topY + 12);
    peakGradient.addColorStop(0, palette.shadow);
    peakGradient.addColorStop(0.35, palette.highlight);
    peakGradient.addColorStop(1, palette.colour);
    ctx.fillStyle = peakGradient;
    ctx.beginPath();
    ctx.moveTo(cx - peakRadius, topY + 5);
    ctx.bezierCurveTo(cx - peakRadius * 0.9, topY - 13, cx - peakRadius * 0.15, topY - 17, cx + 1, topY - 22);
    ctx.bezierCurveTo(cx + peakRadius * 0.1, topY - 9, cx + peakRadius * 0.9, topY - 12, cx + peakRadius, topY + 5);
    ctx.quadraticCurveTo(cx, topY + 17, cx - peakRadius, topY + 5);
    ctx.fill();

    if (toppings.has("sprinkles")) this.drawSprinkles(ctx, cx, topY, baseY, baseRadius);
    if (toppings.has("pearls")) this.drawPearls(ctx, cx, topY, baseY, baseRadius);
  }

  drawSprinkles(ctx, cx, topY, baseY, radius) {
    const pieces = [
      [-0.72, 0.26, -0.6], [-0.28, 0.12, 0.45], [0.2, 0.22, -0.3],
      [0.62, 0.35, 0.7], [-0.52, 0.52, 0.35], [0.02, 0.48, -0.8],
      [0.48, 0.62, 0.2], [-0.12, 0.72, 0.65], [-0.72, 0.78, -0.25],
      [0.75, 0.88, 0.8], [0.22, 0.9, -0.5], [-0.38, 0.92, 0.25],
    ];
    const availableHeight = Math.max(1, baseY - topY);
    pieces.forEach(([x, y, angle], index) => {
      const px = cx + x * radius;
      const py = topY + y * availableHeight;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.fillStyle = SPRINKLE_COLOURS[index % SPRINKLE_COLOURS.length];
      ctx.beginPath();
      ctx.roundRect(-2.1, -5.2, 4.2, 10.4, 2.1);
      ctx.fill();
      ctx.restore();
    });
  }

  drawPearls(ctx, cx, topY, baseY, radius) {
    const pearls = [
      [-0.62, 0.34], [-0.12, 0.18], [0.45, 0.3], [0.7, 0.56],
      [-0.42, 0.62], [0.12, 0.7], [-0.7, 0.88], [0.48, 0.91],
    ];
    const availableHeight = Math.max(1, baseY - topY);
    pearls.forEach(([x, y]) => {
      const px = cx + x * radius;
      const py = topY + y * availableHeight;
      const pearlGradient = ctx.createRadialGradient(px - 2, py - 2, 1, px, py, 5);
      pearlGradient.addColorStop(0, "#9c684f");
      pearlGradient.addColorStop(0.55, "#5e3429");
      pearlGradient.addColorStop(1, "#321c19");
      ctx.fillStyle = pearlGradient;
      ctx.beginPath();
      ctx.arc(px, py, 4.2, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

function initMachine() {
  const stage = document.querySelector(".machine-stage");
  const flavourButtons = [...document.querySelectorAll(".flavour-control")];
  const lever = document.querySelector(".lever-control");
  const sprinklesButton = document.querySelector(".sprinkles-control");
  const pearlsButton = document.querySelector(".pearls-control");
  const receipt = document.querySelector(".receipt");
  const receiptRows = receipt ? [...receipt.querySelectorAll(".receipt-row")] : [];
  const receiptButtons = receipt ? [...receipt.querySelectorAll("button")] : [];
  const shareButton = receiptButtons[0];
  const resetButton = receiptButtons[1];
  const lamp = document.querySelector(".amber-lamp");
  const canvas = document.querySelector(".chamber-render canvas");

  if (!stage || !lever || !receipt || flavourButtons.length === 0) return;

  const state = {
    flavour: "vanilla",
    turns: 0,
    toppings: new Set(),
  };
  const renderer = new ConeRenderer(canvas);
  let holdTimer = null;
  let holdStartedAt = 0;
  let pointerIsDown = false;

  const flavourValue = receiptRows[0]?.querySelectorAll("span")[1];
  const turnsValue = receiptRows[1]?.querySelectorAll("span")[1];
  const toppingsValue = receiptRows[2]?.querySelectorAll("span")[1];

  function updateReceipt() {
    if (flavourValue) flavourValue.textContent = FLAVOURS[state.flavour].label;
    if (turnsValue) turnsValue.textContent = `${state.turns} / ${MAX_TURNS}`;
    if (toppingsValue) {
      const names = [];
      if (state.toppings.has("sprinkles")) names.push("Sprinkles");
      if (state.toppings.has("pearls")) names.push("Chocolate pearls");
      toppingsValue.textContent = names.length ? names.join(" + ") : "None yet";
    }
  }

  function render() {
    const hasCone = state.turns > 0;
    flavourButtons.forEach((button) => {
      const selected = button.getAttribute("aria-label") === state.flavour;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    [sprinklesButton, pearlsButton].forEach((button) => {
      if (!button) return;
      const key = button === sprinklesButton ? "sprinkles" : "pearls";
      const active = state.toppings.has(key);
      button.disabled = !hasCone;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
    });

    lever.disabled = state.turns >= MAX_TURNS;
    stage.classList.toggle("has-cone", hasCone);
    stage.classList.toggle("is-pouring", pointerIsDown);
    if (lamp) lamp.classList.toggle("lit", hasCone);
    if (shareButton) shareButton.disabled = !hasCone;
    updateReceipt();
    renderer.setState(state);
  }

  function addTurn() {
    if (state.turns >= MAX_TURNS) return;
    state.turns += 1;
    render();
  }

  function selectFlavour(flavour) {
    if (!FLAVOURS[flavour]) return;
    state.flavour = flavour;
    render();
  }

  function toggleTopping(key) {
    if (!state.turns) return;
    if (state.toppings.has(key)) state.toppings.delete(key);
    else state.toppings.add(key);
    render();
  }

  function stopPouring() {
    if (holdTimer) {
      window.clearInterval(holdTimer);
      holdTimer = null;
    }
    if (pointerIsDown && Date.now() - holdStartedAt < TURN_INTERVAL) addTurn();
    pointerIsDown = false;
    stage.classList.remove("is-pouring");
    if (lever.hasPointerCapture?.(activePointerId)) {
      try { lever.releasePointerCapture(activePointerId); } catch { /* Pointer already released. */ }
    }
    render();
  }

  let activePointerId = null;
  lever.addEventListener("pointerdown", (event) => {
    if (lever.disabled || pointerIsDown) return;
    event.preventDefault();
    pointerIsDown = true;
    activePointerId = event.pointerId;
    holdStartedAt = Date.now();
    try { lever.setPointerCapture(event.pointerId); } catch { /* Capture may be unavailable. */ }
    render();
    holdTimer = window.setInterval(addTurn, TURN_INTERVAL);
  });

  ["pointerup", "pointercancel", "lostpointercapture"].forEach((eventName) => {
    lever.addEventListener(eventName, () => {
      if (pointerIsDown) stopPouring();
    });
  });

  // Keyboard activation has no pointerdown event, so one press adds one turn.
  lever.addEventListener("click", (event) => {
    if (event.detail === 0 && !lever.disabled) addTurn();
  });

  flavourButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectFlavour(button.getAttribute("aria-label"));
    });
  });

  sprinklesButton?.addEventListener("click", () => toggleTopping("sprinkles"));
  pearlsButton?.addEventListener("click", () => toggleTopping("pearls"));

  // The flavour cards lower on the page also select the matching machine flavour.
  document.querySelectorAll(".flavours-section .flavour-row a").forEach((link, index) => {
    link.addEventListener("click", () => {
      const flavour = ["vanilla", "strawberry", "pistachio"][index];
      if (flavour) selectFlavour(flavour);
    });
  });

  resetButton?.addEventListener("click", () => {
    state.flavour = "vanilla";
    state.turns = 0;
    state.toppings.clear();
    pointerIsDown = false;
    if (holdTimer) window.clearInterval(holdTimer);
    holdTimer = null;
    render();
    stage.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  });

  if (shareButton) {
    shareButton.addEventListener("click", async () => {
      const toppingNames = [];
      if (state.toppings.has("sprinkles")) toppingNames.push("rainbow sprinkles");
      if (state.toppings.has("pearls")) toppingNames.push("chocolate pearls");
      const description = [
        `${state.turns}-turn ${FLAVOURS[state.flavour].label.toLowerCase()} soft serve`,
        toppingNames.length ? `with ${toppingNames.join(" and ")}` : "with no toppings",
      ].join(" ");
      const shareData = {
        title: "My Twist Stop cone",
        text: `I made a ${description} at Twist Stop. Make yours!`,
        url: window.location.href.split("#")[0],
      };

      try {
        if (navigator.share) {
          await navigator.share(shareData);
          shareButton.dataset.originalLabel ||= shareButton.textContent.trim();
          shareButton.textContent = "Shared!";
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
          shareButton.dataset.originalLabel ||= shareButton.textContent.trim();
          shareButton.textContent = "Copied!";
        } else {
          window.prompt("Copy your cone description:", `${shareData.text} ${shareData.url}`);
          return;
        }
        window.setTimeout(() => {
          if (shareButton.dataset.originalLabel) shareButton.textContent = shareButton.dataset.originalLabel;
        }, 1800);
      } catch (error) {
        if (error?.name !== "AbortError") console.error("Could not share this cone:", error);
      }
    });
  }

  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMachine, { once: true });
} else {
  initMachine();
}
