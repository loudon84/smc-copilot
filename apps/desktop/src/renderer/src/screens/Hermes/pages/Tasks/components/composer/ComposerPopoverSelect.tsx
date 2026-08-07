import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

export type ComposerPopoverOption = {
  id: string;
  label: string;
};

type Props = {
  value?: string;
  options: ComposerPopoverOption[];
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  onChange: (id: string | undefined) => void;
};

export function ComposerPopoverSelect({
  value,
  options,
  placeholder = "—",
  disabled,
  searchable,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.id === value);
  const filtered = searchable && query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="hermes-composer-popover" ref={rootRef}>
      <button
        type="button"
        className="hermes-composer-popover__trigger"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{selected?.label ?? placeholder}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open ? (
        <div className="hermes-composer-popover__menu" id={listId} role="listbox">
          {searchable ? (
            <label className="hermes-composer-popover__search">
              <Search size={14} aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
              />
            </label>
          ) : null}
          <button
            type="button"
            className="hermes-composer-popover__option"
            role="option"
            aria-selected={!value}
            onClick={() => {
              onChange(undefined);
              setOpen(false);
              setQuery("");
            }}
          >
            {placeholder}
          </button>
          {filtered.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`hermes-composer-popover__option${opt.id === value ? " is-active" : ""}`}
              role="option"
              aria-selected={opt.id === value}
              onClick={() => {
                onChange(opt.id);
                setOpen(false);
                setQuery("");
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
