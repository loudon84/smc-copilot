import { shouldOpenUrlExternally } from "../../../../../shared/web-preview-url";

export function MarkdownLink({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (!href) return;
        try {
          const url = new URL(href, "https://placeholder.invalid");
          if (!["http:", "https:", "mailto:"].includes(url.protocol)) {
            return;
          }
          if (url.protocol === "http:" || url.protocol === "https:") {
            // LAN HTTP / attachment downloads are blocked from <webview>;
            // open in the system browser instead of mounting a dead preview.
            if (shouldOpenUrlExternally(href)) {
              void window.hermesAPI.openExternal(href);
              return;
            }
            const event = new CustomEvent("web-preview:navigate", {
              detail: href,
            });
            document.dispatchEvent(event);
            return;
          }
        } catch {
          return;
        }
        void window.hermesAPI.openExternal(href);
      }}
    >
      {children}
    </a>
  );
}
