// CAMBIAR NUMERO ACA
const WHATSAPP_NUMBER = '5493456546324';

// Colores y branding principal del sitio
const BRAND = {
  name: 'PRONTO! Congelados y más',
  primary: '#600020',
  accent: '#d9a56a',
  text: '#2f1f14',
};

// Productos: se leen directamente del CSV en cada visita a la página.
// Para actualizar el catálogo, alcanza con reemplazar CATALOG_CSV_PATH
// en el repo (mismo nombre de archivo) y subirlo a GitHub. No hace falta
// correr ningún script ni generar ningún archivo intermedio.
const CATALOG_CSV_PATH = 'catalogo_pronto_web_1.csv';

// Productos que se venden por peso (kg) en vez de por unidad.
// Si agregás un producto nuevo que se vende por kg, sumalo acá.
const KEYWORDS_KG = [
  'GRANEL',
  'ALITA',
  'BONDIOLA',
  'MEDALLON',
  'MILANESA',
  'MUSLO',
  'PECHUGA',
  'TROZADO POLLO',
];

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
      // ignorar, lo maneja el \n siguiente
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

function buildCategory(categoria, subcategoria) {
  const cat = (categoria || '').trim();
  const sub = (subcategoria || '').trim();
  return sub ? `${cat}/${sub}` : (cat || 'General');
}

// Umbral para avisar que queda poco stock (unidades o kg, según el producto).
const LOW_STOCK_THRESHOLD = 2;

function parseQuantity(value) {
  const num = parseFloat(String(value || '0').replace(',', '.'));
  return Number.isFinite(num) ? num : 0;
}

function mapCsvRowToProduct(row) {
  const name = (row.PRODUCTO || '').trim();
  const nameUpper = name.toUpperCase();
  const stock = parseQuantity(row.CANTIDAD);
  return {
    name,
    price: parsePrice(row.PRECIO),
    category: buildCategory(row.CATEGORIA, row.SUBCATEGORIA),
    unit: KEYWORDS_KG.some((keyword) => nameUpper.includes(keyword)) ? 'kg' : 'unidad',
    description: 'Producto del catálogo',
    discountPercent: parsePrice(row.DESCUENTO),
    stock,
    isOutOfStock: stock <= 0,
    isLowStock: stock > 0 && stock <= LOW_STOCK_THRESHOLD,
  };
}

function normalizeProduct(product) {
  return {
    ...product,
    category: product.category || 'General',
    unit: product.unit === 'kg' ? 'kg' : 'unidad',
    description: product.description || 'Producto del catálogo',
    discountPercent: Number(product.discountPercent) || 0,
  };
}

let products = [];

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

function normalizeText(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function shouldIncludeProduct(product) {
  if (product.isAvailable === false) {
    return false;
  }

  const normalizedCategory = normalizeText(product.category);
  return !normalizedCategory.includes('insumos de produccion')
    && !normalizedCategory.includes('descartables')
    && normalizedCategory !== 'all';
}

function getCategoryParts(category = '') {
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

function applyPromotionsToProducts(productList) {
  return productList.map((product) => {
    const discountPercent = Number(product.discountPercent) || 0;
    const originalPrice = Number(product.price) || 0;
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

async function loadProducts() {
  if (resultsCount) {
    resultsCount.textContent = 'Cargando productos...';
  }

  let sourceProducts = [];
  try {
    // cache: 'no-store' para que siempre traiga la última versión del CSV
    // y no una copia vieja guardada por el navegador.
    const response = await fetch(`${CATALOG_CSV_PATH}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`No se pudo cargar ${CATALOG_CSV_PATH} (status ${response.status})`);
    }
    const text = await response.text();
    sourceProducts = parseCsv(text).map(mapCsvRowToProduct).map(normalizeProduct);
  } catch (error) {
    console.error('Error cargando el catálogo:', error);
    if (resultsCount) {
      resultsCount.textContent = 'No se pudo cargar el catálogo. Probá recargar la página.';
    }
    return;
  }

  products = applyPromotionsToProducts(sourceProducts.filter(shouldIncludeProduct));

  renderCategoryTabs();
  renderCatalog();
  renderCart();
}


function saveCart() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

function updateCartCount() {
  const count = cart.reduce((total, item) => total + item.quantity, 0);
  cartCount.textContent = count;
}

function renderCategoryTabs() {
  const categories = ['Todos', ...new Set(products.map((product) => getCategoryParts(product.category).main))];
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
      .filter((product) => getCategoryParts(product.category).main === activeCategory)
      .map((product) => getCategoryParts(product.category).sub)
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
    const categoryParts = getCategoryParts(product.category);
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

  if (product.stock && currentQty + 1 > product.stock) {
    alert(`Solo quedan ${product.stock} de "${product.name}" en stock.`);
    return;
  }

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ name: product.name, price: product.price, quantity: 1, unit: product.unit });
  }

  saveCart();
  renderCart();
}

function updateQuantity(productName, delta) {
  const item = cart.find((entry) => entry.name === productName);
  if (!item) return;

  if (delta > 0) {
    const product = products.find((p) => p.name === productName);
    if (product && product.stock && item.quantity + delta > product.stock) {
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

function renderCart() {
  updateCartCount();
  if (!cart.length) {
    cartItems.innerHTML = '<p class="empty-cart">Tu carrito está vacío.</p>';
    cartTotal.textContent = '$0';
    return;
  }

  cartItems.innerHTML = cart
    .map(
      (item) => `
        <div class="cart-item">
          <div class="cart-item-top">
            <div>
              <p class="cart-item-name">${item.name}</p>
              <p class="cart-item-price">${formatPrice(item.price)} · ${item.unit === 'kg' ? 'por kg' : 'por unidad'}</p>
            </div>
            <button class="remove-btn" data-remove-product="${item.name}" type="button">Quitar</button>
          </div>
          <div class="qty-row">
            <div class="qty-controls">
              <button class="qty-btn" data-qty-change="${item.name}" data-delta="-1" type="button">−</button>
              <span>${item.quantity}</span>
              <button class="qty-btn" data-qty-change="${item.name}" data-delta="1" type="button">+</button>
            </div>
            <strong>${formatPrice(item.price * item.quantity)}</strong>
          </div>
        </div>
      `
    )
    .join('');

  cartTotal.textContent = formatPrice(cart.reduce((sum, item) => sum + item.price * item.quantity, 0));

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

  const message = [
    'Hola! Quiero hacer este pedido:',
    ...cart.map((item) => `- ${item.quantity}x ${item.name} - ${formatPrice(item.price)} ${item.unit === 'kg' ? '/ kg' : '/ unidad'}`),
    `TOTAL: ${formatPrice(cart.reduce((sum, item) => sum + item.price * item.quantity, 0))}`
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
