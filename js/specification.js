(() => {
  'use strict';
  const State=window.WoodstockSpecificationState,Common=window.WoodstockQuickCommon;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const n=value=>Number.isFinite(value)?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:4}).format(value):'—';
  const money=value=>Number.isFinite(value)?new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(value):'Уточняется';
  // Each displayed monetary line is rounded to kopecks before order summation.
  const moneyCents=value=>Math.round((value+Math.sign(value)*Number.EPSILON*Math.max(1,Math.abs(value)))*100);
  const roundMoney=value=>Number.isFinite(value)?moneyCents(value)/100:null;
  const join=values=>values.filter(value=>value!==undefined&&value!==null&&value!=='').join('\n');
  const uid=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():'position_'+Date.now()+'_'+Math.random().toString(36).slice(2);
  const metadataKey='woodstockDetailedOrder';
  let records=[],otherRecords=[],order={},busy=false,editorIndex=null,editorController=null,engineWindow=null,pendingEditor=null,editingRow=0;
  const requestedType=new URLSearchParams(location.search).get('product')||sessionStorage.getItem('woodstockSpecificationProduct');
  let productType=requestedType==='flooring'?'flooring':'plate';
  let restoringFocus=false,sourceRegistry=new Map(),editorOriginalRecords=null;
  const pendingChanges=new Set();
  const serviceNames={delivery:'Доставка',installation:'Монтаж',measurement:'Замер',design:'Конструкторские услуги',other:'Другое'};
  const panelHeaders=['№','Основа','Шпон А / Б','Раскладка','Размеры и количество','Обработка','Площадь, объём, вес основы','Цена с НДС','Сумма с НДС','Примечания и дополнительные параметры'];
  const floorHeaders=['№','Конструкция и шпон','Сортировка и рисунок','Размеры и соединение','Раскладка','Площадь и запас','Покрытие','Цена за м² с НДС','Сумма с НДС','Примечания и дополнительные параметры'];
  const edgeHeaders=['Изделие','Кромка','Ширина / толщина, мм','Торцы','Геометрический метраж, пог. м','Расход / к заказу, пог. м','Цена за пог. м с НДС','Материал с НДС','Кромление с НДС'];
  function persist(next=records){State.write([...otherRecords,...next]);records=next;}
  function status(message){$('pageStatus').textContent=message;}
  function saveOrder(){
    const next={...order};document.querySelectorAll('[data-order]').forEach(node=>next[node.id]=node.type==='checkbox'?node.checked:node.value);
    try{sessionStorage.setItem(metadataKey,JSON.stringify(next));order=next;renderExtras();}catch(error){status('Не удалось сохранить данные заказа: '+error.message);}
  }
  function services(){return [...(order.packagingSelect?['Упаковка: '+order.packagingSelect]:[]),...Object.entries(serviceNames).filter(([id])=>order[id]).map(([,label])=>label)];}
  function known(record){
    if(record.pricingUnavailable || editorController && records[editorIndex]?.id === record.id && editorController.result?.()?.pricingUnavailable)return null;
    // A partial record with no calculated monetary amount is unknown, not a zero-ruble offer.
    if(inProduction(record)){
      const materialCost=materialKnown(record);
      return moneyCents(materialCost)!==0?materialCost:null;
    }
    if(editorController&&editorIndex!==null&&records[editorIndex]?.id===record.id){
      const live=editorController.result?.();
      const value=live?.finalTotal??live?.total??null;
      const rounded=roundMoney(value);
      return partial(record)&&(!Number.isFinite(rounded)||moneyCents(rounded)===0)?null:rounded;
    }
    const value=Number.isFinite(record.specification?.knownTotal)?record.specification.knownTotal:Number.isFinite(record.total)?record.total:null;
    const rounded=Number.isFinite(value)?roundMoney(value+edgeDiscount(record).delta):null;
    return partial(record)&&(!Number.isFinite(rounded)||moneyCents(rounded)===0)?null:rounded;
  }
  function partial(record){if(record.sizes?.some(row=>row.productionFitStatus==='unconfirmed'))return true;if(inProduction(record))return !quoteState().valid||!materialsComplete(record);if(editorController&&editorIndex!==null&&records[editorIndex]?.id===record.id){const live=editorController.result?.();return !live||(productType==='plate'?!live.priceCalculationComplete:!Number.isFinite(live.total));}return record.pricingPartial===true||!Number.isFinite(record.total);}
    // Production quote belongs to the order and is never allocated to individual rows.
  const productionReason = reason => /^(Стоимость производства|Основа и производственные операции|Работа с толстым шпоном|Операция кромления:|Калибровка:|Фаска:|Финишное покрытие)/.test(reason);
  const productionEligible = record => record.productType==='plate' && !record.sizes?.some(row=>row.classificationId==='warehouse_standard');
  const productionRequired = record => productionEligible(record) && (record.productionCosts?.some(q=>q.required)||record.requiresProductionCost);
  function productionScope(){
    const selected=new Set(order.productionScopeIds||[]);
    return records.filter(record=>productionEligible(record)&&(selected.has(record.id)||productionRequired(record)));
  }
  function inProduction(record){return productionScope().some(item=>item.id===record.id);}
  function effectiveWarnings(record){return inProduction(record)&&quoteState().valid&&materialsComplete(record)?(record.warnings||[]).filter(note=>!/ставк|стоимость.*производ|цен.*производ|производственн.*сумм|производственн.*стоим/i.test(note)):(record.warnings||[]);}
  function materialParts(record){
    return (record.specification?.breakdown||[]).filter(item=>(record.calibration?.separatelyPriced && /^Калибровка основы$/.test(item.label)) || /^(Шпон|Чернов|Бумага|Готовая рубашка|Кромка(?: отдельно)? — материал)/.test(item.label));
  }
  function materialKnown(record){
    const subtotal = materialParts(record).reduce((sum, item) =>
      sum + (Number.isFinite(item.value) ? item.value : 0), 0);
    return roundMoney(subtotal + edgeDiscount(record).delta);
  }
  function materialsComplete(record){
    if(record.sizes?.some(row=>row.productionFitStatus==='unconfirmed'))return false;
    const missing=(record.sizes||[]).flatMap(row=>row.pendingCosts||[]).filter(reason=>!productionReason(reason));
    return !missing.length && Object.values(record.pricing?.veneer||{}).flat().every(item=>Number.isFinite(item.calculatedCost)&&!item.condition?.unresolved&&!item.condition?.requiresPriceAgreement) && (record.veneerConsumptions||[]).every(item=>Number.isFinite(item.materialCost)) && (record.pricing?.readyShirts||[]).every(item=>item.requirementStatus==='calculated'&&Number.isFinite(item.materialCost)&&!item.priceCondition?.unresolved) &&
      (record.edge?.mode==='none'||!record.edge||['calculated','calculated_manual_order_price','not_required'].includes(record.edge.materialPricingStatus));
  }
  function quoteSignature(){
    // Include the complete production request. Descriptive order/contact edits do not affect it.
    return JSON.stringify(productionScope().map(record=>({id:record.id,base:record.baseId,thickness:record.baseThickness,
      sides:record.sides,materials:record.materialSides,layout:record.layoutId,layoutB:record.layoutBId,
      sanding:record.sanding,calibration:record.calibration,finish:record.finishParameters,finishByPosition:record.finishByPosition,
      sizes:record.sizes.map(row=>({length:row.length,width:row.width,quantity:row.quantity,manufacturing:row.manufacturingType,transition:row.transition,comment:row.comment,files:row.files})),
      edge:{mode:record.edge?.mode,type:record.edge?.typeId,material:record.edge?.catalogItemId,thickness:record.edge?.thicknessMm,width:record.edge?.widthMm,bevel:record.edge?.bevel,meters:record.edge?.meters,
        positions:record.edge?.positionSettings?.map(item=>({position:item.position,sides:item.sidesId,thickness:item.thicknessMm,width:item.widthMm,meters:item.calculatedMeters}))},
      comment:record.comment,files:record.files,layoutComment:record.layoutTzComment,layoutFiles:record.layoutTzFiles})));
  }
  function decimal(value){const raw=String(value??'').trim().replace(/\s/g,'');return /^\d+(?:[.,]\d{1,2})?$/.test(raw)?Number(raw.replace(',','.')):null;}
  function quoteState(){
    const scope=productionScope(),quote=order.productionQuote;
    const valid=scope.length>0&&!!quote&&quote.signature===quoteSignature()&&quote.cost>0&&quote.markup>=0&&Number.isSafeInteger(Math.round(quote.cost*100))&&Number.isSafeInteger(Math.round(quote.cost*(1+quote.markup/100)*100));
    return {scope,valid,stale:!!quote&&!valid,cost:valid?quote.cost:null,markup:valid?quote.markup:null,clientCost:valid?roundMoney(quote.cost*(1+quote.markup/100)):null};
  }
  function renderProduction(){
    const section=$('productionSection');if(!section)return;
    section.classList.toggle('is-hidden',productType!=='plate'||!records.length);
    if(productType!=='plate')return;
    const state=quoteState();
    $('productionScope').innerHTML=records.filter(productionEligible).map(record=>'<label class="toggle-line"><input type="checkbox" data-production-scope="'+esc(record.id)+'" '+(inProduction(record)?'checked ':'')+(productionRequired(record)?'disabled':'')+'><span>Изделие '+(records.indexOf(record)+1)+' · '+esc(record.title)+(productionRequired(record)?' — требуется цена производства':'')+'</span></label>').join('');
    $('productionStatus').textContent=!state.scope.length?'Все позиции имеют автоматический расчёт. При необходимости включите изделия в общий запрос производства.':state.valid?'Стоимость подтверждена для текущего состава запроса.':state.stale?'Состав или параметры запроса изменены. Требуется повторное подтверждение стоимости производства.':'Введите общую стоимость производства для отмеченных изделий.';
    $('productionSummary').innerHTML=table(['Составляющая','Сумма с НДС'],[['Себестоимость производства',money(state.cost)],['Наценка, '+(state.valid?n(state.markup):$('productionMarkupInput').value)+'%',state.valid?money(state.clientCost-state.cost):'Уточняется'],['Производство для клиента',money(state.clientCost)]]);
    $('confirmProduction').disabled=!!editorController||busy||!state.scope.length;
  }
  function edgeEntries(){
    return records.flatMap(record=>{
      const edge=record.edge;if(!edge||edge.mode==='none')return [];
      const parts=edge.mode==='attached'?(edge.positionSettings||[]).filter(item=>item.applies):[{...edge,position:null,calculatedMeters:edge.orderedMeters??edge.meters}];
      return parts.map(part=>{
        // У кромления каждой детали собственный материал, ширина и тариф в selection.
        // Общие параметры edge нельзя использовать вместо них при разных позициях.
        const selection=part.selection||part;
        const catalog=selection.catalogItemId||part.catalogItemId||(edge.mode==='attached'?null:edge.catalogItemId);
        const width=part.widthMm??selection.widthMm??edge.widthMm;
        const thickness=part.thicknessMm??selection.thicknessMm??edge.thicknessMm;
        return {record,part,key:JSON.stringify([catalog,width,thickness]),catalog,
          meters:part.calculatedMeters||0,
          originalRate:selection.pricePerRunningM??part.pricePerRunningM??(edge.mode==='attached'?null:edge.pricePerRunningM),
          levels:selection.volumePriceLevels??part.volumePriceLevels??edge.volumePriceLevels,
          ranges:selection.volumePriceRanges??part.volumePriceRanges??edge.volumePriceRanges};
      });
    });
  }
  function edgeDiscount(record){
    const all=edgeEntries(),entries=all.filter(entry=>entry.record.id===record.id).map(entry=>{
      const total=all.filter(other=>other.key===entry.key&&other.catalog).reduce((sum,other)=>sum+other.meters,0);
      const range=entry.ranges?.find(range=>(range.minExclusive?total>range.minRunningM:total>=range.minRunningM)&&
        (range.maxRunningM===null||range.maxRunningM===undefined||(range.maxExclusive?total<range.maxRunningM:total<=range.maxRunningM)));
      const volume=range?entry.levels?.[range.id]:null;
      const rate=entry.catalog&&Number.isFinite(volume)&&Number.isFinite(entry.originalRate)?Math.min(volume,entry.originalRate):entry.originalRate;
      return {...entry,rate,total,condition:rate<entry.originalRate?range:null,delta:Number.isFinite(rate)&&Number.isFinite(entry.originalRate)?roundMoney(entry.meters*(rate-entry.originalRate)):0};
    });
    return {entries,delta:entries.reduce((sum,entry)=>sum+entry.delta,0)};
  }
  function effectiveEdge(record){
    const edge=record.edge;if(!edge||edge.mode==='none')return edge;
    const discount=edgeDiscount(record),rates=[...new Set(discount.entries.map(entry=>entry.rate))];
    return {...edge,materialCost:Number.isFinite(edge.materialCost)?edge.materialCost+discount.delta:null,
      pricePerRunningM:rates.length===1?rates[0]:null,
      positionSettings:edge.positionSettings?.map(item=>{
        const rate=discount.entries.find(entry=>entry.part.position===item.position)?.rate;
        return {...item,pricePerRunningM:rate??item.selection?.pricePerRunningM??item.pricePerRunningM};
      }),
      operationPricingStatus:inProduction(record)&&quoteState().valid?'included_in_production_quote':edge.operationPricingStatus};
  }
  function productionRows(){const state=quoteState();return state.scope.length?[
    ['Производственный запрос',state.scope.map(record=>'Изделие '+(records.indexOf(record)+1)).join(', ')],
    ['Себестоимость производства с НДС',money(state.cost)],['Наценка',state.valid?n(state.markup)+'%':'Уточняется'],
    ['Производство для клиента с НДС',money(state.clientCost)],['Статус',state.valid?'Подтверждено':'Требуется подтверждение стоимости производства']]:[];}

  function totals(){
    if(records.some(record=>record.pricingUnavailable) || editorController?.result?.()?.pricingUnavailable)return {total:null,vat:null,partial:true};
    const values=records.map(known).filter(Number.isFinite);
    const quote=quoteState();
    // Sum only already rounded order lines in integer kopecks.
    const cents=values.reduce((sum,value)=>sum+moneyCents(value),0)+(quote.valid?moneyCents(quote.clientCost):0);
    const hasKnownAmount=values.length>0||quote.valid;
    const total=hasKnownAmount?cents/100:null;
    const vats=records.map((record,index)=>editorController&&index===editorIndex?(editorController.result?.()?.vat??null):record.specification?.knownVat??record.vat);
    // VAT is included in the rounded gross total, not added on top.
    const vat=productType==='plate'
      ? (hasKnownAmount?roundMoney(total*0.22/1.22):null)
      : records.length&&values.length===records.length&&vats.every(Number.isFinite)
        ? roundMoney(vats.reduce((sum,value)=>sum+value,0)):null;
    return {total,vat,partial:records.some(partial)||services().length>0};
  }
  function table(headers,rows,classes=''){
    return '<div class="spec-table-wrap"><table class="spec-table '+classes+'"><thead><tr>'+headers.map(value=>'<th scope="col">'+esc(value)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(value=>'<td>'+esc(value??'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  }
  function material(side,fallback){return side?join([side.name,side.article?'Артикул: '+side.article:'',side.typeName,Number.isFinite(side.thicknessMm)?n(side.thicknessMm)+' мм':'']):fallback||'—';}
  function panelCells(record,row,label){
    const delta=edgeDiscount(record).entries.filter(entry=>entry.part.position===row.position).reduce((sum,entry)=>sum+entry.delta,0);
    row={...row,knownSubtotal:Number.isFinite(row.knownSubtotal)?row.knownSubtotal+delta:row.knownSubtotal,knownPricePerPiece:Number.isFinite(row.knownPricePerPiece)?row.knownPricePerPiece+delta/row.quantity:row.knownPricePerPiece,knownPricePerM2:Number.isFinite(row.knownPricePerM2)?row.knownPricePerM2+delta/row.area:row.knownPricePerM2};
    const edge=effectiveEdge(record)||{},attached=edge.mode==='attached'?edge.positionSettings?.find(item=>item.position===row.position):null;
    const tech=record.technologicalOperations||{};
    const finish=record.finishByPosition?.find(item=>item.position===row.position)?.summary||record.finish||'—';
    const price=value=>record.pricingUnavailable?'Уточняется':inProduction(record)?'Производство общей суммой; материалы — в итоге изделия':money(value)+(row.pricingPartial&&Number.isFinite(value)?' *':'');
    const weightText=record.specification?.sizes?.[row.position-1]?.find(([key])=>key==='Расчётный вес основы, кг')?.[1]||'—';
    const volume=record.specification?.sizes?.[row.position-1]?.find(([key])=>key==='Объём, м³')?.[1];
    return [label,join([record.base,'Основа: '+record.baseThickness+' мм',record.calibration?.enabled?'После калибровки: '+n(record.calibration.baseThicknessAfterCalibrationMm)+' мм':'']),
      join(['А: '+material(record.materialSides?.A,record.veneerA),'Б / оборот: '+(record.sides===2?material(record.materialSides?.B,record.sideB):record.sideB),'Фанеровка: '+record.sides+' ст.']),
      join(['А: '+(record.layout||'—'),'Б: '+(record.layoutB||'—'),record.veneerCut?'Рисунок А: '+record.veneerCut:'',record.veneerBCut?'Рисунок Б: '+record.veneerBCut:'']),
      join([n(row.length)+' × '+n(row.width)+' мм',n(row.quantity)+' шт.',row.classificationName,row.manufacturingType==='allowance20'?'С припуском: '+n(row.productionLength)+' × '+n(row.productionWidth)+' мм':'']),
      join(['Шлифовка: '+(record.sanding?'да':'нет'),'Финиш: '+finish,attached?.applies?'Кромка: '+(attached.sidesName||attached.sides||attached.sidesId||'—')+' · '+n(attached.calculatedMeters)+' пог. м':edge.mode==='separate'?'Кромка отдельно':'Кромка: нет',edge.bevel?'Фаска на кромке: да':'',tech.calibration?'Калибровка: да':'',row.cleanCuttingRequired?'Чистовой припил: да':'',tech.gluing?'Проклейка основы: да':'',row.transition?'Переход рисунка: да':'',row.comment?'Комментарий: '+row.comment:'',row.files?.length?'Файлы: '+row.files.join(', '):'']),
      join([n(row.area)+' м²','Объём: '+(volume||'—')+' м³','Вес основы: '+weightText+' кг']),
      inProduction(record)?'Производство — общей суммой':price(row.knownPricePerPiece??row.pricePerPiece)+' / шт.\n'+price(row.knownPricePerM2??row.pricePerM2)+' / м²',inProduction(record)?'Материалы — в итоге изделия':price(row.knownSubtotal??row.total),remainingParameters(record,row)];
  }
  function floorCells(record,label){return [label,join([record.base,'Нижний слой: '+n(record.baseThickness)+' мм','Верхний слой: '+(record.topLayer||'—'),'Общая толщина: '+n(record.totalThickness)+' мм',record.species,record.materialType]),join([record.sorting,record.patternType]),join([n(record.length)+' × '+n(record.width)+' мм','Соединение: '+(record.connection||'—'),'Фаска: '+(record.chamfer||'—')]),join([record.patternName,Number.isFinite(record.angle)?'Торцевой рез: '+n(record.angle)+'°':'',record.customPatternDescription,record.customPatternFile?.length?'Файлы: '+record.customPatternFile.map(file=>file.name||file).join(', '):'']),join(['Помещение: '+n(record.baseArea)+' м²','Запас: '+n(record.wastePercent)+'%','К расчёту: '+n(record.areaWithWaste)+' м²']),join([record.coatingName,Number.isFinite(record.gloss)?'Блеск: '+n(record.gloss)+'%':'']),money(record.finalUnitPrice),money(record.total),remainingParameters(record)];}
  function productRows(type){
    return records.flatMap((record,index)=>record.productType===type?(type==='flooring'?[{cells:floorCells(record,String(index+1)),index,row:0}]:record.sizes.map((row,rowIndex)=>({cells:panelCells(record,row,(index+1)+'.'+(rowIndex+1)),index,row:rowIndex}))):[]);
  }
  function edgeRows(){return records.flatMap((record,index)=>{
    const edge=effectiveEdge(record);if(!edge||edge.mode==='none')return [];
    const base=[String(index+1),join([edge.typeName,edge.displayName||edge.veneerName||edge.name,edge.comment,edge.priceCatalogSource]),n(edge.widthMm)+' / '+(edge.thicknessApplicable?n(edge.thicknessMm):'—')];
    const rows=[];
    if(edge.mode==='attached'){
      (edge.positionSettings||[]).filter(item=>item.applies).forEach(item=>rows.push([(index+1)+'.'+item.position,join([edge.typeName,edge.displayName||edge.veneerName||edge.name,edge.comment,item.priceCatalogSource||edge.priceCatalogSource]),n(item.widthMm??edge.widthMm)+' / '+n(item.thicknessMm??edge.thicknessMm),item.sidesName||item.sides||item.sidesId||'—',n(item.geometricMeters),n(item.calculatedMeters),money(item.pricePerRunningM??item.selection?.pricePerRunningM??edge.pricePerRunningM),'В составе итога ниже','В составе итога ниже']));
    }
    rows.push([...base,edge.mode==='attached'?'Итого по изделию':edge.sides||'—',n(edge.geometricMeters),join([n(edge.orderedMeters??edge.meters??edge.calculatedMeters),edge.manuallyAdjusted?'Ручная корректировка':'Автоматически']),money(edge.pricePerRunningM),money(edge.materialCost),edge.operationPricingStatus==='included_in_production_quote'?'В стоимости производства':edge.operationPricingStatus==='not_required'?'Не требуется':money(edge.operationCost)]);
    return rows;
  });}
  function conditions(){return records.flatMap((record,index)=>{
    const prefix=String(index+1),rows=[];
    edgeDiscount(record).entries.filter(entry=>entry.condition).forEach(entry=>rows.push([prefix,'Материал кромки',entry.condition.name,'Общий метраж '+n(entry.total)+' пог. м',money(entry.rate)+' / пог. м']));
    if(record.productType==='flooring'){
      if(record.discountPercent)rows.push([prefix,'Изделие',record.pricingTier?.name||'Скидка',n(record.discountPercent)+'%',money(record.discountAmount)]);
      (record.markups||[]).filter(item=>item.percent).forEach(item=>rows.push([prefix,'Изделие',item.name||item.label||item.id,n(item.percent)+'%','Учтено в цене']));
    }else{
      const pricing=record.pricing||{};
      Object.entries(pricing.veneer||{}).forEach(([side,items])=>(Array.isArray(items)?items:[]).forEach(item=>{const condition=item.condition;if(condition&&condition.id!=='retail')rows.push([prefix,'Шпон '+side,condition.name,'Цена: '+money(item.finalPricePerM2)+' / м²',condition.unresolved?'Требует уточнения':'Учтено в цене']);}));
      (inProduction(record)?[]:pricing.mdf||[]).filter(item=>item.conditionId!=='retail').forEach(item=>rows.push([prefix,'Основа '+item.size,item.conditionName,n(item.actualConditionPercent)+'%',money(item.actualConditionPricePerSheet)+' / лист']));
      (inProduction(record)?[]:pricing.baseRates||[]).filter(item=>item.conditionId!=='retail'||item.actualDiscountPercent).forEach(item=>rows.push([prefix+(item.position?'.'+item.position:''),item.component,item.conditionName,n(item.actualDiscountPercent)+'%',money(item.finalRatePerM2)+' / м²']));
      const edge=record.edge;if(edge?.priceCondition&&edge.priceCondition.id!=='retail')rows.push([prefix,'Кромка',edge.priceCondition.name,'Цена: '+money(edge.pricePerRunningM)+' / пог. м','Учтено в цене']);
    }
    return rows;
  });}
  function supplemental(record){
    const rows=[...(record.specification?.characteristics||[])];
    if(record.layoutTzComment&&!rows.some(([key])=>['Комментарий к раскладке','Требования к раскладке'].includes(key)))rows.push(['Комментарий к раскладке',record.layoutTzComment]);
    if(record.layoutTzFiles?.length&&!rows.some(([key])=>key==='Файлы к раскладке'))rows.push(['Файлы к раскладке',record.layoutTzFiles.join(', ')]);
    if(record.comment&&!rows.some(([key])=>key==='Комментарий'))rows.push(['Комментарий',record.comment]);
    if(record.files?.length&&!rows.some(([key])=>['Файлы','Файлы к позиции'].includes(key)))rows.push(['Файлы',record.files.map(file=>file.name||file).join(', ')]);
    return rows;
  }
  function remainingParameters(record,row) {
    const details=supplemental(record);
    const shown=record.productType==='flooring'
      ? /^(Нижний слой|Верхний слой|Толщина|Порода дерева|Наименование|Тип шпона|Тип рисунка|Сортировка|Ширина|Длина|Наличие фаски|Тип соединения|Раскладка|Угол торцевого реза|Описание раскладки|Файлы индивидуальной раскладки|Итого к расчёту|Площадь помещения|Запас на укладку|Финишное покрытие|Степень блеска|Цена за м² с НДС)$/
      : /^(Тип шпона|Толщина|Тип рисунка|Раскладка|Основа|Толщина основы|Фанерованные стороны|Сторона А|Лицевая сторона|Тип шпона стороны А|Тип шпона лицевой стороны|Толщина шпона стороны А|Толщина шпона лицевой стороны|Тип рисунка стороны А|Тип рисунка лицевой стороны|Раскладка А|Раскладка Б|Сторона Б|Обратная сторона|Материал стороны Б|Материал обратной стороны|Порода на обратной стороне|Тип шпона стороны Б|Тип шпона обратной стороны|Толщина материала стороны Б|Толщина материала обратной стороны|Тип рисунка стороны Б|Тип рисунка обратной стороны|Шлифовка|Финишное покрытие|Кромка|Стороны кромления|Ширина кромки|Толщина кромки|Калибровка|Чистовой припил|Проклейка основы|Фаска на кромке)$/;
    return join(details.filter(([key])=>!shown.test(key)&&!/^Геометрический метраж кромки|^Расход кромки|^Метраж к заказу|^Расчётный метраж кромки|^Кромка · Позиция/.test(key)).filter(([key])=>!/^Финиш · Позиция/.test(key)||Number(key.match(/Позиция\s+(\d+)/)?.[1])===row?.position).map(([key,value])=>key+': '+value));
  }
  function actionButton(action,label,index,row) {
    return '<button class="secondary-button" type="button" data-action="'+action+'" data-index="'+index+'" data-row="'+row+'"'+(busy?' disabled':'')+'>'+label+'</button>';
  }
  function render(){
    const suppress=restoringFocus;restoringFocus=true;
    sourceRegistry.clear();widgetSequence=0;
    $('emptyState').classList.toggle('is-hidden',!!records.length||editorIndex===null&&!!editorController);
    $('downloadSpecification').disabled=!records.length||!!editorController||busy;
    $('addPosition').disabled=busy||!!editorController;
    $('calculationMeta').textContent=new Date(order.createdAt).toLocaleDateString('ru-RU');
    const rows=productRows(productType);
    if(editorController&&editorIndex===null)rows.push({cells:[String(records.length+1),...Array(9).fill('—')],index:null,row:0});
    const headers=[...(productType==='plate'?panelHeaders:floorHeaders),'Действия'];
    const container=document.createElement('div');container.innerHTML=table(headers,rows.map(item=>[...item.cells,'']));
    container.querySelectorAll('tbody tr').forEach((tr,i)=>{
      const item=rows[i];tr.dataset.record=String(item.index);tr.dataset.size=String(item.row);
      const editing=!!editorController&&item.index===editorIndex&&(productType!=='plate'||item.row===editingRow);
      tr.lastElementChild.innerHTML=editing?actionButton('save','Сохранить',item.index,item.row)+actionButton('cancel','Отменить',item.index,item.row):actionButton('edit','Редактировать',item.index,item.row)+actionButton('duplicate','Дублировать',item.index,item.row)+actionButton('delete','Удалить',item.index,item.row);
      if(editing)fillEditorRow(tr,item.row);
    });
    $('productTables').innerHTML=container.innerHTML;
    // cloneNode/innerHTML do not retain current values or FileLists; synchronize from the source controls.
    syncProxyValues();
    const notes=records.flatMap((record,index)=>[...effectiveWarnings(record).map(note=>'Изделие '+(index+1)+': '+note),...(record.specification?.unallocatedCost?['Изделие '+(index+1)+': общие рассчитанные затраты '+money(record.specification.unallocatedCost)+' уже включены в итог и не распределены по строкам.']:[])]);
    if(notes.length){const note=document.createElement('p');note.className='field__note';note.textContent=notes.join(' ');$('productTables').append(note);}
    renderEdgeTable();renderExtras();restoringFocus=suppress;
  }
  function renderExtras(){
    renderProduction();
    ['companyNameField','innField'].forEach(id=>$(id).classList.toggle('is-hidden',order.clientTypeSelect!=='company'));
    const selected=services();$('servicesTable').innerHTML=selected.length?table(['Услуга','Стоимость'],selected.map(name=>[name,'Уточняется'])):'';
    const rows=conditions();$('conditionsSection').classList.toggle('is-hidden',!rows.length);$('conditionsTable').innerHTML=rows.length?table(['Изделие','Составляющая','Условие','Значение','Результат'],rows):'';
    const result=totals();$('totalLabel').textContent=result.partial?'Стоимость рассчитанной части с НДС':'Итого с НДС';$('orderTotal').textContent=money(result.total);$('orderVat').textContent='В том числе НДС: '+money(result.vat);
    $('orderBreakdown').innerHTML=table(['Состав заказа','Стоимость с НДС'],records.map((record,index)=>['Изделие '+(index+1)+' · '+(record.title||record.species)+(inProduction(record)?' · материалы отдельно':'')+(partial(record)?' (рассчитанная часть)':''),money(known(record))]).concat(quoteState().scope.length?[["Общая стоимость производства для клиента",money(quoteState().clientCost)]]:[]));
    let managerDetails=$('managerCalculationDetails');
    if(!managerDetails){managerDetails=document.createElement('details');managerDetails.id='managerCalculationDetails';$('orderBreakdown').after(managerDetails);}
    managerDetails.innerHTML='<summary>Внутренняя детализация расчёта · для менеджера</summary><p>Не включается в клиентскую спецификацию. Работы, входящие в цену панели или производства, отдельно не начисляются.</p>'+records.filter(record=>record.productType==='plate').map((record,index)=>'<h3>Изделие '+(index+1)+'</h3>'+table(['Составляющая','Расчёт','Стоимость с НДС'],(record.specification?.breakdown||[]).map(item=>[item.label,item.note||'',breakdownValue(record,item)]))).join('');

    $('partialNote').classList.toggle('is-hidden',!result.partial);$('partialNote').textContent='Расчёт неполный. Учтены только известные составляющие. Стоимость нерассчитанных составляющих'+(selected.length?', выбранных услуг и упаковки':'')+' уточняется. Полную стоимость подтвердит менеджер.';
  }
  function closeEditor(){
    if(editorOriginalRecords){records=editorOriginalRecords;editorOriginalRecords=null;}
    editorController=null;editorIndex=null;editingRow=0;sourceRegistry.clear();pendingChanges.clear();
    $('calculationEngine').src='about:blank';engineWindow=null;
  }
  function loadEngine(type,record=null){
    if(pendingEditor)return Promise.reject(new Error('Дождитесь завершения расчёта.'));
    const promise=new Promise((resolve,reject)=>pendingEditor={resolve,reject,record});
    $('calculationEngine').src=(type==='flooring'?'flooring.html':'panels.html')+'?specEngine=1';return promise;
  }
  async function openEditor(index=null,row=0){
    if(busy||editorController)return;
    busy=true;render();status('Загрузка полей позиции…');
    try{
      editorIndex=index;editingRow=row;
      editorController=await loadEngine(productType,index===null?null:records[index]);
      editorOriginalRecords=records;
      busy=false;render();status('Измените поля в таблице и нажмите «Сохранить».');
    }catch(error){closeEditor();busy=false;render();status(error.message);}
  }
  function groupId(record){return record?.calculationGroupId||record?.id;}
  function restorePlateContext(controller,next,index){
    engineWindow.WoodstockSpecificationContext={items:State.clone(next.filter((_,i)=>i!==index))};
    controller.restoreRecord(State.clone(next[index]));
  }
  function recalculatePlateGroup(next,index,controller){
    const id=groupId(next[index]);
    const indexes=next.map((record,i)=>groupId(record)===id?i:null).filter(i=>i!==null);
    if(!indexes.length)return next;
    // A manually specified MixMatch batch is shared by these linked rows, just as before editing.
    const edited=next[index],overrides=edited.editorState?.priceAdjustmentOverrides||[];
    const batch=overrides.find(([key])=>key==='mixmatch:actualVeneerAreaM2');
    indexes.forEach(i=>{
      if(next[i].materialSides?.A?.id!==edited.materialSides?.A?.id||next[i].layoutId!=='mixmatch')return;
      next[i]=State.clone(next[i]);
      next[i].editorState.priceAdjustmentOverrides=next[i].editorState.priceAdjustmentOverrides.filter(([key])=>key!=='mixmatch:actualVeneerAreaM2');
      if(batch)next[i].editorState.priceAdjustmentOverrides.push(State.clone(batch));
    });
    for(const i of indexes){
      const original=next[i];restorePlateContext(controller,next,i);
      const updated=controller.capture();
      if(!updated)throw new Error('Проверьте параметры связанных позиций.');
      next[i]={...updated,id:original.id,createdAt:original.createdAt,calculationGroupId:id};
    }
    restorePlateContext(controller,next,index);
    return next;
  }
  function separateEditedRow(){
    const original=records[editorIndex];
    if(productType!=='plate'||!original||original.sizes.length<2)return;
    const parts=editorController.isolateRow(editingRow),id=groupId(original);
    const split=[parts.before,parts.selected,parts.after].filter(Boolean).map((record,i)=>({...record,id:i===0?original.id:uid(),createdAt:original.createdAt,calculationGroupId:id}));
    const next=records.slice();next.splice(editorIndex,1,...split);
    editorIndex+=parts.before?1:0;editingRow=0;
    records=recalculatePlateGroup(next,editorIndex,editorController);
    restorePlateContext(editorController,records,editorIndex);
  }
  function refreshPlateGroup(){
    if(productType!=='plate'||editorIndex===null||editorController.issues().length)return;
    const id=groupId(records[editorIndex]);
    if(records.filter(record=>groupId(record)===id).length<2)return;
    const current=editorController.capture();if(!current)return;
    const next=records.slice();next[editorIndex]={...current,id:records[editorIndex].id,createdAt:records[editorIndex].createdAt,calculationGroupId:id};
    records=recalculatePlateGroup(next,editorIndex,editorController);
  }
  function rowSpecificChange(source,event){
    if(productType!=='plate'||!records[editorIndex]||records[editorIndex].sizes.length<2)return false;
    if(source.closest('[data-size-row],#positionFinishOverrides,#positionEdgeOverrides,#priceAdjustmentsList,#veneerConsumptionList'))return false;
    // Descriptions and uploaded documents belong to the calculation; per-row fields remain available separately.
    if(['commentInput','filesInput','layoutTzComment','layoutTzFiles'].includes(source.id))return false;
    if(event.type==='input'||event.type==='change')return source.type==='checkbox'||source.type==='radio'?source.checked!==event.target.checked:source.value!==event.target.value;
    return event.type==='click'&&source.tagName==='BUTTON';
  }
  function commitEditor(){
    try{
      const record=editorController.capture();
      if(!record){status(engineWindow.document.getElementById('saveStatus')?.textContent||'Проверьте поля позиции.');renderKeepingFocus();return;}
      const next=records.slice();record.id=editorIndex===null?uid():records[editorIndex].id;
      if(editorIndex===null)next.push(record);else next[editorIndex]={...record,createdAt:records[editorIndex].createdAt};
      if(productType==='plate'&&editorIndex!==null)recalculatePlateGroup(next,editorIndex,editorController);
      persist(next);editorOriginalRecords=null;closeEditor();busy=false;render();status('Позиция сохранена. Спецификация пересчитана.');
    }catch(error){status('Не удалось сохранить позицию: '+error.message);}
  }
  async function mutate(action,index,row){
    if(busy||editorController){status('Сначала сохраните или отмените изменения позиции.');return;}
    const record=records[index];if(!record)return;
    busy=true;render();
    try{
      let next;
      if(action==='delete'&&(record.productType==='flooring'||record.sizes.length===1)){
        next=records.filter((_,i)=>i!==index);
        if(productType==='plate'){
          const remaining=next.findIndex(item=>groupId(item)===groupId(record));
          if(remaining>=0){const controller=await loadEngine(productType,next[remaining]);recalculatePlateGroup(next,remaining,controller);}
        }
      }else if(record.productType==='flooring'&&action==='duplicate'){
        next=State.clone(records);const copy=State.clone(record);copy.id=uid();next.splice(index+1,0,copy);
      }else{
        const controller=await loadEngine(productType,record),updated=controller.modifyRow(action,row);
        if(!updated)throw new Error('Проверьте параметры изделия перед сохранением изменения.');
        next=records.slice();next[index]={...updated,id:record.id};
        recalculatePlateGroup(next,index,controller);
      }
      persist(next);
      status(action==='delete'?'Позиция удалена. Связанные данные пересчитаны.':'Позиция продублирована. Связанные данные пересчитаны.');
    }catch(error){status(error.message);}finally{closeEditor();busy=false;render();}
  }
  function visibleSource(node){
    if(!node)return false;
    for(let parent=node;parent&&parent!==engineWindow.document.body;parent=parent.parentElement){if(parent.hidden||parent.classList.contains('is-hidden')||parent.style.display==='none')return false;}
    return true;
  }
  function sourceToken(node){
    if(node.id)return 'id:'+node.id;
    const indexes=[];let current=node;
    while(current&&current!==engineWindow.document.body){indexes.unshift(Array.from(current.parentElement.children).indexOf(current));current=current.parentElement;}
    return 'path:'+indexes.join('.');
  }
  let widgetSequence=0;
  function widget(source,force=false){
    if(!source||!force&&!visibleSource(source))return '';
    const copy=source.cloneNode(true),originals=[source,...source.querySelectorAll('*')],copies=[copy,...copy.querySelectorAll('*')];
    const prefix='spec-field-'+(widgetSequence++)+'-';
    const idMap=new Map(originals.filter(node=>node.id).map(node=>[node.id,prefix+node.id]));
    originals.forEach((node,index)=>{
      const target=copies[index];
      if(node.id)target.id=idMap.get(node.id);
      if(target.hasAttribute('for')&&idMap.has(target.htmlFor))target.htmlFor=idMap.get(target.htmlFor);
      if(/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(node.tagName)){
        const token=sourceToken(node);sourceRegistry.set(token,node);target.dataset.specSource=token;
        if(node.tagName==='SELECT')Array.from(target.options).forEach((option,i)=>option.toggleAttribute('selected',node.options[i].selected));
        else if(node.tagName==='TEXTAREA')target.textContent=node.value;
        else if(node.tagName==='INPUT'&&node.type!=='file'){target.setAttribute('value',node.value);target.toggleAttribute('checked',node.checked);}
      }
    });
    return copy.outerHTML;
  }
  function sourceFields(ids){
    const used=new Set();return ids.map(id=>{
      const node=engineWindow.document.getElementById(id);if(!visibleSource(node))return '';
      const root=node.closest('.field,.toggle-line')||node;
      if(used.has(root))return '';used.add(root);return widget(root);
    }).join('');
  }
  function fileOutput(input,output){return input?.closest('.field')?.contains(output)?'':widget(output);}
  function sizeFields(row,selector){const node=row?.querySelector(selector);return node?widget(node.closest('.field,.toggle-line')||node):'';}
  function syncProxyValues(){
    document.querySelectorAll('[data-spec-source]').forEach(node=>{
      const source=sourceRegistry.get(node.dataset.specSource);if(!source)return;
      if(/^(INPUT|SELECT|TEXTAREA)$/.test(node.tagName)&&node.type!=='file'){node.value=source.value;if(node.type==='checkbox'||node.type==='radio')node.checked=source.checked;}
    });
  }
  function fillEditorRow(tr,rowIndex){
    const cells=tr.cells,doc=engineWindow.document;
    tr.dataset.editGroup='';tr.dataset.editRow=String(rowIndex);
    const set=(index,html)=>{if(html)cells[index].innerHTML=html;};
    if(productType==='flooring'){
      set(1,sourceFields(['materialTypeSelect','speciesInput','topLayerSelect','baseThicknessInput'])+widget(doc.getElementById('baseThicknessToggle')));
      set(2,sourceFields(['sortingSelect','patternTypeSelect']));
      set(3,sourceFields(['widthInput','lengthInput']));
      set(4,sourceFields(['patternSelect','angleSelect','customPatternInput','customPatternFileInput'])+fileOutput(doc.getElementById('customPatternFileInput'),doc.getElementById('customPatternFileName')));
      set(5,sourceFields(['boardAreaInput','wasteInput']));
      set(6,sourceFields(['coatingSelect','glossInput']));
      set(7,sourceFields(['loyaltySelect'])+widget(doc.getElementById('selectionSurchargeOptions'))+widget(doc.getElementById('priceAdjustmentsList'))+'<p>'+esc(doc.getElementById('specFinalUnitPrice')?.textContent||'—')+'</p>');
      cells[8].textContent=doc.getElementById('specTotal')?.textContent||'—';
      set(9,sourceFields(['commentInput','filesInput'])+fileOutput(doc.getElementById('filesInput'),doc.getElementById('selectedFiles')));
    }else{
      const row=doc.querySelectorAll('[data-size-row]')[rowIndex];
      set(1,sourceFields(['baseSelect','baseThicknessSelect']));
      set(2,sourceFields(['veneerTypeSelect','veneerAInput','veneerThicknessSelect','veneeredSidesSelect','reverseSideSelect','veneerBModeSelect','veneerBInput','veneerBRoughThicknessSelect'])+widget(doc.getElementById('veneerConsumptionList')));
      set(3,sourceFields(['layoutSelect','layoutBSelect','veneerCutSelect','veneerBCutSelect','layoutTzComment','layoutTzFiles'])+fileOutput(doc.getElementById('layoutTzFiles'),doc.getElementById('layoutTzFileNames')));
      set(4,widget(row?.querySelector('.standard-size-list'))+sizeFields(row,'[data-size-manufacturing]')+sizeFields(row,'[data-size-manufacturing-type]')+widget(row?.querySelector('[data-size-fields]')));
      set(5,sourceFields(['edgeModeSelect','calibrationSelect','calibrationTargetInput','finishSelect','lacquerExecutionSelect','lacquerGlossSelect','lacquerProcessSelect','enamelVariantSelect','finishSidesSelect','toningSelect','isolatorSelect'])+widget(doc.getElementById('positionFinishToggle'))+widget(doc.querySelector('[data-position-finish-row="'+row?.dataset.rowId+'"]'))+sizeFields(row,'[data-size-transition]'));
      const result=editorController.result(),item=result?.itemResults?.[rowIndex];
      if(result?.pricingUnavailable){cells[7].textContent='Уточняется';cells[8].textContent='Уточняется';}
      if(item && !result?.pricingUnavailable){cells[6].textContent=join([n(item.area)+' м²',item.weight?'Вес основы: '+n(item.weight.min)+(item.weight.min!==item.weight.max?'–'+n(item.weight.max):'')+' кг':'Вес основы: —']);cells[7].textContent=join([money(item.positionKnownPricePerPiece??item.positionPricePerPiece)+' / шт.',money(item.positionKnownPricePerM2??item.positionPricePerM2)+' / м²']);cells[8].textContent=money(item.positionKnownTotal??item.positionTotal);}
      set(7,sourceFields(['clientConditionSelect'])+widget(doc.getElementById('priceAdjustmentsList'))+'<p>'+esc(cells[7].textContent)+'</p>');
      set(9,sizeFields(row,'[data-size-comment]')+sizeFields(row,'[data-size-files]')+fileOutput(row?.querySelector('[data-size-files]'),row?.querySelector('[data-size-file-names]'))+sourceFields(['commentInput','filesInput'])+fileOutput(doc.getElementById('filesInput'),doc.getElementById('selectedFiles')));
    }
  }
  function renderKeepingFocus(){
    const active=document.activeElement,token=active?.dataset.specSource,tr=active?.closest('tr'),row=tr?.dataset.editRow;
    let selection=null;try{selection=[active.selectionStart,active.selectionEnd];}catch{}
    const scrolls=Array.from(document.querySelectorAll('.spec-table-wrap')).map(node=>({left:node.scrollLeft,top:node.scrollTop}));
    const viewport={x:window.scrollX,y:window.scrollY};
    render();
    document.querySelectorAll('.spec-table-wrap').forEach((node,index)=>{if(scrolls[index]){node.scrollLeft=scrolls[index].left;node.scrollTop=scrolls[index].top;}});
    window.scrollTo(viewport.x,viewport.y);
    if(token){const next=Array.from(document.querySelectorAll('[data-spec-source]')).find(node=>node.dataset.specSource===token&&(row===undefined||node.closest('tr')?.dataset.editRow===row));if(next){restoringFocus=true;next.focus({preventScroll:true});try{if(selection&&selection[0]!==null)next.setSelectionRange(...selection);}catch{}restoringFocus=false;}}
  }
  function proxyEvent(event){
    const target=event.target.closest('[data-spec-source]');if(!target||!editorController||restoringFocus)return;
    const source=sourceRegistry.get(target.dataset.specSource);if(!source)return;
    const SourceEvent=engineWindow.Event;
    if(event.type==='keydown'){
      const keyboard=new engineWindow.KeyboardEvent('keydown',{key:event.key,code:event.code,ctrlKey:event.ctrlKey,metaKey:event.metaKey,altKey:event.altKey,shiftKey:event.shiftKey,bubbles:true,cancelable:true});
      if(!source.dispatchEvent(keyboard))event.preventDefault();
      return;
    }
    if(event.type==='mousedown'&&target.closest('.autocomplete-menu')){event.preventDefault();return;}
    if(event.type==='focusin'){
      if(source.closest('.autocomplete-field')){
        source.dispatchEvent(new SourceEvent('focus'));
        const menu=source.closest('.autocomplete-field').querySelector('.autocomplete-menu'),local=target.closest('.autocomplete-field')?.querySelector('.autocomplete-menu');
        if(menu&&local){const holder=document.createElement('div');holder.innerHTML=widget(menu,true);const replacement=holder.firstElementChild;local.replaceWith(replacement);target.setAttribute('aria-controls',replacement.id);target.setAttribute('aria-expanded','true');}
      }
      return;
    }
    if(event.type==='focusout'){
      if(pendingChanges.delete(target.dataset.specSource))source.dispatchEvent(new SourceEvent('change',{bubbles:true}));
      source.dispatchEvent(new SourceEvent('blur'));
      source.dispatchEvent(new SourceEvent('focusout',{bubbles:true}));
      refreshPlateGroup();
      // Change handlers may rebuild dynamic price controls. Reconnect their proxies.
      sourceRegistry.forEach((original,token)=>{
        if(original.isConnected)return;
        const live=token.startsWith('id:')?engineWindow.document.getElementById(token.slice(3)):token.slice(5).split('.').reduce((node,index)=>node?.children[Number(index)],engineWindow.document.body);
        if(live)sourceRegistry.set(token,live);
      });
      syncProxyValues();
      // Keep the destination of a click or Tab in the DOM while applying validation.
      document.querySelectorAll('[data-spec-source]').forEach(proxy=>{
        const original=sourceRegistry.get(proxy.dataset.specSource);
        const from=original?.closest('.field,.toggle-line'),to=proxy.closest('.field,.toggle-line');
        if(!from||!to)return;
        const messages=from.querySelectorAll('.field__error,.field__note');
        to.querySelectorAll('.field__error,.field__note').forEach((node,index)=>{
          const message=messages[index];if(message){node.textContent=message.textContent;node.className=message.className;node.hidden=message.hidden;}
        });
      });
      const displayRows=productRows(productType);
      document.querySelectorAll('#productTables tbody tr:not([data-edit-group])').forEach(tr=>{
        const item=displayRows.find(item=>String(item.index)===tr.dataset.record&&String(item.row)===tr.dataset.size);
        if(item)item.cells.forEach((value,index)=>tr.cells[index].textContent=value??'—');
      });
      const result=editorController.result();
      document.querySelectorAll('#productTables tr[data-edit-group]').forEach(tr=>{
        if(productType==='flooring'){
          tr.cells[7].querySelector('p:last-child').textContent=engineWindow.document.getElementById('specFinalUnitPrice')?.textContent||'—';
          tr.cells[8].textContent=engineWindow.document.getElementById('specTotal')?.textContent||'—';
        }else{
          const item=result?.itemResults?.[Number(tr.dataset.editRow)];
          if(item){tr.cells[6].textContent=join([n(item.area)+' м²',item.weight?'Вес основы: '+n(item.weight.min)+(item.weight.min!==item.weight.max?'–'+n(item.weight.max):'')+' кг':'Вес основы: —']);tr.cells[7].querySelector('p:last-child').textContent=join([money(item.positionKnownPricePerPiece??item.positionPricePerPiece)+' / шт.',money(item.positionKnownPricePerM2??item.positionPricePerM2)+' / м²']);tr.cells[8].textContent=money(item.positionKnownTotal??item.positionTotal);}
        }
      });
      renderExtras();
      const field=target.closest('.autocomplete-field');
      if(field)setTimeout(()=>{if(!field.contains(document.activeElement)){field.querySelector('.autocomplete-menu')?.classList.add('is-hidden');target.setAttribute('aria-expanded','false');}},150);
      return;
    }
    try{
      if(event.type==='click'){
        if(source.tagName!=='BUTTON')return;
        if(rowSpecificChange(source,event))separateEditedRow();
        event.preventDefault();source.click();refreshPlateGroup();renderKeepingFocus();return;
      }
      if(!['input','change'].includes(event.type))return;
      if(rowSpecificChange(source,event))separateEditedRow();
      if(source.type==='file'){
        if(event.type!=='change')return;
        source.files=target.files;
      }else if(source.type==='checkbox'||source.type==='radio')source.checked=target.checked;
      else source.value=target.value;
      const sourceType=event.type==='input'&&(source.tagName==='SELECT'||source.type==='checkbox'||source.type==='radio')?'change':event.type;
      if(sourceType==='input'&&source.type!=='file')pendingChanges.add(target.dataset.specSource);
      else if(sourceType==='change')pendingChanges.delete(target.dataset.specSource);
      source.dispatchEvent(new SourceEvent(sourceType,{bubbles:true}));
      if(!(sourceType==='input'&&source.closest('#priceAdjustmentsList,#veneerConsumptionList')))refreshPlateGroup();
      renderKeepingFocus();
    }catch(error){status('Не удалось изменить поле: '+error.message);}
  }
  function renderEdgeTable(){
    let rows=edgeRows().map(row=>[...row,'']);
    if(editorController&&productType==='plate'){
      if(editorIndex!==null)rows=rows.filter(row=>!String(row[0]).startsWith(String(editorIndex+1)+'.')&&String(row[0])!==String(editorIndex+1));
      const edge=editorController.result()?.edge;
      if(edge&&edge.mode!=='none'){
        // В отдельной кромке расчётный метраж по торцам может отличаться от вручную заказанного.
        const metersToOrder=edge.mode==='separate'?(edge.orderedMeters??edge.meters??edge.calculatedMeters):edge.calculatedMeters;
        rows.push([editorIndex===null?'Новая позиция':String(editorIndex+1),'','','',n(edge.geometricMeters),n(metersToOrder),money(edge.pricePerRunningM),money(edge.materialCost),edge.operationPricingStatus==='included_in_production_quote'?'В стоимости производства':edge.operationPricingStatus==='not_required'?'Не требуется':money(edge.operationCost),'']);
      }
    }
    $('edgeSection').classList.toggle('is-hidden',!rows.length);if(!rows.length){$('edgeTable').innerHTML='';return;}
    const container=document.createElement('div');container.innerHTML=table([...edgeHeaders,'Действия'],rows);
    container.querySelectorAll('tbody tr').forEach((tr,i)=>{
      const last=!!editorController&&productType==='plate'&&editorController.result()?.edge?.mode!=='none'&&i===rows.length-1;
      if(last){
        tr.dataset.editRow='edge';tr.dataset.editGroup='';
        const doc=engineWindow.document,separate=editorController.result()?.edge?.mode==='separate',prefix=separate?'separateEdge':'edge';
        tr.cells[1].innerHTML=sourceFields([prefix+'TypeSelect',prefix+'MaterialInput']);
        tr.cells[2].innerHTML=sourceFields([prefix+'ThicknessSelect',prefix+'WidthSelect',prefix+'OrderWidthInput']);
        tr.cells[3].innerHTML=sourceFields([separate?'separateEdgeSidesSelect':'edgeSidesSelect','edgeBevelSelect','edgeCommentInput'])+widget(doc.getElementById('positionEdgeToggle'))+widget(doc.getElementById('positionEdgeOverrides'));
        tr.cells[5].innerHTML=sourceFields(separate?['separateEdgeMetersInput']:[])+widget(doc.getElementById('separateEdgeMetersReset'))+'<p>'+esc(tr.cells[5].textContent)+'</p>';
        tr.lastElementChild.innerHTML=actionButton('save','Сохранить',editorIndex,editingRow)+actionButton('cancel','Отменить',editorIndex,editingRow);
      }else{
        const index=Number(String(rows[i][0]).split('.')[0])-1;
        tr.lastElementChild.innerHTML=actionButton('edit','Редактировать',index,0);
      }
    });
    $('edgeTable').innerHTML=container.innerHTML;syncProxyValues();
  }

  async function prepareLegacyRecords(){
    const indexes=records.map((record,index)=>!record.editorState||!record.specification||(record.productType==='plate'&&record.sizes.some(row=>!Object.hasOwn(row,'knownSubtotal')))?index:null).filter(index=>index!==null);
    if(!indexes.length)return;
    busy=true;render();status('Подготовка сохранённых позиций…');
    const next=records.slice(),unresolved=[];
    try{
      for(const index of indexes){
        try{
          const controller=await loadEngine(productType,records[index]),updated=controller.capture();
          if(updated)next[index]={...records[index],...updated,id:records[index].id,createdAt:records[index].createdAt};
          else unresolved.push(String(index+1));
        }catch(error){unresolved.push(String(index+1));}
        closeEditor();
      }
      persist(next);
      status(unresolved.length?'Проверьте параметры ранее сохранённых изделий: '+unresolved.join(', ')+'.':'');
    }catch(error){status('Не удалось обновить сохранённые позиции: '+error.message);}
    finally{closeEditor();busy=false;render();}
  }
  function validateOrder(){
    for(const [id,label] of [['managerNameInput','менеджера'],['branchSelect','филиал'],['clientNameInput','имя клиента'],['clientPhoneInput','телефон']]){
      if(!$(id).value.trim()){ $(id).focus();return 'Укажите '+label+'.'; }
    }
    if($('clientPhoneInput').value.replace(/\D/g,'').length<7){$('clientPhoneInput').focus();return 'Проверьте номер телефона.';}
    if(!$('clientEmailInput').checkValidity()){$('clientEmailInput').focus();return 'Проверьте email клиента.';}
    return '';
  }
  function pdfTable(title,headers,rows,widths){return [{text:title,style:'sectionTitle'},{table:{headerRows:1,dontBreakRows:false,widths:Common.fitPdfTableWidths(widths||headers.map(()=>1),1.4),body:[headers.map(text=>({text,style:'tableHeader'})),...rows.map(row=>row.map(value=>String(value??'—')))]},layout:{...Common.pdfTableLayout(),paddingLeft:()=>1.4,paddingRight:()=>1.4},margin:[0,0,0,10]}];}
  function breakdownValue(record,item){
    const quotes=(record.productionCosts||[]).filter(quote=>quote.coveredReasons?.some(reason=>reason.startsWith('Калибровка:')));
    if(item.value===0&&/Калибровка/.test(item.label)&&quotes.length){
      return quotes.every(quote=>quote.status==='provided')?'В стоимости производства':quotes.some(quote=>quote.status==='provided')?'Частично в стоимости производства; остаток уточняется':'Уточняется';
    }
    return money(item.value);
  }
  function buildPdf(){
    const groups=[productType].map(type=>({type,rows:productRows(type)})).filter(group=>group.rows.length);
    const first=groups[0],result=totals(),before=[];
    if(!first)throw new Error('Добавьте хотя бы одну позицию.');
    if(productionRows().length)before.push(...pdfTable('Общая стоимость производства',['Параметр','Значение'],productionRows(),[230,309]));
    const title=type=>type==='plate'?'Плитные материалы и изделия':'Инженерная доска';
    const headers=type=>type==='plate'?panelHeaders:floorHeaders;
    const widths=[productType==='plate'?24:14,58,80,54,65,72,62,65,64,85];
    groups.slice(1).forEach(group=>before.push(...pdfTable(title(group.type),headers(group.type),group.rows.map(item=>item.cells),widths)));
    if(edgeRows().length)before.push(...pdfTable('Спецификация кромки — стоимость уже включена в итог изделий',edgeHeaders,edgeRows()));
    before.push(...pdfTable('Данные менеджера и клиента',['Параметр','Значение'],[
      ['Менеджер / ЛПР',order.managerNameInput],['Филиал',order.branchSelect],['Статус расчёта',order.orderStatusSelect],['Тип клиента',order.clientTypeSelect==='company'?'Юрлицо':'Физлицо'],
      ...(order.clientTypeSelect==='company'?[['Компания',order.companyNameInput||'—'],['ИНН',order.clientInnInput||'—']]:[])
    ],[130,409]));
    records.forEach((record,index)=>{
      if(record.productType!=='plate' && record.specification?.breakdown?.length)before.push(...pdfTable('Изделие '+(index+1)+' — рассчитанные составляющие',['Составляющая','Стоимость с НДС'],(inProduction(record)?materialParts(record):record.specification.breakdown).map(item=>[item.label,breakdownValue(record,item)]).concat(edgeDiscount(record).delta?[["Объёмная корректировка материала кромки",money(edgeDiscount(record).delta)]]:[]),[400,139]));
      if(effectiveWarnings(record).length)before.push({text:effectiveWarnings(record).join('\n'),style:'infoSmall',margin:[0,0,0,8]});
      if(record.productType!=='plate' && record.specification?.unallocatedCost)before.push({text:'Общие затраты изделия '+(index+1)+', не распределённые по строкам: '+money(record.specification.unallocatedCost)+'. Уже включены в итог.',style:'infoSmall'});
    });
    if(services().length)before.push(...pdfTable('Упаковка и услуги',['Услуга','Стоимость'],services().map(name=>[name,'Уточняется']),[400,139]));
    if(order.servicesCommentInput)before.push({text:'Комментарий к услугам: '+order.servicesCommentInput,style:'infoText'});
    if(conditions().length)before.push(...pdfTable('Применённые ценовые условия — уже учтены в цене',['Изделие','Составляющая','Условие','Значение','Результат'],conditions(),[28,100,160,120,131]));
    before.push(...pdfTable('Итог по изделиям',['Изделие','Стоимость с НДС'],records.map((record,index)=>[(index+1)+'. '+(record.title||record.species),money(known(record))]).concat(quoteState().scope.length?[["Производство для клиента общей суммой",money(quoteState().clientCost)]]:[]),[400,139]));
    const product={title:title(first.type),subtitle:'Подробный расчёт',widths,header:headers(first.type).map(text=>({text,style:'tableHeader'})),rows:first.rows.map(item=>item.cells.map((cell,index)=>first.type==='plate'&&index===0?{text:String(cell),noWrap:true}:cell)),dontBreakRows:false,beforePrice:before,afterPrice:[{text:result.partial?'* Частичная стоимость: учтены только рассчитанные составляющие. Стоимость кромки и общих затрат не начисляется повторно.':'Стоимость кромки и общих затрат уже включена в итог.',style:'infoSmall'},...(result.partial?[{text:$('partialNote').textContent,style:'infoText'}]:[])]};
    const doc=Common.createPdfDocument({createdAt:order.createdAt,contact:{name:order.clientNameInput,phone:order.clientPhoneInput,email:order.clientEmailInput,city:order.branchSelect},pricing:{total:result.total,vat:result.vat,partial:result.partial,finalPricePerM2:null}},product);
    // Branch belongs to the manager, not to the client. Keep the existing client layout with the correct label.
    const client=doc.content.find(node=>node.table?.body?.[0]?.[0]?.stack?.[0]?.text==='Имя');
    if(client){client.table.body[0][2].stack[0].text='Компания';client.table.body[0][2].stack[1].text=order.clientTypeSelect==='company'?(order.companyNameInput||'—'):'—';}
    doc.content[0].columns[2].stack=doc.content[0].columns[2].stack.filter(node=>!node.text?.startsWith('Номер расчёта:'));
    // Individual row prices are already shown; an aggregate price must not replace them.
    const totalStack=doc.content.find(node=>node.stack?.some(part=>part.text==='Расчётная цена за м² с НДС'));
    if(totalStack){totalStack.stack=totalStack.stack.slice(3);totalStack.unbreakable=true;}
    return doc;
  }
  window.WoodstockSpecification={
    engineReady(controller,sourceWindow){
      const pending=pendingEditor;if(!pending)return;
      try{if(pending.record)controller.restoreRecord(State.clone(pending.record));engineWindow=sourceWindow;pendingEditor=null;pending.resolve(controller);}
      catch(error){pendingEditor=null;pending.reject(error);}
    },
    engineFailed(message){if(pendingEditor)pendingEditor.reject(new Error(message));pendingEditor=null;},
    context:()=>State.clone(records.filter(record=>record.id!==pendingEditor?.record?.id)),
    buildPdf,totals,quoteState,edgeDiscount,records:()=>State.clone(records)
  };
  document.addEventListener('change',event=>{
    const node=event.target.closest('[data-production-scope]');if(!node)return;
    const ids=new Set(order.productionScopeIds||[]);if(node.checked)ids.add(node.dataset.productionScope);else ids.delete(node.dataset.productionScope);
    order.productionScopeIds=[...ids];saveOrder();render();
  });
  ['productionCostInput','productionMarkupInput'].forEach(id=>$(id).addEventListener('input',()=>{
    order.productionCostDraft=$('productionCostInput').value;order.productionMarkupDraft=$('productionMarkupInput').value;
    if(order.productionQuote)order.productionQuote.signature='';saveOrder();
  }));
  $('confirmProduction').addEventListener('click',()=>{
    const cost=decimal($('productionCostInput').value),markup=decimal($('productionMarkupInput').value);
    if(!productionScope().length||cost===null||cost<=0||!Number.isSafeInteger(Math.round(cost*100))||markup===null||markup<0||!Number.isSafeInteger(Math.round(cost*(1+markup/100)*100))){$('productionStatus').textContent='Введите положительную себестоимость с точностью до копеек и неотрицательную наценку. Итоговая сумма должна быть корректным денежным значением.';return;}
    order.productionQuote={cost,markup,signature:quoteSignature(),confirmedAt:new Date().toISOString()};saveOrder();render();
  });
  $('addPosition').addEventListener('click',()=>{location.href=(productType==='flooring'?'flooring.html':'panels.html')+'?fromSpecification=1';});
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-action]');if(!button)return;
    const index=button.dataset.index==='null'?null:Number(button.dataset.index),row=Number(button.dataset.row);
    if(button.dataset.action==='edit')openEditor(index,row);
    else if(button.dataset.action==='save')commitEditor();
    else if(button.dataset.action==='cancel'){closeEditor();busy=false;render();status('Изменения отменены.');}
    else mutate(button.dataset.action,index,row);
  });
  ['input','change','click','focusin','focusout','mousedown','keydown'].forEach(type=>document.addEventListener(type,proxyEvent));
  document.querySelectorAll('[data-order]').forEach(node=>{node.addEventListener('input',saveOrder);node.addEventListener('change',saveOrder);});
  $('downloadSpecification').addEventListener('click',()=>{
    const output=$('downloadStatus');output.textContent='';
    if(editorController||busy){output.textContent='Сначала сохраните или отмените изменения позиции.';return;}
    saveOrder();const error=validateOrder();if(error){output.textContent=error;return;}
    try{Common.downloadDocument(buildPdf(),'woodstock-specification.pdf',output);}catch(error){output.textContent='Не удалось сформировать PDF: '+error.message;}
  });
  try{
    const all=State.read();
    all.forEach(record=>{
      if(record.productType!=='plate')return;
      const fractionalSizes=(record.sizes||[]).filter(row=>!Number.isInteger(Number(row.length))||!Number.isInteger(Number(row.width)));
      if(fractionalSizes.length){
        const warning='Ошибка размеров: укажите длину и ширину целыми числами миллиметров.';
        fractionalSizes.forEach(row=>{
          row.pricingPartial=true;
          row.pricingComplete=false;
          row.pendingCosts=[...new Set([...(row.pendingCosts||[]),warning])];
        });
        record.pricingPartial=true;
        record.warnings=[...new Set([...(record.warnings||[]),warning])];
      }
      if(Number(record.baseThickness)!==21)return;
      const sizes=(record.sizes||[]).filter(row=>row.manufacturingType==='exact'||(!row.manufacturingType&&row.cleanCuttingRequired===true));
      if(!sizes.length)return;
      const warning='Максимальный чистовой размер для основы 21 мм не подтверждён. Согласуйте размер с производством.';
      sizes.forEach(row=>{
        row.productionFitStatus='unconfirmed';
        row.pricingPartial=true;
        row.pricingComplete=false;
        row.pendingCosts=[...new Set([...(row.pendingCosts||[]),warning])];
      });
      record.pricingPartial=true;
      if(!(record.warnings||[]).some(note=>note.includes(warning)))record.warnings=[...(record.warnings||[]),warning];
    });
    if(!requestedType&&all.length)productType=all[all.length-1].productType==='flooring'?'flooring':'plate';
    records=all.filter(record=>record.productType===productType);otherRecords=all.filter(record=>record.productType!==productType);
    sessionStorage.setItem('woodstockSpecificationProduct',productType);
    order=JSON.parse(sessionStorage.getItem(metadataKey)||'{}');
    document.querySelector('h1').textContent=productType==='flooring'?'Спецификация инженерной доски':'Спецификация плит';
    if(!order.createdAt)order.createdAt=records[0]?.createdAt||new Date().toISOString();
    delete order.number;
    let changed=false;records.forEach(record=>{if(!record.id){record.id=uid();changed=true;}});if(changed)persist();
    document.querySelectorAll('[data-order]').forEach(node=>{if(order[node.id]!==undefined){if(node.type==='checkbox')node.checked=order[node.id];else node.value=order[node.id];}});
    $('productionCostInput').value=order.productionCostDraft??order.productionQuote?.cost??'';
    $('productionMarkupInput').value=order.productionMarkupDraft??order.productionQuote?.markup??'50';
    saveOrder();render();prepareLegacyRecords();
  }catch(error){status('Не удалось открыть спецификацию: '+error.message);$('downloadSpecification').disabled=true;}
})();
