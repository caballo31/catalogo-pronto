// Gestor de Promos — PRONTO!
// Lee productos.csv (el mismo export crudo de Odoo que usa el catálogo
// público) solo para ofrecerte los nombres/categorías reales al elegir.
// Las promos se guardan en localStorage de este navegador y se exportan
// como promos.json para subir al repo.
//
// OJO: como esto hace fetch() de productos.csv, necesita servirse por
// http(s) — no funciona abriendo el archivo con doble click (file://).
// Lo más simple: subilo al repo junto con el resto y abrilo desde
// tu URL de Vercel, ej. catalogo-pronto.vercel.app/promos-admin.html
// (o corré un server local: `python -m http.server` en la carpeta).

const STORAGE_KEY = 'pronto_promos_v1';
const CATALOG_CSV_PATH = 'productos.csv';
const EXCLUDED_CATEGORIES = ['insumos de produccion', 'descartables', 'all', 'todos'];

let allProducts = [];
let promos = [];
let currentTipo = 'producto';

// Selecciones activas de los pickers (se resetean al agregar una promo)
const selection = {
  producto: new Set(),   // multi, para tipo "producto"
  trigger: null,         // single, nombre de producto (tipo "cruzada")
  beneficio: null,       // single, nombre de producto (tipo "cruzada" -> otroProducto)
};

const dataStatus = document.getElementById('dataStatus');
const dataStatusText = document.getElementById('dataStatusText');

// ---------------------------------------------------------------------------
// Parsing del CSV crudo de Odoo (mismas funciones que usa script.js)
// ---------------------------------------------------------------------------

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r') {
      // ignorar
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const header = (rows.shift() || []).map((h) => h.trim());
  return rows
    .filter((r) => r.some((cell) => cell.trim() !== ''))
    .map((r) => {
      const entry = {};
      header.forEach((key, index) => {
        entry[key] = (r[index] || '').trim();
      });
      return entry;
    });
}

function parsePrice(value) {
  const num = parseFloat(String(value || '0').replace(',', '.'));
  return Number.isFinite(num) ? Math.round(num) : 0;
}

function mapOdooRowToProduct(row) {
  const name = (row['Nombre'] || '').trim();
  const parentCat = (row['Categoría del producto/Categoría principal'] || '').trim();
  const leafCat = (row['Categoría del producto/Nombre'] || '').trim();
  const category = parentCat ? `${parentCat}/${leafCat}` : leafCat;
  const unidad = (row['Unidad de medida'] || '').trim().toLowerCase();

  return {
    name,
    price: parsePrice(row['Precio de venta']),
    category: category || '',
    unit: unidad === 'kg' ? 'kg' : 'unidad',
  };
}

function shouldIncludeProduct(product) {
  if (!product.name) return false;
  const mainCategory = normalizeText(getCategoryParts(product.category).main);
  if (!mainCategory) return false;
  return !EXCLUDED_CATEGORIES.includes(mainCategory);
}

async function loadProductsFromCsv() {
  const response = await fetch(`${CATALOG_CSV_PATH}?v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`status ${response.status}`);
  const text = await response.text();
  return parseCsv(text).map(mapOdooRowToProduct).filter(shouldIncludeProduct);
}

async function init() {
  try {
    allProducts = await loadProductsFromCsv();
    if (!allProducts.length) throw new Error('El CSV no tiene productos.');
    dataStatus.classList.add('ready');
    dataStatusText.textContent = `Listo: ${allProducts.length} productos de referencia cargados desde productos.csv.`;
  } catch (error) {
    dataStatus.classList.add('error');
    dataStatusText.textContent =
      'No se pudo leer productos.csv (' + error.message + '). Recordá: esta página necesita abrirse por http(s), ' +
      'no con doble click. Subila junto al resto del sitio y entrá por tu URL de Vercel, o corré un server local.';
  }

  promos = loadPromos();
  renderCategoriaSelects();
  renderPromoList();
  bindTipoTabs();
  bindSearchInputs();
  bindBeneficioTipo();
  document.getElementById('promoForm').addEventListener('submit', handleSubmit);
  document.getElementById('exportBtn').addEventListener('click', exportPromos);
  document.getElementById('importInput').addEventListener('change', importPromos);

  renderPickers('producto', '');
  renderPickers('trigger', '');
  renderPickers('beneficio', '');
}

// ---------------------------------------------------------------------------
// Categorías (derivadas de products-data.js: "CATEGORIA/Subcategoria")
// ---------------------------------------------------------------------------

function getCategoryParts(category = '') {
  const parts = String(category || '').split('/').map((p) => p.trim()).filter(Boolean);
  return { main: parts[0] || 'General', sub: parts.slice(1).join(' / ') || '' };
}

function distinctMainCategories() {
  return [...new Set(allProducts.map((p) => getCategoryParts(p.category).main))].sort();
}

function subcategoriesFor(mainCategory) {
  return [...new Set(
    allProducts
      .filter((p) => getCategoryParts(p.category).main === mainCategory)
      .map((p) => getCategoryParts(p.category).sub)
      .filter(Boolean)
  )].sort();
}

function renderCategoriaSelects() {
  const categorias = distinctMainCategories();
  const opts = categorias.map((c) => `<option value="${c}">${c}</option>`).join('');

  const categoriaSelect = document.getElementById('categoriaSelect');
  categoriaSelect.innerHTML = opts;
  categoriaSelect.addEventListener('change', () => updateSubcategoriaOptions(categoriaSelect.value));
  updateSubcategoriaOptions(categoriaSelect.value);

  const beneficioCategoriaSelect = document.getElementById('beneficioCategoriaSelect');
  beneficioCategoriaSelect.innerHTML = opts;
}

function updateSubcategoriaOptions(mainCategory) {
  const subcategoriaSelect = document.getElementById('subcategoriaSelect');
  const subs = subcategoriesFor(mainCategory);
  subcategoriaSelect.innerHTML =
    '<option value="">Todas</option>' + subs.map((s) => `<option value="${s}">${s}</option>`).join('');
}

// ---------------------------------------------------------------------------
// Tabs de tipo de promo
// ---------------------------------------------------------------------------

function bindTipoTabs() {
  document.querySelectorAll('.tipo-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentTipo = btn.dataset.tipo;
      document.querySelectorAll('.tipo-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('[data-tipo-fields]').forEach((el) => {
        el.hidden = el.dataset.tipoFields !== currentTipo;
      });
    });
  });
}

function bindBeneficioTipo() {
  const select = document.getElementById('beneficioTipo');
  select.addEventListener('change', () => {
    document.getElementById('beneficioOtroProducto').hidden = select.value !== 'otroProducto';
    document.getElementById('beneficioCategoria').hidden = select.value !== 'categoria';
  });
}

// ---------------------------------------------------------------------------
// Pickers de producto (con búsqueda)
// ---------------------------------------------------------------------------

function bindSearchInputs() {
  document.querySelectorAll('.product-search').forEach((input) => {
    input.addEventListener('input', () => {
      renderPickers(input.dataset.searchFor, input.value);
    });
  });
}

function normalizeText(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function renderPickers(key, searchTerm) {
  const container = document.querySelector(`[data-picker="${key}"]`);
  if (!container) return;

  const term = normalizeText(searchTerm);
  const matches = allProducts
    .filter((p) => !term || normalizeText(p.name).includes(term))
    .slice(0, 60);

  if (!matches.length) {
    container.innerHTML = '<p class="empty-msg">Sin resultados</p>';
    return;
  }

  const isMulti = key === 'producto';

  container.innerHTML = matches
    .map((p) => {
      const isSelected = isMulti ? selection.producto.has(p.name) : selection[key] === p.name;
      return `
        <div class="product-picker-item ${isSelected ? 'selected' : ''}" data-product="${encodeURIComponent(p.name)}">
          <span>${p.name}</span>
          <span class="cat-tag">${p.category} · ${p.unit}</span>
        </div>
      `;
    })
    .join('');

  container.querySelectorAll('.product-picker-item').forEach((item) => {
    item.addEventListener('click', () => {
      const name = decodeURIComponent(item.dataset.product);
      if (isMulti) {
        selection.producto.has(name) ? selection.producto.delete(name) : selection.producto.add(name);
      } else {
        selection[key] = selection[key] === name ? null : name;
        if (key === 'trigger') updateTriggerUnitLabel();
      }
      renderPickers(key, document.querySelector(`[data-search-for="${key}"]`).value);
    });
  });
}

function updateTriggerUnitLabel() {
  const label = document.getElementById('triggerUnitLabel');
  if (!selection.trigger) {
    label.textContent = '';
    return;
  }
  const product = allProducts.find((p) => p.name === selection.trigger);
  label.textContent = product ? `(en ${product.unit === 'kg' ? 'kg' : 'unidades'})` : '';
}

// ---------------------------------------------------------------------------
// Alta de promo
// ---------------------------------------------------------------------------

function handleSubmit(event) {
  event.preventDefault();

  let promo;
  try {
    promo = buildPromoFromForm();
  } catch (err) {
    alert(err.message);
    return;
  }

  promo.id = `promo_${Date.now()}`;
  promo.activa = true;
  promos.push(promo);
  savePromos();
  renderPromoList();
  resetForm();
}

function buildPromoFromForm() {
  if (currentTipo === 'producto') {
    const productos = [...selection.producto];
    const descuento = Number(document.getElementById('descuentoProducto').value);
    if (!productos.length) throw new Error('Elegí al menos un producto.');
    if (!descuento || descuento <= 0) throw new Error('Cargá un % de descuento válido.');
    return { tipo: 'producto', productos, descuentoPercent: descuento };
  }

  if (currentTipo === 'categoria') {
    const categoria = document.getElementById('categoriaSelect').value;
    const subcategoria = document.getElementById('subcategoriaSelect').value;
    const descuento = Number(document.getElementById('descuentoCategoria').value);
    if (!categoria) throw new Error('Elegí una categoría.');
    if (!descuento || descuento <= 0) throw new Error('Cargá un % de descuento válido.');
    return { tipo: 'categoria', categoria, subcategoria: subcategoria || '', descuentoPercent: descuento };
  }

  // cruzada
  const triggerProducto = selection.trigger;
  const cantidadMinima = Number(document.getElementById('cantidadMinima').value);
  const beneficioTipo = document.getElementById('beneficioTipo').value;
  const descuento = Number(document.getElementById('descuentoCruzada').value);

  if (!triggerProducto) throw new Error('Elegí el producto disparador.');
  if (!cantidadMinima || cantidadMinima <= 0) throw new Error('Cargá una cantidad mínima válida.');
  if (!descuento || descuento <= 0) throw new Error('Cargá un % de descuento válido.');

  const triggerProduct = allProducts.find((p) => p.name === triggerProducto);
  const trigger = { producto: triggerProducto, cantidadMinima, unidad: triggerProduct ? triggerProduct.unit : 'unidad' };

  const beneficio = { tipo: beneficioTipo };
  if (beneficioTipo === 'otroProducto') {
    if (!selection.beneficio) throw new Error('Elegí el producto beneficiado.');
    beneficio.producto = selection.beneficio;
  } else if (beneficioTipo === 'categoria') {
    const cat = document.getElementById('beneficioCategoriaSelect').value;
    if (!cat) throw new Error('Elegí la categoría beneficiada.');
    beneficio.categoria = cat;
  }

  return { tipo: 'cruzada', trigger, beneficio, descuentoPercent: descuento };
}

function resetForm() {
  document.getElementById('promoForm').reset();
  selection.producto.clear();
  selection.trigger = null;
  selection.beneficio = null;
  updateTriggerUnitLabel();
  document.getElementById('beneficioOtroProducto').hidden = true;
  document.getElementById('beneficioCategoria').hidden = true;
  renderPickers('producto', '');
  renderPickers('trigger', '');
  renderPickers('beneficio', '');
}

// ---------------------------------------------------------------------------
// Listado / resumen legible de cada promo
// ---------------------------------------------------------------------------

function summarize(promo) {
  if (promo.tipo === 'producto') {
    return `${promo.descuentoPercent}% OFF en: ${promo.productos.join(', ')}`;
  }
  if (promo.tipo === 'categoria') {
    const catLabel = promo.subcategoria ? `${promo.categoria} / ${promo.subcategoria}` : promo.categoria;
    return `${promo.descuentoPercent}% OFF en toda la categoría "${catLabel}"`;
  }
  // cruzada
  const unidadLabel = promo.trigger.unidad === 'kg' ? 'kg' : 'unidad(es)';
  const triggerLabel = `Llevando ${promo.trigger.cantidadMinima}${promo.trigger.unidad === 'kg' ? 'kg' : ' ' + unidadLabel} de "${promo.trigger.producto}"`;
  let beneficioLabel;
  if (promo.beneficio.tipo === 'mismoProducto') {
    beneficioLabel = `${promo.descuentoPercent}% OFF en ese mismo producto`;
  } else if (promo.beneficio.tipo === 'otroProducto') {
    beneficioLabel = `${promo.descuentoPercent}% OFF en "${promo.beneficio.producto}"`;
  } else {
    beneficioLabel = `${promo.descuentoPercent}% OFF en la categoría "${promo.beneficio.categoria}"`;
  }
  return `${triggerLabel} → ${beneficioLabel}`;
}

function renderPromoList() {
  const list = document.getElementById('promoList');
  document.getElementById('promoCount').textContent = promos.length;

  if (!promos.length) {
    list.innerHTML = '<p class="empty-msg">Todavía no cargaste promos.</p>';
    return;
  }

  list.innerHTML = promos
    .map(
      (promo) => `
        <div class="promo-card ${promo.activa ? '' : 'inactiva'}" data-id="${promo.id}">
          <div class="promo-card-main">
            <span class="promo-type-badge ${promo.tipo}">${labelForTipo(promo.tipo)}</span>
            <p class="promo-summary">${summarize(promo)}</p>
          </div>
          <div class="promo-card-actions">
            <button class="toggle-btn" data-action="toggle" data-id="${promo.id}" type="button">
              ${promo.activa ? 'Pausar' : 'Activar'}
            </button>
            <button class="delete-btn" data-action="delete" data-id="${promo.id}" type="button">Eliminar</button>
          </div>
        </div>
      `
    )
    .join('');

  list.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const promo = promos.find((p) => p.id === btn.dataset.id);
      promo.activa = !promo.activa;
      savePromos();
      renderPromoList();
    });
  });

  list.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!confirm('¿Eliminar esta promo?')) return;
      promos = promos.filter((p) => p.id !== btn.dataset.id);
      savePromos();
      renderPromoList();
    });
  });
}

function labelForTipo(tipo) {
  if (tipo === 'producto') return 'Producto';
  if (tipo === 'categoria') return 'Categoría';
  return 'Cruzada';
}

// ---------------------------------------------------------------------------
// Persistencia local + export/import
// ---------------------------------------------------------------------------

function loadPromos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePromos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(promos));
}

function exportPromos() {
  const blob = new Blob([JSON.stringify(promos, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'promos.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importPromos(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error('El archivo no tiene el formato esperado.');
      promos = imported;
      savePromos();
      renderPromoList();
      alert(`Se importaron ${imported.length} promos.`);
    } catch (err) {
      alert('No se pudo leer el archivo: ' + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

init();
