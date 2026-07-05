// CAMBIAR NUMERO ACA
const WHATSAPP_NUMBER = '5493456546324';

// Colores y branding principal del sitio
const BRAND = {
  name: 'PRONTO! Congelados y más',
  primary: '#600020',
  accent: '#d9a56a',
  text: '#2f1f14',
};

// Array de productos cargado desde products-data.js (generado por generate_products.py
// a partir de catalogo_pronto_web_1.csv). Cada producto ya trae su categoría,
// subcategoría (dentro de "category" como "CATEGORIA/SUBCATEGORIA") y su
// descuento propio en discountPercent (0 si no tiene oferta).

function normalizeProduct(product) {
  return {
    ...product,
    category: product.category || 'General',
    unit: product.unit === 'kg' ? 'kg' : 'unidad',
    description: product.description || 'Producto del catálogo',
    discountPercent: Number(product.discountPercent) || 0,
  };
}

let products = Array.isArray(window.PRODUCTS_DATA) && window.PRODUCTS_DATA.length
  ? window.PRODUCTS_DATA.map(normalizeProduct)
  : [];

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

function loadProducts() {
  const sourceProducts = Array.isArray(window.PRODUCTS_DATA) && window.PRODUCTS_DATA.length
    ? window.PRODUCTS_DATA.map(normalizeProduct)
    : [];

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
        <article class="product-card">
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
            <p class="product-unit">${getUnitLabel(product)}</p>
          </div>
          <button class="add-btn" type="button" data-add-product="${product.name}">Agregar</button>
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
  if (!product) return;

  const existing = cart.find((item) => item.name === productName);
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
