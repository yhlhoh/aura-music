import { useState } from "react";
import { searchQqMusic } from "../services/qqmusicService";

export function useQqSearchProvider() {
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  async function performSearch(query, pageNo = 1, pageSize = 30) {
    setIsLoading(true);
    setHasSearched(true);
    const data = await searchQqMusic(query, pageNo, pageSize);
    setResults(data);
    setIsLoading(false);
    setHasMore(data.length === pageSize);
  }

  async function loadMore(query, pageNo, pageSize = 30) {
    setIsLoading(true);
    const data = await searchQqMusic(query, pageNo, pageSize);
    setResults((prev) => [...prev, ...data]);
    setIsLoading(false);
    setHasMore(data.length === pageSize);
  }

  return {
    label: "QQ音乐",
    results,
    isLoading,
    hasSearched,
    hasMore,
    performSearch,
    loadMore,
  };
}
