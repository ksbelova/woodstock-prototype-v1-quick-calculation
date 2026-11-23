/* Small dependency-free XLSX export: inline text, numeric cells, stored ZIP entries. */
(() => {
  'use strict';
  const encoder=new TextEncoder();
  const xml=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const column=index=>{let name='';for(let n=index+1;n;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;};
  const crcTable=Array.from({length:256},(_,i)=>{for(let j=0;j<8;j++)i=i&1?0xedb88320^(i>>>1):i>>>1;return i>>>0;});
  function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
  function header(size,values){const bytes=new Uint8Array(size),view=new DataView(bytes.buffer);values.forEach(([offset,value,width])=>width===2?view.setUint16(offset,value,true):view.setUint32(offset,value,true));return bytes;}
  function zip(files){
    const chunks=[],directory=[];let offset=0;
    files.forEach(([path,content])=>{
      const name=encoder.encode(path),data=encoder.encode(content),crc=crc32(data);
      if(data.length>0xffffffff)throw new Error('Слишком большой файл.');
      const local=header(30,[[0,0x04034b50,4],[4,20,2],[6,0x800,2],[10,0,2],[12,33,2],[14,crc,4],[18,data.length,4],[22,data.length,4],[26,name.length,2]]);
      const central=header(46,[[0,0x02014b50,4],[4,20,2],[6,20,2],[8,0x800,2],[12,0,2],[14,33,2],[16,crc,4],[20,data.length,4],[24,data.length,4],[28,name.length,2],[42,offset,4]]);
      chunks.push(local,name,data);directory.push(central,name);offset+=30+name.length+data.length;
    });
    const size=directory.reduce((sum,item)=>sum+item.length,0);
    if(offset+size>0xffffffff)throw new Error('Слишком большой архив.');
    const end=header(22,[[0,0x06054b50,4],[8,files.length,2],[10,files.length,2],[12,size,4],[16,offset,4]]);
    const bytes=new Uint8Array(offset+size+22);let cursor=0;[...chunks,...directory,end].forEach(chunk=>{bytes.set(chunk,cursor);cursor+=chunk.length;});return bytes;
  }
  const declaration='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  function build(sheets){
    if(!sheets?.length)throw new Error('Нет данных для выгрузки.');
    const names=new Set();sheets.forEach(sheet=>{if(!sheet.name||sheet.name.length>31||/[\\/?*\[\]:]/.test(sheet.name)||names.has(sheet.name))throw new Error('Некорректное имя листа.');names.add(sheet.name);});
    const files=[
      ['[Content_Types].xml',declaration+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>'],
      ['_rels/.rels',declaration+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml',declaration+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>'+sheets.map((sheet,i)=>'<sheet name="'+xml(sheet.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels',declaration+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml',declaration+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>']
    ];
    sheets.forEach((sheet,index)=>{
      const count=Math.max(1,...sheet.rows.map(row=>row.length));
      if(count>16384||sheet.rows.length>1048576)throw new Error('Превышен размер листа Excel.');
      const columns=Array.from({length:count},(_,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+(count<=2?(i===0?42:80):i===0?12:32)+'" customWidth="1"/>').join('');
      const rows=sheet.rows.map((row,r)=>{
        const width=count<=2?70:30;
        const lines=Math.max(1,...row.map(value=>String(value??'').split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/width)),0)));
        const height=Math.min(409,Math.max(22,lines*15+8));
        return '<row r="'+(r+1)+'" ht="'+height+'" customHeight="1">'+row.map((value,c)=>{
          const ref=column(c)+(r+1);
          return typeof value==='number'&&Number.isFinite(value)?'<c r="'+ref+'" s="1"><v>'+value+'</v></c>':'<c r="'+ref+'" s="'+(r===0?'2':'0')+'" t="inlineStr"><is><t xml:space="preserve">'+xml(value)+'</t></is></c>';
        }).join('')+'</row>';
      }).join('');
      files.push(['xl/worksheets/sheet'+(index+1)+'.xml',declaration+'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols>'+columns+'</cols><sheetData>'+rows+'</sheetData><pageSetup orientation="landscape" paperSize="9" fitToWidth="1"/></worksheet>']);
    });return zip(files);
  }
  function download(sheets,filename){
    const data=build(sheets),blob=new Blob([data],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  window.WoodstockExcel={build,download};
})();
