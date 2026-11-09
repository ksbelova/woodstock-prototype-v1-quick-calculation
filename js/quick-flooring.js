"use strict";

const Core = window.WoodstockFlooringCore;

const form = {
  root: document.querySelector("#quickFlooringForm"),
  materialType: document.querySelector("#materialTypeSelect"),
  species: document.querySelector("#speciesInput"),
  speciesClear: document.querySelector("#speciesClearButton"),
  topLayer: document.querySelector("#topLayerSelect"),
  pattern: document.querySelector("#patternSelect"),
  customPattern: document.querySelector("#customPatternInput"),
  customPatternFile: document.querySelector("#customPatternFileInput"),
  boardSizeToggle: document.querySelector("#boardSizeToggle"),
  boardWidth: document.querySelector("#boardWidthInput"),
  boardLength: document.querySelector("#boardLengthInput"),
  roomArea: document.querySelector("#roomAreaInput"),
  waste: document.querySelector("#wasteInput"),
  finish: document.querySelector("#finishSelect"),
  name: document.querySelector("#nameInput"),
  phone: document.querySelector("#phoneInput"),
  city: document.querySelector("#cityInput"),
  email: document.querySelector("#emailInput"),
  comment: document.querySelector("#commentInput"),
  files: document.querySelector("#filesInput"),
  managerContact: document.querySelector("#managerContactInput"),
  privacy: document.querySelector("#privacyInput")
};

const ui = Object.fromEntries([
  "speciesSuggestions",
  "citySuggestions",
  "speciesHint",
  "topLayerHint",
  "customPatternField",
  "customPatternWarning",
  "customPatternFileName",
  "volumeDiscountHint",
  "finishHint",
  "boardSizeFields",
  "boardWidthWarning",
  "areaWithWasteValue",
  "areaWithWasteFormula",
  "selectedFiles",
  "resultTotal",
  "getCalculationButton",
  "saveStatus",
  "downloadModal",
  "downloadModalClose"
].map((id) => [id, document.querySelector(`#${id}`)]));

const validation = {
  species: [document.querySelector("#speciesField"), document.querySelector("#speciesError")],
  topLayer: [document.querySelector("#topLayerField"), document.querySelector("#topLayerError")],
  pattern: [document.querySelector("#patternField"), document.querySelector("#patternError")],
  customPattern: [document.querySelector("#customPatternField"), document.querySelector("#customPatternError")],
  boardWidth: [document.querySelector("#boardWidthField"), document.querySelector("#boardWidthError")],
  boardLength: [document.querySelector("#boardLengthField"), document.querySelector("#boardLengthError")],
  roomArea: [document.querySelector("#roomAreaField"), document.querySelector("#roomAreaError")],
  finish: [document.querySelector("#finishField"), document.querySelector("#finishError")],
  name: [document.querySelector("#nameField"), document.querySelector("#nameError")],
  phone: [document.querySelector("#phoneField"), document.querySelector("#phoneError")],
  city: [document.querySelector("#cityField"), document.querySelector("#cityError")],
  email: [document.querySelector("#emailField"), document.querySelector("#emailError")],
  privacy: [document.querySelector("#privacyField"), document.querySelector("#privacyError")]
};

const finishLabels = {};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

const number = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 2
});

let flooringData = null;
let veneerSelector = null;
let currentItem = null;
let submitAttempted = false;

const touchedFields = new Set();

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function shouldShowError(key, hasEnteredValue = false) {
  return submitAttempted || (hasEnteredValue && touchedFields.has(key));
}

function markFieldTouched(key) {
  touchedFields.add(key);
}

function setFieldError(key, message = "") {
  const [field, error] = validation[key] || [];
  field?.classList.toggle("field--invalid", Boolean(message));
  if (error) error.textContent = message;
}

const sharedContact=window.WoodstockQuickCommon.createContact({form,ui,setFieldError,markFieldTouched,touchedFields,renderAll,validateAll,submitted:()=>submitAttempted});
const {normalizeCitySearch,closeCitySuggestions,setPhoneCountryCode,selectCityOption,renderCitySuggestions,phoneDigits,recognizedPhoneCode,formatKnownPhone,formatPhone,applyPhoneMask,validPhone,normalizeEmail,applyEmailMask,validateEmail,fileIdentity,getUploadedFiles,setUploadedFiles,appendUploadedFiles,removeUploadedFile,fileNames,renderUploadedFiles,addSelectedFiles}=sharedContact;

function fillOptions(select, options, placeholder) {
  select.replaceChildren();

  const first = document.createElement("option");
  first.value = "";
  first.textContent = placeholder;
  select.append(first);

  options.forEach(({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  });
}

function topLayerThicknessMm(value) {
  const parsed = Number(
    String(value || "")
      .replace(",", ".")
      .replace(/[^0-9.]/g, "")
  );

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function patternUnavailableReason(pattern) {
  const minTopLayerMm = Number(pattern?.minTopLayerMm);
  const selectedTopLayerMm = topLayerThicknessMm(form.topLayer.value);

  if (!Number.isFinite(minTopLayerMm)) {
    return "";
  }

  if (selectedTopLayerMm !== null && selectedTopLayerMm >= minTopLayerMm) {
    return "";
  }

  return `доступно от ${number.format(minTopLayerMm)} мм`;
}

function patternAllowedForTopLayer(pattern) {
  return Boolean(pattern) && !patternUnavailableReason(pattern);
}

function availablePatterns() {
  return flooringData?.patterns || [];
}

function selectedPattern() {
  const pattern = flooringData?.patterns.find((item) => item.id === form.pattern.value) || null;
  return patternAllowedForTopLayer(pattern) ? pattern : null;
}

function speciesItems() {
  return veneerSelector?.itemsForCurrentType() || [];
}

function exactSpeciesItem() {
  return veneerSelector?.exactItem() || null;
}

function speciesProducts() {
  return veneerSelector?.selectedProducts() || [];
}

function exactProductItem() {
  if (!form.species.value.trim() || !form.topLayer.value) {
    currentItem = null;
    return null;
  }

  currentItem = speciesProducts().find(
    (item) => item.topLayer === form.topLayer.value
  ) || null;

  return currentItem;
}

function exactSpeciesExists() {
  return Boolean(exactSpeciesItem());
}

function closeSpeciesSuggestions() {
  veneerSelector?.closeSuggestions();
}

function renderSpeciesSuggestions() {
  veneerSelector?.renderSuggestions();
}

function refreshSpeciesOptions() {
  veneerSelector?.refreshSuggestions();
}

function updateSpeciesClearButton() {
  veneerSelector?.updateClearButton();
}

function fillTopLayerOptions() {
  const currentValue = form.topLayer.value;
  const speciesMatch = exactSpeciesItem();
  const layers = speciesMatch
    ? [
        ...new Set(
          speciesProducts()
            .map((item) => item.topLayer)
            .filter(Boolean)
        )
      ]
    : [];

  fillOptions(
    form.topLayer,
    layers.map((layer) => ({ value: layer, label: layer })),
    "Выберите верхний слой"
  );

  form.topLayer.disabled = !speciesMatch || !layers.length;

  if (layers.includes(currentValue)) {
    form.topLayer.value = currentValue;
  } else {
    form.topLayer.value = "";
  }
}

function clearProductSelection() {
  currentItem = null;
  fillTopLayerOptions();
  ui.topLayerHint.textContent = "";
}

function applySpeciesSelection() {
  updateSpeciesClearButton();
  currentItem = null;

  const speciesMatch = exactSpeciesItem();

  if (!speciesMatch) {
    clearProductSelection();
    ui.speciesHint.textContent = form.species.value.trim()
      ? "Выберите наименование из списка."
      : "";
    renderAll();
    return;
  }

  fillTopLayerOptions();
  ui.speciesHint.textContent = "";
  applyTopLayerSelection();
}

function applyTopLayerSelection() {
  currentItem = exactProductItem();
  const patternWasReset = fillPatterns();

  if (patternWasReset) {
    applyPattern();
  }

  if (!form.topLayer.value) {
    ui.topLayerHint.textContent = "";
  } else if (currentItem?.priceStatus === "onRequest") {
    ui.topLayerHint.textContent = "Стоимость этой позиции рассчитывается по запросу.";
  } else {
    ui.topLayerHint.textContent = "";
  }

  renderAll();
}

function fillPatterns() {
  const currentValue = form.pattern.value;
  const patterns = availablePatterns();

  form.pattern.replaceChildren();
  const first = document.createElement("option");
  first.value = "";
  first.textContent = "Выберите раскладку";
  form.pattern.append(first);

  patterns.forEach((pattern) => {
    const unavailableReason = patternUnavailableReason(pattern);
    const option = document.createElement("option");
    option.value = pattern.id;
    option.textContent = unavailableReason
      ? `${pattern.name} — ${unavailableReason}`
      : pattern.name;
    option.disabled = Boolean(unavailableReason);
    if (unavailableReason) option.title = unavailableReason;
    form.pattern.append(option);
  });

  const currentPattern = patterns.find((pattern) => pattern.id === currentValue);
  if (currentPattern && patternAllowedForTopLayer(currentPattern)) {
    form.pattern.value = currentValue;
    return false;
  }

  form.pattern.value = "";
  return Boolean(currentValue);
}

function boardSizesVisible() {
  return !ui.boardSizeFields.classList.contains("is-hidden");
}

function valueWithinLimits(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function clampOnBlur(input, key, min, max, label) {
  const raw = input.value.trim();

  if (!raw) {
    touchedFields.delete(key);
    renderAll();
    return;
  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    markFieldTouched(key);
    input.value = "";
    renderAll();
    setFieldError(key, `${label}: введите числовое значение.`);
    return;
  }

  const belowMinimum = value < min;
  const aboveMaximum = Number.isFinite(max) && value > max;

  if (belowMinimum || aboveMaximum) {
    markFieldTouched(key);
    input.value = "";
    renderAll();
    setFieldError(
      key,
      Number.isFinite(max)
        ? `${label}: допустимо от ${min} до ${max}.`
        : `${label}: значение не меньше ${min}.`
    );
    return;
  }

  touchedFields.delete(key);
  setFieldError(key, "");
}

function validateBoardSizeFields() {
  const pattern = selectedPattern();
  const sizesOpen = boardSizesVisible();

  if (!sizesOpen || !pattern) {
    setFieldError("boardWidth");
    setFieldError("boardLength");
    return { widthValid: true, lengthValid: true };
  }

  const { minWidth, maxWidth, minLength, maxLength } = pattern.limits;
  const widthRaw = form.boardWidth.value.trim();
  const lengthRaw = form.boardLength.value.trim();
  const width = Number(widthRaw);
  const length = Number(lengthRaw);
  const widthValid = !widthRaw || valueWithinLimits(width, minWidth, maxWidth);
  const lengthValid = !lengthRaw || valueWithinLimits(length, minLength, maxLength);

  setFieldError(
    "boardWidth",
    widthRaw && !widthValid && shouldShowError("boardWidth", true)
      ? `Ширина: допустимо от ${minWidth} до ${maxWidth}.`
      : ""
  );

  setFieldError(
    "boardLength",
    lengthRaw && !lengthValid && shouldShowError("boardLength", true)
      ? `Длина: допустимо от ${minLength} до ${maxLength}.`
      : ""
  );

  return { widthValid, lengthValid };
}

function updateBoardSizeLimits({ clearInvalid = false } = {}) {
  const limits = selectedPattern()?.limits;

  form.boardSizeToggle.classList.toggle("is-hidden", !limits);

  if (!limits) {
    ui.boardSizeFields.classList.add("is-hidden");
    form.boardSizeToggle.setAttribute("aria-expanded", "false");
    form.boardWidth.value = "";
    form.boardLength.value = "";
    touchedFields.delete("boardWidth");
    touchedFields.delete("boardLength");
    setFieldError("boardWidth");
    setFieldError("boardLength");
    return;
  }

  form.boardWidth.min = String(limits.minWidth);
  form.boardWidth.max = String(limits.maxWidth);
  form.boardLength.min = String(limits.minLength);
  form.boardLength.max = String(limits.maxLength);
  form.boardWidth.placeholder = `${limits.minWidth}–${limits.maxWidth}`;
  form.boardLength.placeholder = `${limits.minLength}–${limits.maxLength}`;

  if (clearInvalid) {
    const width = Number(form.boardWidth.value);
    const length = Number(form.boardLength.value);

    if (form.boardWidth.value && !valueWithinLimits(width, limits.minWidth, limits.maxWidth)) {
      form.boardWidth.value = "";
    }
    if (form.boardLength.value && !valueWithinLimits(length, limits.minLength, limits.maxLength)) {
      form.boardLength.value = "";
    }
  }
}

function toggleBoardSizes() {
  const shouldOpen = !boardSizesVisible();
  ui.boardSizeFields.classList.toggle("is-hidden", !shouldOpen);
  form.boardSizeToggle.setAttribute("aria-expanded", String(shouldOpen));
  form.boardSizeToggle.textContent = shouldOpen
    ? "Не указывать размеры досок"
    : "Я знаю размеры досок";

  if (shouldOpen) {
    updateBoardSizeLimits();
    form.boardWidth.focus();
  } else {
    form.boardWidth.value = "";
    form.boardLength.value = "";
    touchedFields.delete("boardWidth");
    touchedFields.delete("boardLength");
    setFieldError("boardWidth");
    setFieldError("boardLength");
  }

  renderAll();
}

function applyPattern() {
  const pattern = selectedPattern();
  const quickCustomWaste = Number(flooringData?.meta?.quickCalculation?.customPatternWastePercent ?? 15);
  const configuredWaste = pattern?.id === "custom" ? quickCustomWaste : pattern?.defaultWastePercent;
  const waste = configuredWaste === null || configuredWaste === undefined ? NaN : Number(configuredWaste);

  form.waste.value = Number.isFinite(waste) ? String(waste) : "";
  const customPatternSelected = pattern?.id === "custom";
  ui.customPatternField.classList.toggle("is-hidden", !customPatternSelected);
  ui.customPatternWarning.classList.toggle("is-hidden", !customPatternSelected);

  if (!customPatternSelected) {
    form.customPattern.value = "";
    setUploadedFiles(form.customPatternFile, []);
    ui.customPatternFileName.textContent = "Файлы не выбраны";
    touchedFields.delete("customPattern");
    setFieldError("customPattern");
  }

  touchedFields.delete("boardWidth");
  touchedFields.delete("boardLength");
  updateBoardSizeLimits({ clearInvalid: true });
  renderAll();
}

function priceArea() {
  const roomArea = Number(form.roomArea.value);
  const waste = Number(form.waste.value);

  if (!Number.isFinite(roomArea) || roomArea <= 0 || !Number.isFinite(waste) || waste < 0) {
    return null;
  }

  return round(roomArea * (1 + waste / 100), 2);
}

function automaticDiscountPercent(area) {
  const scale = flooringData?.meta?.pricing?.discountScale || [];
  const row = scale.find((item) => (
    area >= Number(item.minArea || 0) &&
    (item.maxArea === null || area <= Number(item.maxArea))
  ));

  return Number(row?.percent || 0);
}

function pricingState() {
  const area = priceArea();
  const retail = currentItem ? Core.catalogPrice(currentItem) : null;
  const fixedPrice = Number.isFinite(retail) && retail > 0;

  if (!area || !currentItem || !fixedPrice) {
    return {
      area,
      fixedPrice,
      catalogPrice: fixedPrice ? retail : null,
      discount: 0,
      markup: 0,
      finalUnitPrice: null,
      total: null,
      vat: null,
      requiresManagerCalculation: false
    };
  }

  const threshold = Number(flooringData.meta.pricing.smallOrderThresholdM2 || 20);
  const markup = area < threshold ? Number(flooringData.meta.pricing.defaultSmallOrderMarkupPercent || 0) : 0;
  const discount = area >= threshold ? Core.automaticVolumeDiscountPercent(flooringData, area) : 0;
  const calc = Core.calculatePricing({
    data: flooringData,
    retailPrice: retail,
    areaWithWaste: area,
    tierCoefficient: 1 - discount / 100,
    markups: markup > 0 ? [{ id: "smallOrder", name: "Малый объём", percent: markup }] : []
  });

  return {
    area,
    fixedPrice,
    catalogPrice: retail,
    discount,
    markup,
    finalUnitPrice: calc?.finalUnitPriceRaw ?? null,
    total: calc?.totalRaw ?? null,
    vat: calc?.vatRaw ?? null,
    requiresManagerCalculation: false
  };
}

function renderArea() {
  const pattern = selectedPattern();
  const area = priceArea();
  const roomArea = Number(form.roomArea.value);
  const waste = Number(form.waste.value);
  const validRoomArea = Number.isFinite(roomArea) && roomArea > 0;

  ui.volumeDiscountHint?.classList.toggle("is-hidden", !validRoomArea);

  if (area !== null) {
    ui.areaWithWasteValue.textContent = `${number.format(area)} м²`;
    ui.areaWithWasteFormula.textContent =
      `${number.format(roomArea)} м² + ${number.format(waste)}% запаса на укладку`;
    return;
  }

  ui.areaWithWasteValue.textContent = "—";
  ui.areaWithWasteFormula.textContent = pattern
    ? "Укажите площадь помещения"
    : "Сначала выберите раскладку.";
}

function renderResult() {
  const calc = pricingState();

  if (currentItem?.priceStatus === "onRequest") {
    ui.resultTotal.textContent = "По запросу";
    return;
  }

  ui.resultTotal.textContent = calc.total ? money.format(calc.total) : "—";
}

function validateQuickFieldOnBlur(key) {
  if (submitAttempted) {
    validateAll();
    return;
  }

  if (key === "species") {
    const hasValue = Boolean(form.species.value.trim());
    const invalid = hasValue && !exactSpeciesExists();
    if (invalid) markFieldTouched(key);
    else touchedFields.delete(key);
    setFieldError(key, invalid ? "Выберите наименование шпона из списка." : "");
    return;
  }

  if (key === "roomArea") {
    const raw = form.roomArea.value.trim();
    const value = Number(raw);
    const invalid = Boolean(raw) && (!Number.isFinite(value) || value <= 0);
    if (invalid) markFieldTouched(key);
    else touchedFields.delete(key);
    setFieldError(key, invalid ? "Укажите площадь помещения больше 0." : "");
    return;
  }

  sharedContact.validateOnBlur(key);
}

function validateAll() {
  const issues = [];
  const roomArea = Number(form.roomArea.value);
  const limits = selectedPattern()?.limits;
  const width = Number(form.boardWidth.value);
  const length = Number(form.boardLength.value);
  const sizesOpen = boardSizesVisible();
  const pattern = selectedPattern();
  const hasCustomPatternDetails = Boolean(form.customPattern.value.trim()) || fileNames(form.customPatternFile).length > 0;
  const customPatternMessage = pattern?.requiresDescription && !hasCustomPatternDetails
    ? "Добавьте описание раскладки или приложите файл."
    : "";
  const widthMessage = sizesOpen && form.boardWidth.value
    ? (valueWithinLimits(width, limits.minWidth, limits.maxWidth)
      ? ""
      : `Ширина: допустимо от ${limits.minWidth} до ${limits.maxWidth}.`)
    : "";
  const lengthMessage = sizesOpen && form.boardLength.value
    ? (valueWithinLimits(length, limits.minLength, limits.maxLength)
      ? ""
      : `Длина: допустимо от ${limits.minLength} до ${limits.maxLength}.`)
    : "";

  const checks = [
    ["species", exactSpeciesExists() ? "" : "Выберите наименование шпона из списка.", form.species],
    ["topLayer", exactSpeciesExists() && !currentItem ? "Выберите верхний слой." : "", form.topLayer],
    ["pattern", form.pattern.value ? "" : "Выберите раскладку.", form.pattern],
    ["customPattern", customPatternMessage, form.customPattern],
    ["boardWidth", widthMessage, form.boardWidth],
    ["boardLength", lengthMessage, form.boardLength],
    ["roomArea", Number.isFinite(roomArea) && roomArea > 0 ? "" : "Укажите площадь помещения больше 0.", form.roomArea],
    ...sharedContact.checks()
  ];

  checks.forEach(([key, message, input]) => {
    setFieldError(key, message);
    if (message) issues.push({ key, input });
  });

  return issues;
}

function focusFirstIssue(issue) {
  if (!issue?.input) return;
  issue.input.focus({ preventScroll: true });
  issue.input.scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderFiles() {
  addSelectedFiles(form.files, ui.selectedFiles);
}

function renderCustomPatternFiles() {
  addSelectedFiles(form.customPatternFile, ui.customPatternFileName);
  renderAll();
}

function buildPayload() {
  const pattern = selectedPattern();
  const calc = pricingState();
  const coating = (flooringData?.coatings || []).find((item) => item.id === form.finish.value) || null;
  const fixedGloss = coating?.glossRequired
    ? Number(coating.defaultGloss ?? flooringData?.meta?.quickCalculation?.fixedGlossPercent ?? 10)
    : null;
  const customPattern = pattern?.id === "custom";
  const standardBaseThickness = Number(flooringData?.meta?.baseThicknessMm || 12);

  return {
    createdAt: new Date().toISOString(),
    productType: "Инженерная доска",
    calculationMode: "quick",
    material: {
      id: currentItem.id,
      typeId: currentItem.materialType,
      typeName: currentItem.materialTypeName,
      species: currentItem.species,
      topLayer: currentItem.topLayer,
      chamfer: chamferLabel(currentItem.topLayer),
      baseMaterial: currentItem.baseMaterial || flooringData?.meta?.baseMaterial || "Влагостойкая фанера из берёзы",
      baseThicknessMm: standardBaseThickness,
      totalThicknessMm: Core.totalThickness(flooringData, currentItem, standardBaseThickness)
    },
    layout: {
      id: pattern.id,
      name: pattern.name,
      angle: pattern.id === "hungarian_herringbone" ? 90 : null,
      roomArea: Number(form.roomArea.value),
      wastePercent: Number(form.waste.value),
      areaWithWaste: calc.area,
      boardWidth: boardSizesVisible() && form.boardWidth.value ? Number(form.boardWidth.value) : null,
      boardLength: boardSizesVisible() && form.boardLength.value ? Number(form.boardLength.value) : null,
      customPatternDescription: customPattern ? form.customPattern.value.trim() : null,
      customPatternFiles: customPattern ? fileNames(form.customPatternFile) : []
    },
    finish: {
      id: form.finish.value,
      name: coating?.id === "oil"
        ? "3 слоя твёрдого воск-масла, матовое"
        : finishLabels[form.finish.value] || coating?.name || "—",
      gloss: fixedGloss
    },
    pricing: {
      catalogPricePerM2: calc.catalogPrice,
      finalPricePerM2: calc.finalUnitPrice,
      total: calc.total,
      vat: calc.vat,
      priceStatus: currentItem.priceStatus,
      discountPercent: calc.discount,
      markupPercent: calc.markup,
      requiresManagerCalculation: false
    },
    contact: {
      name: form.name.value.trim(),
      phone: form.phone.value.trim(),
      city: form.city.value.trim(),
      email: normalizeEmail(form.email.value),
      comment: form.comment.value.trim(),
      callbackRequested: form.managerContact.checked,
      privacyAccepted: form.privacy.checked,
      files: fileNames()
    }
  };
}

const {pdfTableLayout,fitPdfTableWidths}=window.WoodstockQuickCommon;
function pdfValue(value,fallback="—"){return String(value??"").trim()||fallback;}
function chamferLabel(topLayer) {
  const thickness = Number.parseFloat(String(topLayer ?? "").replace(",", "."));
  return Number.isFinite(thickness) && Math.abs(thickness - 0.6) < 1e-9
    ? "Без фаски"
    : Number.isFinite(thickness)
      ? "С фаской с 4-х сторон"
      : "—";
}

function connectionTypeForLength(value, fallback = "Определяется после уточнения длины") {
  const length = Number(value);

  if (!Number.isFinite(length) || length <= 0) return fallback;
  if (length >= 400 && length <= 2400) return "Шип-паз";
  if (length >= 2401 && length <= 3000) return "Паз-паз на шпонку";

  return fallback;
}

function pdfBaseMaterial(value) {
  return pdfValue(value).replace(/берёзы/g, "берёзы");
}

function pdfFinishLabel(finish) {
  const name = pdfValue(finish?.name);
  return finish?.gloss === null || finish?.gloss === undefined
    ? name
    : `${name}, блеск ${number.format(finish.gloss)}%`;
}

function compoundPdfCell(mainValue, details = []) {
  const visibleDetails = details.filter((item) => {
    const value = String(item?.value ?? "").trim();
    return value && (value !== "—" || item?.label === "Страна происхождения шпона");
  });

  const stack = [
    { text: pdfValue(mainValue), bold: true, fontSize: 5.3, lineHeight: 1.03 }
  ];

  if (visibleDetails.length) {
    stack.push({
      canvas: [{ type: "line", x1: 0, y1: 0, x2: 32, y2: 0, lineWidth: 0.6, lineColor: "#BEBEBA" }],
      margin: [0, 2, 0, 2]
    });

    visibleDetails.forEach((item) => {
      stack.push({
        text: [
          { text: `${item.label}: `, color: "#6B6B68" },
          { text: String(item.value), color: "#202020" }
        ],
        fontSize: 4.5,
        lineHeight: 1.03,
        margin: [0, 0, 0, 1]
      });
    });
  }

  return { stack };
}

function createPdfDocument(payload) {
  const baseThickness = Number(payload.material.baseThicknessMm);
  const standardBaseThickness = Number(flooringData?.meta?.baseThicknessMm || 12);
  const nonstandardBaseThickness =
    Number.isFinite(baseThickness) &&
    Number.isFinite(standardBaseThickness) &&
    Math.abs(baseThickness - standardBaseThickness) > 1e-9;
  const overallThickness = Number(payload.material.totalThicknessMm);
  const pricePerM2 = payload.pricing.finalPricePerM2 ? money.format(payload.pricing.finalPricePerM2) : "По запросу";
  const total = payload.pricing.total ? money.format(payload.pricing.total) : "По запросу";
  const vat = payload.pricing.vat ? money.format(payload.pricing.vat) : "—";
  const clientFiles = payload.contact.files.length ? payload.contact.files.join(", ") : "";
  const customLayout = payload.layout.id === "custom";
  const angle = payload.layout.id === "french_herringbone"
    ? "Уточняется менеджером"
    : payload.layout.id === "hungarian_herringbone"
      ? `${payload.layout.angle ?? 90}°`
      : "";
  const layoutFiles = customLayout ? payload.layout.customPatternFiles.join(", ") : "";
  const layoutDescription = customLayout ? payload.layout.customPatternDescription : "";

  const chamfer = payload.material.chamfer || chamferLabel(payload.material.topLayer);
  const connectionType = connectionTypeForLength(payload.layout.boardLength);
  const includeSplineNote = connectionType === "Паз-паз на шпонку";
  const underfloorHeating = Core.underfloorHeatingLabel(payload.material.topLayer);

  const clientBody = [[
    {
      stack: [
        { text: "Имя", color: "#666663" },
        { text: pdfValue(payload.contact.name), bold: true, margin: [0, 4, 0, 0] }
      ]
    },
    {
      stack: [
        { text: "Телефон", color: "#666663" },
        { text: pdfValue(payload.contact.phone), bold: true, margin: [0, 4, 0, 0] }
      ]
    },
    {
      stack: [
        { text: "Город", color: "#666663" },
        { text: pdfValue(payload.contact.city), bold: true, margin: [0, 4, 0, 0] }
      ]
    },
    {
      stack: [
        { text: "Email", color: "#666663" },
        { text: pdfValue(payload.contact.email), bold: true, margin: [0, 4, 0, 0] }
      ]
    }
  ]];

  const multishpon = payload.material.typeId === "multishpon";
  const multishponParts = Core.splitMultishponName(flooringData, payload.material.species);
  const veneerDetails = multishpon
    ? [
        { label: "Коллекция", value: multishponParts.collection },
        { label: "Наименование", value: multishponParts.name },
        { label: "Тип шпона", value: payload.material.typeName },
        { label: "Страна происхождения шпона", value: "—" },
        { label: "Сортировка", value: "Селект+" }
      ]
    : [
        {
          label: payload.material.typeId === "design" ? "Порода дерева и оттенок" : "Порода дерева",
          value: payload.material.species
        },
        { label: "Тип шпона", value: payload.material.typeName },
        { label: "Страна происхождения шпона", value: "—" },
        { label: "Сортировка", value: "Селект+" }
      ];

  const groupedPdfCell = (details = []) => {
    const visibleDetails = details.filter((item) => {
      const value = String(item?.value ?? "").trim();
      return value && (value !== "—" || item?.label === "Страна происхождения шпона");
    });

    if (!visibleDetails.length) return { text: "—", bold: true, fontSize: 5.3 };

    return {
      stack: visibleDetails.map((item) => ({
        text: [
          { text: `${item.label}: `, color: "#6B6B68" },
          { text: String(item.value), color: "#202020" }
        ],
        fontSize: 4.3,
        lineHeight: 1.03,
        margin: [0, 0, 0, 1]
      }))
    };
  };

  const productHeader = [
    "№ П/П",
    "Нижний слой",
    "Верхний слой",
    "Толщина",
    "Шпон",
    "Ширина",
    "Длина",
    "Наличие фаски",
    "Тип соединения",
    "Раскладка",
    "Итого к расчёту",
    "Финишное покрытие",
    "Подходит для водяного тёплого пола",
    "Конструкция",
    "Примечание"
  ].map((text) => ({ text, style: "tableHeader", alignment: "center" }));

  const baseLayerText = Number.isFinite(baseThickness)
    ? `${pdfBaseMaterial(payload.material.baseMaterial || flooringData?.meta?.baseMaterial || "Влагостойкая фанера из берёзы")} · ${number.format(baseThickness)} мм${nonstandardBaseThickness ? "*" : ""}`
    : pdfBaseMaterial(payload.material.baseMaterial || flooringData?.meta?.baseMaterial || "Влагостойкая фанера из берёзы");
  const baseLayerCell = {
    stack: [
      { text: baseLayerText, bold: true, fontSize: 5.3, lineHeight: 1.03 },
      ...(nonstandardBaseThickness
        ? [{ text: "* Нестандартная толщина", color: "#6B6B68", fontSize: 4.5, lineHeight: 1.03, margin: [0, 2, 0, 0] }]
        : [])
    ]
  };

  const productRow = [
    { text: "1", bold: true, alignment: "center", fontSize: 5.2 },
    baseLayerCell,
    compoundPdfCell(payload.material.topLayer),
    compoundPdfCell(Number.isFinite(overallThickness) ? `${number.format(overallThickness)} мм` : "—"),
    groupedPdfCell(veneerDetails),
    compoundPdfCell(payload.layout.boardWidth ? `${number.format(payload.layout.boardWidth)} мм` : "—"),
    compoundPdfCell(payload.layout.boardLength ? `${number.format(payload.layout.boardLength)} мм` : "—"),
    compoundPdfCell(chamfer),
    compoundPdfCell(connectionType),
    compoundPdfCell(payload.layout.name, [
      { label: "Угол торцевого реза", value: angle },
      { label: "Описание раскладки", value: layoutDescription },
      { label: "Файлы индивидуальной раскладки", value: layoutFiles }
    ]),
    compoundPdfCell(`${number.format(payload.layout.areaWithWaste)} м²`, [
      { label: "Площадь помещения", value: `${number.format(payload.layout.roomArea)} м²` },
      { label: "Запас на укладку", value: `${number.format(payload.layout.wastePercent)}%` }
    ]),
    compoundPdfCell(
      String(payload.finish?.name || "—")
        .replace(/,\s*блеск\s+\d+(?:[.,]\d+)?%\s*$/i, "")
        .replace(/\s+[—-]\s*\d+(?:[.,]\d+)?%\s+блеска\s*$/i, ""),
      [
        {
          label: "Степень блеска",
          value: payload.finish?.gloss === null || payload.finish?.gloss === undefined
            ? ""
            : `${number.format(payload.finish.gloss)}%`
        }
      ]
    ),
    compoundPdfCell(underfloorHeating),
    compoundPdfCell("Запатентованная ламель WOODSTOCK"),
    groupedPdfCell([
      { label: "Комментарий", value: payload.contact.comment },
      { label: "Приложенные файлы", value: clientFiles }
    ])
  ];
  const productBaseWidths = [14, 52, 32, 32, 78, 27, 29, 48, 50, 62, 62, 55, 42, 58, 68];

  return window.WoodstockQuickCommon.createPdfDocument(payload,{
    tableBottomMargin:includeSplineNote?0:10,title:"Инженерная доска",subtitle:"Краткий расчёт инженерной доски",widths:productBaseWidths,header:productHeader,rows:[productRow],
    beforePrice:includeSplineNote?[{text:"Шпонка поставляется в комплекте.",style:"infoSmall",margin:[0,3,0,10]}]:[],
    afterPrice:[
      {
        text: "ИНФОРМАЦИЯ ОБ ИНЖЕНЕРНОЙ ДОСКЕ WOODSTOCK",
        style: "infoTitle"
      },
      {
        table: {
          widths: ["*"],
          body: [[{
            text: "Срок поставки: 1,5 месяца с момента 100% предоплаты и утверждения спецификации.",
            style: "infoLead",
            margin: [8, 6, 8, 6]
          }]]
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          fillColor: () => "#FFF6A6",
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0
        },
        margin: [0, 0, 0, 2]
      },
      {
        ul: [
          "Дерево — это натуральный материал, поэтому некоторые вариации в цвете, тоне и текстуре допустимы. Их интенсивность зависит от природных характеристик определенных пород древесины, выбранных пачек шпона заказчиком и дополнительно подчеркивает натуральность материала.",
          "Лицевой шпон инженерной доски WOODSTOCK изготавливается из ценных пород древесины, выбранных заказчиком, и дополнен внутренними слоями пород, гармонично сочетающихся по цвету и обладающих необходимой твердостью для применения в напольных покрытиях.",
          { text: "Инструкция по монтажу и эксплуатации инженерной доски WOODSTOCK", bold: true }
        ],
        style: "infoText",
        margin: [7, 0, 0, 5]
      },
      {
        stack: [
          { text: "Инженерная доска WOODSTOCK: Пол, который не требует циклёвки!", bold: true, margin: [0, 0, 0, 2] },
          { text: "Её уникальность — в лицевом слое из натурального шпона, который имеет однородный цвет на всю глубину, в отличие от полов с поверхностной тонировкой, которые со временем стираются.", margin: [0, 0, 0, 2] },
          { text: "Царапины на инженерной доске WOODSTOCK малозаметны. Их легко замаскировать, не прибегая к сложному ремонту и реставрации.", margin: [0, 0, 0, 2] },
          { text: "Запатентованная многослойная структура лицевого шпона не только обеспечивает идеальный внешний вид, но и гарантирует высочайшую устойчивость к деформациям, влаге и перепадам температур.", margin: [0, 0, 0, 2] },
          { text: "Срок службы инженерной доски WOODSTOCK — не менее 25 лет!", bold: true }
        ],
        style: "infoText",
        margin: [0, 0, 0, 6]
      },
      {
        columns: [
          {
            width: "*",
            stack: [
              { text: "С уважением,", margin: [0, 0, 0, 3] },
              { text: "Громов Николай", bold: true },
              { text: "Руководитель направления" },
              { text: "АО «Вудсток»", margin: [0, 0, 0, 5] },
              { text: "+7 (495) 617-17-99 доб. 1367" },
              { text: "+7 (926) 776-00-91" },
              { text: "kudryavcev@wood-s.com" },
              { text: "woodstock.su" }
            ],
            style: "infoSmall"
          },
          {
            width: 165,
            stack: [
              { text: "WOODSTOCK Москва-Север", bold: true },
              { text: "141044, Московская обл., г.о. Мытищи, д. Грибки, Дмитровское ш., стр. 63А", margin: [0, 3, 0, 0] }
            ],
            style: "infoSmall"
          }
        ]
      }
 ]});
}

function downloadSpecification(payload,onSuccess) {
  return window.WoodstockQuickCommon.downloadDocument(createPdfDocument(payload),"woodstock-flooring-specification.pdf",ui.saveStatus,onSuccess);
}

function openDownloadModal(){window.WoodstockQuickCommon.openDownloadModal(ui.downloadModal);}
function closeDownloadModal(){window.WoodstockQuickCommon.closeDownloadModal(ui.downloadModal);}

function submitCalculation() {
  submitAttempted = true;
  const issues = validateAll();

  if (issues.length) {
    ui.saveStatus.textContent = `Заполните обязательные поля: ${issues.map((issue) => {
      const labels = {
        species: "наименование шпона",
        topLayer: "верхний слой",
        pattern: "раскладка",
        customPattern: "описание раскладки или файл",
        boardWidth: "ширина доски",
        boardLength: "длина ламелей",
        roomArea: "площадь помещения",
        finish: "покрытие",
        name: "имя",
        phone: "телефон",
        city: "город",
        email: "email",
        privacy: "согласие"
      };
      return labels[issue.key];
    }).join(", ")}.`;
    focusFirstIssue(issues[0]);
    return;
  }

  const payload = buildPayload();
  try {
    localStorage.setItem("woodstockQuickFlooringCalculation", JSON.stringify(payload));
  } catch (error) {
    console.warn("Не удалось сохранить расчёт локально:", error);
  }

  downloadSpecification(payload,()=>{
    ui.saveStatus.textContent = "Спецификация и расчёт скачаны в PDF.";
    openDownloadModal();
  });
}

function renderAll() {
  renderArea();
  renderResult();
  if (ui.finishHint) {
    const finishHintText = form.finish.value === "uv_lacquer"
      ? "Стандартная степень блеска — 5%. Другую степень блеска можно согласовать с менеджером."
      : form.finish.value === "parquet_lacquer"
        ? "Стандартная степень блеска — 10%. Другую степень блеска можно согласовать с менеджером."
        : "";
    ui.finishHint.textContent = finishHintText;
    ui.finishHint.classList.toggle("is-hidden", !finishHintText);
  }
  validateBoardSizeFields();

  const width = Number(form.boardWidth.value);
  const managerCheckWidth = Number(
    flooringData?.meta?.generalDimensions?.managerCheckWidth
  );

  ui.boardWidthWarning.classList.toggle(
    "is-hidden",
    !boardSizesVisible() ||
      !width ||
      !Number.isFinite(managerCheckWidth) ||
      width <= managerCheckWidth
  );

  if (submitAttempted) validateAll();
}

async function init() {
  setUploadedFiles(form.customPatternFile, getUploadedFiles(form.customPatternFile));
  setUploadedFiles(form.files, getUploadedFiles(form.files));
  try {
    const response = await fetch("../../data/flooring.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    flooringData = await response.json();
    veneerSelector = Core.createVeneerSelector({
      data: flooringData,
      materialTypeSelect: form.materialType,
      speciesInput: form.species,
      clearButton: form.speciesClear,
      suggestions: ui.speciesSuggestions,
      focusAfterSelect: form.topLayer,
      onChange: () => {
        currentItem = null;
        applySpeciesSelection();
      }
    });
    const quickCoatings = Core.quickCoatingOptions(flooringData);
    fillOptions(
      form.finish,
      quickCoatings.map((item) => ({ value: item.id, label: item.name })),
      "Выберите покрытие"
    );
    quickCoatings.forEach((item) => { finishLabels[item.id] = item.name; });
    fillTopLayerOptions();
    fillPatterns();
    renderAll();
  } catch (error) {
    console.error("Не удалось загрузить данные инженерной доски:", error);
    ui.saveStatus.textContent = "Не удалось загрузить каталог. Обновите страницу или обратитесь к менеджеру.";
    ui.getCalculationButton.disabled = true;
  }

  form.topLayer.addEventListener("change", () => {
    if (document.activeElement === form.species) renderSpeciesSuggestions();
    applyTopLayerSelection();
  });
  form.species.addEventListener("blur", () => {
    window.setTimeout(() => validateQuickFieldOnBlur("species"), 0);
  });
  form.pattern.addEventListener("change", applyPattern);
  form.customPattern.addEventListener("input", renderAll);
  form.customPatternFile.addEventListener("change", renderCustomPatternFiles);
  form.boardSizeToggle.addEventListener("click", toggleBoardSizes);
  form.boardWidth.addEventListener("input", () => {
    if (!submitAttempted) {
      touchedFields.delete("boardWidth");
      setFieldError("boardWidth", "");
    }
    renderAll();
  });
  form.boardLength.addEventListener("input", () => {
    if (!submitAttempted) {
      touchedFields.delete("boardLength");
      setFieldError("boardLength", "");
    }
    renderAll();
  });

  form.boardWidth.addEventListener("blur", () => {
    const limits = selectedPattern()?.limits;

    if (limits) {
      clampOnBlur(
        form.boardWidth,
        "boardWidth",
        limits.minWidth,
        limits.maxWidth,
        "Ширина"
      );
    }
  });

  form.boardLength.addEventListener("blur", () => {
    const limits = selectedPattern()?.limits;

    if (limits) {
      clampOnBlur(
        form.boardLength,
        "boardLength",
        limits.minLength,
        limits.maxLength,
        "Длина"
      );
    }
  });
  form.roomArea.addEventListener("input", renderAll);
  form.roomArea.addEventListener("blur", () => validateQuickFieldOnBlur("roomArea"));
  form.finish.addEventListener("change", renderAll);
  form.files.addEventListener("change", renderFiles);
  form.city.addEventListener("focus", renderCitySuggestions);
  form.city.addEventListener("click", renderCitySuggestions);
  form.city.addEventListener("input", renderCitySuggestions);
  form.city.addEventListener("blur", () => setTimeout(closeCitySuggestions, 0));
  form.city.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCitySuggestions();
  });
  document.addEventListener("pointerdown", (event) => {
    const cityField = form.city.closest(".autocomplete-field");
    if (cityField && !cityField.contains(event.target)) closeCitySuggestions();
  });
  form.phone.addEventListener("input", applyPhoneMask);
  form.phone.addEventListener("blur", () => {
    applyPhoneMask();
    validateQuickFieldOnBlur("phone");
  });
  form.email.addEventListener("input", applyEmailMask);
  form.email.addEventListener("blur", () => {
    applyEmailMask();
    validateQuickFieldOnBlur("email");
  });
  ui.getCalculationButton.addEventListener("click", submitCalculation);
  ui.downloadModalClose?.addEventListener("click", closeDownloadModal);
  ui.downloadModal?.addEventListener("click", (event) => {
    if (event.target === ui.downloadModal) closeDownloadModal();
  });

  [
    form.species,
    form.topLayer,
    form.pattern,
    form.boardWidth,
    form.boardLength,
    form.roomArea,
    form.finish,
    form.name,
    form.phone,
    form.city,
    form.email,
    form.privacy
  ].forEach((input) => {
    input.addEventListener("change", () => {
      if (submitAttempted) validateAll();
    });
    input.addEventListener("input", () => {
      if (submitAttempted) validateAll();
    });
  });

}

init();