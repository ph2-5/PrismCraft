"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export function useDebouncedState<T>(
  initialValue: T,
  delay: number = 300,
  options?: {
    onDebouncedUpdate?: (value: T) => void;
    immediate?: boolean;
  }
) {
  const [value, setValue] = useState<T>(initialValue);
  const [debouncedValue, setDebouncedValue] = useState<T>(initialValue);
  const [isPending, setIsPending] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const immediateRef = useRef(options?.immediate ?? false);

  const setDebouncedState = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      const actualNewValue =
        typeof newValue === "function"
          ? (newValue as (prev: T) => T)(value)
          : newValue;

      setValue(actualNewValue);

      if (immediateRef.current && !timeoutRef.current) {
        setDebouncedValue(actualNewValue);
        options?.onDebouncedUpdate?.(actualNewValue);
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setIsPending(true);
      timeoutRef.current = setTimeout(() => {
        setDebouncedValue(actualNewValue);
        options?.onDebouncedUpdate?.(actualNewValue);
        timeoutRef.current = null;
        setIsPending(false);
      }, delay);
    },
    [value, delay, options]
  );

  const flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setIsPending(false);
    }
    setDebouncedValue(value);
    options?.onDebouncedUpdate?.(value);
  }, [value, options]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setIsPending(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    value,
    debouncedValue,
    setValue: setDebouncedState,
    flush,
    cancel,
    isPending,
  };
}

export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);
  const [isPending, setIsPending] = useState(false);

  // eslint-disable-next-line react-hooks/refs
  callbackRef.current = callback;

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setIsPending(true);
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        setIsPending(false);
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );

  const flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setIsPending(false);
    }
  }, []);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setIsPending(false);
    }
  }, []);

  return {
    debouncedCallback,
    flush,
    cancel,
    isPending,
  };
}
