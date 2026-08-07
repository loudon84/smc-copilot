import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EXPERT_CATEGORIES } from "../mock/expert-mock-data";

type Props = {
  keyword: string;
  category: string;
  onKeywordChange: (value: string) => void;
  onCategoryChange: (category: string) => void;
  searchPlaceholder?: string;
  ariaLabel?: string;
};

export function ExpertFilterBar({
  keyword,
  category,
  onKeywordChange,
  onCategoryChange,
  searchPlaceholder,
  ariaLabel = "Categories",
}: Props) {
  const { t } = useTranslation();

  return (
    <>
      <div className="hermes-experts-toolbar">
        <div className="hermes-search-field">
          <Search size={14} />
          <input
            type="search"
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            placeholder={searchPlaceholder ?? t("workspaces.hermes.experts.search")}
          />
        </div>
      </div>

      <nav className="hermes-category-tabs" aria-label={ariaLabel}>
        {EXPERT_CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            className={category === c.key ? "is-active" : undefined}
            onClick={() => onCategoryChange(c.key)}
          >
            {t(c.labelKey, { defaultValue: c.key })}
          </button>
        ))}
      </nav>
    </>
  );
}
