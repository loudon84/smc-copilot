export type ChatCommandPort = {
  listCommands?(): Promise<
    Array<{ name: string; description: string; args?: string }>
  >;
  execute?(
    name: string,
    args: string,
    ctx: { sessionId?: string | null; profileId?: string },
  ): Promise<{ ok: boolean; message?: string }>;
};

export type ChatVoicePort = {
  supported?: boolean;
  /** Optional remote transcription; local SpeechRecognition is used when absent. */
  transcribe?(blob: Blob, profileId?: string): Promise<{ text: string }>;
};
