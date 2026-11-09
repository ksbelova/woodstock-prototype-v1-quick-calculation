"use strict";
window.WoodstockQuickCommon = (() => {
const CITY_OPTIONS = [
  { group: "Россия", city: "Москва", code: "+7" },
  { group: "Россия", city: "Санкт-Петербург", code: "+7" },
  { group: "Россия", city: "Нижний Новгород", code: "+7" },
  { group: "Россия", city: "Ковров", code: "+7" },
  { group: "Россия", city: "Брянск", code: "+7" },
  { group: "Россия", city: "Ростов-на-Дону", code: "+7" },
  { group: "Россия", city: "Краснодар", code: "+7" },
  { group: "Россия", city: "Казань", code: "+7" },
  { group: "Россия", city: "Ульяновск", code: "+7" },
  { group: "Россия", city: "Самара", code: "+7" },
  { group: "Россия", city: "Екатеринбург", code: "+7" },
  { group: "Россия", city: "Новосибирск", code: "+7" },
  { group: "СНГ", city: "Минск, Беларусь", code: "+375" },
  { group: "СНГ", city: "Алматы, Казахстан", code: "+7" },
  { group: "СНГ", city: "Астана, Казахстан", code: "+7" },
  { group: "СНГ", city: "Ташкент, Узбекистан", code: "+998" },
  { group: "СНГ", city: "Бишкек, Кыргызстан", code: "+996" },
  { group: "СНГ", city: "Ереван, Армения", code: "+374" },
  { group: "СНГ", city: "Баку, Азербайджан", code: "+994" },
  { group: "СНГ", city: "Душанбе, Таджикистан", code: "+992" }
];

const PHONE_MASKS = {
  "+7": { nationalDigits: 10, groups: [3, 3, 2, 2] },
  "+375": { nationalDigits: 9, groups: [2, 3, 2, 2] },
  "+998": { nationalDigits: 9, groups: [2, 3, 2, 2] },
  "+996": { nationalDigits: 9, groups: [3, 3, 3] },
  "+374": { nationalDigits: 8, groups: [2, 3, 3] },
  "+994": { nationalDigits: 9, groups: [2, 3, 2, 2] },
  "+992": { nationalDigits: 9, groups: [2, 3, 2, 2] }
};

const PHONE_CODES = Object.keys(PHONE_MASKS).sort((a, b) => b.length - a.length);

function createContact(options){
 const {form,ui}=options;
 const uploadedFilesState=new WeakMap();
 const touchedFields=options.touchedFields||new Set();
 const markFieldTouched=options.markFieldTouched||((key)=>touchedFields.add(key));
 const renderAll=options.renderAll||(()=>{});
 const validateAll=options.validateAll||validate;
 const validation=Object.fromEntries(["name","phone","city","email","privacy"].map(key=>[key,[document.getElementById(key+"Field"),document.getElementById(key+"Error")]]));
 const setFieldError=options.setFieldError||((key,message="")=>{const [field,error]=validation[key]||[];field?.classList.toggle("field--invalid",Boolean(message));if(error)error.textContent=message;});
function normalizeCitySearch(value) {
  return String(value || "").trim().toLocaleLowerCase("ru-RU");
}

function closeCitySuggestions() {
  if (!ui.citySuggestions) return;
  ui.citySuggestions.classList.add("is-hidden");
  ui.citySuggestions.replaceChildren();
  form.city.setAttribute("aria-expanded", "false");
}

function setPhoneCountryCode(code) {
  const currentValue = String(form.phone.value || "");
  const currentDigits = phoneDigits(currentValue);
  const currentCode = recognizedPhoneCode(currentValue);
  const hasLeadingPlus = currentValue.trimStart().startsWith("+");
  let nationalDigits = "";

  if (currentCode) {
    nationalDigits = currentDigits.slice(currentCode.slice(1).length);
  } else if (!hasLeadingPlus) {
    nationalDigits = currentDigits;
  }

  form.phone.value = formatPhone(`${code}${nationalDigits}`);
}

function selectCityOption(item) {
  form.city.value = item.city;
  closeCitySuggestions();
  setPhoneCountryCode(item.code);

  if (options.submitted()) validateAll();
}

function renderCitySuggestions() {
  if (!ui.citySuggestions) return;

  const query = normalizeCitySearch(form.city.value);
  const matches = CITY_OPTIONS.filter((item) => {
    if (!query) return true;
    return normalizeCitySearch(`${item.city} ${item.group}`).includes(query);
  });

  ui.citySuggestions.replaceChildren();

  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "autocomplete-empty";
    empty.textContent = "Город не найден — можно продолжить ввод вручную.";
    ui.citySuggestions.append(empty);
  } else {
    ["Россия", "СНГ"].forEach((group) => {
      const groupItems = matches.filter((item) => item.group === group);
      if (!groupItems.length) return;

      const heading = document.createElement("div");
      heading.className = "autocomplete-empty";
      heading.textContent = group;
      heading.setAttribute("aria-hidden", "true");
      ui.citySuggestions.append(heading);

      groupItems.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "autocomplete-option";
        button.setAttribute("role", "option");
        button.textContent = item.city;
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", () => selectCityOption(item));
        ui.citySuggestions.append(button);
      });
    });
  }

  ui.citySuggestions.classList.remove("is-hidden");
  form.city.setAttribute("aria-expanded", "true");
}

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 15);
}

function recognizedPhoneCode(value) {
  const rawValue = String(value || "").trimStart();
  if (!rawValue.startsWith("+")) return null;

  const digits = phoneDigits(rawValue);
  const matched = PHONE_CODES.find((code) => digits.startsWith(code.slice(1)));
  return matched || null;
}

function formatKnownPhone(code, nationalDigits) {
  const mask = PHONE_MASKS[code];
  const digits = String(nationalDigits || "").slice(0, mask.nationalDigits);
  if (!digits) return code;

  let output = code;
  let offset = 0;

  mask.groups.forEach((size, index) => {
    const part = digits.slice(offset, offset + size);
    if (!part) return;

    if (index === 0) {
      output += ` (${part}${part.length === size ? ")" : ""}`;
    } else if (index === 1) {
      output += ` ${part}`;
    } else {
      output += `-${part}`;
    }

    offset += size;
  });

  return output;
}

function formatPhone(value) {
  const rawValue = String(value || "");
  const hasLeadingPlus = rawValue.trimStart().startsWith("+");
  const digits = phoneDigits(rawValue);

  if (!digits) return hasLeadingPlus ? "+" : "";

  const code = recognizedPhoneCode(rawValue);
  if (!code) {
    return `${hasLeadingPlus ? "+" : ""}${digits}`;
  }

  const codeDigits = code.slice(1);
  return formatKnownPhone(code, digits.slice(codeDigits.length));
}

function applyPhoneMask() {
  form.phone.value = formatPhone(form.phone.value);
}

function validPhone(value) {
  const digits = phoneDigits(value);
  const code = recognizedPhoneCode(value);

  if (!code) {
    return digits.length >= 10 && digits.length <= 15;
  }

  const codeDigits = code.slice(1).length;
  return digits.length === codeDigits + PHONE_MASKS[code].nationalDigits;
}

function normalizeEmail(value) {
  const compactValue = String(value || "").replace(/\s+/g, "");
  const separatorIndex = compactValue.indexOf("@");

  if (separatorIndex < 0) return compactValue;

  const localPart = compactValue.slice(0, separatorIndex);
  const domainPart = compactValue
    .slice(separatorIndex + 1)
    .replaceAll(",", ".")
    .toLowerCase();

  return `${localPart}@${domainPart}`;
}

function applyEmailMask() {
  form.email.value = normalizeEmail(form.email.value);
}

function validateEmail(value) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function fileIdentity(file) {
  return [file.name, file.size, file.type, file.lastModified].join("::");
}

function getUploadedFiles(input = form.files) {
  const stored = uploadedFilesState.get(input);
  return stored ? [...stored] : [...(input.files || [])];
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

function fileNames(input = form.files) {
  return getUploadedFiles(input).map((file) => file.name);
}

function renderUploadedFiles(input, container) {
  const files = getUploadedFiles(input);
  container.replaceChildren();
  container.classList.toggle("is-hidden", !files.length);

  if (!files.length) {
    container.textContent = "Файлы не выбраны";
    return;
  }

  files.forEach((file, index) => {
    const badge = document.createElement("span");
    badge.className = "uploaded-file";

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
      renderUploadedFiles(input, container);
      renderAll();
    });

    badge.append(name, removeButton);
    container.append(badge);
  });
}

function addSelectedFiles(input, container) {
  const selectedNow = [...input.files];
  appendUploadedFiles(input, selectedNow);
  renderUploadedFiles(input, container);
}


 function checks(){return [
    ["name", form.name.value.trim() ? "" : "Укажите имя.", form.name],
    ["phone", validPhone(form.phone.value) ? "" : "Проверьте номер телефона.", form.phone],
    ["city", form.city.value.trim() ? "" : "Укажите город.", form.city],
    ["email", validateEmail(normalizeEmail(form.email.value)) ? "" : "Проверьте адрес электронной почты.", form.email],
    ["privacy", form.privacy.checked ? "" : "Необходимо согласие на обработку персональных данных.", form.privacy]
 ];}
 function validate(){const issues=[];checks().forEach(([key,message,input])=>{setFieldError(key,message);if(message)issues.push({key,input});});return issues;}
 function validateOnBlur(key){if(options.submitted()){validateAll();return;}
  if (key === "phone") {
    const raw = form.phone.value.trim();
    const invalid = Boolean(raw) && !validPhone(raw);
    if (invalid) markFieldTouched(key);
    else touchedFields.delete(key);
    setFieldError(key, invalid ? "Проверьте номер телефона." : "");
    return;
  }

  if (key === "email") {
    const raw = normalizeEmail(form.email.value);
    const invalid = Boolean(raw) && !validateEmail(raw);
    if (invalid) markFieldTouched(key);
    else touchedFields.delete(key);
    setFieldError(key, invalid ? "Проверьте адрес электронной почты." : "");
  }
}

 function bind(){
  form.files.addEventListener("change",()=>addSelectedFiles(form.files,ui.selectedFiles));
  form.city.addEventListener("focus",renderCitySuggestions);form.city.addEventListener("click",renderCitySuggestions);form.city.addEventListener("input",renderCitySuggestions);
  form.city.addEventListener("blur",()=>setTimeout(closeCitySuggestions,0));form.city.addEventListener("keydown",event=>{if(event.key==="Escape")closeCitySuggestions();});
  document.addEventListener("pointerdown",event=>{const field=form.city.closest(".autocomplete-field");if(field&&!field.contains(event.target))closeCitySuggestions();});
  form.phone.addEventListener("input",applyPhoneMask);form.phone.addEventListener("blur",()=>{applyPhoneMask();validateOnBlur("phone");});
  form.email.addEventListener("input",applyEmailMask);form.email.addEventListener("blur",()=>{applyEmailMask();validateOnBlur("email");});
  [form.name,form.phone,form.city,form.email,form.privacy].forEach(input=>["change","input"].forEach(type=>input.addEventListener(type,()=>{if(options.submitted())validateAll();})));
 }
 return {checks,validate,validateOnBlur,bind,normalizeCitySearch,closeCitySuggestions,setPhoneCountryCode,selectCityOption,renderCitySuggestions,phoneDigits,recognizedPhoneCode,formatKnownPhone,formatPhone,applyPhoneMask,validPhone,normalizeEmail,applyEmailMask,validateEmail,fileIdentity,getUploadedFiles,setUploadedFiles,appendUploadedFiles,removeUploadedFile,fileNames,renderUploadedFiles,addSelectedFiles};
}
function pdfTableLayout() {
  return {
    hLineColor: "#CFCFCB",
    vLineColor: "#CFCFCB",
    hLineWidth: () => 0.7,
    vLineWidth: () => 0.7,
    paddingLeft: () => 3,
    paddingRight: () => 3,
    paddingTop: () => 3,
    paddingBottom: () => 3
  };
}

const PDF_TABLE_OUTER_WIDTH = 539;

function fitPdfTableWidths(baseWidths, horizontalPadding, verticalLineWidth = 0.7) {
  const columnCount = baseWidths.length;
  const fixedWidth = columnCount * horizontalPadding * 2
    + (columnCount + 1) * verticalLineWidth;
  const targetColumnsWidth = PDF_TABLE_OUTER_WIDTH - fixedWidth;
  const baseTotal = baseWidths.reduce((sum, width) => sum + width, 0);
  const scale = targetColumnsWidth / baseTotal;
  const result = [];

  for (let index = 0; index < columnCount - 1; index += 1) {
    result.push(Math.round(baseWidths[index] * scale * 100) / 100);
  }

  const used = result.reduce((sum, width) => sum + width, 0);
  result.push(Math.round((targetColumnsWidth - used) * 100) / 100);
  return result;
}

function pdfDate(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function calculationNumber(payload) {
  const date = new Date(payload.createdAt);
  const pad = (value) => String(value).padStart(2, "0");
  return `КР-ИД-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function pdfValue(value, fallback = "—") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function createPdfDocument(payload,product){
 const calcNumber=calculationNumber(payload).replace("КР-ИД-",product.numberPrefix||"КР-ИД-");
 const pricePerM2=Number.isFinite(payload.pricing.finalPricePerM2)?new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",minimumFractionDigits:0,maximumFractionDigits:2}).format(payload.pricing.finalPricePerM2):"По запросу";
 const total=Number.isFinite(payload.pricing.total)?new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",minimumFractionDigits:0,maximumFractionDigits:2}).format(payload.pricing.total):"По запросу";
 const vat=Number.isFinite(payload.pricing.vat)?new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",minimumFractionDigits:0,maximumFractionDigits:2}).format(payload.pricing.vat):"—";
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

 return {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [28, 18, 28, 24],
    defaultStyle: {
      font: "Roboto",
      fontSize: 6.2,
      color: "#202020"
    },
    styles: {
      logo: { fontSize: 11.5, bold: true, characterSpacing: 1.2 },
      requisites: { fontSize: 5.2, color: "#555552", lineHeight: 1.05 },
      documentType: { fontSize: 12.5, bold: true, alignment: "center", margin: [0, 18, 0, 5] },
      documentSubtitle: { fontSize: 7.2, alignment: "center", color: "#5D5D5A", margin: [0, 0, 0, 16] },
      meta: { fontSize: 5.6, color: "#555552" },
      sectionTitle: { fontSize: 8, bold: true, margin: [0, 6, 0, 3] },
      tableHeader: { fontSize: 4.4, bold: true, color: "#202020" },
      priceLabel: { fontSize: 5.7, color: "#666663" },
      priceValue: { fontSize: 8.2, bold: true },
      totalValue: { fontSize: 11.5, bold: true },
      vatLabel: { fontSize: 4.8, color: "#777774" },
      vatValue: { fontSize: 6.2, color: "#555552" },
      disclaimer: { fontSize: 5.3, color: "#5F5F5C", lineHeight: 1.08 },
      infoTitle: { fontSize: 8.2, bold: true, margin: [0, 14, 0, 4] },
      infoText: { fontSize: 5.4, lineHeight: 1.08, color: "#202020" },
      infoSmall: { fontSize: 5.2, lineHeight: 1.06, color: "#353533" },
      infoLead: { fontSize: 5.8, bold: true, lineHeight: 1.08 }
    },
    footer(currentPage, pageCount) {
      return {
        columns: [
          { text: "WOODSTOCK · Предварительная спецификация", alignment: "left" },
          { text: `${currentPage} / ${pageCount}`, alignment: "right" }
        ],
        margin: [28, 5, 28, 0],
        fontSize: 5,
        color: "#777774"
      };
    },
 content:[
      {
        columnGap: 8,
        columns: [
          {
            width: 78,
            text: "WOODSTOCK",
            style: "logo",
            noWrap: true
          },
          {
            width: "*",
            text: [
              "АО «Вудсток»\n",
              "141044, Московская область, г.о. Мытищи, д. Грибки, Дмитровское ш., стр. 63А\n",
              "ИНН 7714659391 · КПП 502901001 · ОГРН 5067746131130\n",
              "+7 (495) 617-17-99 · info@wood-s.com · woodstock.su"
            ],
            style: "requisites"
          },
          {
            width: 105,
            stack: [
              { text: `Дата: ${pdfDate(payload.createdAt)}`, style: "meta", alignment: "right" },
              { text: `Номер расчёта: ${calcNumber}`, style: "meta", alignment: "right", margin: [0, 3, 0, 0] }
            ]
          }
        ]
      },
      { text: "ПРЕДВАРИТЕЛЬНАЯ СПЕЦИФИКАЦИЯ", style: "documentType" },
      { text: product.subtitle, style: "documentSubtitle" },
      { text: "Клиент", style: "sectionTitle" },
      {
        table: {
          widths: fitPdfTableWidths([105, 125, 100, 160], 3),
          body: clientBody
        },
        layout: pdfTableLayout(),
        margin: [0, 0, 0, 10]
      },
 {text:product.title,style:"sectionTitle"},
 {table:{headerRows:1,widths:fitPdfTableWidths(product.widths,1.4),body:[product.header,...product.rows],dontBreakRows:product.dontBreakRows??true},layout:{...pdfTableLayout(),paddingLeft:()=>1.4,paddingRight:()=>1.4,fillColor:row=>row===0?"#F0F0ED":null},margin:[0,0,0,product.tableBottomMargin??10]},
 ...(product.beforePrice||[]),
      { text: product.preliminaryPriceLabels ? "Ориентировочная стоимость" : (payload.pricing.partial ? "Стоимость рассчитанной части" : "Ориентировочная стоимость"), style: "sectionTitle", alignment: "right" },
      {
        stack: [
          { text: "Расчётная цена за м² с НДС", style: "priceLabel", alignment: "right" },
          { text: pricePerM2, style: "priceValue", alignment: "right", margin: [0, 4, 0, 5] },
          {
            canvas: [{
              type: "line",
              x1: 0,
              y1: 0,
              x2: 105,
              y2: 0,
              lineWidth: 0.6,
              lineColor: "#CFCFCB"
            }],
            alignment: "right",
            margin: [0, 0, 0, 6]
          },
          { text: product.preliminaryPriceLabels ? "Ориентировочная стоимость с НДС" : (payload.pricing.partial ? "Рассчитанная часть с НДС" : "Итого с НДС"), style: "priceLabel", alignment: "right" },
          { text: total, style: "totalValue", alignment: "right", margin: [0, 3, 0, 5] },
          {
            canvas: [{
              type: "line",
              x1: 0,
              y1: 0,
              x2: 105,
              y2: 0,
              lineWidth: 0.6,
              lineColor: "#CFCFCB"
            }],
            alignment: "right",
            margin: [0, 0, 0, 4]
          },
          { text: "В том числе НДС 22%", style: "vatLabel", alignment: "right" },
          { text: vat, style: "vatValue", alignment: "right", margin: [0, 2, 0, 0] }
        ],
        margin: [0, 2, 0, 4]
      },
      {
        text: "Расчёт является предварительным и не является публичной офертой.",
        style: "disclaimer",
        margin: [0, 6, 0, 0]
      },
 ...(product.afterPrice||[])
 ]};
}
function downloadDocument(documentDefinition,filename,status,onSuccess){
 if(typeof window.pdfMake?.createPdf!=="function"){status.textContent="Не удалось загрузить библиотеку PDF. Проверьте подключение к интернету и обновите страницу.";return false;}
 const fontFiles=['Roboto-Regular.ttf','Roboto-Medium.ttf','Roboto-Italic.ttf','Roboto-MediumItalic.ttf'];
 if(!fontFiles.every(name=>typeof window.pdfMake.vfs?.[name]==='string'&&window.pdfMake.vfs[name].length>0)){
  status.textContent="Не удалось загрузить шрифты PDF. Проверьте подключение к интернету и обновите страницу.";return false;
 }
 try{
  status.textContent="Формируется PDF…";
  window.pdfMake.createPdf(documentDefinition).download(filename,()=>{
   status.textContent="Спецификация подготовлена для скачивания.";
   if(typeof onSuccess==='function')onSuccess();
  });
  return true;
 }catch(error){status.textContent="Не удалось сформировать PDF: "+(error?.message||String(error));return false;}
}
function downloadSpecification(payload,product,filename,status,onSuccess){return downloadDocument(createPdfDocument(payload,product),filename,status,onSuccess);}
function openDownloadModal(modal){if(!modal)return;if(typeof modal.showModal==="function")modal.showModal();else modal.setAttribute("open","");}
function closeDownloadModal(modal){if(!modal)return;if(typeof modal.close==="function")modal.close();else modal.removeAttribute("open");}
return {createContact,createPdfDocument,downloadDocument,downloadSpecification,openDownloadModal,closeDownloadModal,pdfTableLayout,fitPdfTableWidths};
})();
