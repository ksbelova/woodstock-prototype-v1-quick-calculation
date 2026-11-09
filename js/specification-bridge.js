/* The original calculator supplies choices, validation and prices to table fields. */
(() => {
  'use strict';
  const parameters=new URLSearchParams(location.search);
  if(parameters.has('fromSpecification'))window.addEventListener('DOMContentLoaded',()=>{
    const link=document.querySelector('.back-link'),type=location.pathname.endsWith('/flooring.html')?'flooring':'plate';
    if(link){link.href='specification.html?product='+type;link.textContent='К спецификации';}
  });
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
