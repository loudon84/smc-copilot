import { memo } from "react";
import { Search, Clock, Mail, Code, ChartLine, Bell } from "lucide-react";
import { useI18n } from "@renderer/components/useI18n";
import titleLine from "../../assets/title-line.png";

interface Suggestion {
  i18nKey: string;
  text: string;
  Icon: typeof Search;
}

const SUGGESTIONS: Suggestion[] = [
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

interface ChatEmptyStateProps {
  onSelectSuggestion: (text: string) => void;
}

export const ChatEmptyState = memo(function ChatEmptyState({
  onSelectSuggestion,
}: ChatEmptyStateProps): React.JSX.Element {
  const { t } = useI18n();

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
      <div className="chat-empty-suggestions">
        {SUGGESTIONS.map(({ i18nKey, text, Icon }) => (
          <button
            key={i18nKey}
            type="button"
            className="chat-suggestion"
            onClick={() => onSelectSuggestion(text)}
          >
            <Icon size={16} />
            <span>{t(i18nKey, { defaultValue: text })}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
