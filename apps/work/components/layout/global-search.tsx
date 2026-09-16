import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { knowledgeService } from "@/services/knowledge/knowledge-service";
import type { KnowledgeBase } from "@/types/knowledge-base";
import type { KnowledgeDocument } from "@/types/knowledge-document";
import type { KnowledgeSet } from "@/types/knowledge-set";

interface SearchResults {
  documents: KnowledgeDocument[];
  knowledgeBases: KnowledgeBase[];
  knowledgeSets: KnowledgeSet[];
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const navigate = useNavigate();

  const handleSearch = async (value: string) => {
    setQuery(value);
    if (value.length < 1) {
      setResults(null);
      return;
    }
    const [bases, sets, docs] = await Promise.all([
      knowledgeService.listKnowledgeBases(),
      knowledgeService.listKnowledgeSets(),
      knowledgeService.listDocuments(),
    ]);
    const q = value.toLowerCase();
    setResults({
      knowledgeBases: bases.filter((b) => b.name.toLowerCase().includes(q)),
      knowledgeSets: sets.filter((s) => s.name.toLowerCase().includes(q)),
      documents: docs.filter((d) => d.name.toLowerCase().includes(q)),
    });
  };

  return (
    <>
      <Button
        className="relative h-8 w-48 justify-start text-muted-foreground sm:w-64"
        onClick={() => setOpen(true)}
        variant="outline"
      >
        <Search className="mr-2 h-4 w-4" />
        搜索知识库、文档...
      </Button>
      <CommandDialog onOpenChange={setOpen} open={open}>
        <CommandInput
          onValueChange={handleSearch}
          placeholder="搜索知识库、知识集、文档..."
          value={query}
        />
        <CommandList>
          <CommandEmpty>未找到结果</CommandEmpty>
          {results && results.knowledgeBases.length > 0 && (
            <CommandGroup heading="知识库">
              {results.knowledgeBases.map((kb) => (
                <CommandItem
                  key={kb.id}
                  onSelect={() => {
                    setOpen(false);
                    navigate({
                      to: "/knowledge-bases/$knowledgeBaseId",
                      params: { knowledgeBaseId: kb.id },
                    });
                  }}
                >
                  {kb.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results && results.knowledgeSets.length > 0 && (
            <CommandGroup heading="知识集">
              {results.knowledgeSets.map((ks) => (
                <CommandItem
                  key={ks.id}
                  onSelect={() => {
                    setOpen(false);
                    navigate({
                      to: "/knowledge-sets/$knowledgeSetId",
                      params: { knowledgeSetId: ks.id },
                    });
                  }}
                >
                  {ks.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results && results.documents.length > 0 && (
            <CommandGroup heading="文档">
              {results.documents.map((doc) => (
                <CommandItem
                  key={doc.id}
                  onSelect={() => {
                    setOpen(false);
                    navigate({
                      to: "/documents/$documentId",
                      params: { documentId: doc.id },
                    });
                  }}
                >
                  {doc.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
