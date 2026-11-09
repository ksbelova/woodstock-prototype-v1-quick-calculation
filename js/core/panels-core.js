"use strict";

(function attachPanelsCore(global) {
  const RU_LOCALE = "ru-RU";

  function parseNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const cleaned = String(value ?? "").trim().replace(/\s+/g, "").replace(",", ".");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function round(value, digits = 2) {
    const factor = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  }

  function formatMoney(value) {
    return Number.isFinite(value)
      ? `${new Intl.NumberFormat(RU_LOCALE, { maximumFractionDigits: 2 }).format(value)} ₽`
      : "—";
  }

  function parseThicknessComposition(value) {
    const raw = String(value ?? "").trim().replace(/,/g, ".");
    if (!raw) return { raw: "", parts: [], total: null, composite: false };
    const tokens = raw.split("+");
    const parts = tokens.map((x) => Number(x.trim()));
    if (!parts.length || parts.some((x) => !Number.isFinite(x))) {
      return { raw, parts: [], total: null, composite: tokens.length > 1 };
    }
    return {
      raw,
      parts,
      total: parts.reduce((sum, part) => sum + part, 0),
      composite: parts.length > 1
    };
  }

  function closestExactRate(rows, thickness, key) {
    if (!Number.isFinite(thickness)) return null;
    const row = (rows || []).find((x) => Number(x.thicknessMm) === Number(thickness));
    const value = row ? Number(row[key]) : NaN;
    return Number.isFinite(value) ? value : null;
  }

  function edgeMetersForSize(size, rule) {
    if (!rule || !size?.length || !size?.width || !size?.quantity) return 0;
    return ((Number(rule.lengthCount || 0) * size.length + Number(rule.widthCount || 0) * size.width) / 1000) * size.quantity * 1.2;
  }

  function normalizeThicknessKey(value) {
    return String(value ?? "").trim().replace(/\s+/g, "").replace(/,/g, ".");
  }

  function compositionRateRow(rows, baseId, thicknessRaw, allowLegacyFallback = true) {
    const normalized = normalizeThicknessKey(thicknessRaw);
    const thickness = parseThicknessComposition(thicknessRaw);
    const totalKey = Number.isFinite(thickness.total)
      ? normalizeThicknessKey(thickness.total)
      : null;
    const sourceRows = rows || [];

    // Exact base + composition rows always win and may be used for any base when
    // a confirmed tariff is explicitly present in the data.
    const exactForBase = sourceRows.find((x) => (
      x.baseId === baseId &&
      normalizeThicknessKey(x.thickness ?? x.thicknessMm) === normalized
    ));
    if (exactForBase) return exactForBase;

    // Legacy rows have no baseId and therefore cannot be transferred between
    // technologies merely because the total thickness happens to match.
    if (!allowLegacyFallback) return null;

    const exactLegacy = sourceRows.find((x) => (
      !x.baseId &&
      normalizeThicknessKey(x.thickness ?? x.thicknessMm) === normalized
    ));
    if (exactLegacy) return exactLegacy;
    // A composite base must never inherit a tariff from a solid sheet merely
    // because the summed thickness is the same. Only an exact confirmed
    // composition row may price a composite operation.
    if (!thickness.composite && totalKey && totalKey !== normalized) {
      return sourceRows.find((x) => (
        !x.baseId &&
        normalizeThicknessKey(x.thickness ?? x.thicknessMm) === totalKey
      )) || null;
    }
    return null;
  }

  function nonstandardRateFor(data, baseId, thicknessRaw, sides) {
    // Backward compatibility with the previous 3-argument call.
    if (arguments.length === 3) {
      sides = thicknessRaw;
      thicknessRaw = baseId;
      baseId = "mdf";
    }
    const row = (data?.nonstandardRates || []).find((x) => (
      (!x.baseId || x.baseId === baseId) &&
      normalizeThicknessKey(x.thickness) === normalizeThicknessKey(thicknessRaw) &&
      Number(x.sides) === Number(sides)
    ));
    return row ? parseNumber(row.ratePerM2) : null;
  }

  function standardProductionRateFor(data, baseId, thicknessRaw, sides, veneerThickness) {
    const thick = parseNumber(veneerThickness);
    const cls = Number.isFinite(thick) && Math.abs(thick - 0.6) < 0.001
      ? "0.6"
      : Number.isFinite(thick) && thick >= 1.5
        ? "1.5+"
        : null;
    if (!cls) return null;
    const row = (data?.standardProductionRates || []).find((x) => (
      x.baseId === baseId &&
      normalizeThicknessKey(x.thickness) === normalizeThicknessKey(thicknessRaw) &&
      Number(x.sides) === Number(sides) &&
      x.veneerThicknessClass === cls
    ));
    return row ? parseNumber(row.ratePerM2) : null;
  }

  function cuttingRateFor(data, baseId, thicknessRaw) {
    const fallbackBases = Array.isArray(data?.meta?.legacyOperationRateFallbackBaseIds)
      ? data.meta.legacyOperationRateFallbackBaseIds
      : ["mdf", "dsp"];
    const row = compositionRateRow(data?.cuttingRates, baseId, thicknessRaw, fallbackBases.includes(baseId));
    return row ? parseNumber(row.ratePerRunningM) : null;
  }

  function edgeRateFor(data, baseId, thicknessRaw, edgeThickness, runningM, options = {}) {
    const fallbackBases = Array.isArray(data?.meta?.legacyOperationRateFallbackBaseIds)
      ? data.meta.legacyOperationRateFallbackBaseIds
      : ["mdf", "dsp"];
    const row = compositionRateRow(data?.edgeRates, baseId, thicknessRaw, fallbackBases.includes(baseId));
    const edge = parseNumber(edgeThickness);
    const meters = parseNumber(runningM);
    if (!row || !Number.isFinite(edge) || !Number.isFinite(meters)) return null;
    const group = edge >= 0.5 && edge <= 1 ? "thin" : edge >= 1.5 && edge <= 2 ? "thick" : null;
    if (!group) return null;

    const threshold = parseNumber(data?.meta?.edgeMachineThresholdRunningM) ?? 40;
    const machine = options.machineThresholdExclusive ? meters > threshold : meters >= threshold;
    const method = machine ? "Machine" : "Manual";
    const currentKey = `${group}${method}RatePerRunningM`;
    const currentRate = parseNumber(row[currentKey]);
    if (Number.isFinite(currentRate)) {
      return {
        rate: currentRate,
        method: method === "Machine" ? "machine" : "manual",
        group,
        threshold,
        source: "current"
      };
    }

    // Older confirmed tariffs only distinguished thin/thick edge and did not define
    // the new <40 / >=40 production-method split. They remain a fallback instead of
    // being silently discarded or transformed into an invented machine tariff.
    const legacyKey = `${group}RatePerRunningM`;
    const legacyRate = parseNumber(row[legacyKey]);
    return Number.isFinite(legacyRate)
      ? { rate: legacyRate, method: "legacy", group, threshold: null, source: "legacy" }
      : null;
  }

  function percentDiscount(retail, target) {
    const r = parseNumber(retail);
    const t = parseNumber(target);
    if (!Number.isFinite(r) || r <= 0 || !Number.isFinite(t)) return 0;
    return Math.max((1 - t / r) * 100, 0);
  }

  function percentMarkup(retail, target) {
    const r = parseNumber(retail);
    const t = parseNumber(target);
    if (!Number.isFinite(r) || r <= 0 || !Number.isFinite(t)) return 0;
    return Math.max((t / r - 1) * 100, 0);
  }

  function standardSheetPrices(standard, condition, mdfSelectionId, volumeId, warnings = [], overrides = {}) {
    const retail = parseNumber(standard?.pricesPerSheet?.retail);
    if (!Number.isFinite(retail)) {
      return { retailSheet: null, finalSheet: null, partial: true, note: "Нет розничной цены в строке прайса." };
    }

    const conditionKey = volumeId && volumeId !== "none" ? volumeId : (condition || "retail");
    const conditionTarget = conditionKey === "retail"
      ? retail
      : parseNumber(standard.pricesPerSheet?.[conditionKey]);
    let partial = false;
    if (!Number.isFinite(conditionTarget)) {
      warnings.push(`Для условия «${conditionKey}» в строке МДФ ${standard.lengthMm}×${standard.widthMm} нет цены; применена розничная цена.`);
      partial = true;
    }
    const automaticDiscountPercent = Number.isFinite(conditionTarget)
      ? percentDiscount(retail, conditionTarget)
      : 0;
    const discountPercent = Number.isFinite(parseNumber(overrides.discountPercent))
      ? Math.max(parseNumber(overrides.discountPercent), 0)
      : automaticDiscountPercent;

    let automaticMarkupPercent = 0;
    if (mdfSelectionId && mdfSelectionId !== "none") {
      const selectionTarget = parseNumber(standard.pricesPerSheet?.[mdfSelectionId]);
      if (Number.isFinite(selectionTarget)) {
        automaticMarkupPercent = percentMarkup(retail, selectionTarget);
      } else {
        warnings.push(`Для отбора МДФ в строке ${standard.lengthMm}×${standard.widthMm} нет цены; отбор не включён автоматически.`);
        partial = true;
      }
    }
    const markupPercent = Number.isFinite(parseNumber(overrides.markupPercent))
      ? Math.max(parseNumber(overrides.markupPercent), 0)
      : automaticMarkupPercent;

    // Для плит порядок согласован так: сначала надбавка за отбор, затем скидка/условие клиента.
    const finalSheet = retail * (1 + markupPercent / 100) * (1 - discountPercent / 100);
    return {
      retailSheet: retail,
      finalSheet,
      partial,
      note: "",
      conditionKey,
      automaticDiscountPercent,
      discountPercent,
      automaticMarkupPercent,
      markupPercent
    };
  }

  function weightForSize(size, base, thickness) {
    const density = base?.weightDensityKgM3;
    if (!density || !Number.isFinite(thickness?.total) || !size?.calcLength || !size?.calcWidth || !size?.quantity) return null;
    const volume = (size.calcLength / 1000) * (size.calcWidth / 1000) * (thickness.total / 1000) * size.quantity;
    return {
      min: volume * density.min,
      max: volume * density.max,
      densityMin: density.min,
      densityMax: density.max
    };
  }

  function weightText(weight) {
    if (!weight) return "—";
    const formatter = new Intl.NumberFormat(RU_LOCALE, { maximumFractionDigits: 1 });
    if (Math.abs(weight.max - weight.min) < 0.01) return `≈ ${formatter.format(weight.min)} кг`;
    return `≈ ${formatter.format(weight.min)}–${formatter.format(weight.max)} кг`;
  }

  function validateVeneerPriceLevel(item, level, purchase, warnings, label, veneerThickness = null) {
    if (!item || !level) return;
    if (level.requiresAgreement) warnings.push(`${label}: выбранный ценовой уровень «${level.name}» по прайсу требует согласования.`);
    if (level.requiresProjectMaterials) warnings.push(`${label}: уровень «${level.name}» действует только при указанной в прайсе доле дополнительных материалов; автоматическая проверка этой доли в расчёте позиции невозможна.`);
    if (level.id === "volume1000_5000" && Number.isFinite(purchase.area) && purchase.area > 5000) {
      warnings.push(`${label}: при объёме свыше 5000 м² цена мультишпона по прайсу согласовывается отдельно.`);
    }
    if (Number.isFinite(level.minM2) && Number.isFinite(purchase.area) && (item.type === "design" && level.id === "volume1000" ? purchase.area <= level.minM2 : purchase.area < level.minM2)) {
      const minimumDescription = item.type === "design" && level.id === "volume1000" ? "свыше" : "не менее";
      warnings.push(`${label}: для уровня «${level.name}» требуется ${minimumDescription} ${level.minM2} м²; рассчитано к закупке ${round(purchase.area, 2)} м².`);
    }
    if (Number.isFinite(level.minSheets) && Number.isFinite(purchase.sheets) && purchase.sheets < level.minSheets) {
      warnings.push(`${label}: для уровня «${level.name}» требуется не менее ${level.minSheets} листов; рассчитано ${purchase.sheets}.`);
    }
    if (level.minNote) {
      const thick = parseNumber(item.thicknessMm ?? veneerThickness);
      const thickOrExotic = (Number.isFinite(thick) && thick >= 1) || item.exoticOrThick;
      const thresholds = { volume1: thickOrExotic ? 50 : 100, volume2: thickOrExotic ? 149 : 300, volume3: thickOrExotic ? 300 : 1000 };
      const min = thresholds[level.id];
      const exclusiveMinimum = (level.id === "volume3" && !thickOrExotic) || (level.id === "volume2" && thickOrExotic);
      if (min && Number.isFinite(purchase.area) && (exclusiveMinimum ? purchase.area <= min : purchase.area < min)) {
        const thresholdDescription = exclusiveMinimum ? `действует при объёме свыше ${min}` : `начинается с ${min}`;
        warnings.push(`${label}: выбранный объёмный уровень ${thresholdDescription} м² для этой группы; рассчитано к закупке ${round(purchase.area, 2)} м².`);
      }
    }
  }

  function isSheetBasedVeneer(item) {
    return Boolean(item && (item.priceUnit === "sheet" || item.type === "multi"));
  }

  function isReadyShirt(item) {
    return Boolean(item && item.materialType === "ready_shirt");
  }

  function readyShirtDimensions(item) {
    if (!isReadyShirt(item)) return null;
    const lengthMm = parseNumber(item.lengthMm);
    const widthMm = parseNumber(item.widthMm);
    const areaM2 = parseNumber(item.areaM2) ?? (Number.isFinite(lengthMm) && Number.isFinite(widthMm) ? lengthMm * widthMm / 1_000_000 : null);
    if (!(lengthMm > 0 && widthMm > 0 && areaM2 > 0)) return null;
    return { lengthMm, widthMm, areaM2 };
  }

  // Готовая рубашка — уже собранное полотно. Для одной облицовываемой
  // поверхности допускается только одно полотно с поворотом на 90°.
  // Автоматический раскрой нескольких деталей из одного полотна и стыковка
  // нескольких полотен здесь намеренно не выполняются.
  function readyShirtRequirement(item, options = {}) {
    const panelLengthMm = parseNumber(options.panelLengthMm);
    const panelWidthMm = parseNumber(options.panelWidthMm);
    const quantity = Math.max(0, parseNumber(options.quantity) || 0);
    const surfaceCount = Math.max(0, parseNumber(options.surfaceCount) || 0);
    const dims = readyShirtDimensions(item);
    const base = {
      method: "whole_ready_shirts", exact: false,
      panelLengthMm: Number.isFinite(panelLengthMm) ? panelLengthMm : null,
      panelWidthMm: Number.isFinite(panelWidthMm) ? panelWidthMm : null,
      quantity, surfaceCount,
      lengthMm: dims?.lengthMm ?? null, widthMm: dims?.widthMm ?? null,
      areaPerSheetM2: dims?.areaM2 ?? null,
      sheets: null, paidAreaM2: null, fitsSingleSheet: false, reason: ""
    };
    if (!(panelLengthMm > 0 && panelWidthMm > 0 && quantity > 0 && surfaceCount > 0)) {
      return { ...base, reason: "Недостаточно данных о размере, количестве или числе сторон." };
    }
    if (!dims) return { ...base, reason: "Для готовой рубашки не подтверждён формат полотна." };
    const fits = (panelLengthMm <= dims.lengthMm && panelWidthMm <= dims.widthMm) ||
      (panelLengthMm <= dims.widthMm && panelWidthMm <= dims.lengthMm);
    if (!fits) {
      return { ...base, reason: "Требуется уточнение расхода / стоимости производства" };
    }
    const sheets = quantity * surfaceCount;
    return {
      ...base, exact: true, fitsSingleSheet: true, sheets,
      paidAreaM2: sheets * dims.areaM2, reason: ""
    };
  }

  function automaticReadyShirtLevel(item, sheets) {
    if (!isReadyShirt(item)) return { id: "retail", name: "Розничная цена", price: null };
    return automaticVeneerLevel(item, 0, sheets);
  }

  function readyShirtPurchase(item, requirement, pricePerM2) {
    const req = requirement || {};
    if (!req.exact || !Number.isFinite(req.sheets) || !Number.isFinite(req.paidAreaM2)) {
      return { cost: null, sheets: null, area: null, pricePerSheet: null, partial: true, note: req.reason || "" };
    }
    const price = parseNumber(pricePerM2);
    if (!(price > 0)) {
      return { cost: null, sheets: req.sheets, area: req.paidAreaM2, pricePerSheet: null, partial: true, note: "Цена за м² не задана." };
    }
    const dims = readyShirtDimensions(item);
    const pricePerSheet = dims ? dims.areaM2 * price : null;
    return {
      cost: req.paidAreaM2 * price, sheets: req.sheets, area: req.paidAreaM2, pricePerSheet, partial: false,
      note: `${req.sheets} полотно(а) · ${round(req.paidAreaM2, 3)} м² × ${formatMoney(price)}/м²`
    };
  }

  function veneerPhysicalSheetDimensions(item) {
    const dim = item?.sheetDimensionsMm;
    if (!dim || dim.range) return null;
    const width = parseNumber(dim.width ?? dim.widthMin);
    const length = parseNumber(dim.length);
    if (!Number.isFinite(width) || !Number.isFinite(length) || width <= 0 || length <= 0) return null;
    return {
      widthMm: width,
      lengthMm: length,
      areaM2: width * length / 1_000_000
    };
  }

  // Для стандартизированных панелей листовой шпон считается отдельной группой
  // конкретного размера. Мультишпон требует подтверждённой полезной ширины:
  // её нельзя выводить из физической ширины листа автоматически.
  function standardizedSheetVeneerRequirement(item, options = {}) {
    const panelLengthMm = parseNumber(options.panelLengthMm);
    const panelWidthMm = parseNumber(options.panelWidthMm);
    const quantity = Math.max(0, parseNumber(options.quantity) || 0);
    const surfaceCount = Math.max(0, parseNumber(options.surfaceCount) || 0);
    const netAreaM2 = Number.isFinite(panelLengthMm) && Number.isFinite(panelWidthMm)
      ? panelLengthMm * panelWidthMm * quantity * surfaceCount / 1_000_000
      : 0;
    const physical = veneerPhysicalSheetDimensions(item);

    const base = {
      method: "by_sheets",
      exact: false,
      netAreaM2,
      panelLengthMm: Number.isFinite(panelLengthMm) ? panelLengthMm : null,
      panelWidthMm: Number.isFinite(panelWidthMm) ? panelWidthMm : null,
      quantity,
      surfaceCount,
      physicalLengthMm: physical?.lengthMm ?? null,
      physicalWidthMm: physical?.widthMm ?? null,
      physicalSheetAreaM2: physical?.areaM2 ?? null,
      usableLengthMm: physical?.lengthMm ?? null,
      usableWidthMm: null,
      technicalSheetsPerSurface: null,
      technicalSheets: null,
      purchasedSheets: null,
      paidAreaM2: null,
      proportionalDistribution: false,
      reason: ""
    };

    if (!isSheetBasedVeneer(item)) return { ...base, reason: "Шпон не является листовым." };
    if (!(panelLengthMm > 0 && panelWidthMm > 0 && quantity > 0 && surfaceCount > 0)) {
      return { ...base, reason: "Недостаточно данных о размере, количестве или числе сторон." };
    }
    if (!physical) {
      return { ...base, reason: item?.sheetDimensionsMm?.range
        ? `Физический формат листа задан диапазоном (${item?.sheetSize || "без точного формата"}).`
        : "Нет подтверждённого физического формата листа." };
    }

    if (item.type === "multi") {
      const rules = options.multiUsableWidthBySheetFormatMm || {};
      const key = `${physical.lengthMm}x${physical.widthMm}`;
      const rule = rules[key] || null;
      const usableWidthMm = parseNumber(rule?.usableWidthMm);
      const usableLengthMm = parseNumber(rule?.usableLengthMm ?? physical.lengthMm);
      if (!(usableWidthMm > 0 && usableLengthMm > 0)) {
        return { ...base, reason: `Для мультишпона формата ${physical.lengthMm}×${physical.widthMm} мм нет подтверждённой полезной ширины/геометрии.` };
      }
      const shirtAllowanceMm = options.roundMultiSheetsPerPanel ? 50 : 0;
      if (panelLengthMm + shirtAllowanceMm > usableLengthMm + 0.000001) {
        return { ...base, usableWidthMm, usableLengthMm, reason: `Длина панели с запасом рубашки ${panelLengthMm + shirtAllowanceMm} мм превышает подтверждённую рабочую длину листа ${usableLengthMm} мм.` };
      }

      const across = (panelWidthMm + shirtAllowanceMm) / usableWidthMm;
      // Подтверждённый пример 2070/620 = 3,34 -> технологически 3,5 листа на сторону.
      // Поэтому для этого подтверждённого формата технологическая потребность
      // округляется вверх до половины листа; к покупке итог округляется до целого листа.
      const technicalSheetsPerSurface = Math.ceil((across * 2) - 1e-9) / 2;
      const technicalSheets = technicalSheetsPerSurface * quantity * surfaceCount;
      // Половинки листов от одинаковых панелей используются в общей партии:
      // 2 панели по 3,5 листа = 7 целых листов к закупке, а не 8.
      const purchasedSheets = Math.ceil(technicalSheets - 1e-9);
      return {
        ...base,
        exact: true,
        usableWidthMm,
        usableLengthMm,
        technicalSheetsPerSurface,
        technicalSheets,
        purchasedSheets,
        paidAreaM2: purchasedSheets * physical.areaM2,
        reason: ""
      };
    }

    // Для другого листового шпона сохраняется существующий способ определения
    // кратности по физической площади листа, но теперь отдельно для каждой
    // стандартизированной размерной группы.
    const purchasedSheets = Math.ceil(netAreaM2 / physical.areaM2 - 1e-9);
    return {
      ...base,
      exact: true,
      technicalSheets: netAreaM2 / physical.areaM2,
      purchasedSheets,
      paidAreaM2: purchasedSheets * physical.areaM2,
      reason: ""
    };
  }

  function veneerPurchase(item, requiredArea, price, selectionMarkup, warnings, label) {
    if (!Number.isFinite(requiredArea) || requiredArea <= 0) {
      return { cost: 0, area: 0, sheets: 0, partial: false, note: "" };
    }
    if (!Number.isFinite(price)) {
      warnings.push(`${label}: цена шпона не задана; компонент не включён в стоимость.`);
      return { cost: 0, area: requiredArea, sheets: null, partial: true, note: "" };
    }
    const markup = 1 + (selectionMarkup || 0);

    if (item?.priceUnit === "sheet") {
      const dim = item.sheetDimensionsMm;
      if (!dim || !Number.isFinite(dim.width) || !Number.isFinite(dim.length)) {
        warnings.push(`${label}: для цены за лист нет подтверждённого размера листа; стоимость не рассчитана автоматически.`);
        return { cost: 0, area: requiredArea, sheets: null, partial: true, note: "Цена за лист." };
      }
      const sheetArea = dim.width * dim.length / 1_000_000;
      const sheets = Math.ceil(requiredArea / sheetArea);
      return {
        cost: sheets * price * markup,
        area: sheets * sheetArea,
        sheets,
        partial: false,
        note: `${sheets} лист. × ${formatMoney(price)}/лист`
      };
    }

    if (item?.type === "multi") {
      const dim = item.sheetDimensionsMm;
      if (!dim) {
        warnings.push(`${label}: размер листа мультишпона не найден в прайсе; расход кратно листу не рассчитан.`);
        return { cost: 0, area: requiredArea, sheets: null, partial: true, note: "" };
      }
      if (dim.range) {
        warnings.push(`${label}: ширина листа мультишпона в прайсе задана диапазоном ${item.sheetSize}; без фактической ширины нельзя точно округлить расход до целых листов. Стоимость шпона не включена автоматически.`);
        return {
          cost: 0,
          area: requiredArea,
          sheets: null,
          partial: true,
          note: `Требуется фактический размер листа: ${item.sheetSize}`
        };
      }
      const sheetArea = dim.widthMin * dim.length / 1_000_000;
      const sheets = Math.ceil(requiredArea / sheetArea);
      const purchaseArea = sheets * sheetArea;
      return {
        cost: purchaseArea * price * markup,
        area: purchaseArea,
        sheets,
        partial: false,
        note: `${round(requiredArea, 2)} м² потребность → ${sheets} лист. → ${round(purchaseArea, 2)} м² к закупке`
      };
    }

    return {
      cost: requiredArea * price * markup,
      area: requiredArea,
      sheets: null,
      partial: false,
      note: `${round(requiredArea, 2)} м²`
    };
  }

  function veneerPurchaseFromSheetRequirement(item, requirement, price, selectionMarkup, warnings, label) {
    const req = requirement || {};
    if (!req.exact || !Number.isFinite(req.purchasedSheets) || req.purchasedSheets < 0 || !Number.isFinite(req.paidAreaM2)) {
      const reason = req.reason ? ` ${req.reason}` : "";
      warnings.push(`${label}: точный расход листового шпона не рассчитан.${reason}`);
      return { cost: null, area: null, sheets: null, partial: true, note: req.reason || "" };
    }
    if (!Number.isFinite(price)) {
      warnings.push(`${label}: цена шпона не задана; компонент не включён в стоимость.`);
      return { cost: 0, area: req.paidAreaM2, sheets: req.purchasedSheets, partial: true, note: "" };
    }
    const markup = 1 + (selectionMarkup || 0);
    const cost = item?.priceUnit === "sheet"
      ? req.purchasedSheets * price * markup
      : req.paidAreaM2 * price * markup;
    const unitNote = item?.priceUnit === "sheet"
      ? `${req.purchasedSheets} лист. × ${formatMoney(price)}/лист`
      : `${req.purchasedSheets} лист. · ${round(req.paidAreaM2, 3)} м² × ${formatMoney(price)}/м²`;
    return {
      cost,
      area: req.paidAreaM2,
      sheets: req.purchasedSheets,
      partial: false,
      note: unitNote
    };
  }

  function veneerThicknessFromItem(item) {
    const direct = parseNumber(item?.thicknessMm);
    if (Number.isFinite(direct)) return direct;
    const text = `${item?.sheetSize || ""} ${item?.name || ""}`;
    const match = text.match(/толщина\s*(\d+(?:[.,]\d+)?)/i);
    return match ? parseNumber(match[1]) : null;
  }

  function veneerVolumeBasis(item, requiredArea) {
    const area = parseNumber(requiredArea);
    if (!Number.isFinite(area) || area <= 0) return { area: 0, sheets: 0, exact: true };
    const dim = item?.sheetDimensionsMm;
    if ((item?.type === "multi" || item?.priceUnit === "sheet") && dim) {
      if (dim.range) return { area, sheets: null, exact: false };
      const width = parseNumber(dim.width ?? dim.widthMin);
      const length = parseNumber(dim.length);
      if (Number.isFinite(width) && Number.isFinite(length)) {
        const sheetArea = width * length / 1_000_000;
        const sheets = Math.ceil(area / sheetArea);
        return { area: sheets * sheetArea, sheets, exact: true };
      }
    }
    return { area, sheets: null, exact: true };
  }

  function automaticVeneerLevel(item, purchaseArea, purchaseSheets = null) {
    if (!item) return { id: "retail", name: "Розничная цена", price: null };
    const area = parseNumber(purchaseArea) || 0;
    const sheets = parseNumber(purchaseSheets);
    const levels = (item.priceLevels || []).filter((level) =>
      level.id !== "client" &&
      !level.requiresAgreement &&
      !level.requiresProjectMaterials &&
      Number.isFinite(parseNumber(item.prices?.[level.id]))
    );

    let selected = null;
    if (item.type === "natural") {
      const thickness = veneerThicknessFromItem(item);
      const thickOrExotic = (Number.isFinite(thickness) && thickness >= 1) || item.exoticOrThick;
      const thresholds = {
        volume1: thickOrExotic ? 50 : 100,
        volume2: thickOrExotic ? 149 : 300,
        volume3: thickOrExotic ? 300 : 1000
      };
      for (const level of levels) {
        const min = thresholds[level.id];
        const exclusiveMinimum = (level.id === "volume3" && !thickOrExotic) || (level.id === "volume2" && thickOrExotic);
        if (Number.isFinite(min) && (exclusiveMinimum ? area > min : area >= min)) selected = { ...level, minM2: min };
      }
    } else {
      const sheetLevels = levels.filter((level) => Number.isFinite(parseNumber(level.minSheets)));
      if (sheetLevels.length && Number.isFinite(sheets)) {
        sheetLevels
          .sort((a, b) => parseNumber(a.minSheets) - parseNumber(b.minSheets))
          .forEach((level) => { if (sheets >= parseNumber(level.minSheets)) selected = level; });
      } else {
        levels
          .filter((level) => Number.isFinite(parseNumber(level.minM2)))
          .sort((a, b) => parseNumber(a.minM2) - parseNumber(b.minM2))
          .forEach((level) => { if (item.type === "design" && level.id === "volume1000" ? area > parseNumber(level.minM2) : area >= parseNumber(level.minM2)) selected = level; });
      }
    }

    if (!selected) return { id: "retail", name: "Розничная цена", price: parseNumber(item.prices?.retail), minM2: 0 };
    let name = selected.name;
    if (item.type === "design" && selected.id === "volume300_999") name = "Объём 300–1000 м²";
    if (item.type === "natural") {
      const thickOrExotic = veneerThicknessFromItem(item) >= 1 || item.exoticOrThick;
      if (selected.id === "volume1" && !thickOrExotic) name = "Объём от 100 до 300 м² (не включая 300)";
      if (selected.id === "volume2") name = thickOrExotic
        ? "Объём свыше 149 и менее 300 м²" : "Объём 300–1000 м²";
    }
    return { ...selected, name, price: parseNumber(item.prices?.[selected.id]) };
  }

  function veneerClientPrice(item, condition) {
    if (!item) return null;
    return parseNumber(item.prices?.[condition]) ?? parseNumber(item.prices?.retail);
  }


  function sortPhysicalSizes(formats = []) {
    const seen = new Set();
    return (formats || [])
      .map((item) => ({
        length: parseNumber(item?.length),
        width: parseNumber(item?.width)
      }))
      .filter((item) => Number.isFinite(item.length) && Number.isFinite(item.width) && item.length > 0 && item.width > 0)
      .filter((item) => {
        const key = [item.length, item.width].sort((a, b) => a - b).join("x");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const aMax = Math.max(a.length, a.width);
        const bMax = Math.max(b.length, b.width);
        if (aMax !== bMax) return aMax - bMax;
        const aMin = Math.min(a.length, a.width);
        const bMin = Math.min(b.length, b.width);
        return aMin - bMin;
      });
  }

  function sizeFitsFormats(length, width, formats = [], allowanceMm = 0) {
    const l = parseNumber(length);
    const w = parseNumber(width);
    const allowance = Math.max(parseNumber(allowanceMm) || 0, 0);
    if (!Number.isFinite(l) || !Number.isFinite(w) || l <= 0 || w <= 0) return false;

    const requiredLength = l + allowance;
    const requiredWidth = w + allowance;

    return sortPhysicalSizes(formats).some((format) => (
      (requiredLength <= format.length && requiredWidth <= format.width) ||
      (requiredLength <= format.width && requiredWidth <= format.length)
    ));
  }

  function maxDimensionForFormats(formats = [], allowanceMm = 0) {
    const allowance = Math.max(parseNumber(allowanceMm) || 0, 0);
    const values = sortPhysicalSizes(formats).flatMap((format) => [format.length, format.width]);
    if (!values.length) return null;
    return Math.max(...values) - allowance;
  }

  function maxCompanionDimension(value, formats = [], allowanceMm = 0) {
    const dimension = parseNumber(value);
    const allowance = Math.max(parseNumber(allowanceMm) || 0, 0);
    if (!Number.isFinite(dimension) || dimension <= 0) return maxDimensionForFormats(formats, allowance);

    const required = dimension + allowance;
    const candidates = [];
    sortPhysicalSizes(formats).forEach((format) => {
      if (required <= format.length) candidates.push(format.width - allowance);
      if (required <= format.width) candidates.push(format.length - allowance);
    });
    const valid = candidates.filter((candidate) => Number.isFinite(candidate) && candidate > 0);
    return valid.length ? Math.max(...valid) : null;
  }

  global.WoodstockPanelsCore = {
    parseNumber,
    round,
    formatMoney,
    parseThicknessComposition,
    closestExactRate,
    edgeMetersForSize,
    nonstandardRateFor,
    standardProductionRateFor,
    cuttingRateFor,
    edgeRateFor,
    standardSheetPrices,
    weightForSize,
    weightText,
    validateVeneerPriceLevel,
    isSheetBasedVeneer,
    isReadyShirt,
    readyShirtDimensions,
    readyShirtRequirement,
    automaticReadyShirtLevel,
    readyShirtPurchase,
    veneerPhysicalSheetDimensions,
    standardizedSheetVeneerRequirement,
    veneerPurchase,
    veneerPurchaseFromSheetRequirement,
    veneerThicknessFromItem,
    veneerVolumeBasis,
    automaticVeneerLevel,
    veneerClientPrice,
    sortPhysicalSizes,
    sizeFitsFormats,
    maxDimensionForFormats,
    maxCompanionDimension
  };
})(window);
