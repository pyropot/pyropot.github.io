const root = document.documentElement;
const body = document.body;
const savedTextPreference = localStorage.getItem("pyropot-text");

const settings = {
  theme: localStorage.getItem("pyropot-theme") || localStorage.getItem("pyropot-background") || "workshop",
  mode: localStorage.getItem("pyropot-mode") || "system",
  text: savedTextPreference === "small" ? "compact" : savedTextPreference || "compact",
  reduceMotion: localStorage.getItem("pyropot-motion") === "off" || window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  highContrast: localStorage.getItem("pyropot-contrast") === "on"
};

const themeSelect = document.querySelector("#themeSelect");
const modeSelect = document.querySelector("#modeSelect");
const textSelect = document.querySelector("#textSelect");
const motionToggle = document.querySelector("#motionToggle");
const contrastToggle = document.querySelector("#contrastToggle");
const systemScheme = window.matchMedia("(prefers-color-scheme: light)");

function resolveMode(mode) {
  return mode === "system" ? (systemScheme.matches ? "light" : "dark") : mode;
}

function applySettings() {
  body.dataset.theme = settings.theme;
  root.dataset.mode = resolveMode(settings.mode);
  root.dataset.text = settings.text;
  body.classList.toggle("reduce-motion", settings.reduceMotion);
  body.classList.toggle("high-contrast", settings.highContrast);
  themeSelect.value = settings.theme;
  modeSelect.value = settings.mode;
  textSelect.value = settings.text;
  motionToggle.checked = settings.reduceMotion;
  contrastToggle.checked = settings.highContrast;
}

themeSelect.addEventListener("change", (event) => {
  settings.theme = event.target.value;
  localStorage.setItem("pyropot-theme", settings.theme);
  applySettings();
});

modeSelect.addEventListener("change", (event) => {
  settings.mode = event.target.value;
  localStorage.setItem("pyropot-mode", settings.mode);
  applySettings();
});

textSelect.addEventListener("change", (event) => {
  settings.text = event.target.value;
  localStorage.setItem("pyropot-text", settings.text);
  applySettings();
});

motionToggle.addEventListener("change", (event) => {
  settings.reduceMotion = event.target.checked;
  localStorage.setItem("pyropot-motion", settings.reduceMotion ? "off" : "on");
  applySettings();
});

contrastToggle.addEventListener("change", (event) => {
  settings.highContrast = event.target.checked;
  localStorage.setItem("pyropot-contrast", settings.highContrast ? "on" : "off");
  applySettings();
});

systemScheme.addEventListener("change", () => {
  if (settings.mode === "system") applySettings();
});

document.querySelector("#resetSettings").addEventListener("click", () => {
  Object.assign(settings, {
    theme: "workshop",
    mode: "system",
    text: "compact",
    reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    highContrast: false
  });
  ["pyropot-theme", "pyropot-background", "pyropot-mode", "pyropot-text", "pyropot-motion", "pyropot-contrast"].forEach((key) => localStorage.removeItem(key));
  applySettings();
});

const settingsPanel = document.querySelector("#settingsPanel");
const settingsButton = document.querySelector("#settingsButton");
const settingsScrim = document.querySelector("#settingsScrim");

function setSettingsOpen(open) {
  settingsPanel.hidden = !open;
  settingsScrim.hidden = !open;
  settingsButton.setAttribute("aria-expanded", String(open));
  if (open) settingsPanel.querySelector("select").focus();
}

settingsButton.addEventListener("click", () => setSettingsOpen(settingsPanel.hidden));
document.querySelector("#closeSettings").addEventListener("click", () => setSettingsOpen(false));
settingsScrim.addEventListener("click", () => setSettingsOpen(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setSettingsOpen(false);
    setMenuOpen(false);
  }
});

const mobileNav = document.querySelector("#mobileNav");
const menuButton = document.querySelector("#menuButton");

function setMenuOpen(open) {
  mobileNav.hidden = !open;
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
}

menuButton.addEventListener("click", () => setMenuOpen(mobileNav.hidden));
mobileNav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setMenuOpen(false)));

const materials = {
  aluminum: { modulus: 69e9, yield: 276e6 },
  steel: { modulus: 200e9, yield: 250e6 },
  abs: { modulus: 2.1e9, yield: 40e6 },
  oak: { modulus: 11e9, yield: 50e6 }
};

const labInputs = {
  material: document.querySelector("#material"),
  load: document.querySelector("#load"),
  length: document.querySelector("#length"),
  width: document.querySelector("#width"),
  height: document.querySelector("#height")
};

function formatDeflection(millimeters) {
  if (millimeters < .01) return `${millimeters.toFixed(3)} mm`;
  if (millimeters < 10) return `${millimeters.toFixed(2)} mm`;
  return `${millimeters.toFixed(1)} mm`;
}

function updateBeamLab() {
  const load = Number(labInputs.load.value);
  const lengthMm = Number(labInputs.length.value);
  const widthMm = Number(labInputs.width.value);
  const heightMm = Number(labInputs.height.value);
  const length = lengthMm / 1000;
  const width = widthMm / 1000;
  const height = heightMm / 1000;
  const material = materials[labInputs.material.value];

  const inertia = width * Math.pow(height, 3) / 12;
  const deflectionMeters = load * Math.pow(length, 3) / (3 * material.modulus * inertia);
  const stressPascals = 6 * load * length / (width * Math.pow(height, 2));
  const deflectionMm = deflectionMeters * 1000;
  const stressMpa = stressPascals / 1e6;
  const safetyFactor = material.yield / stressPascals;
  const utilization = stressPascals / material.yield * 100;

  document.querySelector("#loadValue").value = `${load} N`;
  document.querySelector("#lengthValue").value = `${lengthMm} mm`;
  document.querySelector("#widthValue").value = `${widthMm} mm`;
  document.querySelector("#heightValue").value = `${heightMm} mm`;
  document.querySelector("#deflectionResult").textContent = formatDeflection(deflectionMm);
  document.querySelector("#deflectionBadge").textContent = `δ = ${formatDeflection(deflectionMm)}`;
  document.querySelector("#stressResult").textContent = `${stressMpa.toFixed(2)} MPa`;
  document.querySelector("#safetyResult").textContent = safetyFactor >= 100 ? ">100" : safetyFactor.toFixed(1);
  document.querySelector("#utilizationValue").textContent = `${Math.round(utilization)}%`;

  const utilizationBar = document.querySelector("#utilizationBar");
  utilizationBar.style.width = `${Math.min(100, Math.max(1, utilization))}%`;
  utilizationBar.style.background = utilization > 100 ? "var(--danger)" : utilization > 65 ? "var(--accent)" : "var(--success)";

  const visualDrop = Math.min(105, 4 + 93 * (1 - Math.exp(-deflectionMm / 20)));
  const beamY = 170 + visualDrop;
  document.querySelector("#beamPath").setAttribute("d", `M80 170 Q400 ${170 + visualDrop * .16} 680 ${beamY}`);
  document.querySelector("#forceArrow").setAttribute("d", `M680 ${beamY - 108}v80m0 0-13-19m13 19 13-19`);
  document.querySelector("#forceText").setAttribute("y", String(beamY - 80));
  document.querySelector("#forceText").textContent = `${load} N`;
  document.querySelector("#lengthText").textContent = `${lengthMm} mm`;
}

Object.values(labInputs).forEach((input) => input.addEventListener("input", updateBeamLab));
document.querySelector("#resetLab").addEventListener("click", () => {
  labInputs.material.value = "aluminum";
  labInputs.load.value = "250";
  labInputs.length.value = "800";
  labInputs.width.value = "40";
  labInputs.height.value = "60";
  updateBeamLab();
});

const revealItems = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window && !settings.reduceMotion) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: .08, rootMargin: "0px 0px -35px" });
  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("visible"));
}

window.addEventListener("scroll", () => {
  document.querySelector(".site-header").classList.toggle("scrolled", window.scrollY > 12);
}, { passive: true });

document.querySelector("#year").textContent = new Date().getFullYear();
const contactForm = document.querySelector("#contactForm");
const contactSubmit = document.querySelector("#contactSubmit");
const formStatus = document.querySelector("#formStatus");

function clearFormErrors() {
  contactForm.querySelectorAll("[data-error-for]").forEach((element) => {
    element.textContent = "";
  });
  contactForm.querySelectorAll("[aria-invalid]").forEach((element) => {
    element.removeAttribute("aria-invalid");
  });
}

function showFormspreeErrors(errors) {
  const generalErrors = [];
  let firstInvalidField = null;

  errors.forEach((error) => {
    const fieldName = error.field || "";
    const field = fieldName ? contactForm.elements.namedItem(fieldName) : null;
    const errorElement = fieldName ? contactForm.querySelector(`[data-error-for="${fieldName}"]`) : null;

    if (field && errorElement) {
      field.setAttribute("aria-invalid", "true");
      errorElement.textContent = error.message || "Please check this field.";
      firstInvalidField ||= field;
    } else if (error.message) {
      generalErrors.push(error.message);
    }
  });

  firstInvalidField?.focus();
  return generalErrors;
}

contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFormErrors();

  if (!contactForm.checkValidity()) {
    contactForm.reportValidity();
    return;
  }

  const originalButtonContent = contactSubmit.innerHTML;
  contactSubmit.disabled = true;
  contactForm.setAttribute("aria-busy", "true");
  formStatus.dataset.state = "sending";
  formStatus.textContent = "Sending securely through Formspree…";

  try {
    const response = await fetch(contactForm.action, {
      method: "POST",
      body: new FormData(contactForm),
      headers: { Accept: "application/json" }
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errors = Array.isArray(result.errors) ? result.errors : [];
      const generalErrors = showFormspreeErrors(errors);
      throw new Error(generalErrors[0] || result.error || "Formspree could not deliver this message.");
    }

    contactForm.reset();
    formStatus.dataset.state = "success";
    formStatus.textContent = "Message sent — thank you. I’ll reply by email.";
  } catch (error) {
    formStatus.dataset.state = "error";
    formStatus.textContent = `${error.message || "The message could not be sent."} You can also email me directly at ltrevillian@ycp.edu.`;
  } finally {
    contactSubmit.disabled = false;
    contactSubmit.innerHTML = originalButtonContent;
    contactForm.removeAttribute("aria-busy");
  }
});

applySettings();
updateBeamLab();
