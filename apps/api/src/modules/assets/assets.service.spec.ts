import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AccountType, AssetType } from '@finfury/contracts';
import { Like } from 'typeorm';
import { AssetsService } from './assets.service';

const ASSET = {
  id: 'a1',
  symbol: 'GAZP',
  name: 'Газпром',
  type: AssetType.STOCK,
  currency: 'RUB',
  isin: 'RU0007661625',
  figi: null,
};

const EXTERNAL = {
  id: 'ext1',
  symbol: 'SBER',
  name: 'Сбер',
  type: AssetType.STOCK,
  currency: 'RUB',
  isin: null,
  source: 'moex',
};

function buildService(overrides: {
  asset?: object | null;
  assets?: object[];
  externalAssets?: object[];
  price?: 'throw';
  searchExternalResults?: object[];
} = {}) {
  const assets = {
    find: vi.fn(async () => overrides.assets ?? [ASSET]),
    findOne: vi.fn(async (q: object) => {
      if (overrides.asset === undefined) return ASSET;
      if (overrides.asset === null) return null;
      // Для ensureAsset: ищем по symbol
      const where = (q as { where: { symbol?: string } }).where;
      if (where?.symbol === 'SBER') return null; // не существует — создадим
      return ASSET;
    }),
    create: vi.fn((input: object) => input),
    save: vi.fn(async (row: object) => ({ ...ASSET, ...row, id: 'a2' })),
  };

  const externalAssets = {
    find: vi.fn(async () => [...(overrides.externalAssets ?? [])]),
    findOne: vi.fn(async () => null),
    create: vi.fn((input: object) => input),
    save: vi.fn(async (row: object) => ({ ...EXTERNAL, ...row })),
    update: vi.fn(async () => undefined),
  };

  const prices = {
    getPrice: vi.fn(async () => {
      if (overrides.price === 'throw') throw new Error('no price');
      return { amount: 15000, currency: 'RUB' };
    }),
    searchExternal: vi.fn(async () => overrides.searchExternalResults ?? []),
  };

  const service = new AssetsService(assets as never, externalAssets as never, prices as never);
  return { service, assets, externalAssets, prices };
}

describe('AssetsService', () => {
  it('search без query отдаёт все активы', async () => {
    const { service, assets } = buildService();
    const rows = await service.search();
    expect(assets.find).toHaveBeenCalledWith({ where: undefined, order: { symbol: 'ASC' } });
    expect(rows[0].symbol).toBe('GAZP');
    expect(rows[0].isin).toBe('RU0007661625');
  });

  it('search с query ищет по symbol и name (Like) в assets', async () => {
    const { service, assets } = buildService();
    await service.search('gaz');
    expect(assets.find).toHaveBeenCalledWith({
      where: [{ symbol: Like('%gaz%') }, { name: Like('%gaz%') }],
      order: { symbol: 'ASC' },
    });
  });

  it('getWithPrice возвращает актив и цену', async () => {
    const { service, prices } = buildService();
    const result = await service.getWithPrice('a1');
    expect(prices.getPrice).toHaveBeenCalledWith('GAZP', AssetType.STOCK, 'RU0007661625');
    expect(result.currentPrice).toEqual({ amount: 15000, currency: 'RUB' });
    expect(result.symbol).toBe('GAZP');
  });

  it('getWithPrice без источника цены — currentPrice undefined', async () => {
    const { service } = buildService({ price: 'throw' });
    const result = await service.getWithPrice('a1');
    expect(result.currentPrice).toBeUndefined();
  });

  it('getWithPrice неизвестного актива → 404', async () => {
    const { service } = buildService({ asset: null });
    await expect(service.getWithPrice('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('searchExternal возвращает из кэша, если есть записи (фильтр по типу)', async () => {
    const { service, externalAssets, prices } = buildService({
      externalAssets: [{ ...EXTERNAL, symbol: 'SBER', source: 'moex' }],
    });
    const results = await service.searchExternal('sber', AccountType.BROKER);
    expect(externalAssets.find).toHaveBeenCalled();
    expect(prices.searchExternal).not.toHaveBeenCalled();
    // Для BROKER 3 разрешённых типа (STOCK/BOND/FUND) → 3 вызова find
    expect(results).toHaveLength(3);
    expect(results[0].symbol).toBe('SBER');
  });

  it('searchExternal для WALLET ищет только crypto', async () => {
    const { service, prices } = buildService({
      externalAssets: [],
      searchExternalResults: [
        { symbol: 'bitcoin', name: 'Bitcoin', type: AssetType.CRYPTO, currency: 'USD', source: 'coingecko' },
      ],
    });
    const results = await service.searchExternal('bitcoin', AccountType.WALLET);
    expect(prices.searchExternal).toHaveBeenCalledWith('bitcoin', AccountType.WALLET);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe(AssetType.CRYPTO);
  });

  it('searchExternal для BROKER не ищет crypto', async () => {
    const { service, prices } = buildService({
      externalAssets: [],
      searchExternalResults: [
        { symbol: 'bitcoin', name: 'Bitcoin', type: AssetType.CRYPTO, currency: 'USD', source: 'coingecko' },
      ],
    });
    const results = await service.searchExternal('bitcoin', AccountType.BROKER);
    expect(prices.searchExternal).toHaveBeenCalledWith('bitcoin', AccountType.BROKER);
    expect(results).toHaveLength(0);
  });

  it('searchExternal идёт во внешние API при промахе кэша и сохраняет результаты', async () => {
    const { service, externalAssets, prices } = buildService({
      externalAssets: [],
      searchExternalResults: [
        { symbol: 'SBER', name: 'Сбер', type: AssetType.STOCK, currency: 'RUB', source: 'moex' },
      ],
    });
    const results = await service.searchExternal('sber', AccountType.BROKER);
    expect(prices.searchExternal).toHaveBeenCalledWith('sber', AccountType.BROKER);
    expect(externalAssets.save).toHaveBeenCalled();
    expect(results).toHaveLength(1);
  });

  it('ensureAsset создаёт актив, если его нет', async () => {
    const { service, assets } = buildService({ asset: null });
    const dto = { symbol: 'SBER', name: 'Сбер', type: AssetType.STOCK, currency: 'RUB' };
    const result = await service.ensureAsset(dto);
    expect(assets.findOne).toHaveBeenCalledWith({ where: { symbol: 'SBER' } });
    expect(assets.create).toHaveBeenCalledWith(dto);
    expect(result.symbol).toBe('SBER');
  });

  it('ensureAsset возвращает существующий актив, если уже есть', async () => {
    const { service, assets } = buildService();
    const dto = { symbol: 'GAZP', name: 'Газпром', type: AssetType.STOCK, currency: 'RUB' };
    const result = await service.ensureAsset(dto);
    expect(assets.findOne).toHaveBeenCalledWith({ where: { symbol: 'GAZP' } });
    expect(assets.create).not.toHaveBeenCalled();
    expect(result.symbol).toBe('GAZP');
  });
});