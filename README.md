# Catálogo online estático

Este proyecto es una landing page simple para mostrar un catálogo de productos, permitir armar un pedido y enviarlo por WhatsApp.

## Archivos principales
- index.html: estructura de la página
- style.css: estilos visuales y responsive
- script.js: catálogo, carrito, filtros, búsqueda y envío por WhatsApp

## Cómo agregar o editar productos
- Abrí [script.js](script.js) y editá el array `products`.
- Cada producto tiene este formato:
  - `name`: nombre del producto
  - `price`: precio en pesos sin puntos ni comas
  - `category`: categoría visible en el catálogo
  - `image`: ruta de la imagen placeholder

## Cómo cambiar el número de WhatsApp
- En [script.js](script.js) buscá la constante `WHATSAPP_NUMBER`.
- Cambiá el valor por el número que quieras usar, por ejemplo `5491123456789`.

## Cómo publicar en Vercel
1. Subí este proyecto a GitHub.
2. Entrá a Vercel y creá un nuevo proyecto desde ese repo.
3. Vercel detectará automáticamente el sitio estático y lo desplegará.
4. Cada push a `main` actualizará el sitio automáticamente.

Si querés, después podés reemplazar los placeholders de imagen por fotos reales y ajustar colores y texto de marca en [index.html](index.html) y [style.css](style.css).
