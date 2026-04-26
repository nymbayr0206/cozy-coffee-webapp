"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Package, Search, SlidersHorizontal } from "lucide-react";
import { getProductCategories, getProducts, getReadableError } from "@/lib/kass/client-api";
import type { KassCategory, KassProduct } from "@/lib/kass/client-types";
import { ProductCard } from "./ProductCard";

interface ProductGridProps {
  onAddProduct: (product: KassProduct) => void;
}

interface PosCategoryItem {
  key: string;
  label: string;
  count: number;
  aliases: string[];
}

const transliterationMap: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "j",
  з: "z",
  и: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  ө: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ү: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sh",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function toSearchText(value: string) {
  const lower = value.toLowerCase();
  const latin = Array.from(lower)
    .map((letter) => transliterationMap[letter] ?? letter)
    .join("");

  return `${lower} ${latin} ${latin.replaceAll("k", "c")}`;
}

function productCategoryKeys(product: KassProduct) {
  const posCategoryIds = product.pos_category_ids ?? [];
  return Array.from(new Set(posCategoryIds.map((categoryId) => `pos:${categoryId}`)));
}

export function ProductGrid({ onAddProduct }: ProductGridProps) {
  const [products, setProducts] = useState<KassProduct[]>([]);
  const [odooCategories, setOdooCategories] = useState<KassCategory[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadProducts() {
    setLoading(true);
    setError(null);

    try {
      const [productResponse, categoryResponse] = await Promise.all([getProducts(), getProductCategories()]);
      setProducts(productResponse.products ?? []);
      setOdooCategories(categoryResponse.categories ?? []);
    } catch (loadError) {
      setError(getReadableError(loadError));
      setProducts([]);
      setOdooCategories([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  const categories = useMemo(() => {
    const categoryCounts = new Map<string, number>();

    products.forEach((product) => {
      productCategoryKeys(product).forEach((key) => {
        categoryCounts.set(key, Number(categoryCounts.get(key) ?? 0) + 1);
      });
    });

    return odooCategories.map<PosCategoryItem>((categoryRecord) => {
      const label = categoryRecord.display_name || categoryRecord.name;
      const key = `pos:${categoryRecord.id}`;
      const aliases = Array.from(new Set([categoryRecord.display_name, categoryRecord.name].filter(Boolean)));

      return {
        key,
        label,
        count: Number(categoryCounts.get(key) ?? 0),
        aliases,
      };
    });
  }, [odooCategories, products]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const hasSearch = Boolean(normalizedQuery);
    const hasCategory = Boolean(category);

    if (!hasSearch && !hasCategory) return [];

    return products.filter((product) => {
      const selectedCategory = categories.find((item) => item.key === category);
      const productKeys = productCategoryKeys(product);
      const matchesCategory =
        !category ||
        productKeys.includes(category) ||
        Boolean(product.category && selectedCategory?.aliases.includes(product.category));
      const haystack = toSearchText(`${product.name} ${product.barcode ?? ""}`);
      return matchesCategory && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [categories, category, products, query]);

  const resultLabel = query.trim() || category ? `${filteredProducts.length} илэрц` : `${products.length} бараа`;
  const activeCategoryLabel = category ? categories.find((item) => item.key === category)?.label ?? "Ангилал" : "Ангилал";

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || loading || error) return;

    const firstAvailable = filteredProducts.find((product) => product.available_for_sale !== false);
    if (!firstAvailable) return;

    event.preventDefault();
    onAddProduct(firstAvailable);
  }

  return (
    <section className="product-grid-panel">
      <div className="panel-toolbar">
        <div>
          <p className="eyebrow">Бараа</p>
          <div className="heading-line">
            <h2>{activeCategoryLabel}</h2>
            {!loading && !error ? <span className="soft-pill">{resultLabel}</span> : null}
          </div>
        </div>
        <button className="secondary-button" type="button" onClick={loadProducts} disabled={loading}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          <span>{loading ? "Уншиж байна" : "Шинэчлэх"}</span>
        </button>
      </div>

      <div className="product-filters category-first-filters">
        <label className="search-box">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder="Нэр эсвэл баркод хайх"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
        </label>
      </div>

      {!loading && !error ? (
        <div className="pos-category-section" data-testid="pos-category-section">
          <div className="category-section-heading">
            <p className="eyebrow">POS ангилал</p>
          </div>
          <div className="pos-category-grid">
            {categories.map((item) => {
              const active = category === item.key;

              return (
                <button
                  className={active ? "pos-category-button active" : "pos-category-button"}
                  type="button"
                  key={item.key}
                  onClick={() => setCategory(item.key)}
                  data-testid="pos-category-button"
                >
                  <span className="category-icon">
                    <Package size={18} aria-hidden="true" />
                  </span>
                  <strong>{item.label}</strong>
                  <small>{item.count} бараа</small>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="state-box error-state">
          <strong>Бараа татахад алдаа гарлаа</strong>
          <p>{error}</p>
          <button className="secondary-button" type="button" onClick={loadProducts}>
            Дахин оролдох
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="product-grid" aria-label="Бараа уншиж байна">
          {Array.from({ length: 8 }).map((_, index) => (
            <div className="product-skeleton" key={index} />
          ))}
        </div>
      ) : null}

      {!loading && !error && (query.trim() || category) && filteredProducts.length === 0 ? (
        <div className="state-box">
          <strong>Бараа олдсонгүй</strong>
          <p>
            {category && !query.trim()
              ? "Энэ POS ангилалд касс дээр харагдах бараа оноогдоогүй байна."
              : "Хайлтын утга эсвэл ангиллаа өөрчилнө үү."}
          </p>
        </div>
      ) : null}

      {!loading && !error && filteredProducts.length > 0 ? (
        <div className="product-grid">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} onAdd={onAddProduct} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
