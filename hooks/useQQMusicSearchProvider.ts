import { useState, useCallback } from "react";
import { SearchProvider, SearchResultItem } from "./useSearchProvider";
import { searchQQMusic, QQTrackInfo } from "../services/qqmusic";

const PAGE_SIZE = 30;

export interface QQMusicSearchProviderExtended extends SearchProvider {
  performSearch: (query: string) => Promise<void>;
  hasSearched: boolean;
  results: QQTrackInfo[];
}

export const useQQMusicSearchProvider = (): QQMusicSearchProviderExtended => {
  const [results, setResults] = useState<QQTrackInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    setResults([]);
    setHasMore(true);
    setCurrentPage(1);

    try {
      const searchResults = await searchQQMusic(query, 1, PAGE_SIZE);
      setResults(searchResults);
      setHasMore(searchResults.length >= PAGE_SIZE);
    } catch (e) {
      console.error("QQ Music search failed:", e);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMore = useCallback(
    async (query: string, _offset?: number, _limit?: number): Promise<SearchResultItem[]> => {
      if (isLoading || !hasMore) return [];

      setIsLoading(true);
      const nextPage = currentPage + 1;
      
      try {
        const searchResults = await searchQQMusic(query, nextPage, PAGE_SIZE);

        if (searchResults.length === 0) {
          setHasMore(false);
        } else {
          setResults((prev) => [...prev, ...searchResults]);
          setCurrentPage(nextPage);
          setHasMore(searchResults.length >= PAGE_SIZE);
        }
        return searchResults;
      } catch (e) {
        console.error("Load more failed:", e);
        setHasMore(false);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, hasMore, currentPage]
  );

  const provider: QQMusicSearchProviderExtended = {
    id: "qqmusic",
    label: "QQ Music",
    requiresExplicitSearch: true,
    isLoading,
    hasMore,
    hasSearched,
    results,

    search: async (query: string): Promise<SearchResultItem[]> => {
      // For explicit search providers, this returns current results
      // Actual search is triggered by performSearch
      return results;
    },

    loadMore,
    performSearch,
  };

  return provider;
};
