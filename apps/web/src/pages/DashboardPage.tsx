import { useQuery } from '@tanstack/react-query';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export function DashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/health`);
      if (!res.ok) throw new Error('API недоступен');
      return res.json();
    },
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h1 className="text-lg font-semibold">FinFury</h1>
      {isLoading && <p className="text-sm text-gray-500">Проверяю API…</p>}
      {isError && <p className="text-sm text-red-600">API недоступен</p>}
      {data && (
        <p className="text-sm text-gray-600">
          API: {data.status} · {data.service}
        </p>
      )}
    </div>
  );
}