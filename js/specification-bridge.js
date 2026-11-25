/* The original calculator supplies choices, validation and prices to table fields. */
(() => {
  'use strict';
  const parameters=new URLSearchParams(location.search);
  if(parameters.has('fromSpecification'))window.addEventListener('DOMContentLoaded',()=>{
    const link=document.querySelector('.back-link'),type=location.pathname.endsWith('/flooring.html')?'flooring':'plate';
    if(link){link.href='specification.html?product='+type;link.textContent='К спецификации';}
  });
  if(parameters.has('editPosition')&&!parameters.has('specEngine')){
    const id=parameters.get('editPosition'),type=location.pathname.endsWith('/flooring.html')?'flooring':'plate';
    const back='specification.html?product='+encodeURIComponent(type);
    let saved,error;
    try{
      const records=window.WoodstockSpecificationState.read();
      saved=records.find(item=>item.id===id&&item.productType===type);
      if(!saved)throw new Error('Изделие для редактирования не найдено.');
      // Prevent the edited item from counting twice in order-dependent calculations.
      window.WoodstockSpecificationContext={items:records.filter(item=>item.id!==id&&item.productType===type)};
    }catch(e){error=e;}
    window.addEventListener('DOMContentLoaded',async()=>{
      const button=document.getElementById('addToSpecButton'),status=document.getElementById('saveStatus'),link=document.querySelector('.back-link');
      if(link){link.href=back;link.textContent='Отменить редактирование';}
      if(button){button.disabled=true;button.textContent='Сохранить изменения';}
      try{
        const controller=type==='flooring'?window.WoodstockFlooringController:window.WoodstockPanelsController;
        if(error)throw error;
        if(!controller)throw new Error('Калькулятор не загружен.');
        await controller.ready;
        controller.restoreRecord(window.WoodstockSpecificationState.clone(saved));
        window.WoodstockSpecificationEdit={id,type};
        if(button){button.textContent='Сохранить изменения';button.disabled=false;}
        if(status)status.textContent='';
      }catch(e){
        if(button)button.disabled=true;
        if(status)status.textContent='Не удалось открыть изделие: '+e.message;
      }
    });
    return;
  }
  if (!parameters.has('specEngine')) return;
  // This is the existing row-price presentation used by the short calculation.
  // It is scoped to the specification engine; the detailed form retains its original mode.
  window.WoodstockSpecificationContext={items:window.parent.WoodstockSpecification.context()};
  if (location.pathname.endsWith('/panels.html')) window.WoodstockPanelsView={positionPricing:true};
  window.addEventListener('DOMContentLoaded',()=>{
    const controller=window.WoodstockPanelsController||window.WoodstockFlooringController;
    controller.ready.then(()=>window.parent.WoodstockSpecification.engineReady(controller,window)).catch(error=>window.parent.WoodstockSpecification.engineFailed(error.message));
  });
})();
