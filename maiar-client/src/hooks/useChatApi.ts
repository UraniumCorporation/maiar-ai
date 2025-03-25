import { useCallback, useState } from "react";

import { DEFAULT_URLS, STORAGE_KEYS } from "../config";

interface UseChatApiOptions {
  url?: string;
}

interface ChatApiState {
  url: string;
  setUrl: (url: string) => void;
}

export function useChatApi({
  url: initialUrl = DEFAULT_URLS.CHAT_API
}: UseChatApiOptions = {}): ChatApiState {
  // Try to get the saved URL from localStorage first, fallback to initialUrl
  const getSavedUrl = () => {
    try {
      const savedUrl = localStorage.getItem(STORAGE_KEYS.CHAT_API_URL);
      console.log("Initial load - chat API URL from localStorage:", savedUrl);
      return savedUrl || initialUrl;
    } catch (error) {
      console.error("Failed to load chat API URL from localStorage:", error);
      return initialUrl;
    }
  };

  const [url, setUrl] = useState<string>(getSavedUrl());

  // Custom setUrl function that saves to localStorage
  const handleSetUrl = useCallback((newUrl: string) => {
    console.log("Changing chat API URL to:", newUrl);

    // Save to localStorage immediately
    try {
      localStorage.setItem(STORAGE_KEYS.CHAT_API_URL, newUrl);
      console.log("Saved chat API URL to localStorage:", newUrl);
    } catch (error) {
      console.error("Failed to save chat API URL to localStorage:", error);
    }

    setUrl(newUrl);
  }, []);

  return {
    url,
    setUrl: handleSetUrl
  };
}
