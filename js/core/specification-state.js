/* Shared form persistence. Prices are always obtained from the original calculators. */
(() => {
  'use strict';
  const key = 'woodstockDetailedSpecification';
  const clone = value => JSON.parse(JSON.stringify(value));
  const path = (node, root) => {
    const indexes = [];
    while (node && node !== root) {
      indexes.unshift(Array.from(node.parentElement.children).indexOf(node));
      node = node.parentElement;
    }
    return indexes;
  };
  const at = (root, indexes) => indexes.reduce((node, index) => node?.children[index], root);
  function snapshot(root, getFiles) {
    const copy = root.cloneNode(true);
    const source = Array.from(root.querySelectorAll('input,select,textarea'));
    const targets = Array.from(copy.querySelectorAll('input,select,textarea'));
    source.forEach((node, index) => {
      const target = targets[index];
      if (node.tagName === 'SELECT') Array.from(target.options).forEach((option,i) => option.toggleAttribute('selected',node.options[i].selected));
      else if (node.tagName === 'TEXTAREA') target.textContent = node.value;
      else if (node.type !== 'file') { target.setAttribute('value',node.value); target.toggleAttribute('checked',node.checked); }
    });
    return {html:copy.innerHTML,files:Array.from(root.querySelectorAll('input[type=file]')).map(node => ({path:path(node,root),files:getFiles(node).map(file=>({name:file.name,size:file.size,type:file.type,lastModified:file.lastModified}))}))};
  }
  function restore(root, state, setFiles) {
    const source = document.createElement('div'); source.innerHTML = state.html;
    function merge(target, saved) {
      Array.from(target.attributes).forEach(attr => {if (!saved.hasAttribute(attr.name)) target.removeAttribute(attr.name);});
      Array.from(saved.attributes).forEach(attr => target.setAttribute(attr.name,attr.value));
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) {
        if (target.tagName !== 'INPUT') target.innerHTML = saved.innerHTML;
        if (target.type !== 'file') target.value = saved.value;
        if (target.type === 'checkbox' || target.type === 'radio') target.checked = saved.checked;
        return;
      }
      Array.from(saved.childNodes).forEach((child,index) => {
        let current = target.childNodes[index];
        if (child.nodeType === 1 && child.id && (current?.nodeType !== 1 || current.id !== child.id)) {
          const found = Array.from(target.children).find(node => node.id === child.id);
          if (found) {target.insertBefore(found,current || null); current = found;}
        }
        const matches = current && current.nodeType === child.nodeType && (child.nodeType !== 1 || (current.tagName === child.tagName && current.id === child.id));
        if (!matches) { target.insertBefore(child.cloneNode(true),current || null); }
        else if (child.nodeType === 1) merge(current,child);
        else current.textContent = child.textContent;
      });
      while (target.childNodes.length > saved.childNodes.length) target.lastChild.remove();
    }
    // Preserve the root element and all static controls with their original listeners.
    source.className = root.className; source.id = root.id;
    merge(root,source);
    state.files.forEach(entry => {const node=at(root,entry.path); if(node?.type==='file')setFiles(node,entry.files);});
  }
  function read() {
    const value = JSON.parse(sessionStorage.getItem(key) || '[]');
    if (!Array.isArray(value)) throw new Error('Не удалось прочитать сохранённую спецификацию.');
    return value;
  }
  function write(records) { sessionStorage.setItem(key, JSON.stringify(records)); }
  // Replace a saved item in place. Linked plate calculations retain their group and
  // are recalculated with the same original controller, excluding each current item.
  function replaceEditedRecord(records,record,editId){
    const index=records.findIndex(item=>item.id===editId&&item.productType===record.productType);
    if(index<0||window.WoodstockSpecificationEdit?.id!==editId)throw new Error('Исходное изделие не найдено или не открыто для редактирования.');
    const original=records[index],next=records.slice();
    next[index]={...record,id:original.id,createdAt:original.createdAt};
    if(record.productType!=='plate')return next;
    const group=original.calculationGroupId||original.id;
    next[index].calculationGroupId=group;
    const indexes=next.map((item,i)=>item.productType==='plate'&&(item.calculationGroupId||item.id)===group?i:null).filter(i=>i!==null);
    if(indexes.length<2)return next;
    const controller=window.WoodstockPanelsController;
    if(!controller)throw new Error('Калькулятор плит не загружен.');
    const edited=next[index],overrides=edited.editorState?.priceAdjustmentOverrides||[];
    const batch=overrides.find(([key])=>key==='mixmatch:actualVeneerAreaM2');
    indexes.forEach(i=>{
      if(next[i].materialSides?.A?.id!==edited.materialSides?.A?.id||next[i].layoutId!=='mixmatch'||!next[i].editorState) return;
      next[i]=clone(next[i]);
      next[i].editorState.priceAdjustmentOverrides=(next[i].editorState.priceAdjustmentOverrides||[]).filter(([key])=>key!=='mixmatch:actualVeneerAreaM2');
      if(batch)next[i].editorState.priceAdjustmentOverrides.push(clone(batch));
    });
    const previousContext=window.WoodstockSpecificationContext;
    try{
      for(const i of indexes){
        const saved=next[i];
        window.WoodstockSpecificationContext={items:clone(next.filter((item,j)=>j!==i&&item.productType==='plate'))};
        controller.restoreRecord(clone(saved));
        const updated=controller.capture();
        if(!updated)throw new Error('Проверьте параметры связанных изделий.');
        next[i]={...updated,id:saved.id,createdAt:saved.createdAt,calculationGroupId:group};
      }
      return next;
    }finally{
      window.WoodstockSpecificationContext=previousContext;
      controller.restoreRecord(clone(edited));
    }
  }
  function save(record) {
    try {
      const records = read();
      const editId=new URLSearchParams(location.search).get('editPosition');
      if(editId!==null)write(replaceEditedRecord(records,record,editId));
      else {records.push(record);write(records);}
      sessionStorage.setItem('woodstockSpecificationProduct',record.productType);
      location.href = './specification.html?product='+encodeURIComponent(record.productType);
      return true;
    } catch (error) {
      const output = document.getElementById('saveStatus');
      if (output) output.textContent = 'Не удалось сохранить позицию: ' + error.message;
      return false;
    }
  }
  function details(root) {
    return Array.from(root?.querySelectorAll('dl > div') || []).filter(node => !node.closest('.is-hidden,[hidden]')).map(node => {
      const copy=node.cloneNode(true);
      copy.querySelectorAll('.is-hidden,[hidden]').forEach(hidden=>hidden.remove());
      return [copy.querySelector('dt')?.textContent.trim(),copy.querySelector('dd')?.textContent.trim()];
    }).filter(pair => pair[0] && pair[1]);
  }
  window.WoodstockSpecificationState = {clone,snapshot,restore,read,write,save,details};
})();
