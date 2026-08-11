import { MediaImage, DownloadChip } from "../../MediaImage";
import { describeImageSrc } from "../../../screens/Chat/mediaUtils";

export function MarkdownImage({
  src,
}: {
  src?: string;
}): React.JSX.Element | null {
  if (typeof src !== "string" || src.length === 0) return null;
  const token = describeImageSrc(src);
  return token.isImage ? (
    <MediaImage token={token} />
  ) : (
    <DownloadChip token={token} />
  );
}
