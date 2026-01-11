import { useState, useCallback, useRef, useEffect } from 'react';

export interface CompanyData {
  nip: string;
  companyName: string;
  regon: string | null;
  krs: string | null;
  status: string;
  pkdMain: string | null;
  pkdList: string[];
  addressLine: string;
  postalCode: string;
  city: string;
  source: "CEIDG" | "KRS" | "GUS";
}

export interface CompanyLookupError {
  type: 'INVALID_NIP' | 'NOT_FOUND' | 'RATE_LIMIT' | 'CONNECTION_ERROR';
  message: string;
}

export function useCompanyLookup() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<CompanyLookupError | null>(null);
  const [data, setData] = useState<CompanyData | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const validateNIPFormat = (nip: string): boolean => {
    const cleanNip = nip.replace(/[\s-]/g, '');
    return /^\d{10}$/.test(cleanNip);
  };

  const fetchCompany = useCallback(async (nip: string): Promise<CompanyData | null> => {
    const cleanNip = nip.replace(/[\s-]/g, '');
    
    if (!validateNIPFormat(cleanNip)) {
      setError({
        type: 'INVALID_NIP',
        message: 'NIP musi składać się z 10 cyfr'
      });
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/company-lookup?nip=${cleanNip}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 400) {
          setError({
            type: 'INVALID_NIP',
            message: result.details || 'Nieprawidłowy format NIP'
          });
        } else if (response.status === 404) {
          setError({
            type: 'NOT_FOUND',
            message: 'Nie znaleziono w rejestrach. Uzupełnij dane ręcznie.'
          });
        } else if (response.status === 429) {
          setError({
            type: 'RATE_LIMIT',
            message: result.details || 'Zbyt wiele zapytań. Spróbuj za chwilę.'
          });
        } else {
          setError({
            type: 'CONNECTION_ERROR',
            message: 'Problem z połączeniem. Spróbuj ponownie.'
          });
        }
        setData(null);
        return null;
      }

      setData(result as CompanyData);
      setError(null);
      return result as CompanyData;
    } catch (err) {
      console.error('Company lookup error:', err);
      setError({
        type: 'CONNECTION_ERROR',
        message: 'Problem z połączeniem. Spróbuj ponownie.'
      });
      setData(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchWithDebounce = useCallback((nip: string, delay: number = 700) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const cleanNip = nip.replace(/[\s-]/g, '');
    
    if (cleanNip.length !== 10) {
      return;
    }

    debounceRef.current = setTimeout(() => {
      fetchCompany(nip);
    }, delay);
  }, [fetchCompany]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, []);

  return {
    isLoading,
    error,
    data,
    fetchCompany,
    fetchWithDebounce,
    reset,
    validateNIPFormat,
  };
}
