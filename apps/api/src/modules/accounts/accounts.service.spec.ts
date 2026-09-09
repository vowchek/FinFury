import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AccountType } from '@finfury/contracts';
import { AccountsService } from './accounts.service';

const ACCOUNT = {
  id: 'acc1',
  userId: 'u1',
  name: 'Брокер',
  type: 'brokerage',
  currency: 'RUB',
  institution: 'Tinkoff',
  externalRef: null,
  createdAt: new Date('2026-01-01'),
};

function buildService(overrides: { account?: object | null; accounts?: object[] } = {}) {
  const accounts = {
    find: vi.fn(async () => overrides.accounts ?? [ACCOUNT]),
    findOne: vi.fn(async () =>
      overrides.account === undefined ? ACCOUNT : overrides.account,
    ),
    create: vi.fn((input: object) => input),
    save: vi.fn(async (row: object) => ({ ...ACCOUNT, ...row })),
    remove: vi.fn(async () => undefined),
  };
  const service = new AccountsService(accounts as never);
  return { service, accounts };
}

describe('AccountsService', () => {
  it('list возвращает только счета пользователя', async () => {
    const { service, accounts } = buildService();
    const rows = await service.list('u1');
    expect(accounts.find).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      order: { createdAt: 'ASC' },
    });
    expect(rows[0]).toMatchObject({
      id: 'acc1',
      name: 'Брокер',
      institution: 'Tinkoff',
    });
    expect(rows[0].externalRef).toBeUndefined();
  });

  it('get чужого счёта → 404', async () => {
    const { service } = buildService({ account: null });
    await expect(service.get('u1', 'acc-x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create сохраняет счёт с userId', async () => {
    const { service, accounts } = buildService();
    const dto = { name: 'ИИС', type: AccountType.BROKER, currency: 'RUB' };
    const result = await service.create('u1', dto);
    expect(accounts.create).toHaveBeenCalledWith({ ...dto, userId: 'u1' });
    expect(result.name).toBe('ИИС');
  });

  it('WALLET только в USD', async () => {
    const { service } = buildService();
    await expect(
      service.create('u1', { name: 'Crypto', type: AccountType.WALLET, currency: 'RUB' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const ok = await service.create('u1', {
      name: 'Crypto',
      type: AccountType.WALLET,
      currency: 'USD',
    });
    expect(ok.name).toBe('Crypto');
  });

  it('update чужого счёта → 404', async () => {
    const { service } = buildService({ account: null });
    await expect(
      service.update('u1', 'acc-x', { name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove удаляет свой счёт', async () => {
    const { service, accounts } = buildService();
    await service.remove('u1', 'acc1');
    expect(accounts.remove).toHaveBeenCalledWith(ACCOUNT);
  });

  it('remove чужого счёта → 404', async () => {
    const { service } = buildService({ account: null });
    await expect(service.remove('u1', 'acc-x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
