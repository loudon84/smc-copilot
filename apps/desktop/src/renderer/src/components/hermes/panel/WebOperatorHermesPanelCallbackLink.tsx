import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { hermesPanelApi } from "../api/hermesPanelApi";
import { extractContactToOrderWebUrl } from "../../../../../shared/hermes-panel/extract-contact-to-order-web-url";
import { normalizeMarkdownHref } from "../../../../../shared/hermes-panel/normalize-markdown-href";

export function WebOperatorHermesPanelCallbackLink({
  content,
  onOpen,
}: {
  content: string;
  onOpen: (href: string) => void;
}): React.JSX.Element | null {
  const { url: messageUrl, looksTruncated } = extractContactToOrderWebUrl(content);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    const hint =
      messageUrl?.includes("tempType=") ||
      content.includes("contact_to_order") ||
      content.includes("web_url_file");
    if (!hint) return;
    void hermesPanelApi.readContactToOrderLastWebUrl().then((res) => {
      if (res?.url) setFileUrl(res.url);
    });
  }, [content, messageUrl]);

  const bestUrl = (() => {
    if (fileUrl && messageUrl) {
      if (looksTruncated || fileUrl.length > messageUrl.length) return fileUrl;
      return messageUrl;
    }
    return fileUrl ?? messageUrl;
  })();

  const normalized = bestUrl ? normalizeMarkdownHref(bestUrl) : "";
  const fromFile = Boolean(fileUrl && bestUrl && bestUrl === fileUrl);

  const copyUrl = useCallback(async () => {
    if (!normalized) return;
    await navigator.clipboard.writeText(normalized);
  }, [normalized]);

  if (!bestUrl) return null;

  return (
    <div className="web-operator-hermes-panel__callback-link">
      {looksTruncated && !fromFile ? (
        <p className="web-operator-hermes-panel__callback-link-warn">
          聊天里的 URL 可能已被截断。若下方按钮可用，将使用 skill 写入磁盘的完整链接。
        </p>
      ) : null}
      {fromFile ? (
        <p className="web-operator-hermes-panel__callback-link-hint">
          已从 contact_to_order 落盘文件加载完整回调 URL（{normalized.length} 字符）。
        </p>
      ) : null}
      <div className="web-operator-hermes-panel__callback-link-actions">
        <button
          type="button"
          className="web-operator-hermes-panel__btn"
          onClick={() => onOpen(normalized)}
        >
          <ExternalLink size={12} />
          在 WebOperator 打开回调页
        </button>
        <button type="button" className="web-operator-hermes-panel__btn" onClick={() => void copyUrl()}>
          <Copy size={12} />
          复制完整链接
        </button>
      </div>
    </div>
  );
}
