import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { graphemeLength } from "@appunions/shared";
import { api } from "../shared/api";
import { KeyModal } from "../shared/key-modal";
import { CategoryFields } from "../shared/category-fields";

export function NewAppPage() {
  const nav = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [appId, setAppId] = useState("");
  const [tagline, setTagline] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const form = e.currentTarget;
    const data = new FormData(form);
    try {
      const res = await api<{ app: { id: string }; apiKey: string }>("/dashboard/apps", {
        method: "POST",
        body: data,
      });
      setApiKey(res.apiKey);
      setAppId(res.app.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">创建应用</h1>
      <p className="mt-2 text-sm text-muted">先填写名称、描述和图标。创建后到详情页选择支持的平台并填写包名。</p>
      <form className="mt-6 space-y-4 rounded-lg bg-white p-6 shadow-sm" onSubmit={(e) => void onSubmit(e)}>
        <Field name="name" label="名称" required />
        <label className="block text-sm">
          图标（png/jpeg/webp，≤512KB）
          <input className="mt-1 block" type="file" name="icon" accept="image/png,image/jpeg,image/webp" required />
        </label>
        <label className="block text-sm">
          描述（{graphemeLength(tagline)}/30）
          <input
            className="mt-1 w-full rounded border border-line px-3 py-2"
            name="tagline"
            required
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="列表卡片上展示"
          />
        </label>
        <CategoryFields
          category={category}
          subcategory={subcategory}
          onChange={(next) => {
            setCategory(next.category);
            setSubcategory(next.subcategory);
          }}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="rounded bg-brand px-4 py-2 text-white disabled:opacity-50" disabled={busy} type="submit">
          {busy ? "提交中…" : "创建"}
        </button>
      </form>
      {apiKey && (
        <KeyModal
          apiKey={apiKey}
          onClose={() => {
            nav(`/apps/${appId}`);
          }}
        />
      )}
    </div>
  );
}

function Field({
  name,
  label,
  required,
  placeholder,
}: {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        className="mt-1 w-full rounded border border-line px-3 py-2"
        name={name}
        required={required}
        placeholder={placeholder}
      />
    </label>
  );
}
