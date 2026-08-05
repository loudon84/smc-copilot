import { memo } from "react";
import { Search, Clock, Mail, Code, ChartLine, Bell } from "lucide-react";
import { useI18n } from "@renderer/components/useI18n";
import titleLine from "../../assets/title-line.png";

interface Suggestion {
  i18nKey?: string;
  text: string;
  Icon?: typeof Search;
}

const DEFAULT_SUGGESTIONS: Suggestion[] = [
  {
    i18nKey: "chat.suggestionSearch",
    text: "Search the web for today's top tech news",
    Icon: Search,
  },
  {
    i18nKey: "chat.suggestionReminder",
    text: "Set a reminder to check emails every day at 9 AM",
    Icon: Bell,
  },
  {
    i18nKey: "chat.suggestionEmail",
    text: "Read my latest emails and summarize them",
    Icon: Mail,
  },
  {
    i18nKey: "chat.suggestionScript",
    text: "Write a Python script to rename all files in a folder",
    Icon: Code,
  },
  {
    i18nKey: "chat.suggestionSchedule",
    text: "Schedule a cron job to back up my database every night",
    Icon: Clock,
  },
  {
    i18nKey: "chat.suggestionAnalyze",
    text: "Analyze this CSV file and show key insights",
    Icon: ChartLine,
  },
];

export type ChatEmptyContext = {
  expertName?: string;
  teamName?: string;
  description?: string;
  suggestions?: Array<{ text: string; label?: string }>;
};

interface ChatEmptyStateProps {
  onSelectSuggestion: (text: string) => void;
  emptyContext?: ChatEmptyContext;
}

export const ChatEmptyState = memo(function ChatEmptyState({
  onSelectSuggestion,
  emptyContext,
}: ChatEmptyStateProps): React.JSX.Element {
  const { t } = useI18n();
  const heading =
    emptyContext?.teamName ||
    emptyContext?.expertName ||
    "Hermes Default";
  const description =
    emptyContext?.description ||
    (emptyContext?.expertName
      ? `Ask ${emptyContext.expertName} to help with your next task.`
      : emptyContext?.teamName
        ? `Coordinate with ${emptyContext.teamName} on your next task.`
        : "What can Hermes help you with today?");

  const suggestions: Suggestion[] =
    emptyContext?.suggestions && emptyContext.suggestions.length > 0
      ? emptyContext.suggestions.map((s) => ({
          text: s.text,
          i18nKey: undefined,
          Icon: Search,
        }))
      : DEFAULT_SUGGESTIONS;

  return (
    <div className="chat-empty chat-empty--rich">
      <div className="chat-empty-icon">
        <img
          className="chat-empty-logo"
          src={titleLine}
          alt="Hermes"
          width={160}
          height={160}
        />
      </div>
      <div className="chat-empty-heading">{heading}</div>
      <p className="chat-empty-desc">{description}</p>
      <div className="chat-empty-suggestions">
        {suggestions.slice(0, 6).map((item, idx) => {
          const Icon = item.Icon || Search;
          const label = item.i18nKey
            ? t(item.i18nKey, { defaultValue: item.text })
            : item.text;
          return (
            <button
              key={`${idx}-${item.text.slice(0, 24)}`}
              type="button"
              className="chat-suggestion"
              onClick={() => onSelectSuggestion(item.text)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
