export default {
  unavailableTitle: "Knowledge unavailable",
  unavailableDescription:
    "A Knowledge provider is not configured. Lists, uploads, and Knowledge Chat stay empty until a provider is available.",
  emptyTitle: "Nothing here yet",
  emptyDescription:
    "No Knowledge items are available for this view. Content will appear when a provider returns data.",
  loading: "Checking Knowledge availability…",
  mockDemoBadge: "Mock / Demo",
  mockReadyTitle: "Mock Knowledge ready",
  mockReadyDescription:
    "Synthetic Knowledge data is available in mock mode. Full page layouts ship in a later stage.",
  home: {
    title: "Knowledge Home",
    description: "Overview of knowledge bases, sets, documents, and uploads.",
  },
  bases: {
    title: "Knowledge Bases",
    description: "Browse and manage knowledge bases.",
  },
  sets: {
    title: "Knowledge Sets",
    description: "Collections that group knowledge bases for retrieval.",
  },
  documents: {
    title: "Documents",
    description: "Documents indexed into knowledge bases.",
  },
  uploads: {
    title: "Uploads",
    description: "Upload jobs for Knowledge documents.",
    pickerBlocked:
      "File upload is unavailable until a Knowledge provider is configured.",
  },
  chat: {
    title: "Knowledge Chat",
    description:
      "Ask questions against knowledge sets. This Stage does not start Work Chat or Skill Run.",
    composerBlocked:
      "Knowledge Chat cannot send messages without a Knowledge provider.",
  },
};
