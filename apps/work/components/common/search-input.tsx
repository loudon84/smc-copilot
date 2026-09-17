import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/tailwind";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  testId?: string;
};

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
  testId,
}: SearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        className="pl-8"
        data-testid={testId}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}
