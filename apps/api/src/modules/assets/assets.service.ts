import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AccountType, AssetDto, AssetPriceDto, AssetType, Money } from '@finfury/contracts';
import { Like, Repository } from 'typeorm';
import { ExternalAssetResult } from '../../prices/price-provider.interface';
import { PriceService } from '../../prices/price.service';
import { Asset } from './asset.entity';
import { ExternalAsset } from './external-asset.entity';
import { CreateAssetDto } from './assets.dto';

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(Asset) private readonly assets: Repository<Asset>,
    @InjectRepository(ExternalAsset) private readonly externalAssets: Repository<ExternalAsset>,
    private readonly prices: PriceService,
  ) {}

  private toDto(asset: Asset): AssetDto {
    return {
      id: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      type: asset.type,
      currency: asset.currency,
      isin: asset.isin ?? undefined,
      figi: asset.figi ?? undefined,
    };
  }

/** Поиск активов в глобальном справочнике (только assets, не external_assets). */
  async search(query?: string): Promise<AssetDto[]> {
    const where = query
      ? [{ symbol: Like(`%${query}%`) }, { name: Like(`%${query}%`) }]
      : undefined;

    const rows = await this.assets.find({ where, order: { symbol: 'ASC' } });
    return rows.map((r) => this.toDto(r));
  }

  /** Актив + текущая цена через PriceService (ADR-005). */
  async getWithPrice(id: string): Promise<AssetPriceDto> {
    const asset = await this.assets.findOne({ where: { id } });
    if (!asset) throw new NotFoundException('Актив не найден');

    let currentPrice: Money | undefined;
    try {
      currentPrice = await this.prices.getPrice(asset.symbol, asset.type, asset.isin ?? undefined);
    } catch {
      currentPrice = undefined;
    }
    return { ...this.toDto(asset), currentPrice };
  }

  private allowedTypesForAccount(accountType: AccountType): AssetType[] {
    switch (accountType) {
      case AccountType.BROKER:
        return [AssetType.STOCK, AssetType.BOND, AssetType.FUND];
      case AccountType.WALLET:
        return [AssetType.CRYPTO];
      default:
        return [];
    }
  }

  /**
   * Поиск активов во внешних источниках.
   * Сначала проверяет кэш external_assets, при промахе — внешние API.
   * Результаты фильтруются по типу актива (ценные бумаги для брокера, крипта для кошелька)
   * и сохраняются в external_assets (upsert по symbol+source).
   */
  async searchExternal(query: string, accountType: AccountType): Promise<ExternalAssetResult[]> {
    // Минимум 2 символа — бережём лимиты внешних API
    if (query.length < 2) return [];

    const allowedTypes = this.allowedTypesForAccount(accountType);

    // Проверяем кэш (фильтруем по разрешённым типам)
    const cached = await this.externalAssets.find({
      where: [
        { symbol: Like(`%${query}%`), type: allowedTypes[0] },
        { name: Like(`%${query}%`), type: allowedTypes[0] },
      ],
    });

    // Добавляем остальные типы через OR
    for (let i = 1; i < allowedTypes.length; i++) {
      const more = await this.externalAssets.find({
        where: [
          { symbol: Like(`%${query}%`), type: allowedTypes[i] },
          { name: Like(`%${query}%`), type: allowedTypes[i] },
        ],
      });
      cached.push(...more);
    }

    if (cached.length > 0) {
      return cached.map((a) => ({
        symbol: a.symbol,
        name: a.name,
        type: a.type,
        currency: a.currency,
        isin: a.isin ?? undefined,
        source: a.source,
      }));
    }

    // Промах — ищем во внешних API, фильтруем по разрешённым типам
    const rawResults = await this.prices.searchExternal(query, accountType);
    const results = rawResults.filter((r) => allowedTypes.includes(r.type));

    // Сохраняем в кэш (upsert по symbol+source)
    for (const r of results) {
      const existing = await this.externalAssets.findOne({
        where: { symbol: r.symbol, source: r.source },
      });
      if (existing) {
        await this.externalAssets.update(existing.id, {
          name: r.name,
          type: r.type,
          currency: r.currency,
          isin: r.isin ?? null,
        });
      } else {
        await this.externalAssets.save(
          this.externalAssets.create({
            symbol: r.symbol,
            name: r.name,
            type: r.type,
            currency: r.currency,
            isin: r.isin ?? null,
            source: r.source,
          }),
        );
      }
    }

    return results;
  }

  /**
   * Создать актив в глобальном справочнике (автоматически, при выборе из внешних результатов).
   * Если актив с таким symbol уже существует — возвращает существующий.
   */
  async ensureAsset(dto: CreateAssetDto): Promise<AssetDto> {
    const existing = await this.assets.findOne({ where: { symbol: dto.symbol } });
    if (existing) return this.toDto(existing);

    const asset = await this.assets.save(this.assets.create(dto));
    return this.toDto(asset);
  }
}