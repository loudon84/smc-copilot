interface ImeKeyEvent {
  keyCode?: number;
  nativeEvent: {
    isComposing?: boolean;
  };
}

/** True while an IME composition session is active (Chinese/Japanese Enter). */
export function isImeComposing(event: ImeKeyEvent): boolean {
  return Boolean(event.nativeEvent.isComposing || event.keyCode === 229);
}
