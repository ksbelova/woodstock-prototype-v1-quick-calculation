"use strict";

const STORAGE_KEY = "woodstockCalculationMode";

const modeLinks = document.querySelectorAll(
  "[data-calculation-mode]"
);

function saveCalculationMode(event) {
  const link = event.currentTarget;
  const mode = link.dataset.calculationMode;

  if (!mode) {
    return;
  }

  try {
    sessionStorage.setItem(STORAGE_KEY, mode);
  } catch (error) {
    console.warn(
      "Не удалось сохранить тип расчёта:",
      error
    );
  }
}

modeLinks.forEach((link) => {
  link.addEventListener("click", saveCalculationMode);
});