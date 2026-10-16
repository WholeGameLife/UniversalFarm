'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const clone = (value) => JSON.parse(JSON.stringify(value));
const STORAGE = 'universal-farm-seed-editor-v1';
const soils = { loam:'壤土', sand:'沙土', clay:'黏土', peat:'腐殖土' };
const biomes = { temperate:'温和', desert:'沙漠', frozen:'冰封', volcanic:'火山', void:'虚空' };
let catalog = clone(DEFAULT_CROPS), selected = 0, saveTimer, toastTimer;
try {
  const draft = localStorage.getItem(STORAGE);
  if (draft) catalog = parseCropCatalog(draft);
} catch { $('save-state').textContent = '草稿不可用，已加载内置数据'; }
const get = (obj, path) => path.split('.').reduce((v, k) => v?.[k], obj);
const set = (obj, path, value) => { const keys=path.split('.'); let target=obj; keys.slice(0,-1).forEach((k)=>target=target[k]); target[keys.at(-1)]=value; };
const field = (label, input, help='', full=false) => `<label class="field ${full?'full':''}"><span>${label}</span>${input}${help?`<small>${help}</small>`:''}</label>`;
const num = (path,label,min=0,help='') => field(label,`<input type="number" data-path="${path}" data-kind="number" min="${min}" step="1" value="${esc(get(catalog[selected],path))}" />`,help);
const text = (path,label,help='',full=false) => field(label,`<input data-path="${path}" value="${esc(get(catalog[selected],path))}" />`,help,full);
const section = (number,title,html) => `<fieldset><legend><span>${number}</span>${title}</legend><div class="fields">${html}</div></fieldset>`;
const csv = (path,label,kind='strings',help='') => field(label,`<input data-path="${path}" data-kind="${kind}" value="${esc(get(catalog[selected],path).join(', '))}" />`,help,true);
const checkboxes = (path,label,choices,help='') => `<div class="field full"><span>${label}</span><div class="checks">${Object.entries(choices).map(([id,name])=>`<label class="check"><input type="checkbox" data-path="${path}" data-kind="choices" value="${id}" ${get(catalog[selected],path).includes(id)?'checked':''} />${name}</label>`).join('')}</div><small>${help}</small></div>`;
const range = (path,label,help) => field(label,`<div class="range"><input type="number" data-path="${path}.0" data-kind="number" value="${get(catalog[selected],path)[0]}" /><span>～</span><input type="number" data-path="${path}.1" data-kind="number" value="${get(catalog[selected],path)[1]}" /></div>`,help);
const color = (path,label) => field(label,`<div class="color-row"><input type="color" data-path="${path}" value="${esc(get(catalog[selected],path))}" /><input data-path="${path}" value="${esc(get(catalog[selected],path))}" /></div>`);

function toast(message) { $('toast').textContent=message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500); }
function persist() {
  clearTimeout(saveTimer);
  $('save-state').textContent='草稿已修改';
  saveTimer=setTimeout(()=>{
    if(!updateValidation()) { $('save-state').textContent='请修正数据后保存'; return; }
    try { localStorage.setItem(STORAGE,JSON.stringify({schemaVersion:CROP_SCHEMA_VERSION,crops:catalog})); $('save-state').textContent='已保存本机草稿'; }
    catch { $('save-state').textContent='无法存储，请导出文件保存'; }
  },350);
}
function renderList() {
  const search=$('search').value.trim().toLowerCase();
  $('crop-count').textContent=String(catalog.length).padStart(2,'0');
  $('crop-list').innerHTML=catalog.map((c,index)=>({c,index})).filter(({c})=>`${c.name} ${c.id} ${c.uses.tags.join(' ')}`.toLowerCase().includes(search)).map(({c,index})=>`<button class="seed-row ${selected===index?'active':''}" data-select="${index}"><span class="icon">${esc(c.harvest.icon)}</span><span><strong>${esc(c.name)}</strong><small>${esc(c.id)}</small></span><span class="cycle">${esc(c.growDays)}d</span></button>`).join('')||'<p class="help">没有匹配的作物</p>';
}
function renderForm() {
  const c=catalog[selected];
  $('record-title').textContent=c.name;
  $('delete-crop').disabled=catalog.length<=1;
  $('crop-form').innerHTML=
    section('A','身份与价格',text('id','作物 ID','已用于存档的 ID 不应修改。')+text('name','显示名称')+text('seed','种子物品 ID')+text('harvest.item','收获物品 ID')+text('seedIcon','种子图标')+text('harvest.icon','收获图标')+num('seedPrice','购买价格（星币）',1)+num('harvest.sellPrice','普通品质售价（每个）',1)+field('描述',`<textarea data-path="description">${esc(c.description)}</textarea>`,'',true))+
    section('B','生长、浇水与收割',num('growDays','首次成熟天数',1,'按有效生长日计算，不浇水不生长。')+num('regrowDays','再生天数',0,'0 = 单次收割；大于 0 = 保留植株继续产出。')+csv('stages','生长阶段图标','strings','以逗号分隔，最后一个图标为成熟。')+csv('stageDays','各阶段所需天数','numbers','数量必须为图标数减一，合计必须等于首次成熟天数。')+num('waterIntervalDays','浇水间隔（天）',1,'1 = 每天；2 = 浇一次支持两个生长日。')+num('maxDryDays','连续缺水容忍天数',0,'超过此天数后枯萎；0 = 第一个缺水日枯萎。')+num('harvest.min','单次最低产量',1)+num('harvest.max','单次最高产量',1))+
    section('C','土地与气候需求',checkboxes('requirements.soils','可种植土地',soils,'已启用。营地默认壤土，可用改良包改变空地土壤。')+range('requirements.temperature','温度范围（°C）','预留：气候联动尚未启用。')+range('requirements.moisture','环境湿度范围（%）','预留：不代替人工浇水。')+checkboxes('requirements.biomes','限定群系',biomes,'预留：全部不选 = 任意群系。'))+
    section('D','获取与野外生成',field('商店出售',`<select data-path="availability.shop" data-kind="boolean"><option value="true" ${c.availability.shop?'selected':''}>是</option><option value="false" ${!c.availability.shop?'selected':''}>否</option></select>`)+text('availability.requires','解锁科技 ID','留空 = 不需要；游戏导入时验证科技是否存在。')+csv('availability.sources','获取方式','strings','shop、starter、research、wild 等标签；新增 starter 标签不会自动增加开局物品。')+checkboxes('availability.wild.biomes','野外生成群系',biomes,'预留：野外种子生成尚未实现。')+field('野外生成概率（0–1）',`<input type="number" min="0" max="1" step="0.01" data-path="availability.wild.chance" data-kind="number" value="${c.availability.wild.chance}" />`,'预留：每次生成检查的概率，不是全星球密度。'))+
    section('E','用途与加工接口',csv('uses.tags','用途标签','strings','如 food、brewing、cooking、preserves、grain。')+num('uses.foodEnergy','每个普通品质恢复体力',0,'0 = 不可直接食用；银星/金星随品质提升。')+field('未来加工配方（JSON 数组）',`<textarea class="code" data-path="uses.processing" data-kind="json">${esc(JSON.stringify(c.uses.processing,null,2))}</textarea>`,'每项：id、name、machine、output、inputCount、outputCount、hours。为空使用 []。加工设备尚未启用。',true))+
    section('F','作物模型',field('造型',`<select data-path="visual.shape">${Object.entries({wheat:'谷物',bush:'灌木 / 浆果',melon:'瓜类',root:'根茎',vine:'藤架 / 啤酒花'}).map(([id,name])=>`<option value="${id}" ${c.visual.shape===id?'selected':''}>${name}</option>`).join('')}</select>`)+color('visual.leaf','叶片颜色')+color('visual.fruit','收获部位颜色'));
}
function updateValidation() {
  const errors=validateCropCatalog(catalog);
  const jsonError=$('crop-form').querySelector('[data-json-error]');
  if(jsonError) errors.unshift('加工配方 JSON 格式错误，请修正后导出');
  $('errors').classList.toggle('invalid',!!errors.length);
  $('errors').innerHTML=errors.length?`<b>需要修正 ${errors.length} 项</b><ul>${errors.slice(0,12).map((e)=>`<li>${esc(e)}</li>`).join('')}</ul>`:'✓ 数据校验通过 · 可导入游戏或更新默认图鉴';
  $('export-json').disabled=$('export-js').disabled=!!errors.length;
  return !errors.length;
}
function renderPreview() {
  const c=catalog[selected], avg=(c.harvest.min+c.harvest.max)/2;
  const revenue=avg*c.harvest.sellPrice, profit=revenue-c.seedPrice;
  $('preview').innerHTML=`<div class="preview-hero"><span class="crop-glyph">${esc(c.harvest.icon)}</span><h3>${esc(c.name)}</h3><small>${esc(c.id)} / ${c.regrowDays?'REPEAT HARVEST':'SINGLE HARVEST'}</small></div>
    <div class="timeline">${c.stages.map((icon,i)=>`<div class="growth-stage" style="flex:${c.stageDays[i]||1}">${esc(icon)}<span>${i===c.stages.length-1?'成熟':`${esc(c.stageDays[i]??'?')}d`}</span></div>`).join('')}</div>
    <div class="metric"><span>首次成熟</span><b>${esc(c.growDays)} 天</b></div><div class="metric"><span>后续周期</span><b>${c.regrowDays?`${esc(c.regrowDays)} 天`:'—'}</b></div><div class="metric"><span>每次普通品质平均产值</span><b>${Number.isFinite(revenue)?revenue.toFixed(1):'—'}</b></div><div class="metric"><span>首次净收益（不计肥料）</span><b>${Number.isFinite(profit)?profit.toFixed(1):'—'}</b></div>
    <p class="mini-label">品质售价 · 每个</p><div class="quality-values"><span>普通 ${esc(c.harvest.sellPrice)}</span><span>银星 ${Math.round(c.harvest.sellPrice*1.25)}</span><span>金星 ${Math.round(c.harvest.sellPrice*1.5)}</span></div>
    <p class="value-note">预估仅按普通品质和平均产量计算。连续作物只在首次扣除种价。基础肥料提升品质，速生肥料速度 +25%，保水肥料每日 50% 保水。</p>`;
}
function render() { renderList(); renderForm(); updateValidation(); renderPreview(); }
function newId(base) { let id=base, n=2; while(catalog.some((c)=>c.id===id||c.seed===`seed_${id}`||c.harvest.item===id))id=`${base}_${n++}`; return id; }
function add(copy) {
  if(!updateValidation()) return toast('请先修正当前数据，再新增或复制');
  const c=clone(copy?catalog[selected]:DEFAULT_CROPS[0]);
  c.id=newId(copy?`${c.id}_copy`:'new_crop'); c.seed=`seed_${c.id}`; c.harvest.item=c.id; c.name=copy?`${c.name}副本`:'新作物';
  catalog.push(c); selected=catalog.length-1; $('search').value=''; render(); persist();
}
function download(content,name,type) { const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);toast(`已导出 ${name}`); }
$('crop-form').addEventListener('submit',(e)=>e.preventDefault());
$('crop-form').addEventListener('input',(e)=>{
  const input=e.target, path=input.dataset.path;
  if(!path)return;
  let value=input.value;
  if(input.dataset.kind==='number') value=value===''?null:Number(value);
  else if(input.dataset.kind==='boolean')value=value==='true';
  else if(input.dataset.kind==='choices')value=Array.from($('crop-form').querySelectorAll(`[data-path="${path}"]:checked`)).map((el)=>el.value);
  else if(input.dataset.kind==='strings'||input.dataset.kind==='numbers')value=value.split(/[,，]/).map((s)=>s.trim()).filter(Boolean).map((s)=>input.dataset.kind==='numbers'?Number(s):s);
  else if(input.dataset.kind==='json') { try { value=JSON.parse(value); delete input.dataset.jsonError; } catch { input.dataset.jsonError='true'; updateValidation(); return; } }
  else if(path==='availability.requires')value=value.trim()||null;
  set(catalog[selected],path,value);
  if(input.type==='color')$('crop-form').querySelectorAll(`[data-path="${path}"]`).forEach((el)=>{if(el!==input)el.value=value;});
  $('record-title').textContent=catalog[selected].name;
  renderList(); updateValidation(); renderPreview(); persist();
});
$('crop-list').addEventListener('click',(e)=>{const button=e.target.closest('[data-select]');if(!button)return;if(!updateValidation())return toast('请先修正当前数据再切换作物');selected=Number(button.dataset.select);render();});
$('search').addEventListener('input',renderList);
$('add-crop').addEventListener('click',()=>add(false));
$('duplicate').addEventListener('click',()=>add(true));
$('delete-crop').addEventListener('click',()=>{if(catalog.length<=1)return;if(!confirm(`删除 ${catalog[selected].name}？已有游戏存档可能仍在使用此 ID。`))return;catalog.splice(selected,1);selected=Math.min(selected,catalog.length-1);render();persist();});
$('restore-defaults').addEventListener('click',()=>{if(!confirm('恢复内置图鉴会覆盖当前草稿。请先导出需要保留的数据。继续？'))return;catalog=clone(DEFAULT_CROPS);selected=0;$('search').value='';render();persist();});
$('import-button').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async(e)=>{const file=e.target.files[0];if(!file)return;try{const next=parseCropCatalog(await file.text());if(!confirm('导入会替换当前图鉴，继续？'))return;catalog=next;selected=0;$('search').value='';render();persist();toast('数据已导入');}catch(error){toast(`导入失败：${error.message}`);}finally{e.target.value='';}});
$('export-json').addEventListener('click',()=>{if(updateValidation())download(JSON.stringify({schemaVersion:CROP_SCHEMA_VERSION,crops:catalog},null,2),'crop-catalog.json','application/json;charset=utf-8');});
$('export-js').addEventListener('click',()=>{if(updateValidation())download(cropModuleSource(catalog),'crops.js','text/javascript;charset=utf-8');});
render();
