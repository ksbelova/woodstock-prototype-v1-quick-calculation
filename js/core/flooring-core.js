"use strict";

(function attachFlooringCore(global) {
  const RU_LOCALE = "ru-RU";

  const normalizeText = (value) => String(value ?? "").trim().toLocaleLowerCase(RU_LOCALE);

  const round = (value, digits = 2) => {
    const factor = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  };

  const money = new Intl.NumberFormat(RU_LOCALE, {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  const editableMoney = new Intl.NumberFormat(RU_LOCALE, {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  function parseLocalizedNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const normalized = String(value ?? "")
      .replace(/[\s\u00A0\u202F]/g, "")
      .replace(/₽/g, "")
      .replace(",", ".")
      .replace(/[^0-9.+-]/g, "");
    if (!normalized || normalized === "." || normalized === "+" || normalized === "-") return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatEditableMoney(value) {
    const parsed = parseLocalizedNumber(value);
    return parsed === null ? "" : editableMoney.format(parsed);
  }

  function formatMoney(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? money.format(parsed) : "—";
  }

  function formatPercent(value, digits = 2) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "—";
    return `${new Intl.NumberFormat(RU_LOCALE, { maximumFractionDigits: digits }).format(parsed)}%`;
  }

  function priceArea(baseArea, wastePercent) {
    const area = Number(baseArea);
    const waste = Number(wastePercent);
    if (!Number.isFinite(area) || area <= 0 || !Number.isFinite(waste) || waste < 0) return null;
    return round(area * (1 + waste / 100), 2);
  }

  function catalogPrice(item) {
    if (!item) return null;
    const retail = Number(item?.prices?.retail);
    if (Number.isFinite(retail) && retail > 0) return retail;
    const fallback = Number(item?.pricePerM2);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
  }

  function standardTopLayerThickness(itemOrValue) {
    const value = typeof itemOrValue === "object" ? itemOrValue?.topLayer : itemOrValue;
    const parsed = Number(String(value ?? "").replace(",", ".").replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function totalThickness(data, item, baseThicknessMm = null) {
    const base = Number(baseThicknessMm ?? data?.meta?.baseThicknessMm ?? 12);
    const top = standardTopLayerThickness(item);
    if (!Number.isFinite(base) || base <= 0 || top === null) return null;
    return round(base + top, 2);
  }

  function underfloorHeatingLabel(itemOrValue) {
    const rawValue = typeof itemOrValue === "object" ? itemOrValue?.topLayer : itemOrValue;
    if (!String(rawValue ?? "").trim()) return "—";
    const top = standardTopLayerThickness(rawValue);
    if (top === null) return "—";
    return Math.abs(top - 0.6) < 1e-9 ? "Нет" : "Да";
  }

  function automaticVolumeDiscountPercent(data, area) {
    const value = Number(area);
    if (!Number.isFinite(value)) return 0;
    const scale = data?.meta?.pricing?.discountScale || [];
    const tier = scale.find((row) => (
      value >= Number(row.minArea ?? 0) &&
      (row.maxArea === null || row.maxArea === undefined || value <= Number(row.maxArea))
    ));
    return Number(tier?.percent || 0);
  }

  function loyaltyTier(data, tierId) {
    const tiers = data?.meta?.pricing?.loyaltyTiers || [];
    return tiers.find((tier) => tier.id === tierId) || tiers[0] || {
      id: "retail",
      name: "Розничная цена",
      percent: 0
    };
  }

  function clientPricingTier(data, area, loyaltyTierId = "retail") {
    const threshold = Number(data?.meta?.pricing?.smallOrderThresholdM2 || 20);
    const value = Number(area);
    const loyalty = loyaltyTier(data, loyaltyTierId);
    const loyaltyPercent = Number(loyalty.percent || 0);
    const volumePercent = Number.isFinite(value) && value >= threshold
      ? automaticVolumeDiscountPercent(data, value)
      : 0;
    const maxDiscount = Number(data?.meta?.pricing?.maxDiscountPercent || 20);
    const percent = Math.min(Math.max(volumePercent, loyaltyPercent), maxDiscount);
    let source = "retail";
    if (percent > 0) {
      if (volumePercent > loyaltyPercent) source = "volume";
      else if (loyaltyPercent > volumePercent) source = "loyalty";
      else source = "volumeAndLoyalty";
    }
    return {
      id: `client_${source}`,
      name: percent ? `Скидка ${percent}%` : "Розничная цена",
      coefficient: 1 - percent / 100,
      discountPercent: percent,
      volumePercent,
      loyaltyPercent,
      loyaltyName: loyalty.name,
      source
    };
  }

  function dealerPricingTier(data, tierId = "dealer_retail") {
    const tiers = data?.meta?.pricing?.dealerTiers || [];
    const tier = tiers.find((row) => row.id === tierId)
      || tiers.find((row) => row.id === "dealer_retail")
      || tiers[0];
    if (!tier) return { id: "dealer_retail", name: "Розничная цена", coefficient: 1, discountPercent: 0 };
    const discountPercent = Number(tier.discountPercent || 0);
    const coefficient = Number.isFinite(Number(tier.coefficient))
      ? Number(tier.coefficient)
      : 1 - discountPercent / 100;
    return {
      ...tier,
      coefficient,
      discountPercent
    };
  }

  function pricingTier(data, area, clientType = "client", pricingConditionId = "retail") {
    return clientType === "dealer"
      ? dealerPricingTier(data, pricingConditionId)
      : clientPricingTier(data, area, pricingConditionId);
  }

  function smallOrderMarkup(data, area) {
    const value = Number(area);
    const threshold = Number(data?.meta?.pricing?.smallOrderThresholdM2 || 20);
    if (!Number.isFinite(value) || value >= threshold) return 0;
    return Number(data?.meta?.pricing?.defaultSmallOrderMarkupPercent || 0);
  }

  function selectionSurchargeOptions(data, item) {
    if (!item) return [];
    const definitions = data?.meta?.pricing?.selectionSurchargeDefinitions || {};
    return Object.values(definitions)
      .filter((option) => Number.isFinite(Number(option?.percent)) && Number(option.percent) > 0)
      .map((option) => ({
        id: option.id,
        name: option.name || option.id,
        percent: Number(option.percent)
      }));
  }

  function quickCoatingOptions(data) {
    return (data?.coatings || []).map((coating) => {
      const defaultGloss = coating.glossRequired
        ? Number(coating.defaultGloss ?? data?.meta?.quickCalculation?.fixedGlossPercent ?? 10)
        : null;

      return {
        id: coating.id,
        name: coating.glossRequired
          ? `${coating.name} — ${defaultGloss}% блеска`
          : coating.name,
        gloss: defaultGloss,
        sourceName: coating.name
      };
    });
  }

  function calculatePricing({
    data,
    retailPrice,
    areaWithWaste,
    tierCoefficient = 1,
    markups = [],
    finalUnitPriceOverride = null
  }) {
    const retail = Number(retailPrice);
    const area = Number(areaWithWaste);
    const coefficient = Number(tierCoefficient);
    if (![retail, area, coefficient].every(Number.isFinite) || retail <= 0 || area <= 0 || coefficient <= 0) return null;

    const normalizedMarkups = (markups || [])
      .map((row) => ({ ...row, percent: Number(row.percent || 0) }))
      .filter((row) => Number.isFinite(row.percent) && row.percent > 0);
    const markupPercent = normalizedMarkups.reduce((sum, row) => sum + row.percent, 0);

    // Порядок согласован для Woodstock:
    // 1) точная розничная цена;
    // 2) клиентская/дилерская ценовая категория;
    // 3) сумма всех применимых надбавок к полученной отпускной цене.
    const priceAfterTierRaw = retail * coefficient;
    const automaticFinalUnitPriceRaw = priceAfterTierRaw * (1 + markupPercent / 100);
    const override = Number(finalUnitPriceOverride);
    const hasOverride = Number.isFinite(override) && override > 0;
    const finalUnitPriceRaw = hasOverride ? override : automaticFinalUnitPriceRaw;

    const retailCostRaw = area * retail;
    const priceAfterTierCostRaw = area * priceAfterTierRaw;
    const automaticTotalRaw = area * automaticFinalUnitPriceRaw;
    const totalRaw = area * finalUnitPriceRaw;
    const vatRate = Number(data?.meta?.vatRate || 0.22);
    const vatRaw = totalRaw * vatRate / (1 + vatRate);

    return {
      retailPriceRaw: retail,
      tierCoefficient: coefficient,
      priceAfterTierRaw,
      markupPercent,
      markups: normalizedMarkups,
      automaticFinalUnitPriceRaw,
      finalUnitPriceRaw,
      manualPrice: hasOverride,
      retailCostRaw,
      priceAfterTierCostRaw,
      automaticTotalRaw,
      totalRaw,
      vatRaw,
      tierAdjustmentAmountRaw: priceAfterTierCostRaw - retailCostRaw,
      markupAmountRaw: automaticTotalRaw - priceAfterTierCostRaw,
      manualAdjustmentAmountRaw: totalRaw - automaticTotalRaw
    };
  }

  function minimumClientFinalPrice(data, retailPrice, markups = []) {
    const retail = Number(retailPrice);
    if (!Number.isFinite(retail) || retail <= 0) return null;
    const maxDiscount = Number(data?.meta?.pricing?.maxDiscountPercent || 20);
    const markupPercent = (markups || []).reduce((sum, row) => sum + Number(row.percent || 0), 0);
    return retail * (1 - maxDiscount / 100) * (1 + markupPercent / 100);
  }

  function veneerMaterialTypes(data) {
    const map = new Map();
    (data?.items || []).forEach((item) => {
      if (!item?.materialType) return;
      if (!map.has(item.materialType)) {
        map.set(item.materialType, item.materialTypeName || item.materialType);
      }
    });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }

  function splitMultishponName(data, value) {
    const fullName = String(value || "").trim();
    const collections = [...(data?.meta?.multishponCollections || [])]
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    const collection = collections.find((item) => (
      fullName === item || fullName.startsWith(`${item} `)
    )) || "";

    return {
      collection,
      name: collection
        ? fullName.slice(collection.length).trim()
        : fullName
    };
  }

  function createVeneerSelector({
    data,
    materialTypeSelect,
    speciesInput,
    clearButton,
    suggestions,
    emptyText = "Совпадений не найдено",
    focusAfterSelect = null,
    onChange = null
  }) {
    const sourceItems = data?.items || [];
    const field = speciesInput?.closest?.(".autocomplete-field") || null;

    function fillMaterialTypes() {
      if (!materialTypeSelect) return;
      const currentValue = materialTypeSelect.value;
      materialTypeSelect.replaceChildren(new Option("Выберите тип шпона", ""));
      veneerMaterialTypes(data).forEach((item) => {
        materialTypeSelect.append(new Option(item.name, item.id));
      });
      if ([...materialTypeSelect.options].some((option) => option.value === currentValue)) {
        materialTypeSelect.value = currentValue;
      }
    }

    function itemsForCurrentType() {
      const type = materialTypeSelect?.value || "";
      return sourceItems.filter((item) => !type || item.materialType === type);
    }

    function exactItem() {
      const name = normalizeText(speciesInput?.value);
      if (!name) return null;
      return itemsForCurrentType().find((item) => normalizeText(item.species) === name) || null;
    }

    function selectedProducts() {
      const name = normalizeText(speciesInput?.value);
      if (!name) return [];
      return itemsForCurrentType().filter((item) => normalizeText(item.species) === name);
    }

    function availableNames() {
      return [...new Set(itemsForCurrentType().map((item) => item.species).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "ru"));
    }

    function updateClearButton() {
      clearButton?.classList.toggle("is-hidden", !speciesInput?.value?.trim());
    }

    function closeSuggestions() {
      if (!suggestions || !speciesInput) return;
      suggestions.classList.add("is-hidden");
      suggestions.replaceChildren();
      speciesInput.setAttribute("aria-expanded", "false");
    }

    function notify(reason, details = {}) {
      onChange?.({
        reason,
        item: exactItem(),
        typeId: materialTypeSelect?.value || "",
        species: speciesInput?.value?.trim() || "",
        ...details
      });
    }

    function renderSuggestions() {
      if (!suggestions || !speciesInput) return;
      const query = normalizeText(speciesInput.value);
      const names = availableNames().filter((name) => (
        !query || normalizeText(name).includes(query)
      ));

      suggestions.replaceChildren();

      if (!names.length) {
        const empty = document.createElement("div");
        empty.className = "autocomplete-empty";
        empty.textContent = emptyText;
        suggestions.append(empty);
      } else {
        names.forEach((name) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "autocomplete-option";
          button.setAttribute("role", "option");
          button.textContent = name;
          button.addEventListener("mousedown", (event) => {
            event.preventDefault();
            speciesInput.value = name;
            const item = exactItem() || sourceItems.find((row) => normalizeText(row.species) === normalizeText(name)) || null;
            if (!materialTypeSelect.value && item) {
              materialTypeSelect.value = item.materialType;
            }
            updateClearButton();
            closeSuggestions();
            notify("species-select");
            focusAfterSelect?.focus?.();
          });
          suggestions.append(button);
        });
      }

      suggestions.classList.remove("is-hidden");
      speciesInput.setAttribute("aria-expanded", "true");
    }

    function refreshSuggestions() {
      if (document.activeElement === speciesInput) {
        renderSuggestions();
      }
    }

    function handleTypeChange() {
      const enteredSpecies = speciesInput.value.trim();
      let speciesReset = false;

      if (enteredSpecies && (!materialTypeSelect.value || !exactItem())) {
        speciesInput.value = "";
        speciesReset = true;
      }

      updateClearButton();
      refreshSuggestions();
      notify("type-change", { speciesReset });
    }

    function handleSpeciesInput() {
      updateClearButton();
      let item = exactItem();

      if (!materialTypeSelect.value && speciesInput.value.trim() && item) {
        materialTypeSelect.value = item.materialType;
        item = exactItem();
      }

      renderSuggestions();
      notify("species-input", { exact: Boolean(item) });
    }

    function clear({ resetType = true, focus = true, notifyChange = true } = {}) {
      speciesInput.value = "";
      if (resetType) materialTypeSelect.value = "";
      updateClearButton();
      closeSuggestions();
      if (notifyChange) notify("clear");
      if (focus) speciesInput.focus();
    }

    fillMaterialTypes();
    updateClearButton();

    materialTypeSelect?.addEventListener("change", handleTypeChange);
    speciesInput?.addEventListener("input", handleSpeciesInput);
    speciesInput?.addEventListener("focus", renderSuggestions);
    speciesInput?.addEventListener("change", () => notify("species-change"));
    speciesInput?.addEventListener("blur", () => window.setTimeout(closeSuggestions, 120));
    clearButton?.addEventListener("click", () => clear());
    document.addEventListener("click", (event) => {
      if (!field || !field.contains(event.target)) closeSuggestions();
    });

    return {
      fillMaterialTypes,
      itemsForCurrentType,
      exactItem,
      selectedProducts,
      availableNames,
      updateClearButton,
      renderSuggestions,
      refreshSuggestions,
      closeSuggestions,
      clear
    };
  }

  global.WoodstockFlooringCore = {
    normalizeText,
    round,
    parseLocalizedNumber,
    formatEditableMoney,
    formatMoney,
    formatPercent,
    priceArea,
    catalogPrice,
    standardTopLayerThickness,
    totalThickness,
    underfloorHeatingLabel,
    automaticVolumeDiscountPercent,
    loyaltyTier,
    clientPricingTier,
    dealerPricingTier,
    pricingTier,
    smallOrderMarkup,
    selectionSurchargeOptions,
    quickCoatingOptions,
    calculatePricing,
    minimumClientFinalPrice,
    veneerMaterialTypes,
    splitMultishponName,
    createVeneerSelector
  };
})(window);
