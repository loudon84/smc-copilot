import { useCallback, useState } from "react";

export function useComposerState(): {
  text: string;
  setText: (value: string) => void;
  imeComposing: boolean;
  setImeComposing: (value: boolean) => void;
  canSend: (hasAttachments: boolean) => boolean;
  clear: () => void;
} {
  const [text, setText] = useState("");
  const [imeComposing, setImeComposing] = useState(false);

  const canSend = useCallback(
    (hasAttachments: boolean) => {
      if (imeComposing) return false;
      const trimmed = text.trim();
      return Boolean(trimmed || hasAttachments);
    },
    [text, imeComposing],
  );

  const clear = useCallback(() => setText(""), []);

  return { text, setText, imeComposing, setImeComposing, canSend, clear };
}
