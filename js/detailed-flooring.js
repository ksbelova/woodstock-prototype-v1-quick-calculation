"use strict";

const DATA_URL = "../../data/flooring.json";
const SPEC_STORAGE_KEY = "woodstockDetailedSpecification";
const Core = window.WoodstockFlooringCore;

const form = {
  materialType: document.querySelector("#materialTypeSelect"),
  species: document.querySelector("#speciesInput"),
  topLayer: document.querySelector("#topLayerSelect"),
  patternType: document.querySelector("#patternTypeSelect"),
  baseThicknessToggle: document.querySelector("#baseThicknessToggle"),
  baseThickness: document.querySelector("#baseThicknessInput"),
  clientType: document.querySelector("#clientTypeSelect"),
  loyalty: document.querySelector("#loyaltySelect"),
  customPriceToggle: document.querySelector("#customPriceToggle"),
  customPrice: document.querySelector("#customPriceInput"),
  resetCustomPrice: document.querySelector("#resetCustomPriceButton"),
  finalUnitPrice: document.querySelector("#finalUnitPriceInput"),
  sorting: document.querySelector("#sortingSelect"),
  pattern: document.querySelector("#patternSelect"),
  angle: document.querySelector("#angleSelect"),
  width: document.querySelector("#widthInput"),
  length: document.querySelector("#lengthInput"),
  customPattern: document.querySelector("#customPatternInput"),
  customPatternFile: document.querySelector("#customPatternFileInput"),
  boardArea: document.querySelector("#boardAreaInput"),
  waste: document.querySelector("#wasteInput"),
  coating: document.querySelector("#coatingSelect"),
  gloss: document.querySelector("#glossInput"),
  unitPrice: document.querySelector("#unitPriceInput"),
  speciesClear: document.querySelector("#speciesClearButton"),
  discount: document.querySelector("#discountInput"),
  markup: document.querySelector("#markupInput"),
  comment: document.querySelector("#commentInput"),
  files: document.querySelector("#filesInput")
};

const ui = Object.fromEntries([
  "materialTypeField",
  "patternTypeField",
  "speciesSuggestions",
  "topLayerHint",
  "baseSummary",
  "customBaseThicknessField",
  "selectionSurchargeBlock",
  "selectionSurchargeOptions",
  "loyaltyField",
  "retailPriceValue",
  "customPriceField",
  "priceAdjustmentsBlock",
  "priceAdjustmentsList",
  "finalUnitPriceValue",
  "angleField",
  "lengthLabel",
  "customPatternField",
  "customPatternWarning",
  "customPatternFileName",
  "widthWarning",
  "areaSummary",
  "areaWithWasteValue",
  "areaWithWasteFormula",
  "coatingHint",
  "glossField",
  "glossLabel",
  "glossHint",
  "selectedFiles",
  "saveStatus",
  "priceStatus",
  "addToSpecButton",
  "specBase",
  "specBaseNote",
  "specTopLayer",
  "specThickness",
  "specSpeciesRow",
  "specSpeciesLabel",
  "specSpecies",
  "specSpeciesNameRow",
  "specSpeciesName",
  "specMaterialTypeRow",
  "specMaterialType",
  "specConnection",
  "specSorting",
  "specPatternTypeRow",
  "specPatternType",
  "specPattern",
  "specAngleRow",
  "specAngle",
  "specWidth",
  "specLength",
  "specChamfer",
  "specCustomPatternRow",
  "specCustomPattern",
  "specCustomPatternFileRow",
  "specCustomPatternFile",
  "specCoating",
  "specGlossRow",
  "specGloss",
  "specBaseArea",
  "specWaste",
  "specAreaWithWaste",
  "specCommentRow",
  "specComment",
  "specFilesRow",
  "specFiles",
  "specUnderfloorHeating",
  "specFinalUnitPrice",
  "specTotal",
  "specVat"
].map((id) => [
  id,
  document.querySelector(`#${id}`)
]));

const validation = {
  pattern: [
    document.querySelector("#patternField"),
    document.querySelector("#patternError")
  ],
  species: [
    document.querySelector("#speciesField"),
    document.querySelector("#speciesError")
  ],
  topLayer: [
    document.querySelector("#topLayerField"),
    document.querySelector("#topLayerError")
  ],
  patternType: [
    document.querySelector("#patternTypeField"),
    document.querySelector("#patternTypeError")
  ],
  angle: [
    document.querySelector("#angleField"),
    document.querySelector("#angleError")
  ],
  width: [
    document.querySelector("#widthField"),
    document.querySelector("#widthError")
  ],
  length: [
    document.querySelector("#lengthField"),
    document.querySelector("#lengthError")
  ],
  customPattern: [
    document.querySelector("#customPatternField"),
    document.querySelector("#customPatternError")
  ],
  boardArea: [
    document.querySelector("#boardAreaField"),
    document.querySelector("#boardAreaError")
  ],
  waste: [
    document.querySelector("#wasteField"),
    document.querySelector("#wasteError")
  ],
  coating: [
    document.querySelector("#coatingField"),
    document.querySelector("#coatingError")
  ],
  gloss: [
    document.querySelector("#glossField"),
    document.querySelector("#glossError")
  ],
  unitPrice: [null, null],
  discount: [null, null],
  markup: [null, null],
  baseThickness: [
    document.querySelector("#customBaseThicknessField"),
    document.querySelector("#baseThicknessInputError")
  ],
  customPrice: [
    document.querySelector("#customPriceField"),
    document.querySelector("#customPriceError")
  ],
  finalUnitPrice: [
    document.querySelector("#finalUnitPriceField"),
    document.querySelector("#finalUnitPriceError")
  ]
};

let flooringData = null;
let veneerSelector = null;
let currentItem = null;
let discountWasEdited = false;
let markupWasEdited = false;
let currentAdjustmentMode = null;
let customBaseEnabled = false;
let selectedSurcharges = new Set();
let customPriceEnabled = false;
let tierDiscountOverride = null;
let activeTierKey = "";
const clientConditionOptions = Array.from(form.loyalty.options).map((option) => ({
  value: option.value,
  label: option.textContent
}));
let clientConditionId = form.loyalty.value || "retail";
let dealerCategoryId = "dealer_retail";
let pricingConditionType = "client"; // Первый этап: тип покупателя зафиксирован как «Клиент».
const markupOverrides = new Map();
let addAttempted = false;
let selectedSpeciesName = "";
let selectedTopLayerValue = "";

const uploadedFilesState = new WeakMap();
const touchedFields = new Set();

const BASE_THICKNESS_MIN = 8;
const BASE_THICKNESS_MAX = 21;
const BASE_THICKNESS_STEP = 0.1;

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

const number = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 2
});

function shouldShowError(key, hasEnteredValue = false) {
  return addAttempted || (hasEnteredValue && touchedFields.has(key));
}

function markFieldTouched(key) {
  touchedFields.add(key);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;

  return (
    Math.round(
      (value + Number.EPSILON) * factor
    ) / factor
  );
}

function chamferLabel(topLayer) {
  const thickness = Number.parseFloat(String(topLayer ?? "").replace(",", "."));
  return Number.isFinite(thickness) && Math.abs(thickness - 0.6) < 1e-9
    ? "Без фаски"
    : Number.isFinite(thickness)
      ? "С фаской с 4-х сторон"
      : "—";
}

function connectionTypeForLength(value, fallback = "—") {
  const length = Number(value);

  if (!Number.isFinite(length) || length <= 0) return fallback;
  if (length >= 400 && length <= 2400) return "Шип-паз";
  if (length >= 2401 && length <= 3000) return "Паз-паз на шпонку";

  return fallback;
}

function setFieldError(key, message = "") {
  const [field, error] = validation[key] || [];

  field?.classList.toggle(
    "field--invalid",
    Boolean(message)
  );

  if (error) {
    error.textContent = message;
  }
}

function fillOptions(select, placeholder, items, valueFn, labelFn) {
  select.replaceChildren();

  const first = document.createElement("option");
  first.value = "";
  first.textContent = placeholder;
  select.append(first);

  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = valueFn(item);
    option.textContent = labelFn(item);
    select.append(option);
  });
}

function matchesStep(value, min, step) {
  if (!Number.isFinite(step) || step <= 0) return true;
  const steps = (value - min) / step;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

function clampOnBlur(
  input,
  key,
  min,
  max,
  label,
  step = null
) {
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

    setFieldError(
      key,
      `${label}: введите числовое значение.`
    );

    return;
  }

  const belowMinimum =
    value < min;

  const aboveMaximum =
    Number.isFinite(max) &&
    value > max;

  const stepMismatch =
    !belowMinimum &&
    !aboveMaximum &&
    !matchesStep(value, min, step);

  if (
    belowMinimum ||
    aboveMaximum ||
    stepMismatch
  ) {
    markFieldTouched(key);
    input.value = "";

    renderAll();

    setFieldError(
      key,
      stepMismatch
        ? `${label}: используйте шаг ${step}.`
        : Number.isFinite(max)
          ? `${label}: допустимо от ${min} до ${max}.`
          : `${label}: значение не меньше ${min}.`
    );
    return;
  }

  touchedFields.delete(key);
  setFieldError(key, "");
}

function topLayerThicknessMm(value) {
  const parsed = Number(
    String(value || "")
      .replace(",", ".")
      .replace(/[^0-9.]/g, "")
  );

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : null;
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
  const pattern =
    flooringData?.patterns.find(
      (item) =>
        item.id === form.pattern.value
    ) || null;

  return patternAllowedForTopLayer(pattern)
    ? pattern
    : null;
}

function effectivePatternAngle(pattern = selectedPattern()) {
  if (!pattern) return null;
  if (pattern.id === "hungarian_herringbone") return 90;

  const value = Number(form.angle.value);
  return Number.isFinite(value) && form.angle.value !== "" ? value : null;
}

function selectedCoating() {
  return (
    flooringData?.coatings.find(
      (item) =>
        item.id === form.coating.value
    ) || null
  );
}

function coatingGlossOptions(coating) {
  if (!Array.isArray(coating?.glossOptions)) return [];

  return coating.glossOptions
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function validGlossValue(coating) {
  if (!coating?.glossRequired) return true;

  const options = coatingGlossOptions(coating);
  const value = Number(form.gloss.value);

  return (
    form.gloss.value !== "" &&
    Number.isFinite(value) &&
    options.includes(value)
  );
}

function updateGlossHint(coating = selectedCoating()) {
  if (!ui.glossHint) return;

  if (!coating?.glossRequired) {
    ui.glossHint.textContent = "";
    return;
  }

  const messages = ["Для тёмных пород шпона рекомендуется блеск не ниже 10%."];
  const value = Number(form.gloss.value);
  const confirmationGlossMin = Number(coating.confirmationGlossMin);

  if (
    form.gloss.value !== "" &&
    Number.isFinite(value) &&
    Number.isFinite(confirmationGlossMin) &&
    value >= confirmationGlossMin
  ) {
    messages.push("Выбранная степень блеска требует подтверждения возможности изготовления.");
  }

  ui.glossHint.textContent = messages.join(" ");
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

function topLayerProducts() {
  if (!form.topLayer.value) return [];

  return speciesProducts().filter(
    (item) => item.topLayer === form.topLayer.value
  );
}

function fixedPrice(item) {
  const price = Core.catalogPrice(item);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function exactProductItem() {
  if (!form.species.value.trim() || !form.topLayer.value) return null;

  return speciesProducts().find(
    (item) => item.topLayer === form.topLayer.value
  ) || null;
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
  const availableLayers = speciesMatch
    ? [...new Set(speciesProducts().map((item) => item.topLayer).filter(Boolean))]
    : [];

  form.topLayer.innerHTML = "";
  form.topLayer.append(new Option("Выберите верхний слой", ""));
  availableLayers.forEach((topLayer) => form.topLayer.append(new Option(topLayer, topLayer)));
  form.topLayer.disabled = !speciesMatch || !availableLayers.length;

  if (availableLayers.includes(currentValue)) {
    form.topLayer.value = currentValue;
  } else {
    form.topLayer.value = "";
    selectedTopLayerValue = "";
  }
}

function selectedVeneerDefinition() {
  const speciesMatch = exactSpeciesItem();
  if (!speciesMatch) return null;

  return (flooringData?.veneers || []).find((veneer) => (
    veneer.materialType === speciesMatch.materialType &&
    veneer.species === speciesMatch.species
  )) || null;
}

function patternTypesForSelectedSpecies() {
  const veneer = selectedVeneerDefinition();
  if (!Array.isArray(veneer?.patternTypes)) return [];

  return [...new Set(
    veneer.patternTypes
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
}

function updatePatternTypeField() {
  const speciesMatch = exactSpeciesItem();
  const availablePatternTypes = patternTypesForSelectedSpecies();
  const currentValue = form.patternType.value;

  form.patternType.replaceChildren();
  form.patternType.disabled = true;
  form.patternType.required = false;
  ui.patternTypeField.classList.add("is-hidden");
  touchedFields.delete("patternType");
  setFieldError("patternType", "");

  if (!speciesMatch || !availablePatternTypes.length) {
    form.patternType.append(new Option("Выберите тип рисунка", ""));
    form.patternType.value = "";
    return;
  }

  if (availablePatternTypes.length === 1) {
    const [onlyValue] = availablePatternTypes;
    form.patternType.append(new Option(onlyValue, onlyValue));
    form.patternType.value = onlyValue;
    return;
  }

  form.patternType.append(new Option("Выберите тип рисунка", ""));
  availablePatternTypes.forEach((patternType) => {
    form.patternType.append(new Option(patternType, patternType));
  });
  form.patternType.disabled = false;
  form.patternType.value = availablePatternTypes.includes(currentValue) ? currentValue : "";
  ui.patternTypeField.classList.remove("is-hidden");
}

function updateMaterialTypeFieldVisibility() {
  // «Тип шпона» остаётся видимым для всех типов, включая мультишпон.
  ui.materialTypeField.classList.remove("is-hidden");
}

function clearSpeciesSelection() {
  veneerSelector?.clear();
}

function resetSortingSelection() {
  form.sorting.value = "Select+";
  touchedFields.delete("sorting");
}

function standardBaseThickness() {
  return Number(flooringData?.meta?.baseThicknessMm || 12);
}

function currentBaseThickness() {
  if (!customBaseEnabled) return standardBaseThickness();
  const value = Number(form.baseThickness.value);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function baseMaterialLabel(value = flooringData?.meta?.baseMaterial) {
  return String(value || "Влагостойкая фанера из берёзы")
    .replace(/берёзы/g, "берёзы");
}

function renderBaseSummary() {
  const thickness = currentBaseThickness() ?? standardBaseThickness();
  ui.baseSummary.textContent = `${baseMaterialLabel()} · ${number.format(thickness)} мм`;
}

function retailPrice() {
  return currentItem ? Core.catalogPrice(currentItem) : null;
}

function sanitizeCustomPriceValue(raw) {
  let result = "";
  let hasSeparator = false;

  for (const char of String(raw ?? "")) {
    if (/\d/.test(char)) {
      result += char;
      continue;
    }

    if ((char === "," || char === ".") && !hasSeparator) {
      result += char;
      hasSeparator = true;
    }
  }

  return result;
}

function parseCustomPrice() {
  return Core.parseLocalizedNumber(form.customPrice.value);
}

function pricingBasePrice() {
  // Первый этап: базовая цена только розничная.
  // Расширенные права (ручная цена) временно отключены до личного кабинета / ролевой модели.
  /*
  if (!customPriceEnabled) return retailPrice();
  const value = parseCustomPrice();
  return Number.isFinite(value) && value > 0 ? value : null;
  */
  return retailPrice();
}

function setCustomPriceValue(value) {
  form.customPrice.value = value === null || value === undefined
    ? ""
    : Core.formatEditableMoney(value);
}

function resetPriceOverrides() {
  tierDiscountOverride = null;
  activeTierKey = "";
  markupOverrides.clear();
}

function selectedSelectionMarkupRows() {
  const options = Core.selectionSurchargeOptions(flooringData, currentItem);
  return options.filter((option) => selectedSurcharges.has(option.id));
}

function selectionMarkupKey(id) {
  return `selection:${id}`;
}

function renderSelectionSurcharges() {
  const options = Core.selectionSurchargeOptions(flooringData, currentItem);
  ui.selectionSurchargeBlock.classList.toggle("is-hidden", !options.length);
  ui.selectionSurchargeOptions.replaceChildren();

  if (!options.length) {
    selectedSurcharges.clear();
    [...markupOverrides.keys()]
      .filter((key) => key.startsWith("selection:"))
      .forEach((key) => markupOverrides.delete(key));
    return;
  }

  options.forEach((option) => {
    const label = document.createElement("label");
    label.className = "selection-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedSurcharges.has(option.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedSurcharges.add(option.id);
      } else {
        selectedSurcharges.delete(option.id);
        markupOverrides.delete(selectionMarkupKey(option.id));
      }
      updateAutomaticPricingAdjustments();
      renderSpecification();
    });
    const text = document.createElement("span");
    text.innerHTML = `<strong>${option.name}</strong><small>+${number.format(option.percent)}% к стоимости</small>`;
    label.append(checkbox, text);
    ui.selectionSurchargeOptions.append(label);
  });
}

function resetProductPrice({ preserveSelectionSurcharges = false } = {}) {
  currentItem = null;
  form.unitPrice.value = "";
  form.finalUnitPrice.value = "";
  form.customPrice.value = "";
  customPriceEnabled = false;
  // Расширенные права (ручная цена) временно отключены; публичных контролов нет.
  form.customPriceToggle?.setAttribute("aria-expanded", "false");
  form.customPriceToggle?.classList.add("is-hidden");
  ui.customPriceField?.classList.add("is-hidden");
  ui.retailPriceValue.textContent = "—";
  ui.finalUnitPriceValue.textContent = "—";
  ui.priceAdjustmentsBlock.classList.add("is-hidden");
  ui.priceAdjustmentsList.replaceChildren();

  if (!preserveSelectionSurcharges) {
    selectedSurcharges.clear();
    renderSelectionSurcharges();
  } else {
    // При смене товарного варианта верхнего слоя сохраняем выбранный отбор.
    // Доступность будет повторно проверена после определения нового currentItem.
    ui.selectionSurchargeBlock.classList.add("is-hidden");
    ui.selectionSurchargeOptions.replaceChildren();
  }

  resetPriceOverrides();
  touchedFields.delete("unitPrice");
  touchedFields.delete("customPrice");
  touchedFields.delete("finalUnitPrice");
  setFieldError("unitPrice", "");
  setFieldError("customPrice", "");
  setFieldError("finalUnitPrice", "");
}

function applySpeciesSelection() {
  updateSpeciesClearButton();

  const speciesMatch =
    exactSpeciesItem();

  const nextSpeciesName =
    speciesMatch?.species || "";

  const speciesChanged =
    nextSpeciesName !==
    selectedSpeciesName;

  if (speciesChanged) {
    selectedSpeciesName =
      nextSpeciesName;

    selectedTopLayerValue = "";
    form.patternType.value = "";

    touchedFields.delete("topLayer");
    touchedFields.delete("sorting");
    touchedFields.delete("unitPrice");
    touchedFields.delete("patternType");

    setFieldError("patternType", "");

    setFieldError(
      "topLayer",
      ""
    );

    setFieldError(
      "sorting",
      ""
    );
  }

  updateMaterialTypeFieldVisibility();
  updatePatternTypeField();

  if (!speciesMatch) {
    currentItem = null;

    fillTopLayerOptions();

    ui.topLayerHint.textContent = "";

    resetSortingSelection();
    resetProductPrice();

    const speciesError =
      form.species.value.trim() &&
      shouldShowError("species", Boolean(form.species.value.trim()))
        ? "Выберите точное наименование из справочника."
        : "";

    setFieldError(
      "species",
      speciesError
    );

    renderAll();
    return;
  }

  if (
    form.materialType.value !==
    speciesMatch.materialType
  ) {
    form.materialType.value =
      speciesMatch.materialType;

    refreshSpeciesOptions();
  }


  setFieldError(
    "species",
    ""
  );

  fillTopLayerOptions();

  applyTopLayerSelection();
}

function applyTopLayerSelection() {
  const nextTopLayer =
    form.topLayer.value;

  const patternWasReset =
    fillPatternOptions();

  if (patternWasReset) {
    applyPattern();
  }

  const topLayerChanged =
    nextTopLayer !==
    selectedTopLayerValue;

  if (topLayerChanged) {
    selectedTopLayerValue =
      nextTopLayer;

    touchedFields.delete("sorting");
    touchedFields.delete("unitPrice");

    setFieldError(
      "sorting",
      ""
    );

    resetSortingSelection();
    resetProductPrice({ preserveSelectionSurcharges: Boolean(nextTopLayer) });
  }

  if (!nextTopLayer) {
    ui.topLayerHint.textContent = "";

    resetSortingSelection();
    resetProductPrice();

    renderAll();
    return;
  }

  const products =
    topLayerProducts();

  form.sorting.value = "Select+";

  const containsOnRequest =
    products.some(
      (item) =>
        !fixedPrice(item)
    );

  ui.topLayerHint.textContent =
    containsOnRequest
      ? "Для выбранной толщины цена указана «По запросу». Введите согласованную цену за м² в блоке «Цена»."
      : "";

  applyProduct();
}

function updateUnitPriceHint() {
  const retail = retailPrice();
  ui.retailPriceValue.textContent = retail ? `${Core.formatMoney(retail)}/м²` : "—";

  // Расширенные права (ручная цена) временно отключены до личного кабинета / ролевой модели.
  // Публичные кнопка, поле ручной цены и сброс не рендерятся.
  /*
  const hasItem = Boolean(currentItem);
  form.customPriceToggle.classList.toggle("is-hidden", !hasItem || customPriceEnabled);
  ui.customPriceField.classList.toggle("is-hidden", !hasItem || !customPriceEnabled);
  form.customPriceToggle.setAttribute("aria-expanded", String(hasItem && customPriceEnabled));

  if (!hasItem) {
    setFieldError("customPrice", "");
    return;
  }

  if (customPriceEnabled) {
    const custom = parseCustomPrice();
    const valid = Number.isFinite(custom) && custom > 0;
    setFieldError(
      "customPrice",
      shouldShowError("customPrice", Boolean(form.customPrice.value.trim())) && !valid
        ? "Укажите цену для расчёта."
        : ""
    );
  } else {
    setFieldError("customPrice", "");
  }
  */
  customPriceEnabled = false;
  setFieldError("customPrice", "");
}


function applyProduct() {
  const previousItemId = currentItem?.id || null;
  currentItem = exactProductItem();

  if (!currentItem) {
    resetProductPrice();
    renderAll();
    return;
  }

  setFieldError("topLayer", "");
  setFieldError("sorting", "");

  const retail = Core.catalogPrice(currentItem);

  if (previousItemId !== currentItem.id) {
    const availableSelectionIds = new Set(
      Core.selectionSurchargeOptions(flooringData, currentItem).map((option) => option.id)
    );

    [...selectedSurcharges].forEach((id) => {
      if (!availableSelectionIds.has(id)) {
        selectedSurcharges.delete(id);
        markupOverrides.delete(selectionMarkupKey(id));
      }
    });

    customPriceEnabled = false;
    form.customPrice.value = "";
    resetPriceOverrides();
    touchedFields.delete("unitPrice");
    touchedFields.delete("customPrice");
    touchedFields.delete("finalUnitPrice");
    setFieldError("unitPrice", "");
    setFieldError("customPrice", "");
    setFieldError("finalUnitPrice", "");
  }

  form.unitPrice.value = retail || "";
  renderSelectionSurcharges();
  updateAutomaticPricingAdjustments();
  updateUnitPriceHint();
  renderAll();
}

function fillPatternOptions() {
  const currentValue = form.pattern.value;
  const patterns = availablePatterns();

  form.pattern.replaceChildren(
    new Option("Выберите раскладку", "")
  );

  patterns.forEach((pattern) => {
    const unavailableReason = patternUnavailableReason(pattern);
    const option = new Option(
      unavailableReason
        ? `${pattern.name} — ${unavailableReason}`
        : pattern.name,
      pattern.id
    );

    option.disabled = Boolean(unavailableReason);
    if (unavailableReason) option.title = unavailableReason;
    form.pattern.append(option);
  });

  const currentPattern = patterns.find(
    (pattern) => pattern.id === currentValue
  );

  if (currentPattern && patternAllowedForTopLayer(currentPattern)) {
    form.pattern.value = currentValue;
    return false;
  }

  form.pattern.value = "";
  return Boolean(currentValue);
}

function fillPatternsAndCoatings() {
  fillPatternOptions();

  fillOptions(
    form.coating,
    "Выберите покрытие",
    flooringData.coatings,
    (item) => item.id,
    (item) => item.name
  );
}

function applyPattern() {
  const pattern = selectedPattern();

  ui.angleField.classList.add("is-hidden");
  ui.customPatternField.classList.add("is-hidden");
  ui.customPatternWarning.classList.add("is-hidden");

  form.angle.innerHTML = `
    <option value="">
      Выберите угол
    </option>
  `;

  form.angle.value = "";
  form.customPattern.value = "";
  setUploadedFiles(form.customPatternFile, []);
  ui.customPatternFileName.textContent = "Файлы не выбраны";
  ui.customPatternFileName.classList.add("is-hidden");

  [
    "angle",
    "width",
    "length",
    "customPattern",
    "waste"
  ].forEach((key) => touchedFields.delete(key));

  [
    "angle",
    "width",
    "length",
    "customPattern",
    "waste"
  ].forEach((key) => setFieldError(key, ""));

  if (!pattern) {
    form.width.disabled = true;
    form.length.disabled = true;
    form.waste.disabled = true;

    form.width.value = "";
    form.length.value = "";
    form.waste.value = "";

    form.width.placeholder = "Сначала выберите раскладку";
    form.length.placeholder = "Сначала выберите раскладку";
    form.waste.placeholder = "Сначала выберите раскладку";

    discountWasEdited = false;
    markupWasEdited = false;

    renderAll();
    return;
  }

  const {
    minWidth,
    maxWidth,
    minLength,
    maxLength
  } = pattern.limits;

  form.width.disabled = false;
  form.length.disabled = false;
  form.waste.disabled = false;

  form.width.min = minWidth;
  form.width.max = maxWidth;
  form.length.min = minLength;
  form.length.max = maxLength;

  form.width.placeholder = `${minWidth}–${maxWidth}`;
  form.length.placeholder = `${minLength}–${maxLength}`;
  form.waste.placeholder = "Укажите процент";

  const currentWidth = Number(form.width.value);
  const currentLength = Number(form.length.value);

  if (
    form.width.value &&
    (
      !Number.isFinite(currentWidth) ||
      currentWidth < minWidth ||
      currentWidth > maxWidth
    )
  ) {
    form.width.value = "";
  }

  if (
    form.length.value &&
    (
      !Number.isFinite(currentLength) ||
      currentLength < minLength ||
      currentLength > maxLength
    )
  ) {
    form.length.value = "";
  }

  ui.lengthLabel.textContent =
    pattern.id === "equal_length"
      ? "Длина, мм"
      : "Длина, мм";

  if (pattern.angles?.length) {
    ui.angleField.classList.remove("is-hidden");

    pattern.angles.forEach((angle) => {
      form.angle.append(
        new Option(`${angle}°`, String(angle))
      );
    });

    if (pattern.id === "french_herringbone" && pattern.angles.includes(45)) {
      form.angle.value = "45";
    }
  }

  if (pattern.requiresDescription) {
    ui.customPatternField.classList.remove("is-hidden");
    ui.customPatternWarning.classList.remove("is-hidden");
  }

  if (
    pattern.defaultWastePercent !== null &&
    pattern.defaultWastePercent !== undefined
  ) {
    form.waste.value = pattern.defaultWastePercent;
  } else {
    form.waste.value = "";
  }

  discountWasEdited = false;
  markupWasEdited = false;

  updateAutomaticPricingAdjustments();
  renderAll();
}

function applyCoating() {
  const coating = selectedCoating();
  const needsGloss = Boolean(coating?.glossRequired);

  setFieldError("coating", "");

  if (ui.coatingHint) {
    ui.coatingHint.textContent = coating?.description
      ? `${coating.description} `
      : "";
  }

  ui.glossField.classList.toggle("is-hidden", !needsGloss);
  form.gloss.replaceChildren();

  if (needsGloss) {
    const options = coatingGlossOptions(coating);
    options.forEach((value) => {
      form.gloss.append(new Option(`${number.format(value)}%`, String(value)));
    });

    const defaultGloss = Number(coating.defaultGloss ?? 10);
    form.gloss.value = options.includes(defaultGloss)
      ? String(defaultGloss)
      : String(options[0] ?? "");

    if (ui.glossLabel) {
      ui.glossLabel.textContent = "Степень блеска";
    }

    updateGlossHint(coating);
  } else {
    form.gloss.value = "";
    setFieldError("gloss", "");
    updateGlossHint(coating);
  }

  touchedFields.delete("gloss");
  renderAll();
}

function priceArea() {
  const area = Number(
    form.boardArea.value
  );

  const waste = Number(
    form.waste.value
  );

  if (
    !(area > 0) ||
    !(waste >= 0 && waste <= 30)
  ) {
    return null;
  }

  return round(
    area *
      (1 + waste / 100),
    2
  );
}

function automaticDiscountPercent(area) {
  if (area === null) {
    return 0;
  }

  const tier =
    flooringData.meta.pricing.discountScale.find(
      (row) =>
        area >= row.minArea &&
        (
          row.maxArea === null ||
          area <= row.maxArea
        )
    );

  return tier?.percent ?? 0;
}

function rememberPricingConditionSelection(type = pricingConditionType) {
  if (type === "dealer") {
    dealerCategoryId = form.loyalty.value || "dealer_retail";
  } else {
    clientConditionId = form.loyalty.value || "retail";
  }
}

function syncSmallOrderClientConditions(area = priceArea()) {
  const clientType = form.clientType.value || "client";
  const threshold = Number(flooringData?.meta?.pricing?.smallOrderThresholdM2 || 20);
  const smallOrder =
    clientType === "client" &&
    area !== null &&
    Number.isFinite(Number(area)) &&
    Number(area) < threshold;

  Array.from(form.loyalty.options).forEach((option) => {
    option.disabled = smallOrder && option.value !== "retail";
  });

  if (smallOrder && form.loyalty.value !== "retail") {
    form.loyalty.value = "retail";
    clientConditionId = "retail";
    tierDiscountOverride = null;
    activeTierKey = "";
  }
}

function syncPricingConditionField() {
  const clientType = form.clientType.value || "client";
  const label = ui.loyaltyField.querySelector(".field__label");

  ui.loyaltyField.classList.remove("is-hidden");
  form.loyalty.replaceChildren();

  if (clientType === "dealer") {
    if (label) label.textContent = "Категория дилера";
    const tiers = flooringData?.meta?.pricing?.dealerTiers || [];
    tiers.forEach((tier) => {
      form.loyalty.append(new Option(tier.name, tier.id));
    });
    const fallback = tiers.some((tier) => tier.id === "dealer_retail")
      ? "dealer_retail"
      : (tiers[0]?.id || "");
    form.loyalty.value = tiers.some((tier) => tier.id === dealerCategoryId)
      ? dealerCategoryId
      : fallback;
    dealerCategoryId = form.loyalty.value || fallback;
  } else {
    if (label) label.textContent = "Ценовые условия";
    clientConditionOptions.forEach((option) => {
      form.loyalty.append(new Option(option.label, option.value));
    });
    const fallback = clientConditionOptions.some((option) => option.value === "retail")
      ? "retail"
      : (clientConditionOptions[0]?.value || "");
    form.loyalty.value = clientConditionOptions.some((option) => option.value === clientConditionId)
      ? clientConditionId
      : fallback;
    clientConditionId = form.loyalty.value || fallback;
  }

  pricingConditionType = clientType;
  syncSmallOrderClientConditions();
}

function pricingTierKey(tier, clientType, loyalty) {
  if (!tier) return "";
  return [
    clientType,
    loyalty,
    tier.id || "",
    tier.source || "",
    Number(tier.discountPercent || 0)
  ].join("|");
}

function effectivePricingTier(area) {
  if (area === null) {
    tierDiscountOverride = null;
    activeTierKey = "";
    return null;
  }

  const clientType = form.clientType.value || "client";
  const pricingCondition = form.loyalty.value || (clientType === "dealer" ? "dealer_retail" : "retail");
  const threshold = Number(flooringData?.meta?.pricing?.smallOrderThresholdM2 || 20);
  const smallClientOrder =
    clientType === "client" &&
    Number.isFinite(Number(area)) &&
    Number(area) < threshold;
  const automaticTier = smallClientOrder
    ? {
        id: "client_small_order",
        name: "Розничная цена",
        coefficient: 1,
        discountPercent: 0,
        volumePercent: 0,
        loyaltyPercent: 0,
        source: "retail"
      }
    : Core.pricingTier(flooringData, area, clientType, pricingCondition);
  const key = pricingTierKey(automaticTier, clientType, pricingCondition);

  if (activeTierKey && activeTierKey !== key) {
    tierDiscountOverride = null;
  }
  activeTierKey = key;

  const automaticPercent = Number(automaticTier?.discountPercent || 0);
  if (!(automaticPercent > 0)) {
    tierDiscountOverride = null;
  }

  // Первый этап: скидки только автоматические.
  // Расширенные права (ручная корректировка скидки) сохранены ниже и временно отключены.
  let discountPercent = automaticPercent;
  /*
  const maxClientDiscount = Number(flooringData?.meta?.pricing?.maxDiscountPercent || 20);
  const maxDealerDiscount = Number(flooringData?.meta?.pricing?.maxDealerDiscountPercent || 44);
  const maxAllowed = clientType === "dealer" ? maxDealerDiscount : maxClientDiscount;
  discountPercent = tierDiscountOverride === null
    ? automaticPercent
    : Number(tierDiscountOverride);

  if (
    !Number.isFinite(discountPercent) ||
    discountPercent < 0 ||
    discountPercent > maxAllowed
  ) {
    tierDiscountOverride = null;
    discountPercent = automaticPercent;
  }
  */

  return {
    ...automaticTier,
    automaticDiscountPercent: automaticPercent,
    discountPercent,
    coefficient: 1 - discountPercent / 100
  };
}

function selectionMarkupName(row) {
  if (row.id === "length") return "Увеличение стоимости за отбор по длине";
  if (row.id === "visual") return "Увеличение стоимости за отбор по ширине, качеству, рисунку, цвету";
  return `Увеличение стоимости за ${String(row.name || "").toLocaleLowerCase("ru")}`;
}

function effectiveMarkupRows(area) {
  const definitions = [];
  const smallAuto = area === null
    ? 0
    : Core.smallOrderMarkup(flooringData, area);

  if (smallAuto > 0) {
    definitions.push({
      id: "smallOrder",
      name: "Увеличение стоимости за малый объём заказа",
      automaticPercent: Number(smallAuto)
    });
  }

  const baseThickness = currentBaseThickness();
  const standardThickness = standardBaseThickness();
  if (
    customBaseEnabled &&
    baseThickness !== null &&
    Math.abs(baseThickness - standardThickness) > 1e-9
  ) {
    definitions.push({
      id: "baseThickness",
      name: "Увеличение стоимости за нестандартную толщину нижнего слоя",
      automaticPercent: Number(flooringData?.meta?.pricing?.customBaseThickness?.defaultMarkupPercent || 10)
    });
  }

  selectedSelectionMarkupRows().forEach((row) => {
    definitions.push({
      id: selectionMarkupKey(row.id),
      name: selectionMarkupName(row),
      automaticPercent: Number(row.percent || 0)
    });
  });

  const activeIds = new Set(definitions.map((row) => row.id));
  [...markupOverrides.keys()].forEach((id) => {
    if (!activeIds.has(id)) markupOverrides.delete(id);
  });

  return definitions.map((row) => {
    // Первый этап: наценки только автоматические.
    // Расширенные права (ручная корректировка наценки) сохранены ниже и временно отключены.
    let percent = row.automaticPercent;
    /*
    const override = markupOverrides.has(row.id)
      ? Number(markupOverrides.get(row.id))
      : null;
    percent = Number.isFinite(override) && override >= 0
      ? override
      : row.automaticPercent;
    */
    return {
      ...row,
      percent
    };
  });
}

function volumeDiscountThresholdLabel(tier) {
  const volumePercent = Number(tier?.volumePercent || 0);
  const scale = flooringData?.meta?.pricing?.discountScale || [];
  const row = scale.find((item) => Number(item?.percent || 0) === volumePercent && volumePercent > 0);
  const minArea = Number(row?.minArea);
  return Number.isFinite(minArea) ? Math.floor(minArea) : null;
}

function pricingConditionDiscountName(id) {
  if (id === "loyalty") return "Скидка лояльности";
  if (id === "regular") return "Скидка по карте постоянного покупателя";
  if (id === "vip") return "Скидка по VIP-карте";
  return "Скидка";
}

function pricingConditionInlineName(id) {
  if (id === "loyalty") return "скидка лояльности";
  if (id === "regular") return "карта постоянного покупателя";
  if (id === "vip") return "VIP-карта";
  return "ценовое условие";
}

function discountRowName(tier) {
  if (!tier) return "Скидка";
  if ((form.clientType.value || "client") === "dealer") {
    if (tier.id === "dealer_3") return "Скидка по категории дилера №3";
    if (tier.id === "dealer_2") return "Скидка по категории дилера №2";
    if (tier.id === "dealer_1") return "Скидка по категории дилера №1";
    return tier.name || "Скидка по категории дилера";
  }

  const threshold = volumeDiscountThresholdLabel(tier);
  if (tier.source === "volume") {
    return threshold === null ? "Скидка по объёму" : `Скидка по объёму от ${threshold} м²`;
  }
  if (tier.source === "volumeAndLoyalty") {
    const id = form.loyalty.value || "retail";
    const volumePart = threshold === null ? "объём" : `объём от ${threshold} м²`;
    return `Скидка: ${volumePart} или ${pricingConditionInlineName(id)}`;
  }
  if (tier.source === "loyalty") {
    const id = form.loyalty.value || "retail";
    return pricingConditionDiscountName(id);
  }
  return tier.name || "Скидка";
}

function renderAdjustmentControlRow({
  id,
  name,
  percent,
  automaticPercent,
  type
}) {
  const wrapper = document.createElement("div");
  wrapper.className = "dynamic-adjustment-row";

  const label = document.createElement("span");
  label.className = "dynamic-adjustment-row__label";
  label.textContent = name;

  const right = document.createElement("div");
  right.className = "dynamic-adjustment-row__right";

  const value = document.createElement("strong");
  value.textContent = `${number.format(percent)}%`;
  right.append(value);

  wrapper.append(label, right);
  ui.priceAdjustmentsList.append(wrapper);

  // Расширенные права (ручная корректировка скидок/наценок) временно отключены.
  // Исходная интерактивная реализация сохранена ниже для этапа личного кабинета / ролевой модели.
  /*
    id,
    name,
    percent,
    automaticPercent,
    type
  }) {
    const wrapper = document.createElement("div");
    wrapper.className = "dynamic-adjustment-row";
  
    const label = document.createElement("span");
    label.className = "dynamic-adjustment-row__label";
    label.textContent = name;
  
    const right = document.createElement("div");
    right.className = "dynamic-adjustment-row__right";
  
    const control = document.createElement("span");
    control.className = "inline-percent-control";
  
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
  
    const dealerDiscount =
      type === "discount" &&
      (form.clientType.value || "client") === "dealer";
  
    input.step = dealerDiscount ? "0.01" : "0.1";
    input.value = String(dealerDiscount ? round(percent, 2) : percent);
    input.setAttribute("aria-label", `${name}, %`);
  
    if (type === "discount" && (form.clientType.value || "client") !== "dealer") {
      input.max = String(Number(flooringData?.meta?.pricing?.maxDiscountPercent || 20));
    } else if (type === "discount") {
      input.max = String(Number(flooringData?.meta?.pricing?.maxDealerDiscountPercent || 44));
    }
  
    input.addEventListener("change", () => {
      const value = Number(input.value);
      const max = input.max ? Number(input.max) : Infinity;
      if (!Number.isFinite(value) || value < 0 || value > max) {
        input.value = String(percent);
        return;
      }
  
      if (type === "discount") {
        tierDiscountOverride = Math.abs(value - automaticPercent) < 0.000001
          ? null
          : value;
      } else {
        if (Math.abs(value - automaticPercent) < 0.000001) {
          markupOverrides.delete(id);
        } else {
          markupOverrides.set(id, value);
        }
      }
  
      updateAutomaticPricingAdjustments();
      renderSpecification();
    });
  
    const percentSign = document.createElement("strong");
    percentSign.textContent = "%";
    control.append(input, percentSign);
    right.append(control);
  
    const manuallyChanged = type === "discount"
      ? tierDiscountOverride !== null && Math.abs(percent - automaticPercent) > 0.000001
      : markupOverrides.has(id) && Math.abs(percent - automaticPercent) > 0.000001;
  
    if (manuallyChanged) {
      const meta = document.createElement("span");
      meta.className = "adjustment-manual";
      meta.append("Изменено вручную · ");
  
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "adjustment-reset";
      reset.textContent = "Вернуть";
      let resetHandled = false;
      const resetAdjustment = () => {
        if (resetHandled) return;
        resetHandled = true;
        if (type === "discount") tierDiscountOverride = null;
        else markupOverrides.delete(id);
        updateAutomaticPricingAdjustments();
        renderSpecification();
      };
  
      // Срабатываем до blur/change активного числового поля: его обработчик
      // перерисовывает список условий и раньше мог удалить кнопку до события click.
      reset.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        resetAdjustment();
      });
      // Оставляем click для клавиатурной активации кнопки (Enter / Space).
      reset.addEventListener("click", (event) => {
        event.preventDefault();
        resetAdjustment();
      });
  
      meta.append(reset);
      right.append(meta);
    }
  
    wrapper.append(label, right);
    ui.priceAdjustmentsList.append(wrapper);
  */
}


function updateAutomaticPricingAdjustments() {
  const area = priceArea();
  const basePrice = pricingBasePrice();
  const clientType = form.clientType.value || "client";

  syncSmallOrderClientConditions(area);

  ui.loyaltyField.classList.remove("is-hidden");
  updateUnitPriceHint();

  ui.priceAdjustmentsList.replaceChildren();

  // Скидки и надбавки имеют смысл только после определения базовой цены
  // выбранной товарной позиции. До этого блок условий не показываем.
  if (!currentItem || !(basePrice > 0)) {
    form.discount.value = "0";
    form.markup.value = "0";
    form.unitPrice.value = basePrice || "";
    ui.priceAdjustmentsBlock.classList.add("is-hidden");
    form.finalUnitPrice.value = "";
    ui.finalUnitPriceValue.textContent = "—";
    setFieldError("finalUnitPrice", "");
    return;
  }

  const tier = effectivePricingTier(area);
  const markups = effectiveMarkupRows(area);

  form.discount.value = String(Number(tier?.discountPercent || 0));
  form.markup.value = String(markups.reduce((sum, row) => sum + Number(row.percent || 0), 0));
  form.unitPrice.value = basePrice || "";

  if (tier && Number(tier.automaticDiscountPercent || 0) > 0) {
    renderAdjustmentControlRow({
      id: "pricingTier",
      name: discountRowName(tier),
      percent: Number(tier.discountPercent || 0),
      automaticPercent: Number(tier.automaticDiscountPercent || 0),
      type: "discount"
    });
  }

  markups.forEach((row) => {
    renderAdjustmentControlRow({
      ...row,
      type: "markup"
    });
  });

  ui.priceAdjustmentsBlock.classList.toggle(
    "is-hidden",
    !ui.priceAdjustmentsList.children.length
  );

  const calc = currentPricingCalculation(tier, markups);
  if (calc) {
    form.finalUnitPrice.value = Core.formatEditableMoney(calc.finalUnitPriceRaw);
    ui.finalUnitPriceValue.textContent = `${Core.formatMoney(calc.finalUnitPriceRaw)}/м²`;
    setFieldError("finalUnitPrice", "");
  } else {
    form.finalUnitPrice.value = "";
    ui.finalUnitPriceValue.textContent = "—";
  }
}

function currentPricingCalculation(tier = null, markups = null) {
  const area = priceArea();
  const basePrice = pricingBasePrice();
  if (!currentItem || !(area > 0) || !(basePrice > 0)) return null;

  const effectiveTier = tier || effectivePricingTier(area);
  const effectiveMarkups = markups || effectiveMarkupRows(area);
  if (!effectiveTier || !(effectiveTier.coefficient > 0)) return null;

  return Core.calculatePricing({
    data: flooringData,
    retailPrice: basePrice,
    areaWithWaste: area,
    tierCoefficient: effectiveTier.coefficient,
    markups: effectiveMarkups
  });
}

function validateNumber(
  input,
  key,
  min,
  max,
  label,
  requiredForPrice = false,
  step = null
) {
  const rawValue =
    input.value.trim();

  const showError =
    shouldShowError(key, Boolean(rawValue));

  if (!rawValue) {
    setFieldError(
      key,
      showError &&
      requiredForPrice
        ? `${label}: заполните поле.`
        : ""
    );

    return false;
  }

  const value =
    Number(rawValue);

  const rangeValid =
    Number.isFinite(value) &&
    value >= min &&
    (
      !Number.isFinite(max) ||
      value <= max
    );
  const stepValid = rangeValid && matchesStep(value, min, step);
  const valid = rangeValid && stepValid;

  if (
    !valid &&
    showError
  ) {
    setFieldError(
      key,
      rangeValid && !stepValid
        ? `${label}: используйте шаг ${step}.`
        : Number.isFinite(max)
          ? `${label}: допустимо от ${min} до ${max}.`
          : `${label}: значение не меньше ${min}.`
    );
  } else {
    setFieldError(
      key,
      ""
    );
  }

  return valid;
}

function pricingState() {
  const item = exactProductItem();
  const patternState = validateNonPriceFields();

  const areaValid = validateNumber(form.boardArea, "boardArea", 0.01, Infinity, "Площадь помещения", true);
  const wasteValid = validateNumber(form.waste, "waste", 0, 30, "Запас на укладку", true);

  let baseValid = true;
  if (customBaseEnabled) {
    baseValid = validateNumber(
      form.baseThickness,
      "baseThickness",
      BASE_THICKNESS_MIN,
      BASE_THICKNESS_MAX,
      "Толщина нижнего слоя",
      true,
      BASE_THICKNESS_STEP
    );
  } else {
    setFieldError("baseThickness", "");
  }

  let priceBaseValid = Boolean(retailPrice());
  if (customPriceEnabled) {
    const custom = parseCustomPrice();
    priceBaseValid = Number.isFinite(custom) && custom > 0;
    setFieldError(
      "customPrice",
      shouldShowError("customPrice", Boolean(form.customPrice.value.trim())) && !priceBaseValid
        ? "Укажите цену для расчёта."
        : ""
    );
  } else {
    setFieldError("customPrice", "");
  }

  const calc = currentPricingCalculation();
  const finalPriceValid = Boolean(calc && calc.finalUnitPriceRaw > 0);
  setFieldError("finalUnitPrice", "");

  return {
    item,
    ready: Boolean(
      item && patternState.patternValid && patternState.widthValid && patternState.lengthValid &&
      patternState.angleValid && patternState.customPatternValid && patternState.coatingValid && patternState.glossValid &&
      areaValid && wasteValid && baseValid && priceBaseValid && finalPriceValid
    )
  };
}

function calculatePricePreview() {
  const item = exactProductItem();
  const areaWithWaste = priceArea();
  const basePrice = pricingBasePrice();

  if (!item || areaWithWaste === null || !(basePrice > 0)) {
    return null;
  }

  // Если включена нестандартная основа, сначала должна быть задана её толщина.
  if (customBaseEnabled && currentBaseThickness() === null) {
    return null;
  }

  const tier = effectivePricingTier(areaWithWaste);
  const markups = effectiveMarkupRows(areaWithWaste);
  const calc = currentPricingCalculation(tier, markups);
  if (!calc) return null;

  return {
    item,
    areaWithWaste,
    unitPrice: basePrice,
    catalogPrice: retailPrice(),
    discountPercent: Number(tier?.discountPercent || 0),
    markupPercent: calc.markupPercent,
    baseCost: calc.retailCostRaw,
    discountAmount: Math.max(calc.retailCostRaw - calc.priceAfterTierCostRaw, 0),
    markupAmount: Math.max(calc.automaticTotalRaw - calc.priceAfterTierCostRaw, 0),
    finalUnitPrice: calc.finalUnitPriceRaw,
    automaticFinalUnitPrice: calc.automaticFinalUnitPriceRaw,
    total: calc.totalRaw,
    vat: calc.vatRaw,
    tier,
    markups,
    manualPrice: customPriceEnabled
  };
}

function calculatePrice() {
  const state = pricingState();
  if (!state.ready) return null;

  return calculatePricePreview();
}

function valueOrDash(
  value,
  suffix = ""
) {
  return (
    value === null ||
    value === undefined ||
    value === ""
  )
    ? "—"
    : `${value}${suffix}`;
}

function renderSpecification() {
  const item = exactProductItem();
  const pattern = selectedPattern();
  const coating = selectedCoating();
  // Цена и итог могут быть рассчитаны раньше, чем позиция полностью готова
  // к добавлению в спецификацию: для превью нужны только поля, влияющие на расчёт.
  const calc = calculatePricePreview();
  const files = [...form.files.files].map((file) => file.name);
  const baseThickness = currentBaseThickness();
  const totalThickness = item && baseThickness !== null
    ? Core.totalThickness(flooringData, item, baseThickness)
    : null;

  const standardBaseThicknessMm = standardBaseThickness();
  const nonstandardBaseThickness =
    baseThickness !== null &&
    Number.isFinite(standardBaseThicknessMm) &&
    Math.abs(baseThickness - standardBaseThicknessMm) > 1e-9;

  ui.specBase.textContent = baseThickness !== null
    ? `${baseMaterialLabel(item?.baseMaterial || flooringData?.meta?.baseMaterial)} · ${number.format(baseThickness)} мм${nonstandardBaseThickness ? "*" : ""}`
    : "—";
  ui.specBaseNote.classList.toggle("is-hidden", !nonstandardBaseThickness);
  const materialTypeId = item?.materialType || form.materialType.value;
  const speciesValue = form.species.value.trim();
  const speciesMatch = exactSpeciesItem();
  const multishpon = speciesMatch?.materialType === "multishpon";
  const multishponParts = Core.splitMultishponName(flooringData, speciesValue);

  ui.specMaterialType.textContent = item?.materialTypeName || (form.materialType.value ? form.materialType.options[form.materialType.selectedIndex].text : "—");
  ui.specMaterialTypeRow.classList.remove("is-hidden");
  ui.specSpeciesNameRow.classList.toggle("is-hidden", !multishpon);

  if (multishpon) {
    ui.specSpeciesLabel.textContent = "Коллекция";
    ui.specSpecies.textContent = multishponParts.collection || "—";
    ui.specSpeciesName.textContent = multishponParts.name || "—";
  } else {
    ui.specSpeciesLabel.textContent = materialTypeId === "design"
      ? "Порода дерева и оттенок"
      : materialTypeId === "natural"
        ? "Порода дерева"
        : "Наименование шпона";
    ui.specSpecies.textContent = speciesValue || "—";
    ui.specSpeciesName.textContent = "—";
  }

  ui.specTopLayer.textContent = form.topLayer.value || "—";
  ui.specThickness.textContent = totalThickness !== null ? `${number.format(totalThickness)} мм` : "—";
  ui.specConnection.textContent = connectionTypeForLength(form.length.value);
  ui.specSorting.textContent = "Селект+";
  const patternTypeValue = form.patternType.value;
  const showPatternType = Boolean(
    speciesMatch &&
    speciesMatch.materialType !== "multishpon" &&
    patternTypeValue
  );
  ui.specPatternTypeRow.classList.toggle("is-hidden", !showPatternType);
  ui.specPatternType.textContent = showPatternType ? patternTypeValue : "—";
  ui.specPattern.textContent = pattern?.name || "—";

  const effectiveAngle = effectivePatternAngle(pattern);
  const showAngle = pattern?.id === "french_herringbone" || pattern?.id === "hungarian_herringbone";
  ui.specAngleRow.classList.toggle("is-hidden", !showAngle);
  ui.specAngle.textContent = effectiveAngle !== null ? `${effectiveAngle}°` : "—";
  ui.specWidth.textContent = form.width.value ? `${number.format(Number(form.width.value))} мм` : "—";
  ui.specLength.textContent = form.length.value ? `${number.format(Number(form.length.value))} мм` : "—";
  ui.specChamfer.textContent = chamferLabel(form.topLayer.value);

  ui.specCustomPatternRow.classList.toggle("is-hidden", !pattern?.requiresDescription);
  ui.specCustomPattern.textContent = form.customPattern.value.trim() || "—";
  const customPatternFiles = getUploadedFiles(form.customPatternFile);
  ui.specCustomPatternFileRow.classList.toggle("is-hidden", !pattern?.requiresDescription || !customPatternFiles.length);
  ui.specCustomPatternFile.textContent = customPatternFiles.length ? customPatternFiles.map((file) => file.name).join(", ") : "—";

  ui.specCoating.textContent = coating?.id === "oil"
    ? "3 слоя твёрдого воск-масла, матовое"
    : coating?.name || "—";
  const showGloss = Boolean(coating?.glossRequired);
  ui.specGlossRow.classList.toggle("is-hidden", !showGloss);
  ui.specGloss.textContent = showGloss && form.gloss.value ? `${number.format(Number(form.gloss.value))}%` : "—";

  ui.specBaseArea.textContent = form.boardArea.value ? `${number.format(Number(form.boardArea.value))} м²` : "—";
  ui.specWaste.textContent = form.waste.value ? `${number.format(Number(form.waste.value))}%` : form.waste.value === "0" ? "0%" : "—";
  ui.specAreaWithWaste.textContent = calc
    ? `${number.format(calc.areaWithWaste)} м²`
    : priceArea() !== null ? `${number.format(priceArea())} м²` : "—";

  const commentValue = form.comment.value.trim();
  ui.specCommentRow.classList.toggle("is-hidden", !commentValue);
  ui.specComment.textContent = commentValue || "—";
  ui.specFilesRow.classList.toggle("is-hidden", !files.length);
  ui.specFiles.textContent = files.length ? files.join(", ") : "—";
  ui.specUnderfloorHeating.textContent = Core.underfloorHeatingLabel(form.topLayer.value);

  ui.specFinalUnitPrice.textContent = calc ? `${Core.formatMoney(calc.finalUnitPrice)}/м²` : "—";

  ui.specTotal.textContent = calc ? Core.formatMoney(calc.total) : "—";
  ui.specVat.textContent = calc ? `В том числе НДС 22%: ${Core.formatMoney(calc.vat)}` : "В том числе НДС 22%: —";

  ui.priceStatus.textContent = "";
  ui.priceStatus.classList.add("is-hidden");

  ui.addToSpecButton.disabled = false;
}

function validateMaterialFields() {
  const speciesMatch =
    exactSpeciesItem();

  const speciesError =
    !speciesMatch &&
    shouldShowError("species", Boolean(form.species.value.trim()))
      ? form.species.value.trim()
        ? "Выберите точное наименование из справочника."
        : "Выберите наименование шпона."
      : "";

  setFieldError(
    "species",
    speciesError
  );

  const topLayerError =
    speciesMatch &&
    !form.topLayer.value &&
    shouldShowError("topLayer")
      ? "Выберите верхний слой."
      : "";

  setFieldError(
    "topLayer",
    topLayerError
  );

  setFieldError("patternType", "");

}

function validateNonPriceFields() {
  const pattern = selectedPattern();

  const patternError =
    !pattern && shouldShowError("pattern")
      ? "Выберите раскладку."
      : "";

  setFieldError("pattern", patternError);

  let widthValid = false;
  let lengthValid = false;
  let angleValid = true;
  let customPatternValid = true;

  if (pattern) {
    widthValid = validateNumber(
      form.width,
      "width",
      pattern.limits.minWidth,
      pattern.limits.maxWidth,
      "Ширина",
      true
    );

    lengthValid = validateNumber(
      form.length,
      "length",
      pattern.limits.minLength,
      pattern.limits.maxLength,
      "Длина",
      true
    );

    if (pattern.angles?.length) {
      angleValid =
        pattern.angles.includes(Number(form.angle.value));

      const angleError =
        !angleValid && shouldShowError("angle")
          ? `Выберите угол: ${pattern.angles.join("°, ")}°.`
          : "";

      setFieldError("angle", angleError);
    } else {
      setFieldError("angle", "");
    }

    if (pattern.requiresDescription) {
      customPatternValid =
        Boolean(form.customPattern.value.trim()) || getUploadedFiles(form.customPatternFile).length > 0;

      const descriptionError =
        !customPatternValid &&
        shouldShowError("customPattern")
          ? "Добавьте описание раскладки или приложите файл."
          : "";

      setFieldError("customPattern", descriptionError);
    } else {
      setFieldError("customPattern", "");
    }
  } else {
    ["width", "length", "angle", "customPattern"].forEach(
      (key) => setFieldError(key, "")
    );
  }

  const coating = selectedCoating();

  const coatingValid = Boolean(coating);
  const coatingError =
    !coatingValid && shouldShowError("coating")
      ? "Выберите покрытие."
      : "";

  setFieldError("coating", coatingError);

  let glossValid = true;

  if (coating?.glossRequired) {
    glossValid = validGlossValue(coating);
    setFieldError(
      "gloss",
      !glossValid && shouldShowError("gloss")
        ? "Степень блеска: выберите значение."
        : ""
    );
  } else {
    setFieldError("gloss", "");
  }

  return {
    patternValid: Boolean(pattern),
    widthValid,
    lengthValid,
    angleValid,
    customPatternValid,
    coatingValid,
    glossValid
  };
}

function fileIdentity(file) {
  return [
    file.name,
    file.size,
    file.type,
    file.lastModified
  ].join("::");
}

function getUploadedFiles(input) {
  const stored = uploadedFilesState.get(input);
  return stored ? [...stored] : [...input.files];
}

function setUploadedFiles(input, files) {
  const nextFiles = [...files];
  uploadedFilesState.set(input, nextFiles);

  try {
    const transfer = new DataTransfer();
    nextFiles.forEach((file) => transfer.items.add(file));
    input.files = transfer.files;
  } catch {
    // Состояние всё равно хранится в uploadedFilesState.
  }
}

function appendUploadedFiles(input, files) {
  const current = getUploadedFiles(input);
  const existing = new Set(current.map(fileIdentity));

  files.forEach((file) => {
    const key = fileIdentity(file);
    if (existing.has(key)) return;
    existing.add(key);
    current.push(file);
  });

  setUploadedFiles(input, current);
}

function removeUploadedFile(input, index) {
  const nextFiles = getUploadedFiles(input).filter((_, fileIndex) => fileIndex !== index);
  setUploadedFiles(input, nextFiles);
}

function serializeUploadedFiles(input) {
  return getUploadedFiles(input).map((file) => ({
    name: file.name,
    size: file.size,
    type: file.type
  }));
}

function renderUploadedFiles(
  input,
  output,
  emptyText = "Файлы не выбраны",
  hideWhenEmpty = false
) {
  const files = getUploadedFiles(input);

  output.innerHTML = "";
  output.classList.toggle("is-hidden", hideWhenEmpty && !files.length);

  if (!files.length) {
    output.textContent = emptyText;
    return;
  }

  files.forEach((file, index) => {
    const tag = document.createElement("span");
    tag.className = "uploaded-file";

    const name = document.createElement("span");
    name.className = "uploaded-file__name";
    name.textContent = file.name;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "uploaded-file__remove";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `Удалить файл ${file.name}`);
    removeButton.addEventListener("click", () => {
      removeUploadedFile(input, index);
      renderUploadedFiles(input, output, emptyText, hideWhenEmpty);
      renderAll();
    });

    tag.append(name, removeButton);
    output.append(tag);
  });
}

function bindFileInput(input, output, hideWhenEmpty = false) {
  setUploadedFiles(input, getUploadedFiles(input));
  renderUploadedFiles(input, output, "Файлы не выбраны", hideWhenEmpty);

  input.addEventListener("change", () => {
    const selectedNow = [...input.files];
    appendUploadedFiles(input, selectedNow);
    renderUploadedFiles(input, output, "Файлы не выбраны", hideWhenEmpty);
    renderAll();
  });
}

function renderAll() {
  if (!flooringData) {
    return;
  }

  renderBaseSummary();
  updateAutomaticPricingAdjustments();
  updateGlossHint();
  validateMaterialFields();
  validateNonPriceFields();
  updateUnitPriceHint();
  renderSpecification();

  const width = Number(form.width.value);

  ui.widthWarning.classList.toggle(
    "is-hidden",
    !width ||
      width <= flooringData.meta
        .generalDimensions
        .managerCheckWidth
  );

  const area = Number(form.boardArea.value);
  const waste = Number(form.waste.value);
  const totalArea = priceArea();

  if (totalArea !== null) {
    ui.areaWithWasteValue.textContent =
      `${number.format(totalArea)} м²`;

    ui.areaWithWasteFormula.textContent =
      `${number.format(area)} м² + ${number.format(waste)}% запаса на укладку`;
  } else {
    ui.areaWithWasteValue.textContent = "—";
    ui.areaWithWasteFormula.textContent =
      selectedPattern()
        ? "Укажите площадь помещения."
        : "Сначала выберите раскладку.";
  }
}

function buildSavedPosition(calc) {
  const item = calc.item;
  const pattern = selectedPattern();
  const coating = selectedCoating();
  const baseThickness = currentBaseThickness();
  const totalThickness = Core.totalThickness(flooringData, item, baseThickness);

  return {
    productType: "flooring",
    itemId: item.id,
    materialCode: item.id,
    materialType: item.materialTypeName,
    species: item.species,
    topLayer: item.topLayer,
    base: item.baseMaterial || flooringData.meta.baseMaterial,
    baseThickness,
    totalThickness,
    connection: connectionTypeForLength(form.length.value, null),
    sorting: item.sorting || "Select+",
    patternType: form.patternType.value || null,
    patternId: pattern?.id || null,
    patternName: pattern?.name || null,
    angle: effectivePatternAngle(pattern),
    width: form.width.value ? Number(form.width.value) : null,
    length: form.length.value ? Number(form.length.value) : null,
    chamfer: chamferLabel(item.topLayer),
    customPatternDescription: form.customPattern.value.trim() || null,
    customPatternFile: serializeUploadedFiles(form.customPatternFile),
    coatingId: coating?.id || null,
    coatingName: coating?.id === "oil"
      ? "3 слоя твёрдого воск-масла, матовое"
      : coating?.name || null,
    gloss: form.gloss.value ? Number(form.gloss.value) : null,
    baseArea: Number(form.boardArea.value),
    wastePercent: Number(form.waste.value),
    areaWithWaste: calc.areaWithWaste,
    catalogPrice: Core.catalogPrice(item),
    unitPrice: calc.unitPrice,
    priceStatus: item.priceStatus || "fixed",
    priceChangedManually: false, // Расширенные ручные ценовые права временно отключены.
    basePriceChangedManually: false,
    clientType: form.clientType.value,
    loyaltyTier: form.clientType.value === "dealer" ? null : form.loyalty.value,
    dealerCategory: form.clientType.value === "dealer" ? form.loyalty.value : null,
    pricingTier: calc.tier,
    markups: calc.markups,
    discountPercent: calc.discountPercent,
    markupPercent: calc.markupPercent,
    baseCost: calc.baseCost,
    discountAmount: calc.discountAmount,
    markupAmount: calc.markupAmount,
    automaticFinalUnitPrice: calc.automaticFinalUnitPrice,
    finalUnitPrice: calc.finalUnitPrice,
    total: calc.total,
    vat: calc.vat,
    comment: form.comment.value.trim(),
    files: serializeUploadedFiles(form.files),
    createdAt: new Date().toISOString(),
    editorState: exportFlooringState(),
    specification: {characteristics: window.WoodstockSpecificationState.details(document.querySelector('.spec-groups')), knownTotal:calc.total,knownVat:calc.vat}
  };
}

function validNumberValue(input, min, max = Infinity, step = null) {
  const value = Number(input.value);

  return (
    input.value.trim() !== "" &&
    Number.isFinite(value) &&
    value >= min &&
    (
      !Number.isFinite(max) ||
      value <= max
    ) &&
    matchesStep(value, min, step)
  );
}

function requiredFieldIssues() {
  const issues = [];
  const species = exactSpeciesItem();
  const pattern = selectedPattern();
  const coating = selectedCoating();

  if (!species) {
    issues.push({ key: "species", label: "наименование шпона", input: form.species });
  } else if (!form.topLayer.value || !exactProductItem()) {
    issues.push({ key: "topLayer", label: "верхний слой", input: form.topLayer });
  }

  if (customBaseEnabled && !validNumberValue(
    form.baseThickness,
    BASE_THICKNESS_MIN,
    BASE_THICKNESS_MAX,
    BASE_THICKNESS_STEP
  )) {
    issues.push({ key: "baseThickness", label: "толщину нижнего слоя", input: form.baseThickness });
  }

  if (!pattern) {
    issues.push({ key: "pattern", label: "раскладку", input: form.pattern });
  } else {
    if (pattern.angles?.length && !pattern.angles.includes(Number(form.angle.value))) {
      issues.push({ key: "angle", label: "угол торцевого реза", input: form.angle });
    }
    if (pattern.requiresDescription && !form.customPattern.value.trim() && getUploadedFiles(form.customPatternFile).length === 0) {
      issues.push({ key: "customPattern", label: "описание раскладки или файл", input: form.customPattern });
    }
    if (!validNumberValue(form.width, pattern.limits.minWidth, pattern.limits.maxWidth)) {
      issues.push({ key: "width", label: "ширину", input: form.width });
    }
    if (!validNumberValue(form.length, pattern.limits.minLength, pattern.limits.maxLength)) {
      issues.push({ key: "length", label: "длину", input: form.length });
    }
  }

  if (!validNumberValue(form.boardArea, 0.01)) {
    issues.push({ key: "boardArea", label: "площадь помещения", input: form.boardArea });
  }
  if (!validNumberValue(form.waste, 0, 30)) {
    issues.push({ key: "waste", label: "запас на укладку", input: form.waste });
  }

  if (!coating) {
    issues.push({ key: "coating", label: "покрытие", input: form.coating });
  } else if (coating.glossRequired && !validGlossValue(coating)) {
    issues.push({ key: "gloss", label: "степень блеска", input: form.gloss });
  }

  if (customPriceEnabled) {
    const custom = parseCustomPrice();
    if (!Number.isFinite(custom) || custom <= 0) {
      issues.push({ key: "customPrice", label: "цену для расчёта", input: form.customPrice });
    }
  } else if (!pricingBasePrice()) {
    issues.push({ key: "customPrice", label: "цену для расчёта", input: form.customPrice });
  }

  return issues;
}

function focusFirstIssue(issue) {
  const [field] = validation[issue.key] || [];
  const target = field || issue.input;

  target?.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

  window.setTimeout(() => {
    if (!issue.input?.disabled) {
      issue.input?.focus({
        preventScroll: true
      });
    }
  }, 350);
}

function addToSpecification() {
  addAttempted = true;

  renderAll();

  const issues =
    requiredFieldIssues();

  const calc =
    calculatePrice();

  if (!calc || issues.length) {
    ui.saveStatus.textContent =
      issues.length
        ? `Заполните: ${issues.map((issue) => issue.label).join(", ")}.`
        : "Проверьте обязательные поля расчёта.";

    if (issues[0]) {
      focusFirstIssue(issues[0]);
    }

    return;
  }

  addAttempted = false;
  touchedFields.clear();

  window.WoodstockSpecificationState.save(buildSavedPosition(calc));
}

function exportFlooringState() {
  return window.WoodstockSpecificationState.clone({version:1,
    form:window.WoodstockSpecificationState.snapshot(document.querySelector('.calc-form'),getUploadedFiles),
    currentItem,customBaseEnabled,selectedSurcharges:[...selectedSurcharges],
    selectedSpeciesName,selectedTopLayerValue,clientConditionId,dealerCategoryId,pricingConditionType,
    activeTierKey,tierDiscountOverride,markupOverrides:[...markupOverrides]
  });
}
function restoreFlooringState(state) {
  if(state?.version!==1)throw new Error('У позиции отсутствуют данные для редактирования.');
  window.WoodstockSpecificationState.restore(document.querySelector('.calc-form'),state.form,(input,files)=>uploadedFilesState.set(input,files));
  currentItem=state.currentItem;customBaseEnabled=state.customBaseEnabled;selectedSurcharges=new Set(state.selectedSurcharges);
  selectedSpeciesName=state.selectedSpeciesName;selectedTopLayerValue=state.selectedTopLayerValue;
  clientConditionId=state.clientConditionId;dealerCategoryId=state.dealerCategoryId;pricingConditionType=state.pricingConditionType;
  activeTierKey=state.activeTierKey;tierDiscountOverride=state.tierDiscountOverride;
  markupOverrides.clear();state.markupOverrides.forEach(([key,value])=>markupOverrides.set(key,value));
  renderUploadedFiles(form.files,ui.selectedFiles,"Файлы не выбраны",true);
  renderUploadedFiles(form.customPatternFile,ui.customPatternFileName,"Файлы не выбраны",true);
  renderSelectionSurcharges();renderAll();
}
function restoreFlooringRecord(record) {
  if(record.editorState){restoreFlooringState(record.editorState);return;}
  const set=(node,value,event='change')=>{if(!node||value===undefined||value===null)return;node.value=String(value);node.dispatchEvent(new Event(event,{bubbles:true}));};
  const item=flooringData.items.find(item=>item.id===record.itemId||item.id===record.materialCode);
  set(form.materialType,item?.materialType);set(form.species,record.species,'input');set(form.topLayer,record.topLayer);
  set(form.patternType,record.patternType);set(form.pattern,record.patternId);set(form.angle,record.angle);
  set(form.width,record.width,'input');set(form.length,record.length,'input');
  if(record.baseThickness!==undefined&&record.baseThickness!==12){customBaseEnabled=true;ui.customBaseThicknessField.classList.remove('is-hidden');set(form.baseThickness,record.baseThickness,'input');}
  set(form.boardArea,record.baseArea,'input');set(form.waste,record.wastePercent,'input');
  set(form.coating,record.coatingId);set(form.gloss,record.gloss,'input');
  set(form.customPattern,record.customPatternDescription||'','input');
  uploadedFilesState.set(form.customPatternFile,(record.customPatternFile||[]).map(file=>typeof file==='string'?{name:file}:file));
  uploadedFilesState.set(form.files,(record.files||[]).map(file=>typeof file==='string'?{name:file}:file));
  set(form.comment,record.comment||'','input');set(form.loyalty,record.loyaltyTier||record.dealerCategory);
  selectedSurcharges=new Set((record.markups||[]).filter(item=>['length','visual','selection:length','selection:visual'].includes(item.id)).map(item=>item.id.replace('selection:','')));
  renderUploadedFiles(form.files,ui.selectedFiles,"Файлы не выбраны",true);
  renderUploadedFiles(form.customPatternFile,ui.customPatternFileName,"Файлы не выбраны",true);
  renderSelectionSurcharges();renderAll();
}
function captureFlooringPosition() {
  addAttempted=true;renderAll();
  const issues=requiredFieldIssues(),calc=calculatePrice();
  if(issues.length||!calc){ui.saveStatus.textContent='Заполните: '+issues.map(issue=>issue.label).join(', ');if(issues[0])focusFirstIssue(issues[0]);return null;}
  return buildSavedPosition(calc);
}

async function init() {
  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error(`Не удалось загрузить данные: ${response.status}`);
  flooringData = await response.json();
  syncPricingConditionField();

  veneerSelector = Core.createVeneerSelector({
    data: flooringData,
    materialTypeSelect: form.materialType,
    speciesInput: form.species,
    clearButton: form.speciesClear,
    suggestions: ui.speciesSuggestions,
    focusAfterSelect: form.topLayer,
    onChange: ({ reason }) => {
      if (reason === "type-change") {
        touchedFields.delete("species");
        touchedFields.delete("topLayer");
        touchedFields.delete("unitPrice");
        touchedFields.delete("finalUnitPrice");
      }
      applySpeciesSelection();
    }
  });
  updatePatternTypeField();
  fillTopLayerOptions();
  refreshSpeciesOptions();
  fillPatternsAndCoatings();
  resetSortingSelection();
  updateSpeciesClearButton();
  renderBaseSummary();

  form.topLayer.addEventListener("change", () => {
    refreshSpeciesOptions();
    applyTopLayerSelection();
  });
  form.patternType.addEventListener("change", renderAll);

  form.baseThicknessToggle.addEventListener("click", () => {
    customBaseEnabled = !customBaseEnabled;
    ui.customBaseThicknessField.classList.toggle("is-hidden", !customBaseEnabled);
    form.baseThicknessToggle.setAttribute("aria-expanded", String(customBaseEnabled));
    form.baseThicknessToggle.textContent = customBaseEnabled ? "Вернуть стандартную толщину 12 мм" : "Указать другую толщину нижнего слоя";
    if (!customBaseEnabled) {
      form.baseThickness.value = "";
      markupOverrides.delete("baseThickness");
      touchedFields.delete("baseThickness");
      setFieldError("baseThickness", "");
    }
    renderAll();
    if (customBaseEnabled) form.baseThickness.focus();
  });

  // Расширенные права (переключение Клиент / Дилер) временно отключены.
  /*
  form.clientType.addEventListener("change", () => {
    rememberPricingConditionSelection(pricingConditionType);
    syncPricingConditionField();
    tierDiscountOverride = null;
    activeTierKey = "";
    renderAll();
  });
  */
  form.loyalty.addEventListener("change", () => {
    rememberPricingConditionSelection(form.clientType.value || "client");
    tierDiscountOverride = null;
    activeTierKey = "";
    renderAll();
  });

  // Расширенные права (ручная цена) временно отключены до личного кабинета / ролевой модели.
  /*
  form.customPriceToggle.addEventListener("click", () => {
    if (!currentItem) return;
    customPriceEnabled = true;
    touchedFields.delete("customPrice");
    setFieldError("customPrice", "");
    renderAll();
    form.customPrice.focus();
  });

  form.customPrice.addEventListener("input", () => {
    const sanitized = sanitizeCustomPriceValue(form.customPrice.value);
    if (form.customPrice.value !== sanitized) {
      form.customPrice.value = sanitized;
    }
    renderAll();
  });
  form.customPrice.addEventListener("blur", () => {
    const raw = form.customPrice.value.trim();
    const value = parseCustomPrice();
    if (raw && (!Number.isFinite(value) || value <= 0)) {
      markFieldTouched("customPrice");
    } else {
      touchedFields.delete("customPrice");
    }
    if (Number.isFinite(value) && value > 0) setCustomPriceValue(value);
    renderAll();
  });
  form.resetCustomPrice.addEventListener("click", () => {
    customPriceEnabled = false;
    form.customPrice.value = "";
    touchedFields.delete("customPrice");
    setFieldError("customPrice", "");
    renderAll();
  });
  */

  form.baseThickness.addEventListener("input", renderAll);

  form.pattern.addEventListener("change", applyPattern);
  form.coating.addEventListener("change", applyCoating);

  bindFileInput(form.customPatternFile, ui.customPatternFileName, true);
  form.customPatternFile.addEventListener("change", renderAll);
  bindFileInput(form.files, ui.selectedFiles, true);
  ui.addToSpecButton.addEventListener("click", addToSpecification);

  [
    form.width,
    form.length,
    form.customPattern,
    form.boardArea,
    form.waste,
    form.gloss,
    form.comment,
    form.angle
  ].forEach((input) => {
    input.addEventListener("input", renderAll);
    input.addEventListener("change", renderAll);
  });

  form.species.addEventListener("blur", () => {
    const hasValue = Boolean(form.species.value.trim());
    if (hasValue && !exactSpeciesItem()) {
      markFieldTouched("species");
    } else {
      touchedFields.delete("species");
    }
    applySpeciesSelection();
  });
  form.topLayer.addEventListener("blur", applyTopLayerSelection);

  form.width.addEventListener("blur", () => {
    const pattern = selectedPattern();
    if (pattern) clampOnBlur(form.width, "width", pattern.limits.minWidth, pattern.limits.maxWidth, "Ширина");
  });
  form.length.addEventListener("blur", () => {
    const pattern = selectedPattern();
    if (pattern) clampOnBlur(form.length, "length", pattern.limits.minLength, pattern.limits.maxLength, "Длина");
  });
  form.boardArea.addEventListener("blur", () => clampOnBlur(form.boardArea, "boardArea", 0.01, Infinity, "Площадь помещения"));
  form.waste.addEventListener("blur", () => clampOnBlur(form.waste, "waste", 0, 30, "Запас на укладку"));
  form.baseThickness.addEventListener("blur", () => {
    if (customBaseEnabled) {
      clampOnBlur(
        form.baseThickness,
        "baseThickness",
        BASE_THICKNESS_MIN,
        BASE_THICKNESS_MAX,
        "Толщина нижнего слоя",
        BASE_THICKNESS_STEP
      );
    }
  });

  renderAll();
}


const flooringReady = init();
window.WoodstockFlooringController = {ready:flooringReady,result:calculatePrice,restoreRecord:restoreFlooringRecord,restoreState:restoreFlooringState,exportState:exportFlooringState,capture:captureFlooringPosition};
flooringReady.catch((error) => {
  console.error(error);
  ui.priceStatus.classList.remove("is-hidden");
  ui.priceStatus.textContent = "Не удалось загрузить данные расчёта. Обновите страницу или обратитесь к менеджеру.";
});