// CAMBIAR NUMERO ACA
const WHATSAPP_NUMBER = '5493456546324';

// Colores y branding principal del sitio
const BRAND = {
  name: 'PRONTO! Congelados y más',
  primary: '#600020',
  accent: '#d9a56a',
  text: '#2f1f14',
};

// El catálogo se arma leyendo DIRECTO el CSV que exportás de Odoo
const CATALOG_CSV_PATH = 'productos.csv';

// Las promos se cargan desde promos.json
const PROMOS_JSON_PATH = 'promos.json';

// Categorías de Odoo que nunca deben aparecer en el catálogo web
const EXCLUDED_CATEGORIES = ['insumos de produccion', 'descartables', 'all', 'todos'];

// Umbral para avisar que queda poco stock
const LOW_STOCK_THRESHOLD = 2;

// ---------------------------------------------------------------------------
// Parsing genérico de CSV
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

function parseQuantity(value) {
  const num = parseFloat(String(value || '0').replace(',', '.'));
  return Number.isFinite(num) ? num : 0;
}

function normalizeText(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function getCategoryParts(category = '') {
  const parts = String(category || '').split('/').map((p) => p.trim()).filter(Boolean);
  return { main: parts[0] || '', sub: parts.slice(1).join(' / ') || '' };
}

// ---------------------------------------------------------------------------
// Mapeo del export crudo de Odoo
// ---------------------------------------------------------------------------

function mapOdooRowToProduct(row) {
  const name = (row['Nombre'] || '').trim();
  const parentCat = (row['Categoría del producto/Categoría principal'] || '').trim();
  const leafCat = (row['Categoría del producto/Nombre'] || '').trim();
  const category = parentCat ? `${parentCat}/${leafCat}` : leafCat;

  const unidad = (row['Unidad de medida'] || '').trim().toLowerCase();
  const unit = unidad === 'kg' ? 'kg' : 'unidad';

  const trackStock = (row['Rastrear inventario'] || '').trim().toLowerCase() === 'true';
  const stock = parseQuantity(row['Cantidad a la mano']);

  return {
    name,
    price: parsePrice(row['Precio de venta']),
    category: category || '',
    unit,
    description: 'Producto del catálogo',
    stock,
    trackStock,
    isOutOfStock: trackStock && stock <= 0,
    isLowStock: trackStock && stock > 0 && stock <= LOW_STOCK_THRESHOLD,
  };
}

function shouldIncludeProduct(product) {
  if (!product.name) return false;
  const mainCategory = normalizeText(getCategoryParts(product.category).main);
  if (!mainCategory) return false;
  return !EXCLUDED_CATEGORIES.includes(mainCategory);
}

// ---------------------------------------------------------------------------
// Promos (promos.json)
// ---------------------------------------------------------------------------

function computeStaticDiscountForProduct(product, promoList) {
  let best = 0;
  promoList
    .filter((promo) => promo.activa)
    .forEach((promo) => {
      if (promo.tipo === 'producto' && promo.productos.includes(product.name)) {
        best = Math.max(best, promo.descuentoPercent);
      }
      if (promo.tipo === 'categoria') {
        const parts = getCategoryParts(product.category);
        const matchesMain = parts.main === promo.categoria;
        const matchesSub = !promo.subcategoria || parts.sub === promo.subcategoria;
        if (matchesMain && matchesSub) {
          best = Math.max(best, promo.descuentoPercent);
        }
      }
    });
  return best;
}

function applyStaticPromos(productList, promoList) {
  return productList.map((product) => {
    const discountPercent = computeStaticDiscountForProduct(product, promoList);
    const originalPrice = product.price;
    const discountedPrice = discountPercent > 0
      ? Math.max(0, Math.round(originalPrice * (1 - discountPercent / 100)))
      : originalPrice;

    return {
      ...product,
      originalPrice,
      price: discountedPrice,
      hasPromo: discountPercent > 0,
      promoLabel: discountPercent > 0 ? `${discountPercent}% OFF` : '',
    };
  });
}

function computeCruzadaDiscounts(cartList, promoList) {
  const discountMap = new Map();
  const setMax = (name, value) => discountMap.set(name, Math.max(discountMap.get(name) || 0, value));

  promoList
    .filter((promo) => promo.activa && promo.tipo === 'cruzada')
    .forEach((promo) => {
      const triggerItem = cartList.find((item) => item.name === promo.trigger.producto);
      if (!triggerItem || triggerItem.quantity < promo.trigger.cantidadMinima) return;

      if (promo.beneficio.tipo === 'mismoProducto') {
        setMax(triggerItem.name, promo.descuentoPercent);
      } else if (promo.beneficio.tipo === 'otroProducto') {
        const targets = promo.beneficio.productos || [promo.beneficio.producto];
        targets.forEach((targetName) => {
          const targetItem = cartList.find((item) => item.name === targetName);
          if (targetItem) setMax(targetItem.name, promo.descuentoPercent);
        });
      } else if (promo.beneficio.tipo === 'categoria') {
        cartList.forEach((item) => {
          const parts = getCategoryParts(item.category);
          if (parts.main === promo.beneficio.categoria) {
            setMax(item.name, promo.descuentoPercent);
          }
        });
      }
    });

  return discountMap;
}

let products = [];
let promos = [];
let bannerTimer = null; // Timer global para el auto-slide

const CART_STORAGE_KEY = 'almacen-rotiseria-cart';
let activeCategory = 'Todos';
let activeSubCategory = 'Todos';
let searchTerm = '';
let cart = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');

const catalogGrid = document.getElementById('catalogGrid');
const categoryTabs = document.getElementById('categoryTabs');
const subcategoryTabs = document.getElementById('subcategoryTabs');
const searchInput = document.getElementById('searchInput');
const resultsCount = document.getElementById('resultsCount');
const cartCount = document.getElementById('cartCount');
const cartItems = document.getElementById('cartItems');
const cartTotal = document.getElementById('cartTotal');
const cartToggle = document.getElementById('cartToggle');
const cartOverlay = document.getElementById('cartOverlay');
const cartPanel = document.getElementById('cartPanel');
const closeCart = document.getElementById('closeCart');
const checkoutBtn = document.getElementById('checkoutBtn');

function formatPrice(value) {
  return `$${Number(value).toLocaleString('es-AR')}`;
}

function getCategoryDisplayParts(category = '') {
  const cleanedCategory = String(category || '').trim();
  const parts = cleanedCategory.split('/').map((part) => part.trim()).filter(Boolean);
  const [mainCategory, ...subCategoryParts] = parts;
  const subCategory = subCategoryParts.join(' / ').trim();

  return {
    main: mainCategory || 'General',
    sub: subCategory || 'General',
  };
}

function getUnitLabel(product) {
  return product.unit === 'kg' ? 'por kg' : 'por unidad';
}

async function fetchJsonSafe(path) {
  try {
    const response = await fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error(`No se pudo cargar ${path}:`, error);
    return null;
  }
}

async function loadProducts() {
  if (resultsCount) {
    resultsCount.textContent = 'Cargando productos...';
  }

  let sourceProducts = [];
  try {
    const response = await fetch(`${CATALOG_CSV_PATH}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`No se pudo cargar ${CATALOG_CSV_PATH} (status ${response.status})`);
    }
    const text = await response.text();
    sourceProducts = parseCsv(text).map(mapOdooRowToProduct).filter(shouldIncludeProduct);
  } catch (error) {
    console.error('Error cargando el catálogo:', error);
    if (resultsCount) {
      resultsCount.textContent = 'No se pudo cargar el catálogo. Probá recargar la página.';
    }
    return;
  }

  promos = (await fetchJsonSafe(PROMOS_JSON_PATH)) || [];
  products = applyStaticPromos(sourceProducts, promos);

  renderBanners();
  renderCategoryTabs();
  renderCatalog();
  renderCart();
}

// RENDER Y LOGICA AUTO-SLIDE DEL CARRUSEL
function renderBanners() {
  const bannerContainer = document.getElementById('promoBannerContainer');
  const bannerTrack = document.getElementById('promoBannerTrack');
  if (!bannerContainer || !bannerTrack) return;

  const promosWithImages = promos.filter(p => p.activa && p.imagen);
  if (promosWithImages.length === 0) {
    bannerContainer.hidden = true;
    clearInterval(bannerTimer);
    return;
  }

  bannerTrack.innerHTML = promosWithImages.map(promo => `
    <div class="banner-slide">
      <img src="${promo.imagen}" alt="Promoción" />
    </div>
  `).join('');

  bannerContainer.hidden = false;

  const prevBtn = document.getElementById('prevBanner');
  const nextBtn = document.getElementById('nextBanner');
  
  if (prevBtn && nextBtn) {
    if (promosWithImages.length <= 1) {
      prevBtn.style.display = 'none';
      nextBtn.style.display = 'none';
      clearInterval(bannerTimer);
    } else {
      prevBtn.style.display = 'flex';
      nextBtn.style.display = 'flex';
      resetBannerTimer(promosWithImages.length);
    }
  }
}

function resetBannerTimer(count) {
  clearInterval(bannerTimer);
  if (count <= 1) return;
  bannerTimer = setInterval(() => {
    navigateBanner(1, count);
  }, 6000); // Cambio automático cada 6 segundos
}

function navigateBanner(direction, count) {
  const bannerTrack = document.getElementById('promoBannerTrack');
  if (!bannerTrack || count <= 1) return;

  const slideWidth = bannerTrack.clientWidth;
  let currentIndex = Math.round(bannerTrack.scrollLeft / slideWidth);
  currentIndex += direction;

  if (currentIndex >= count) {
    currentIndex = 0;
  } else if (currentIndex < 0) {
    currentIndex = count - 1;
  }

  bannerTrack.scrollTo({
    left: currentIndex * slideWidth,
    behavior: 'smooth'
  });
}

// Eventos de botones del carrusel
const prevBannerBtn = document.getElementById('prevBanner');
const nextBannerBtn = document.getElementById('nextBanner');
const closeBannersBtn = document.getElementById('closeBanners');

if (prevBannerBtn) {
  prevBannerBtn.addEventListener('click', () => {
    const count = promos.filter(p => p.activa && p.imagen).length;
    navigateBanner(-1, count);
    resetBannerTimer(count);
  });
}
if (nextBannerBtn) {
  nextBannerBtn.addEventListener('click', () => {
    const count = promos.filter(p => p.activa && p.imagen).length;
    navigateBanner(1, count);
    resetBannerTimer(count);
  });
}
if (closeBannersBtn) {
  closeBannersBtn.addEventListener('click', () => {
    document.getElementById('promoBannerContainer').hidden = true;
    clearInterval(bannerTimer);
  });
}

function saveCart() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

function updateCartCount() {
  const count = cart.reduce((total, item) => total + item.quantity, 0);
  cartCount.textContent = count;
}

function renderCategoryTabs() {
  const categories = ['Todos', ...new Set(products.map((product) => getCategoryDisplayParts(product.category).main))];
  categoryTabs.innerHTML = categories
    .map((category) => {
      const isActive = category === activeCategory;
      return `<button class="category-btn ${isActive ? 'active' : ''}" data-category="${category}" type="button">${category}</button>`;
    })
    .join('');

  categoryTabs.querySelectorAll('.category-btn').forEach((button) => {
    button.addEventListener('click', () => {
      activeCategory = button.dataset.category;
      activeSubCategory = 'Todos';
      renderCategoryTabs();
      renderSubcategoryTabs();
      renderCatalog();
    });
  });

  renderSubcategoryTabs();
}

function renderSubcategoryTabs() {
  if (activeCategory === 'Todos') {
    subcategoryTabs.innerHTML = '';
    return;
  }

  const subcategories = ['Todos', ...new Set(
    products
      .filter((product) => getCategoryDisplayParts(product.category).main === activeCategory)
      .map((product) => getCategoryDisplayParts(product.category).sub)
      .filter((subCategory) => subCategory && subCategory !== 'General' && subCategory !== activeCategory)
  )];

  subcategoryTabs.innerHTML = subcategories
    .map((subCategory) => {
      const isActive = subCategory === activeSubCategory;
      return `<button class="subcategory-btn ${isActive ? 'active' : ''}" data-subcategory="${subCategory}" type="button">${subCategory}</button>`;
    })
    .join('');

  subcategoryTabs.querySelectorAll('.subcategory-btn').forEach((button) => {
    button.addEventListener('click', () => {
      activeSubCategory = button.dataset.subcategory;
      renderSubcategoryTabs();
      renderCatalog();
    });
  });
}

function renderCatalog() {
  const filteredProducts = products.filter((product) => {
    const categoryParts = getCategoryDisplayParts(product.category);
    const matchesCategory = activeCategory === 'Todos' || categoryParts.main === activeCategory;
    const matchesSubCategory = activeCategory === 'Todos' || activeSubCategory === 'Todos' || categoryParts.sub === activeSubCategory;
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const searchableText = `${product.name} ${product.category}`.toLowerCase();
    const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch);
    return matchesCategory && matchesSubCategory && matchesSearch;
  });

  resultsCount.textContent = filteredProducts.length
    ? `Mostrando ${filteredProducts.length} productos`
    : 'No se encontraron productos';

  if (!filteredProducts.length) {
    catalogGrid.innerHTML = '<p class="empty-cart">No hay productos para mostrar con esos filtros.</p>';
    return;
  }

  catalogGrid.innerHTML = filteredProducts
    .map(
      (product) => `
        <article class="product-card${product.isOutOfStock ? ' out-of-stock' : ''}">
          <div class="product-info">
            <h3 class="product-name">${product.name}</h3>
            <p class="product-description">${product.description}</p>
            <div class="product-price-block">
              ${product.hasPromo ? `
                <span class="offer-pill">OFERTA</span>
                <p class="product-old-price">${formatPrice(product.originalPrice)}</p>
                <p class="product-price">${formatPrice(product.price)}</p>
              ` : `
                <p class="product-price">${formatPrice(product.price)}</p>
              `}
            </div>
            ${product.hasPromo ? `<p class="product-promo-badge">${product.promoLabel}</p>` : ''}
            ${product.isOutOfStock ? '<p class="stock-badge stock-badge--out">Fuera de stock</p>' : ''}
            ${product.isLowStock ? '<p class="stock-badge stock-badge--low">¡Quedan pocas unidades!</p>' : ''}
            <p class="product-unit">${getUnitLabel(product)}</p>
          </div>
          ${product.isOutOfStock
            ? '<button class="add-btn" type="button" disabled>Sin stock</button>'
            : `<button class="add-btn" type="button" data-add-product="${product.name}">Agregar</button>`}
        </article>
      `
    )
    .join('');

  catalogGrid.querySelectorAll('[data-add-product]').forEach((button) => {
    button.addEventListener('click', () => {
      addToCart(button.dataset.addProduct);
    });
  });
}

function addToCart(productName) {
  const product = products.find((item) => item.name === productName);
  if (!product || product.isOutOfStock) return;

  const existing = cart.find((item) => item.name === productName);
  const currentQty = existing ? existing.quantity : 0;

  if (product.trackStock && currentQty + 1 > product.stock) {
    alert(`Solo quedan ${product.stock} de "${product.name}" en stock.`);
    return;
  }

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      name: product.name,
      price: product.price,
      quantity: 1,
      unit: product.unit,
      category: product.category,
    });
  }

  saveCart();
  renderCart();
}

function updateQuantity(productName, delta) {
  const item = cart.find((entry) => entry.name === productName);
  if (!item) return;

  if (delta > 0) {
    const product = products.find((p) => p.name === productName);
    if (product && product.trackStock && item.quantity + delta > product.stock) {
      alert(`Solo quedan ${product.stock} de "${productName}" en stock.`);
      return;
    }
  }

  item.quantity += delta;
  if (item.quantity <= 0) {
    cart = cart.filter((entry) => entry.name !== productName);
  }

  saveCart();
  renderCart();
}

function buildCartSummary() {
  const cruzadaDiscounts = computeCruzadaDiscounts(cart, promos);

  const lines = cart.map((item) => {
    const discountPercent = cruzadaDiscounts.get(item.name) || 0;
    const baseTotal = item.price * item.quantity;
    const lineTotal = discountPercent > 0
      ? Math.max(0, Math.round(baseTotal * (1 - discountPercent / 100)))
      : baseTotal;
    return { ...item, discountPercent, baseTotal, lineTotal };
  });

  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  return { lines, total };
}

function renderCart() {
  updateCartCount();
  if (!cart.length) {
    cartItems.innerHTML = '<p class="empty-cart">Tu carrito está vacío.</p>';
    cartTotal.textContent = '$0';
    return;
  }

  const { lines, total } = buildCartSummary();

  cartItems.innerHTML = lines
    .map(
      (item) => `
        <div class="cart-item">
          <div class="cart-item-top">
            <div>
              <p class="cart-item-name">${item.name}</p>
              <p class="cart-item-price">${formatPrice(item.price)} · ${item.unit === 'kg' ? 'por kg' : 'por unidad'}</p>
              ${item.discountPercent > 0 ? `<p class="product-promo-badge">Promo: ${item.discountPercent}% OFF</p>` : ''}
            </div>
            <button class="remove-btn" data-remove-product="${item.name}" type="button">Quitar</button>
          </div>
          <div class="qty-row">
            <div class="qty-controls">
              <button class="qty-btn" data-qty-change="${item.name}" data-delta="-1" type="button">−</button>
              <span>${item.quantity}</span>
              <button class="qty-btn" data-qty-change="${item.name}" data-delta="1" type="button">+</button>
            </div>
            <strong>${formatPrice(item.lineTotal)}</strong>
          </div>
        </div>
      `
    )
    .join('');

  cartTotal.textContent = formatPrice(total);

  cartItems.querySelectorAll('[data-remove-product]').forEach((button) => {
    button.addEventListener('click', () => {
      cart = cart.filter((item) => item.name !== button.dataset.removeProduct);
      saveCart();
      renderCart();
    });
  });

  cartItems.querySelectorAll('[data-qty-change]').forEach((button) => {
    button.addEventListener('click', () => {
      updateQuantity(button.dataset.qtyChange, Number(button.dataset.delta));
    });
  });
}

function openCart() {
  document.body.classList.add('cart-open');
  cartPanel.setAttribute('aria-hidden', 'false');
  cartOverlay.hidden = false;
}

function closeCartPanel() {
  document.body.classList.remove('cart-open');
  cartPanel.setAttribute('aria-hidden', 'true');
  cartOverlay.hidden = true;
}

function sendWhatsApp() {
  if (!cart.length) {
    alert('Tu carrito está vacío.');
    return;
  }

  const { lines, total } = buildCartSummary();

  const message = [
    'Hola! Quiero hacer este pedido:',
    ...lines.map((item) => {
      const unitLabel = item.unit === 'kg' ? '/ kg' : '/ unidad';
      const promoSuffix = item.discountPercent > 0 ? ` (promo ${item.discountPercent}% off)` : '';
      return `- ${item.quantity}x ${item.name} - ${formatPrice(item.price)} ${unitLabel}${promoSuffix} = ${formatPrice(item.lineTotal)}`;
    }),
    `TOTAL: ${formatPrice(total)}`,
  ].join('\n');

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

searchInput.addEventListener('input', (event) => {
  searchTerm = event.target.value;
  renderCatalog();
});

cartToggle.addEventListener('click', openCart);
closeCart.addEventListener('click', closeCartPanel);
cartOverlay.addEventListener('click', closeCartPanel);
checkoutBtn.addEventListener('click', sendWhatsApp);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeCartPanel();
  }
});

loadProducts();