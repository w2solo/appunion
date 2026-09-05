import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";

type CategoryItem = { id: string; name: string; children: { id: string; name: string }[] };

export function CategoryFields({
  category,
  subcategory,
  onChange,
}: {
  category: string;
  subcategory: string;
  onChange: (next: { category: string; subcategory: string }) => void;
}) {
  const [items, setItems] = useState<CategoryItem[]>([]);

  useEffect(() => {
    api<{ items: CategoryItem[] }>("/dashboard/categories")
      .then((d) => setItems(d.items))
      .catch(() => setItems([]));
  }, []);

  const parents = useMemo(() => items.map((i) => i.name), [items]);
  const children = useMemo(() => {
    const match = items.find((i) => i.name.toLowerCase() === category.trim().toLowerCase());
    return match ? match.children.map((c) => c.name) : [];
  }, [items, category]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SuggestInput
        label="大分类"
        name="category"
        value={category}
        options={parents}
        placeholder="点选或输入，如 工具"
        required
        onChange={(value) => onChange({ category: value, subcategory })}
      />
      <SuggestInput
        label="小分类"
        name="subcategory"
        value={subcategory}
        options={children}
        placeholder="点选或输入，如 文件管理"
        required
        onChange={(value) => onChange({ category, subcategory: value })}
      />
    </div>
  );
}

export function SuggestInput({
  label,
  name,
  value,
  options,
  placeholder,
  required,
  onChange,
}: {
  label?: string;
  name?: string;
  value: string;
  options: string[];
  placeholder?: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLLabelElement | HTMLDivElement | null>(null);
  const q = value.trim().toLowerCase();
  const filtered = options.filter((opt) => !q || opt.toLowerCase().includes(q));
  const showNew = q.length > 0 && !options.some((opt) => opt.toLowerCase() === q);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  const field = (
    <div className="relative">
      <input
        className="mt-1 w-full rounded border border-line px-3 py-2"
        name={name}
        placeholder={placeholder}
        required={required}
        value={value}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => {
            if (!wrapRef.current?.contains(document.activeElement)) setOpen(false);
          }, 120);
        }}
      />
      {open && (filtered.length > 0 || showNew) && (
        <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded border border-line bg-white py-1 text-sm shadow-lg">
          {filtered.map((opt) => (
            <li key={opt}>
              <button
                className="block w-full px-3 py-1.5 text-left hover:bg-slate-50"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
              >
                {opt}
              </button>
            </li>
          ))}
          {showNew && (
            <li>
              <button
                className="block w-full px-3 py-1.5 text-left text-muted hover:bg-slate-50"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(value.trim())}
              >
                使用新分类「{value.trim()}」
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );

  if (!label) {
    return (
      <div ref={wrapRef as never} className="block text-sm">
        {field}
      </div>
    );
  }

  return (
    <label ref={wrapRef as never} className="block text-sm">
      {label}
      {field}
    </label>
  );
}
