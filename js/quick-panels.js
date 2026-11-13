"use strict";
(() => {
 const $=id=>document.getElementById(id), scenario=document.body.dataset.panelScenario;
 const standard=scenario==="standard",wall=scenario==="wall";
 const Core=window.WoodstockPanelsCore,Common=window.WoodstockQuickCommon;
 let api=null,contact=null,submitted=false,syncing=false,certifiedState=false;
 const title=document.querySelector('h1').textContent;
 const money=Core.formatMoney,number=v=>Number.isFinite(v)?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:4}).format(v):'—';
 const allowed=standard?['mdf','dsp','gsp','plywood_water','plywood_light','plywood_flexible','blockboard']:wall?['mdf','dsp','gsp','plywood_water','plywood_light']:['mdf','dsp','plywood_water','plywood_light','blockboard'];
 window.WoodstockPanelsView={
  allowBase:base=>Boolean(base)&&(wall?base.id==='mdf':allowed.includes(base.id)),
  baseSelectable:base=>!base||['mdf','dsp'].includes(base.id),
  priceSensitivePatterns:true,
  emptyInitialBase:!wall,
  fixedWallConfiguration:wall,
  sameBackLayout:standard,
  faceThicknesses:wall?[0.6,1,1.5]:null,
  positionPricing:true,
  edgeVolumePricing:true,
  automaticOperations:true,
  transitionMinimumPieces:2,
  allowLayout:(layout,type)=>layout.id!=="herringbone"&&(!standard||layout.id!=="custom")&&(!standard||!["design","multi"].includes(type)||layout.id==="straight"),
  thicknesses:(base,values,data)=>(values||[]).filter(value=>{
   if(!base||!['mdf','dsp'].includes(base.id))return false;
   const key=String(value),mode=standard?'standard':'exact';
   if(base.id==='mdf'&&key==='24')return false; // Legacy standard rates AC23:AC24 conflict with the exact-price classification; confirmation pending.
   if(wall&&key!=='12')return false;
   const status=data.baseThicknessScenarioPriceModes?.[base.id]?.[key]?.[mode]||data.baseThicknessPriceModes?.[base.id]?.[key];
   const rates=standard?data.standardProductionRates:data.nonstandardRates;
   return status==='automatic'&&rates.some(rate=>rate.baseId===base.id&&String(rate.thickness)===key&&Number.isFinite(rate.ratePerM2));
  }),
  changed:result=>{if(api)render(result);}
 };

 const preliminaryDisclaimer='Это предварительный расчёт. Точную стоимость назовёт менеджер, когда уточнит детали вашего заказа';
 // Здесь меняется только язык сообщений для клиента, а не расчётные предупреждения.
 function clientWarningReason(raw){
   const source=String(raw||'').trim();
   if(!source)return '';
   if(/^Присадка:/i.test(source))return 'присадка — отверстия под петли и/или ручки';
   if(/^Не выбрана основа/i.test(source))return 'стоимость основы (материал не выбран)';
   if(/^Не задана корректная толщина основы/i.test(source))return 'стоимость основы (толщина не указана)';
   if(/^Не выбран тип материала/i.test(source))return 'стоимость шпона (тип не выбран)';
   if(/^Не выбрана доступная толщина лицевого шпона/i.test(source))return 'стоимость шпона (толщина не выбрана)';
   if(/^Не добавлен ни один заполненный размер/i.test(source))return 'стоимость изделий (не указаны размеры)';
   if(/^Введите количество целым числом/i.test(source))return 'стоимость изделий (уточните количество)';
   if(/^(Выберите раскладку шпона|Выбранная раскладка недоступна)/i.test(source))return 'стоимость раскладки шпона (уточните раскладку)';
   if(/^Добавьте описание раскладки/i.test(source))return 'стоимость раскладки по индивидуальному заданию';
   if(/^Готовая рубашка:/i.test(source))return 'стоимость приклеивания готового шпона';
   if(/^(Обратная сторона: цена категории|Обратная сторона.*Extra\/AA|Лицевой слой 2 мм:)/i.test(source))return 'стоимость шпона обратной стороны';
   if(/^Черновая обратная сторона:/i.test(source)||/толщины чернового шпона нет подтверждённой ставки/i.test(source))return 'стоимость чернового шпона обратной стороны';
   if(/(ставка бумаги на обратной стороне|Для бумаги на обратной стороне ставка)/i.test(source))return 'стоимость бумаги на обратной стороне';
   if(/^Лак полиуретановый:/i.test(source))return 'покрытие полиуретановым лаком';
   if(/^Глянец 100%:/i.test(source))return 'покрытие с блеском 100%';
   if(/технологической схемы\/числа сторон нет подтверждённого/i.test(source))return 'стоимость выбранного покрытия';
   if(/^Фаска:/i.test(source))return 'стоимость фаски на кромке';
   if(/(операци[яи] кромления|кромление требуется|тарифа операции кромления)/i.test(source))return 'работа по кромлению';
   if(/(кромка отсутствует в складском прайсе|складской кромки нет цены)/i.test(source))return 'стоимость выбранной кромки';
   if(/^Калибровка ДСП:/i.test(source)||/Для калибровки не задана базовая ставка/i.test(source))return 'обработка основы до нужной толщины';
   if(/чистовой припил|тарифа припила/i.test(source))return 'чистовой распил изделия';
   if(/^(Диагональ 45°: ставка|Не подтверждена ставка диагонали)/i.test(source))return 'работа по диагональной раскладке шпона';
   if(/Не подтверждена ставка ёлочки/i.test(source))return 'работа по раскладке шпона «ёлочкой»';
   if(/^Нестандарт со шпоном/i.test(source))return 'дополнительная работа со шпоном выбранной толщины';
   if(/(нет подтверждённой ставки нестандарта|Стандарт по запросу: нет подтверждённой ставки|Базовая стоимость не включена)/i.test(source))return 'стоимость изготовления изделия из выбранной основы';
   if(/(для компонента «|нет подтверждённой цены|не подставляется)/i.test(source))return 'стоимость выбранного материала или производственной операции';
   if(/^(Фактическое количество шпона не задано|Укажите фактическое количество шпона)/i.test(source))return 'стоимость шпона (требуется уточнить расход)';
   if(/готовой рубашки/i.test(source))return 'стоимость готового шпона';
   return source.replace(/\s*Расчёт неполный[.;]?/gi,'').replace(/[.\s]+$/,'');
 }
 function clientWarningReasons(result,boring){
   const raw=[...(result?.warnings||[]),...(boring?['Присадка: стоимость определяет производство.']:[])];
   return [...new Set(raw.map(clientWarningReason).filter(Boolean))];
 }
 function preliminaryPartialText(result,boring){
  if(result?.pricingUnavailable)return "Полиэфирный лак: сначала требуется найти производство и согласовать возможность изготовления. Стоимость заказа уточняет менеджер.";
   const reasons=clientWarningReasons(result,boring);
   const list=reasons.length?reasons.join('; '):'стоимость материалов или работ, которые требуется уточнить';
   return 'Это предварительный расчёт. В сумму пока не вошли: '+list+'. Менеджер уточнит детали заказа и назовёт стоимость, максимально близкую к итоговой';
 }
 // Внутренние вопросы из вкладок «Краткий» и «Второй круг правок».
 // Пометки принадлежат только интерфейсу: productDocument не читает их из DOM.
 function removeReviewNotes(){
  document.querySelectorAll('.prototype-review-note,#calibrationPurchaseReviewNote').forEach(note=>note.remove());
 }
 function syncFixedInfo(result){
  const form=api.form;
  const text=control=>control?.value?control.selectedOptions?.[0]?.textContent.trim()||control.value:'';
  const field=(control,fixed)=>control?.closest('.field')?.toggleAttribute('data-summary-fixed',fixed);
  const section=control=>control.closest('.form-block');
  const info=(id,block,parameters,explanation,details='',visible=true)=>{
   let node=$(id);
   if(!node){
    node=document.createElement('div');node.id=id;node.className='quick-fixed-info';
    const heading=document.createElement('p'),strong=document.createElement('strong');heading.className='quick-fixed-info__parameters';heading.append(strong);
    const note=document.createElement('p');note.className='field__note';
    const extra=document.createElement('p');extra.className='field__note quick-fixed-info__details';
    node.append(heading,note,extra);block.querySelector('h2').after(node);
   }
   node.hidden=!visible;node.querySelector('strong').textContent=parameters;
   node.children[1].textContent=explanation;node.children[2].textContent=details;node.children[2].hidden=!details;
  };
  document.querySelector('.spec-panel .spec-list')?.remove();
  const baseBlock=section(form.baseSelect),veneerBlock=section(form.veneerTypeSelect),edgeBlock=section(form.edgeModeSelect),finishBlock=section(form.finishSelect);
  if(wall){
   baseBlock.removeAttribute('data-summary-fixed');
   info('quickFixedBaseInfo',baseBlock,text(form.baseSelect)+' · '+text(form.baseThicknessSelect),
    'На эту основу наклеивается выбранный вами шпон. В кратком расчёте стеновых панелей используем МДФ толщиной 12 мм; материал и толщина основы зафиксированы для предварительного расчёта.');
  }
  const fixedSides=wall||form.veneeredSidesSelect.disabled&&!!form.veneerThicknessSelect.value;
  if(!wall)field(form.veneeredSidesSelect,fixedSides);
  const paper=form.reverseSideSelect.querySelector('option[value="paper"]');
  const fixedBack=wall||!!form.veneerThicknessSelect.value&&form.veneeredSidesSelect.value==='1'&&(!paper||paper.disabled||paper.hidden);
  if(!wall)field(form.reverseSideSelect,fixedBack);
  const fixedLayout=standard&&form.layoutSelect.disabled&&!!form.layoutSelect.value;
  field(form.layoutSelect,fixedLayout);
  const fixedBackLayout=standard&&form.layoutBSelect.disabled&&form.veneeredSidesSelect.value==='2'&&!!form.layoutSelect.value;
  field(form.layoutBSelect,standard&&form.layoutBSelect.disabled);
  const veneerParameters=[],veneerNotes=[];
  if(fixedSides)veneerParameters.push('Фанеровка — '+text(form.veneeredSidesSelect));
  if(fixedBack){
   veneerParameters.push('На обороте — '+text(form.reverseSideSelect).toLocaleLowerCase('ru'));
   veneerNotes.push('Обратная сторона закрывается техническим шпоном. Он нужен, чтобы изделие не повело. На нём допустимы природные особенности древесины.');
  }else if(fixedSides)veneerNotes.push('Для шпона выбранной толщины предусмотрена фанеровка с двух сторон. Материал обратной стороны укажите ниже.');
  if(fixedLayout){veneerParameters.push('Раскладка — '+text(form.layoutSelect));veneerNotes.push('Для выбранного материала в кратком расчёте используется прямая раскладка.');}
  if(fixedBackLayout){veneerParameters.push('Раскладка оборота — '+(text(form.layoutBSelect)||text(form.layoutSelect)));veneerNotes.push('Раскладка обратной стороны повторяет лицевую.');}
  info('quickFixedVeneerInfo',veneerBlock,veneerParameters.join(' · '),veneerNotes.join(' '),'',veneerParameters.length>0);
  $('quickWallBackExplanation')?.toggleAttribute('data-quick-hidden',wall);
  const attached=result?.edge?.mode==='attached',separate=result?.edge?.mode==='separate';
  const fixedWidth=attached&&(wall||form.edgeWidthSelect.disabled||form.edgeOrderWidthInput.readOnly);
  field(form.edgeWidthSelect,fixedWidth);field(form.edgeOrderWidthInput,fixedWidth);
  const metersSummary=$('attachedEdgeMetersSummary');metersSummary?.closest('.field')?.toggleAttribute('data-summary-fixed',!standard&&attached);
  const edgeParameters=[],edgeNotes=[];
  if(wall){
   edgeParameters.push(text(form.edgeSidesSelect));
   if(form.edgeThicknessSelect.value)edgeParameters.push('Кромка '+text(form.edgeThicknessSelect)+' мм');
   edgeNotes.push('Кромка закрывает торцы панели. Для расчёта принята облицовка всего периметра. Ширина кромки подбирается автоматически с учётом итоговой толщины изделия. Породу кромки можно изменить ниже.');
  }else if(attached){
   edgeParameters.push('Облицовка кромкой');
   if(text(form.edgeTypeSelect))edgeParameters.push(text(form.edgeTypeSelect));
   edgeNotes.push('Кромка закрывает торцы детали. Ширина подбирается автоматически по итоговой толщине изделия. Породу, толщину кромки и стороны облицовки выберите ниже.');
  }else if(separate){
   edgeParameters.push('Кромка в рулоне');
   edgeNotes.push('Рулон рассчитывается по указанным вами ширине и метражу. Запас к метражу не добавляется.');
  }
  if(fixedWidth&&Number.isFinite(result?.edge?.widthMm))edgeParameters.push('Ширина '+number(result.edge.widthMm)+' мм');
  const edgeDetails=[];
  if(attached&&metersSummary?.textContent.trim()&&metersSummary.textContent.trim()!=='—')edgeDetails.push(metersSummary.textContent.trim());
  if(result?.edge?.priceCatalogSource)edgeDetails.push('Источник цены: '+result.edge.priceCatalogSource);
  info('quickFixedEdgeInfo',edgeBlock,edgeParameters.join(' · '),edgeNotes.join(' '),edgeDetails.join(' · '),wall||attached||separate);
  const finish=!!form.finishSelect.value&&form.finishSelect.value!=='none';
  const fixedScheme=finish&&['lacquer_acrylic','enamel'].includes(form.finishSelect.value);
  const fixedFinishSides=finish&&form.finishSidesSelect.closest('.field').hasAttribute('data-quick-hidden');
  const finishParameters=[];
  if(wall||standard)finishParameters.push(text(form.finishSelect));
  if(fixedScheme)finishParameters.push(text(form.finishSelect.value==='enamel'?form.enamelVariantSelect:form.lacquerProcessSelect));
  if(fixedFinishSides)finishParameters.push(text(form.finishSidesSelect));
  const finishExplanation=wall
   ? 'Прозрачный акриловый лак сохраняет видимый рисунок шпона. В кратком расчёте принята схема «Грунт + лак» на лицевой стороне. Степень блеска выберите ниже.'
   : standard&&!finish?'В этом кратком расчёте плита рассчитывается без финишного покрытия. Если нужно покрытие, укажите пожелания в комментарии к заказу.'
   : 'Для предварительного расчёта используется указанная технологическая схема покрытия. Доступные параметры финиша выберите ниже.';
  field(form.finishSelect,wall||standard);
  finishBlock.removeAttribute('data-summary-fixed');
  info('quickFixedFinishInfo',finishBlock,finishParameters.join(' · '),finishExplanation,'',finishParameters.length>0);
  $('quickFinishExplanation')?.setAttribute('data-quick-hidden','');
  if(!$('quickFixedParametersNote')){
   const note=document.createElement('p');note.id='quickFixedParametersNote';note.className='field__note quick-fixed-request-note';
   note.textContent='Если нужны другие параметры, укажите их в комментарии. Менеджер уточнит возможность изготовления и стоимость.';
   $('contactBlock').querySelector('h2').after(note);
  }
 }
 function render(result){
  if(syncing)return;
  const form=api.form;
  const certified=wall&&result?.base?.id==='gsp';
  if(certified!==certifiedState){
   certifiedState=certified;syncing=true;
   if(certified){form.finishSelect.add(new Option('По сертификату КМ1','none'));form.finishSelect.value='none';form.edgeModeSelect.value='none';}
   else if(!standard){form.finishSelect.querySelector('option[value="none"]')?.remove();form.finishSelect.value='';}
   form.finishSelect.disabled=certified;form.edgeModeSelect.disabled=certified;
   form.finishSelect.dispatchEvent(new Event('change',{bubbles:true}));form.edgeModeSelect.dispatchEvent(new Event('change',{bubbles:true}));
   syncing=false;result=api.result();
  }
  if(wall&&$('quickFinishExplanation')) {
   const descriptions={
    lacquer_acrylic:'Прозрачное покрытие на водной основе, сохраняет рисунок и цвет шпона, подходит для стен и мебели без высокой нагрузки.',
    lacquer_polyurethane:'Прозрачное покрытие повышенной прочности, лучше переносит частые прикосновения и влажную уборку, подходит для коридоров, холлов и общественных помещений.',
    enamel:'Непрозрачное цветное покрытие, перекрывает рисунок шпона, но сохраняет его фактуру.'
   };
   const text=descriptions[form.finishSelect.value]||'';
   $('quickFinishExplanation').textContent=text;
   $('quickFinishExplanation').classList.toggle('is-hidden',!text);
  }
  if(wall||scenario==='details'){ $('quickToningField')?.remove(); $('quickPatternTransition')?.closest('label')?.remove(); }
  // The short scenario selects the documented finish process, then the existing controller prices it.
  const process=form.finishSelect.value==='lacquer_acrylic'&&form.lacquerProcessSelect.value===''?'primer_lacquer':null;
  if(process&&[...form.lacquerProcessSelect.options].some(o=>o.value===process)){
   syncing=true;form.lacquerProcessSelect.value=process;api.recalculate();syncing=false;result=api.result();
  }
  if(form.finishSelect.value==='enamel'&&!form.enamelVariantSelect.value){syncing=true;form.enamelVariantSelect.value='Грунт + эмаль';api.recalculate();syncing=false;result=api.result();}
  const ready=!!result?.base&&!!result.validSizes?.length&&!api.issues().length&&(standard||certified||!!form.finishSelect.value);
  const boring=$('boringSelect')?.value==='yes';
  const hasKnownPrice=Number.isFinite(result?.finalTotal)&&result.finalTotal>0;
  removeReviewNotes();
  syncFixedInfo(result);
  const partial=(hasKnownPrice||ready)&&(!ready||!result.priceCalculationComplete||boring);
  $('resultTotal').textContent=result?.pricingUnavailable?'Стоимость уточняется':!hasKnownPrice&&!ready?'—':partial?(hasKnownPrice?money(result.finalTotal)+' *':'Стоимость рассчитает менеджер'):money(result.finalTotal);
  $('priceLabel').textContent='Ориентировочная стоимость с НДС';
  $('partialWarning').classList.toggle('is-hidden',!partial);
  $('partialWarning').textContent=partial?preliminaryPartialText(result,boring):'';
  $('quickArea').textContent=result?.base&&result.totalArea>0?number(result.totalArea)+' м²':'—';

 }
 function productDocument(record,result){
  const side=(material,pattern)=>material?[`${material.name||'—'} · ${number(material.thicknessMm)} мм`,pattern].filter(Boolean).join(' · '):record.sideB||'—';
  const edge=record.edge||{};
  const certified=wall&&record.baseId==='gsp';
  const edgeText=certified?'По сертификату КМ1 (уточняет производство)':edge.mode==='none'?'Не нужна':[edge.typeName,edge.veneerName||edge.name,edge.thicknessApplicable?number(edge.thicknessMm)+' мм':'',number(edge.widthMm)+' мм',number(edge.meters??edge.orderedMeters)+' пог. м',edge.priceCatalogSource].filter(Boolean).join(' · ');
  const edgeForPosition=row=>{
   if(edge.mode==='none')return 'Не нужна';
   if(edge.mode==='separate')return 'Отдельная спецификация';
   const position=edge.positionSettings?.find(item=>item.position===row.position);
   if(!position)return 'См. спецификацию кромки';
   if(!position.applies)return 'Не нужна';
   return [edge.typeName,edge.veneerName||edge.name,Number.isFinite(position.thicknessMm)?number(position.thicknessMm)+' мм':'',Number.isFinite(position.widthMm)?number(position.widthMm)+' мм':'',position.sides,number(position.calculatedMeters)+' пог. м',position.priceCatalogSource||edge.priceCatalogSource].filter(Boolean).join(' · ');
  };
  const boring=$('boringSelect')?.value==='yes';
  const rows=record.sizes.map(row=>{
   const partial=row.pricingPartial||boring;
   const value=amount=>result.pricingUnavailable?'Уточняется':money(amount)+(partial&&Number.isFinite(amount)?' *':'');
   const classification=standard&&['warehouse_standard','standard_request'].includes(row.classificationId)?row.classificationName:'';
   return [
   String(row.position),[record.title,classification].filter(Boolean).join('\n'),
   `А: ${side(record.materialSides.A,record.veneerCut)}\nБ / оборот: ${record.sides===2?side(record.materialSides.B,record.veneerBCut):record.sideB}\nШпон: ${Number(record.sides)===2?'с двух сторон':'с одной стороны'}`,
   `А: ${record.layout}\nБ: ${record.layoutB||'—'}\n${certified?'Покрытие по сертификату КМ1 (уточняет производство)':record.finishByPosition.find(x=>x.position===row.position)?.summary||record.finish}\nКромка: ${edgeForPosition(row)}${row.comment?'\nКомментарий: '+row.comment:''}${$('boringSelect')?.value==='yes'?'\nПрисадка: по чертежу':''}`,
   `${row.length} × ${row.width}`,String(row.quantity),number(row.area),
   `${value(row.knownPricePerPiece)} / шт.\n${value(row.knownPricePerM2)} / м²`,value(row.knownSubtotal)
  ];});
  const partial=!result.priceCalculationComplete||$('boringSelect')?.value==='yes';
  const notes=[{text:preliminaryDisclaimer,style:'infoSmall',margin:[0,4,0,8]}];
  const rowPartial=record.sizes.some(row=>row.pricingPartial)||boring;
  if(rowPartial)notes.push({text:'* Частичная стоимость позиции: учтены только рассчитанные составляющие.',style:'infoSmall'});
  if(certified)notes.push({text:"ГСП: состав кромки и покрытия по сертификату КМ1 подтверждает производство.",style:"infoText"});
  if(partial)notes.push({text:preliminaryPartialText(result,boring),style:'infoText',margin:[0,8,0,4]});

  if(edge.mode!=='none')notes.push({text:'Кромка — данные отдельной спецификации',style:'sectionTitle'},{text:edgeText,style:'infoSmall'});
  const files=[...new Set([...contact.fileNames(),...(record.layoutTzFiles||[]),...record.sizes.flatMap(row=>row.files||[])])];
  if(record.layoutTzComment)notes.push({text:'Требования к раскладке: '+record.layoutTzComment,style:'infoText'});
  notes.push({text:'Дополнительные требования',style:'sectionTitle'},{text:record.comment||'—',style:'infoText'},{text:'Файлы: '+(files.join(', ')||'нет'),style:'infoSmall'},{text:'Связь с менеджером: '+($('managerContactInput').checked?'нужна':'не запрошена'),style:'infoSmall'});
  return {dontBreakRows:false,title,numberPrefix:'КР-ПЛ-',subtitle:'Краткий расчёт плит',preliminaryPriceLabels:true,widths:[12,52,110,103,57,24,38,65,65],header:['№','Основа','Шпон','Раскладка и обработка','Размер, мм','Шт.','Площадь, м²','Цена с НДС','Сумма с НДС'].map(text=>({text,style:'tableHeader'})),rows,afterPrice:notes};
 }
 // Standard sizes are tied to the chosen base. A cleared base must not retain a previously selected format.
 function clearBaseDependentStandardSizes(){
  api.form.sizeRows.querySelectorAll('[data-size-row][data-size-mode="standard"]').forEach(row=>{
   row.dataset.sizeMode='';
   delete row.dataset.sourceStandardLength;
   delete row.dataset.sourceStandardWidth;
   ['length','width'].forEach(key=>{
    const input=row.querySelector(`[data-size-${key}]`);
    if(input){input.value='';input.readOnly=false;}
   });
   row.querySelectorAll('[data-standard-size].is-selected').forEach(button=>button.classList.remove('is-selected'));
  });
 }
 function contactForm(){return {name:$('nameInput'),phone:$('phoneInput'),city:$('cityInput'),email:$('emailInput'),comment:$('commentInput'),files:$('filesInput'),managerContact:$('managerContactInput'),privacy:$('privacyInput')};}
 function submit(){
  submitted=true;const issues=contact.validate();
  if(issues.length){$('saveStatus').textContent='Заполните обязательные контактные данные и согласие.';issues[0].input.focus();return;}
  if(!standard&&api.form.finishSelect.value===''){$('saveStatus').textContent='Выберите покрытие.';api.form.finishSelect.focus();return;}
  if(!standard&&api.form.layoutSelect.value==='custom'&&!api.form.layoutTzFiles.files.length){$('saveStatus').textContent='Для индивидуальной раскладки приложите файл.';api.form.layoutTzFiles.focus();return;}
  if(scenario==='details'&&$('boringSelect').value==='yes'&&!contact.fileNames().length){$('saveStatus').textContent='Для присадки приложите чертёж.';return;}
  // This is the detailed calculation's own validation and serialization, without writing a specification item.
  const record=api.capture();if(!record)return;
  delete record.patternTransitionRequested;
  const result=api.result();
  if($('boringSelect')?.value==='yes')record.sizes.forEach(row=>{row.pricingPartial=true;row.pricingComplete=false;row.total=null;row.pricePerM2=null;row.pricePerPiece=null;row.pendingCosts=[...(row.pendingCosts||[]),'Присадка: стоимость производства'];});
  const f=contactForm(),partial=!result.priceCalculationComplete||$('boringSelect')?.value==='yes';
  const payload={createdAt:record.createdAt,pricing:{total:result.pricingUnavailable?null:result.finalTotal,finalPricePerM2:result.pricingUnavailable?null:result.avgM2,vat:result.pricingUnavailable?null:result.vat,partial},contact:{name:f.name.value.trim(),phone:f.phone.value.trim(),city:f.city.value.trim(),email:contact.normalizeEmail(f.email.value),comment:f.comment.value.trim(),files:contact.fileNames(),callbackRequested:f.managerContact.checked,privacyAccepted:f.privacy.checked}};
  try{localStorage.setItem('woodstockQuickPanelsCalculation',JSON.stringify({...record,...($('boringSelect')?.value==='yes'?{boring:{required:true,pricingStatus:'production'},pricingPartial:true,requiresProductionCost:true,total:null,knownSubtotal:result.finalTotal}:{}),contact:payload.contact}));}catch(error){console.warn('Не удалось сохранить расчёт локально:',error);}
  Common.downloadSpecification(payload,productDocument(record,result),`woodstock-panels-${scenario}-specification.pdf`,$('saveStatus'),()=>{$('saveStatus').textContent='Спецификация и расчёт скачаны в PDF.';Common.openDownloadModal($('downloadModal'));});
 }
 async function init(){
  api=window.WoodstockPanelsController;await api.ready;
  // Run before the detailed controller's change handler and its recalculation.
  api.form.baseSelect.addEventListener('change',()=>{if(!api.form.baseSelect.value)clearBaseDependentStandardSizes();},true);
  const f=contactForm(),ui={citySuggestions:$('citySuggestions'),selectedFiles:$('selectedFiles')};
  contact=Common.createContact({form:f,ui,submitted:()=>submitted,renderAll:()=>api.recalculate()});contact.bind();
  f.files.addEventListener('change',()=>api.recalculate());
  $('getCalculationButton').addEventListener('click',submit);
  // Присадка влияет на полноту стоимости, обновляем чек без другого действия.
  $('boringSelect')?.addEventListener('change',()=>render(api.result()));

  $('downloadModalClose').addEventListener('click',()=>Common.closeDownloadModal($('downloadModal')));
  $('downloadModal').addEventListener('click',event=>{if(event.target===$('downloadModal'))Common.closeDownloadModal($('downloadModal'));});
  api.form.root.addEventListener('submit',event=>{event.preventDefault();submit();});
  if(!wall&&!api.form.veneeredSidesSelect.querySelector('option[value=""]')) api.form.veneeredSidesSelect.add(new Option('Выберите вариант',''),0);
  api.form.veneeredSidesSelect.value=wall?'1':'';
  if(standard)api.form.finishSelect.value='none';
  else{
   api.form.finishSelect.querySelector('option[value="none"]')?.remove();api.form.finishSelect.add(new Option('Выберите покрытие',''),0);api.form.finishSelect.value='';
   const prepareRows=()=>{document.querySelectorAll('[data-size-row]').forEach(row=>{if(!row.dataset.sizeMode)api.customSize(row,{focus:false});});};
   prepareRows();new MutationObserver(prepareRows).observe(api.form.sizeRows,{childList:true});
  }
  // В кратком расчёте фасадов скрытая фаска не должна попадать в цену.
  // Элемент остаётся в DOM для общего расчётного контроллера.
  if(scenario==='details') api.form.edgeBevelSelect.value='no';
  // These are the existing detailed fields, hidden for the shortened client scenario.
  ['toningSelect','isolatorSelect','positionFinishToggle','positionEdgeToggle','lacquerExecutionSelect','lacquerProcessSelect','enamelVariantSelect','edgeOrderPriceInput','separateEdgeOrderPriceInput'].forEach(id=>{$(id)?.closest('.field')?.setAttribute('data-quick-hidden','');});
  if(wall){
   api.form.finishSelect.value='lacquer_acrylic';
  }
  api.form.finishSelect.dispatchEvent(new Event('change',{bubbles:true}));api.recalculate();render(api.result());
 }
 // Configure the view before detailed-panels.js starts; the DOM event runs after it has been loaded.
 window.addEventListener('DOMContentLoaded',()=>init().catch(error=>{console.error(error);$('saveStatus').textContent='Не удалось запустить расчёт.';}));
})();
