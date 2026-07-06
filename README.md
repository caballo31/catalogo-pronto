# Catálogo online — PRONTO!

Landing page estática: catálogo de productos, carrito, y pedido por WhatsApp.
Los productos se leen en vivo desde un CSV exportado directo de Odoo — no hay
que formatear nada a mano. Las promos se cargan aparte, desde un archivo que
armás en un panel propio.

## Archivos del proyecto

- `index.html` — estructura de la página del catálogo.
- `style.css` — estilos.
- `script.js` — lee `productos.csv`, arma el catálogo, el carrito y aplica las promos de `promos.json`.
- `productos.csv` — el export de Odoo. **Este es el único archivo que reemplazás todos los días.**
- `promos.json` — las promociones activas. Lo genera `promos-admin.html`, no se edita a mano.
- `promos-admin.html` / `promos-admin.js` / `promos-admin.css` — panel interno para cargar/editar promos.

## Flujo diario (actualizar productos)

1. En Odoo: **Inventario → Productos**, seleccioná las columnas necesarias y exportá a CSV.
   Las columnas que el sitio necesita (nombres tal cual los usa Odoo, en español):
   - `Nombre`
   - `Precio de venta`
   - `Unidad de medida`
   - `Categoría del producto/Categoría principal`
   - `Categoría del producto/Nombre`
   - `Cantidad a la mano`
   - `Rastrear inventario`
2. Renombrá el archivo exportado a **`productos.csv`** (siempre el mismo nombre) y reemplazá el que está en la carpeta del proyecto.
3. `git add productos.csv && git commit -m "actualizar productos" && git push`.

Vercel redeploya solo y en un rato el catálogo ya muestra los precios/stock del día. No hay ningún script de Python que correr — `script.js` lee y transforma el CSV crudo directo en el navegador.

### Categorías excluidas automáticamente

El sitio nunca muestra productos de estas categorías (no hace falta hacer nada, ya está filtrado en `script.js`):
- `Insumos de Producción`
- `Descartables`
- Productos sin categoría asignada en Odoo (a veces aparecen como "All"/"Todos" o directamente vacíos)

Si en algún momento sumás otra categoría interna que no debería verse en la web (por ejemplo, una nueva de repuestos o consumibles), avisá para agregarla a la lista de exclusión en `script.js` (variable `EXCLUDED_CATEGORIES`).

### Cómo se decide si un producto es "por kg" o "por unidad"

Directo de la columna `Unidad de medida` del export de Odoo (`kg` → por kg, cualquier otra cosa → por unidad). No hay que mantener ninguna lista de palabras clave.

### Cómo se decide si hay stock

- Si el producto tiene **"Rastrear inventario" = True** en Odoo: se usa `Cantidad a la mano`. En 0 o menos, aparece "Fuera de stock"; si queda poco (2 o menos), aparece "¡Quedan pocas unidades!".
- Si **no** rastrea inventario: se asume siempre disponible (no se le aplican esos avisos), porque en Odoo esos productos no tienen una cantidad real que verificar.

## Flujo de promos (menos frecuente que los productos)

Abrí `promos-admin.html` **desde la URL publicada** (ej. `catalogo-pronto.vercel.app/promos-admin.html`), no con doble-click — necesita leer `productos.csv` por `fetch`, y eso solo funciona si la página se sirve por http(s).

Si querés probarlo en tu PC antes de subirlo, corré en la carpeta del proyecto:
```
python -m http.server 8000
```
y abrí `http://localhost:8000/promos-admin.html`.

Ahí podés cargar 3 tipos de promo:
- **Producto específico**: % de descuento fijo sobre uno o varios productos puntuales.
- **Categoría**: % de descuento sobre toda una categoría (o subcategoría).
- **Cruzada / combo**: "llevando X cantidad de [producto] → Y% off en [ese mismo producto / otro producto / una categoría]". Acá va tu ejemplo de "1kg de milanesa, 10% off".

Las promos se guardan en el navegador mientras las armás. Cuando termines, apretás **"Exportar promos.json"**, y ese archivo lo subís al repo (reemplazando el `promos.json` existente) junto con tu próximo commit.

```
git add promos.json && git commit -m "actualizar promos" && git push
```

Las promos de producto/categoría se ven reflejadas como descuento en el catálogo. Las cruzadas se calculan en el carrito, en el momento en que la cantidad del producto disparador llega al mínimo cargado.

## Cómo cambiar el número de WhatsApp

En `script.js`, constante `WHATSAPP_NUMBER`.

## Publicar en Vercel

1. Subí el proyecto a GitHub.
2. Conectá el repo en Vercel (sitio estático, se detecta solo).
3. Cada push a `main` redeploya automáticamente.
