import csv
import json
import re
from pathlib import Path

# ---------------------------------------------------------------------------
# CONFIG: ajustá esto si cambia algo
# ---------------------------------------------------------------------------
root = Path(r"c:\Users\versa\Desktop\CATALOGO ONLINE")

# Archivo fuente: el CSV simple que armás para el catálogo web.
# Columnas esperadas: PRODUCTO, PRECIO, CATEGORIA, SUBCATEGORIA, DESCUENTO
source = root / "catalogo_pronto_web_1.csv"

out = root / "products-data.js"

# Productos que se venden por peso (kg) en vez de por unidad.
# Si agregás un producto nuevo que se vende por kg, sumalo acá.
KEYWORDS_KG = [
    "GRANEL",
    "ALITA",
    "BONDIOLA",
    "MEDALLON",
    "MILANESA",
    "MUSLO",
    "PECHUGA",
    "TROZADO POLLO",
]
# ---------------------------------------------------------------------------

if not source.exists():
    raise FileNotFoundError(
        f"No se encontró {source}. Asegurate de que 'catalogo_pronto_web_1.csv' "
        "esté en la carpeta del proyecto."
    )

with source.open("r", encoding="utf-8-sig", newline="") as f:
    rows = list(csv.DictReader(f))

products = []
seen_names = set()

for row in rows:
    name = (row.get("PRODUCTO") or "").strip()
    if not name or name.lower() in seen_names:
        continue

    price_raw = (row.get("PRECIO") or "0").strip().replace(",", ".")
    try:
        price = round(float(price_raw))
    except ValueError:
        price = 0

    categoria = (row.get("CATEGORIA") or "").strip()
    subcategoria = (row.get("SUBCATEGORIA") or "").strip()
    category = f"{categoria}/{subcategoria}" if subcategoria else (categoria or "General")

    discount_raw = (row.get("DESCUENTO") or "0").strip().replace(",", ".")
    try:
        discount = round(float(discount_raw))
    except ValueError:
        discount = 0

    name_upper = name.upper()
    unit = "kg" if any(keyword in name_upper for keyword in KEYWORDS_KG) else "unidad"

    products.append({
        "name": name,
        "price": price,
        "category": category,
        "unit": unit,
        "description": "Producto del catálogo",
        "discountPercent": discount,
    })
    seen_names.add(name.lower())

out.write_text(
    "window.PRODUCTS_DATA = " + json.dumps(products, ensure_ascii=False, indent=2) + ";\n",
    encoding="utf-8",
)
print(f"Listo: {len(products)} productos escritos en {out}")
